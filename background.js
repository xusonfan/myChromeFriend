const fetchControllers = {};

// 监听来自content.js的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_SUMMARY') {
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
    chrome.storage.sync.get(['apiEndpoint', 'apiKey', 'modelName', 'prompt', 'maxTokens', 'retryCount'], (config) => {
      console.log("收到了内容脚本的请求，正在获取配置...");

      if (!config.apiEndpoint || !config.apiKey) {
        console.log("API配置不完整。");
        sendResponse({ summary: "请先在设置页面配置API信息。" });
        return;
      }

      console.log("配置获取成功。");
      const API_ENDPOINT = config.apiEndpoint;
      const API_KEY = config.apiKey;
      const MODEL_NAME = config.modelName || 'gpt-4'; // 使用保存的模型或默认值
      const PROMPT = config.prompt || '请以一个动漫少女的口吻，用中文总结并评论以下网页内容，忽略其中无关的文字，抓住主题，字数控制在300字左右。'; // 使用保存的提示词或默认值
      const MAX_TOKENS = config.maxTokens || '1000'; // 使用保存的最大令牌数或默认值
      const RETRY_COUNT = config.retryCount || 3; // 使用保存的重试次数或默认值

      // 准备发送到API的数据，采用OpenAI Chat Completions格式
      const requestData = {
        model: MODEL_NAME,
        messages: [
          {
            "role": "system",
            "content": PROMPT
          },
          {
            "role": "user",
            "content": request.text
          }
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
            return await response.json(); // 成功则返回结果
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
      // 根据命令类型发送不同的消息到内容脚本
      if (command === "refresh_summary") {
        console.log(`向标签页 ${tabId} 发送 'REFRESH_SUMMARY' 消息`);
        chrome.tabs.sendMessage(tabId, { type: "REFRESH_SUMMARY" });
      } else if (command === "close_dialog") {
        console.log(`向标签页 ${tabId} 发送 'CLOSE_DIALOG' 消息`);
        chrome.tabs.sendMessage(tabId, { type: "CLOSE_DIALOG" });

        // 中止该标签页的fetch请求
        if (fetchControllers[tabId]) {
          console.log(`中止标签页 ${tabId} 的AI请求。`);
          fetchControllers[tabId].abort();
          delete fetchControllers[tabId];
        }
      } else if (command === "toggle_visibility") {
        console.log(`向标签页 ${tabId} 发送 'TOGGLE_VISIBILITY' 消息`);
        chrome.tabs.sendMessage(tabId, { type: "TOGGLE_VISIBILITY" });
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
