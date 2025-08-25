const fetchControllers = {};
let creating; // A global promise to avoid concurrency issues
let speakingTabId = null; // To track which tab is currently playing TTS
let isBossKeyActive = false; // 全局老板键状态

// Function to setup and manage the offscreen document
async function setupOffscreenDocument(path, reason) {
    // Check if we have an existing offscreen document
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT']
    });
    if (existingContexts.find(c => c.documentUrl.endsWith(path))) {
        return;
    }

    // Avoid creating multiple offscreen documents simultaneously
    if (creating) {
        await creating;
    } else {
        creating = chrome.offscreen.createDocument({
            url: path,
            reasons: [reason],
            justification: 'Needed for audio playback',
        });
        await creating;
        creating = null;
    }
}

// 监听来自content.js的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'PLAY_TTS_REQUEST') {
    const tabId = sender.tab.id;
    // 如果有另一个标签页正在播放，先停止它
    if (speakingTabId !== null && speakingTabId !== tabId) {
      console.log(`收到来自标签页 ${tabId} 的新TTS请求，停止正在播放的标签页 ${speakingTabId}。`);
      chrome.runtime.sendMessage({ type: 'STOP_TTS' }, () => {
        if (chrome.runtime.lastError) {
          console.log(`向 offscreen 发送 STOP_TTS 消息失败: ${chrome.runtime.lastError.message}`);
        }
      }); // 停止离屏播放
      chrome.tabs.sendMessage(speakingTabId, { type: "STOP_TTS" }, () => {
        if (chrome.runtime.lastError) {
          console.log(`向标签页 ${speakingTabId} 发送 STOP_TTS 消息失败: ${chrome.runtime.lastError.message}`);
        }
      }); // 清理旧标签页的队列
    }
    speakingTabId = tabId; // 设置当前正在说话的标签页
    setupOffscreenDocument('offscreen.html', 'AUDIO_PLAYBACK').then(() => {
      chrome.storage.sync.get({ ttsVolume: 100 }, (items) => {
        chrome.runtime.sendMessage({
          type: 'PLAY_TTS',
          audioUrl: request.audioUrl,
          tabId: tabId,
          volume: items.ttsVolume
        });
      });
    });
  } else if (request.type === 'TTS_PLAYBACK_FINISHED') {
    // Forward the message to the content script in the correct tab
    if (sender.url.includes('offscreen.html') && request.tabId) {
        chrome.tabs.sendMessage(request.tabId, { type: 'TTS_PLAYBACK_FINISHED' }, () => {
          if (chrome.runtime.lastError) {
            console.log(`向标签页 ${request.tabId} 发送 TTS_PLAYBACK_FINISHED 消息失败: ${chrome.runtime.lastError.message}`);
          }
        });
        // 播放结束后重置正在说话的标签页ID
        speakingTabId = null;
    }
  } else if (request.type === 'STOP_TTS') {
    // Forward the stop message to the offscreen document and clear state
    speakingTabId = null;
    // 检查offscreen document是否存在，避免不必要的错误日志
    chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] }).then(contexts => {
      if (contexts.length > 0) {
        chrome.runtime.sendMessage({ type: 'STOP_TTS' }, () => {
          if (chrome.runtime.lastError) {
            console.log(`向 offscreen 发送 STOP_TTS 消息失败: ${chrome.runtime.lastError.message}`);
          }
        });
      }
    });
  } else if (request.type === 'GET_SUMMARY') {
    const tabId = sender.tab.id;

    // 如果该标签页有正在进行的请求，先中止它
    if (fetchControllers[tabId]) {
      console.log(`中止标签页 ${tabId} 之前的AI请求。`);
      fetchControllers[tabId].abort();
    }

    // 创建一个新的AbortController
    const controller = new AbortController();
    fetchControllers[tabId] = controller;
    const signal = controller.signal;

    // 从Chrome存储中获取API配置
    chrome.storage.sync.get(['apiEndpoint', 'apiKey', 'modelName', 'prompts', 'selectedPromptId', 'maxTokens', 'retryCount'], (config) => {
      console.log("收到了内容脚本的请求，正在获取配置...");

      if (!config.apiEndpoint || !config.apiKey) {
        console.log("API配置不完整。");
        sendResponse({ summary: "请先在设置页面配置API信息。" });
        return;
      }

      console.log("配置获取成功。");
      const API_ENDPOINT = config.apiEndpoint;
      const API_KEY = config.apiKey;
      const MODEL_NAME = config.modelName || 'gpt-4';

      // 根据 selectedPromptId 查找当前使用的提示词
      // 如果是用户追问(isFollowUp为true)，则使用专门的追问提示词
      let selectedPrompt;
      if (request.isFollowUp) {
        // 使用从设置中加载的追问专用提示词
        selectedPrompt = {
          id: "follow_up",
          name: "追问专用",
          value: config.followUpPrompt || "你是一个可爱的动漫少女AI助手，正在与用户进行对话。请以轻松活泼的语调，用中文回答用户的问题。你的回答应该简洁明了，同时保持友好和乐于助人的态度。"
        };
      } else {
        // 页面总结使用用户选择的提示词
        selectedPrompt = config.prompts.find(p => p.id === config.selectedPromptId);
      }

      if (!selectedPrompt) {
        console.log("未找到选定的提示词，请在设置页面重新选择。");
        sendResponse({ summary: "未能获取当前选定的人设提示词，请前往设置页面重新选择并保存。" });
        return;
      }
      const PROMPT = selectedPrompt.value;
      const MAX_TOKENS = config.maxTokens || '1000'; // 使用保存的最大令牌数或默认值
      const RETRY_COUNT = config.retryCount || 3; // 使用保存的重试次数或默认值

      // 确保 request.history 存在且是一个数组
      if (!request.history || !Array.isArray(request.history)) {
        console.error("请求格式错误，缺少 history 数组。");
        sendResponse({ summary: "请求格式错误。" });
        return;
      }

      // 准备发送到API的数据，采用OpenAI Chat Completions格式
      const requestData = {
        model: MODEL_NAME,
        messages: [
          {
            "role": "system",
            "content": PROMPT // 系统提示词始终置于最前
          },
          ...request.history // 展开对话历史
        ],
        max_tokens: parseInt(MAX_TOKENS) // 使用用户设置的最大令牌数
      };

      console.log("准备调用AI API，端点:", API_ENDPOINT);
      console.log("发送的请求数据:", JSON.stringify(requestData, null, 2));

      // 智能处理API端点URL，确保正确的聊天接口路径
      let chatEndpoint = API_ENDPOINT;
      try {
        const url = new URL(API_ENDPOINT);
        let pathname = url.pathname;
        
        // 移除路径末尾的斜杠
        pathname = pathname.replace(/\/+$/, '');
        
        // 如果路径为空或只是根路径，添加/v1/chat/completions
        if (pathname === '' || pathname === '/') {
          pathname = '/v1/chat/completions';
        }
        // 如果路径是/v1，添加/chat/completions
        else if (pathname === '/v1') {
          pathname = '/v1/chat/completions';
        }
        // 如果路径是/v1/models，替换为/v1/chat/completions
        else if (pathname === '/v1/models') {
          pathname = '/v1/chat/completions';
        }
        // 如果路径不包含/chat/completions，添加它
        else if (!pathname.includes('/chat/completions')) {
          pathname = pathname + '/chat/completions';
        }
        
        url.pathname = pathname;
        chatEndpoint = url.toString();
        console.log("智能处理后的聊天接口URL:", chatEndpoint);
      } catch (error) {
        console.error('URL解析失败，使用原始URL:', error);
        chatEndpoint = API_ENDPOINT;
      }

      // 使用fetch发送请求，并加入重试逻辑
      const fetchWithRetry = async (url, options, retries) => {
        for (let i = 0; i <= retries; i++) {
          try {
            const response = await fetch(url, options);
            console.log(`第 ${i + 1} 次尝试，收到API的原始响应:`, response);
            if (!response.ok) {
              throw new Error(`HTTP 错误! 状态码: ${response.status}`);
            }
            
            // 检查是否支持流式响应
            if (!response.body) {
              // 如果不支持流式响应，则回退到原来的处理方式
              console.log("API不支持流式响应，使用普通JSON解析。");
              return await response.json();
            }
            
            // 处理流式响应
            console.log("开始处理流式响应...");
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let isFirstChunk = true;
            let lastChunkTime = Date.now();
            let accumulatedData = ''; // 用于累积流式数据
            
            while (true) {
              const { done, value } = await reader.read();
              
              if (done) {
                console.log("流式响应处理完成。");
                // 流结束，发送结束信号
                chrome.tabs.sendMessage(tabId, { 
                  type: 'STREAM_CHUNK', 
                  chunk: '', 
                  isEnd: true 
                });
                // 解析累积的数据并返回
                try {
                  const parsedData = JSON.parse(accumulatedData);
                  console.log("流式响应数据解析成功:", parsedData);
                  return parsedData;
                } catch (e) {
                  console.error("流式响应数据解析失败:", e);
                  return {};
                }
              }
              
              // 计算时间间隔
              const currentTime = Date.now();
              const timeInterval = isFirstChunk ? 0 : currentTime - lastChunkTime;
              lastChunkTime = currentTime;
              isFirstChunk = false;
              
              // 解码数据块
              const chunk = decoder.decode(value, { stream: true });
              buffer += chunk;
              accumulatedData += chunk;
              
              // 发送数据块和时间间隔到content script
              chrome.tabs.sendMessage(tabId, { 
                type: 'STREAM_CHUNK', 
                chunk: buffer, 
                timeInterval: timeInterval,
                isEnd: false 
              });
              
              // 清空buffer
              buffer = '';
            }
          } catch (error) {
            console.log(`第 ${i + 1} 次请求失败:`, error.message);
            if (i < retries) {
              console.log(`剩余重试次数: ${retries - i - 1}。将在1秒后重试...`);
              await new Promise(resolve => setTimeout(resolve, 1000)); // 等待1秒
            } else {
              throw error; // 最后一次尝试失败，则抛出错误
            }
          }
        }
      };

      fetchWithRetry(chatEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}` // 根据你的API要求修改认证方式
        },
        body: JSON.stringify(requestData),
        signal: signal // 传递signal
      }, RETRY_COUNT)
      .then(data => {
      console.log("API响应数据 (JSON解析后):", data);
      let summary = "未能获取总结，或API返回格式不正确。";

      if (data.choices && data.choices.length > 0) {
        const firstChoice = data.choices[0];
        console.log("正在检查API返回的第一个选项:", firstChoice);

        if (firstChoice.message && firstChoice.message.content) {
          summary = firstChoice.message.content;
          console.log("成功从 'message.content' 提取到总结内容。");
        } else if (firstChoice.text) {
          summary = firstChoice.text;
          console.log("成功从 'text' 字段提取到总结内容 (兼容旧版API)。");
        } else {
          console.warn("在第一个选项中未能找到 'message.content' 或 'text'。");
        }
      } else {
        console.warn("API响应中缺少 'choices' 数组或该数组为空。");
      }
      sendResponse({ summary: summary });
    })
    .catch(error => {
      if (error.name === 'AbortError') {
        console.log(`标签页 ${tabId} 的Fetch请求被用户中止。`);
      } else {
        console.error('调用AI API时出错:', error);
        sendResponse({ summary: `调用API时出错: ${error.message}。请检查后台日志获取详细信息。` });
      }
    })
    .finally(() => {
      delete fetchControllers[tabId]; // 请求结束后删除控制器
    });
    });

    // 返回true表示我们将异步发送响应
    return true;
  }
});

// 监听快捷键命令
chrome.commands.onCommand.addListener((command) => {
  console.log(`接收到命令: ${command}`);
  // 查询当前活动的标签页
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length > 0) {
      const tabId = tabs[0].id;
      const sendMessageCallback = (type) => {
        if (chrome.runtime.lastError) {
          console.log(`向标签页 ${tabId} 发送 '${type}' 消息失败: ${chrome.runtime.lastError.message}。可能是内容脚本尚未注入或页面不支持。`);
        }
      };

      // 根据命令类型发送不同的消息到内容脚本
      if (command === "refresh_summary") {
        console.log(`向标签页 ${tabId} 发送 'REFRESH_SUMMARY' 消息`);
        chrome.tabs.sendMessage(tabId, { type: "REFRESH_SUMMARY" }, () => sendMessageCallback("REFRESH_SUMMARY"));
      } else if (command === "close_dialog") {
        console.log(`向标签页 ${tabId} 发送 'CLOSE_DIALOG' 消息`);
        chrome.tabs.sendMessage(tabId, { type: "CLOSE_DIALOG" }, () => sendMessageCallback("CLOSE_DIALOG"));

        // 中止该标签页的fetch请求
        if (fetchControllers[tabId]) {
          console.log(`中止标签页 ${tabId} 的AI请求。`);
          fetchControllers[tabId].abort();
          delete fetchControllers[tabId];
        }
      } else if (command === "toggle_visibility") {
        console.log(`向标签页 ${tabId} 发送 'TOGGLE_VISIBILITY' 消息`);
        chrome.tabs.sendMessage(tabId, { type: "TOGGLE_VISIBILITY" }, () => sendMessageCallback("TOGGLE_VISIBILITY"));
      } else if (command === "toggle_follow_up") {
        console.log(`向标签页 ${tabId} 发送 'TOGGLE_FOLLOW_UP' 消息`);
        chrome.tabs.sendMessage(tabId, { type: "TOGGLE_FOLLOW_UP" }, () => sendMessageCallback("TOGGLE_FOLLOW_UP"));
      } else if (command === "toggle_tts") {
        console.log(`向标签页 ${tabId} 发送 'TOGGLE_TTS' 消息`);
        chrome.tabs.sendMessage(tabId, { type: "TOGGLE_TTS" }, () => sendMessageCallback("TOGGLE_TTS"));
      } else if (command === "boss_key") {
        isBossKeyActive = !isBossKeyActive; // 切换全局状态
        console.log(`老板键状态切换为: ${isBossKeyActive}`);
        // 向所有标签页广播消息
        chrome.tabs.query({}, (allTabs) => {
          allTabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, { type: "BOSS_KEY", isHidden: isBossKeyActive }, () => {
              if (chrome.runtime.lastError) {
                console.log(`向标签页 ${tab.id} 发送老板键消息失败: ${chrome.runtime.lastError.message}。`);
              }
            });
          });
        });
      }
    } else {
      console.log("没有找到活动的标签页。");
    }
  });
});

// 监听插件图标的点击事件
chrome.action.onClicked.addListener((tab) => {
  // 定义设置页面的URL
  const optionsUrl = chrome.runtime.getURL('options.html');

  // 查询是否已经有打开的设置页面
  chrome.tabs.query({ url: optionsUrl }, (tabs) => {
    if (tabs.length > 0) {
      // 如果找到了，就激活那个标签页
      const existingTab = tabs[0];
      chrome.tabs.update(existingTab.id, { active: true });
      // 如果标签页所在的窗口不是当前窗口，也激活那个窗口
      chrome.windows.update(existingTab.windowId, { focused: true });
    } else {
      // 如果没找到，就创建一个新的标签页
      chrome.tabs.create({ url: optionsUrl });
    }
  });
});

// 创建右键菜单项
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "add-to-blacklist",
    title: "将当前域名加入黑名单",
    contexts: ["action"]
  });
});

// Listen for tab activation changes
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.storage.sync.get({ ttsBackgroundPlay: false }, (items) => {
    if (!items.ttsBackgroundPlay && speakingTabId !== null && speakingTabId !== activeInfo.tabId) {
      console.log(`Tab switched from ${speakingTabId} to ${activeInfo.tabId}. Stopping TTS.`);
      // Tell the offscreen document to stop playing
      chrome.runtime.sendMessage({ type: 'STOP_TTS' }, () => {
        if (chrome.runtime.lastError) {
          console.log(`向 offscreen 发送 STOP_TTS 消息失败: ${chrome.runtime.lastError.message}`);
        }
      });
      // Tell the original content script to clear its queues
      chrome.tabs.sendMessage(speakingTabId, { type: "STOP_TTS" }, () => {
        if (chrome.runtime.lastError) {
          console.log(`向标签页 ${speakingTabId} 发送 STOP_TTS 消息失败: ${chrome.runtime.lastError.message}`);
        }
      });
      speakingTabId = null; // Reset state
    }
  });
});

// Listen for tab removal (closing)
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    if (speakingTabId !== null && speakingTabId === tabId) {
        console.log(`Tab ${tabId} was closed. Stopping TTS.`);
        chrome.runtime.sendMessage({ type: 'STOP_TTS' }, () => {
          if (chrome.runtime.lastError) {
            console.log(`向 offscreen 发送 STOP_TTS 消息失败: ${chrome.runtime.lastError.message}`);
          }
        });
        speakingTabId = null;
    }
});

// 监听右键菜单点击事件
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "add-to-blacklist") {
    if (tab.url) {
      try {
        const url = new URL(tab.url);
        const domain = url.hostname;

        // 从存储中获取现有黑名单
        chrome.storage.sync.get({ blacklist: '' }, (data) => {
          let blacklist = data.blacklist.split('\n').filter(Boolean); // 转换为数组并移除空行
          
          // 如果域名不存在于黑名单中，则添加
          if (!blacklist.includes(domain)) {
            blacklist.push(domain);
            
            // 保存更新后的黑名单
            chrome.storage.sync.set({ blacklist: blacklist.join('\n') }, () => {
              console.log(`域名 ${domain} 已成功添加到黑名单。`);
              // 可选：发送通知提醒用户
              chrome.notifications.create({
                type: 'basic',
                iconUrl: 'images/icon48.png',
                title: '操作成功',
                message: `域名 ${domain} 已被加入黑名单。`
              });
            });
          } else {
            console.log(`域名 ${domain} 已存在于黑名单中。`);
            chrome.notifications.create({
              type: 'basic',
              iconUrl: 'images/icon48.png',
              title: '操作提醒',
              message: `域名 ${domain} 已存在于黑名单中，无需重复添加。`
            });
          }
        });
      } catch (e) {
        console.error("无法解析URL或处理黑名单:", e);
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'images/icon48.png',
          title: '操作失败',
          message: `无法从 ${tab.url} 中提取域名。`
        });
      }
    }
  }
});
