// options.js - 处理设置页面的逻辑。

// 获取模型列表
async function fetchModels() {
  return new Promise(async (resolve, reject) => {
  const apiEndpoint = document.getElementById('api-endpoint').value;
  const apiKey = document.getElementById('api-key').value;
  const modelDatalist = document.getElementById('model-list');
  const modelInput = document.getElementById('model-name');
  const status = document.getElementById('status');
  const modelStatus = document.getElementById('model-status');

  console.log('开始获取模型列表...');
  console.log('API端点:', apiEndpoint);
  console.log('datalist元素:', modelDatalist);
  console.log('model输入框元素:', modelInput);

  if (!apiEndpoint) {
    modelStatus.textContent = '请先输入AI API端点。';
    modelStatus.style.color = 'var(--primary-color)';
    return;
  }

  // 智能处理API端点URL，支持省略/chat/completions后缀
  let modelsUrl;
  try {
    // 如果用户输入的URL包含/chat/completions，则移除这部分来获取基础URL
    let baseUrl = apiEndpoint;
    if (baseUrl.includes('/chat/completions')) {
      baseUrl = baseUrl.replace('/chat/completions', '');
    }
    
    modelsUrl = new URL(baseUrl);
    
    // 智能处理路径，确保正确的/v1/models路径
    let pathname = modelsUrl.pathname;
    
    // 移除路径末尾的斜杠
    pathname = pathname.replace(/\/+$/, '');
    
    // 如果路径已经是/v1，直接添加/models
    if (pathname === '/v1') {
      pathname = '/v1/models';
    }
    // 如果路径为空或只是根路径，添加/v1/models
    else if (pathname === '' || pathname === '/') {
      pathname = '/v1/models';
    }
    // 如果路径既不是/v1也不是/v1/models，添加/v1/models
    else if (!pathname.endsWith('/v1/models')) {
      pathname = pathname + '/v1/models';
    }
    
    modelsUrl.pathname = pathname;
    
    console.log('处理后的模型URL:', modelsUrl.toString());
  } catch (error) {
    console.error('URL解析失败:', error);
    modelStatus.textContent = 'API端点URL格式错误。';
    modelStatus.style.color = 'var(--primary-color)';
    return;
  }

  modelStatus.textContent = '正在获取模型...';
  modelStatus.style.color = 'var(--text-secondary)';

  try {
    const response = await fetch(modelsUrl.toString(), {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    if (!response.ok) {
      throw new Error(`API请求失败: ${response.statusText}`);
    }

    const data = await response.json();
    const models = data.data || data; // 兼容不同API的返回格式

    console.log('获取到的模型数据:', data);
    console.log('模型数组:', models);

    // 现在使用select元素而不是datalist
    const modelSelect = document.getElementById('model-name');
    
    // 保存当前选中的模型值
    const currentSelectedModel = modelSelect.value;
    
    if (!Array.isArray(models)) {
      console.error('模型数据不是数组格式:', models);
      modelStatus.textContent = '模型数据格式错误。';
      modelStatus.style.color = 'var(--primary-color)';
      return;
    }

    // 清空现有选项，但记住当前选中的模型
    modelSelect.innerHTML = '';

    // 添加默认空选项
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = '请选择模型...';
    modelSelect.appendChild(defaultOption);

    let foundCurrentModel = false;
    models.forEach((model, index) => {
      // 兼容对象数组（{id: "..."}）和字符串数组（"..."）
      const modelId = (typeof model === 'object' && model.id) ? model.id : (typeof model === 'string' ? model : null);
      console.log(`处理模型 ${index}:`, model, '模型ID:', modelId);
      
      if (modelId) {
        const option = document.createElement('option');
        option.value = modelId;
        option.textContent = modelId; // 添加textContent以确保显示
        modelSelect.appendChild(option);
        console.log(`添加选项: ${modelId}`);
        
        // 检查是否是之前选中的模型
        if (modelId === currentSelectedModel) {
          foundCurrentModel = true;
        }
      }
    });

    console.log('最终select内容:', modelSelect.innerHTML);
    console.log('select子元素数量:', modelSelect.children.length);

    // 如果之前选中的模型在新列表中存在，则保持选中状态
    if (currentSelectedModel && foundCurrentModel) {
      modelSelect.value = currentSelectedModel;
      modelStatus.textContent = `模型列表已更新，共${modelSelect.children.length - 1}个模型。当前选中：${currentSelectedModel}`;
    } else {
      modelStatus.textContent = `模型列表已更新，共${modelSelect.children.length - 1}个模型。`;
    }
    modelStatus.style.color = 'var(--accent-color)';
    resolve(); // 成功时解析Promise

  } catch (error) {
    console.error('获取模型失败:', error);
    modelStatus.textContent = '获取模型失败，请检查端点和密钥。';
    modelStatus.style.color = 'var(--primary-color)';
    reject(error); // 失败时拒绝Promise
  } finally {
    setTimeout(() => {
      if (modelStatus.textContent.includes('获取') || modelStatus.textContent.includes('更新') || modelStatus.textContent.includes('失败') || modelStatus.textContent.includes('错误')) {
        modelStatus.textContent = '';
      }
    }, 3000);
  }
  });
}

// 将选项保存到 chrome.storage.sync。
function saveOptions() {
  const apiEndpoint = document.getElementById('api-endpoint').value;
  const apiKey = document.getElementById('api-key').value;
  const modelName = document.getElementById('model-name').value;
  const prompt = document.getElementById('prompt').value;
  const maxTokens = document.getElementById('max-tokens').value;
  const retryCount = document.getElementById('retry-count').value;
  const characterModel = document.getElementById('character-model').value;
  const enableFloatingButton = document.getElementById('enable-floating-button').checked;
  const askPrompt = document.getElementById('ask-prompt').value;
  const enableFollowUp = document.getElementById('enable-follow-up').checked;
  const dialogOpacity = document.getElementById('dialog-opacity').value;
  const dialogFontSize = document.getElementById('dialog-font-size').value;
  const overallScale = document.getElementById('overall-scale').value;
  const blacklist = document.getElementById('blacklist').value;
  // 快捷键现在通过 chrome://extensions/shortcuts 管理
  const autoSummarize = document.getElementById('auto-summarize').checked;
  const dialogSelectable = document.getElementById('dialog-selectable').checked;
  const enableCache = document.getElementById('enable-cache').checked;
  const cacheDuration = document.getElementById('cache-duration').value;
  const enableTTS = document.getElementById('enable-tts').checked;
  const ttsApiEndpoint = document.getElementById('tts-api-endpoint').value;
  const ttsRetryCount = document.getElementById('tts-retry-count').value;
  const ttsVoice = document.getElementById('tts-voice').value;
  const ttsRate = document.getElementById('tts-rate').value;
  const ttsPitch = document.getElementById('tts-pitch').value;
  const ttsBackgroundPlay = document.getElementById('tts-background-play').checked;

  // 先获取当前保存的设置，用于比较是否有变化
  chrome.storage.sync.get({
    apiEndpoint: '',
    apiKey: '',
    modelName: 'gpt-4',
    prompt: '请以一个动漫少女的口吻，用中文总结并评论以下网页内容，忽略其中无关的文字，抓住主题，字数控制在300字左右。',
    maxTokens: '1000',
    retryCount: 3, // 默认重试3次
    characterModel: 'shizuku',
    enableFloatingButton: true,
    askPrompt: '请以一个动漫少女的口吻，结合网页上下文解释我页面中选中的这个内容"{selection}"，直接解释，不要总结其他内容，不超过100字。\\n\\n网页上下文：{context}',
    enableFollowUp: true,
    dialogOpacity: 0.6,
    dialogFontSize: 14,
    overallScale: 100,
    blacklist: '',
    // refreshShortcut 和 closeShortcut 不再需要存储在这里
    autoSummarize: true,
    dialogSelectable: false,
    enableCache: true,
    cacheDuration: 5,
    enableTTS: false,
    ttsApiEndpoint: 'https://libretts.is-an.org/api/tts',
    ttsRetryCount: 2,
    ttsVoice: 'zh-CN-XiaoxiaoNeural',
    ttsRate: 0,
    ttsPitch: 0,
    ttsBackgroundPlay: false
  }, (oldSettings) => {
    // 检查设置是否有变化
    const newSettings = {
      dialogOpacity: parseFloat(dialogOpacity),
      dialogFontSize: parseInt(dialogFontSize, 10),
      overallScale: parseInt(overallScale, 10),
      apiEndpoint: apiEndpoint,
      apiKey: apiKey,
      modelName: modelName,
      prompt: prompt,
      maxTokens: maxTokens,
      retryCount: parseInt(retryCount, 10) || 0,
      characterModel: characterModel,
      enableFloatingButton: enableFloatingButton,
      askPrompt: askPrompt,
      enableFollowUp: enableFollowUp,
      blacklist: blacklist,
      // refreshShortcut 和 closeShortcut 不再需要存储在这里
      autoSummarize: autoSummarize,
      dialogSelectable: dialogSelectable,
      enableCache: enableCache,
      cacheDuration: parseInt(cacheDuration, 10) || 5,
      enableTTS: enableTTS,
      ttsApiEndpoint: ttsApiEndpoint,
      ttsRetryCount: parseInt(ttsRetryCount, 10) || 0,
      ttsVoice: ttsVoice,
      ttsRate: parseInt(ttsRate, 10),
      ttsPitch: parseInt(ttsPitch, 10),
      ttsBackgroundPlay: ttsBackgroundPlay
    };

    const hasChanges =
      oldSettings.apiEndpoint !== newSettings.apiEndpoint ||
      oldSettings.apiKey !== newSettings.apiKey ||
      oldSettings.modelName !== newSettings.modelName ||
      oldSettings.prompt !== newSettings.prompt ||
      oldSettings.maxTokens !== newSettings.maxTokens ||
      oldSettings.retryCount !== newSettings.retryCount ||
      oldSettings.characterModel !== newSettings.characterModel ||
      oldSettings.enableFloatingButton !== newSettings.enableFloatingButton ||
      oldSettings.askPrompt !== newSettings.askPrompt ||
      oldSettings.enableFollowUp !== newSettings.enableFollowUp ||
      oldSettings.dialogOpacity !== newSettings.dialogOpacity ||
      oldSettings.dialogFontSize !== newSettings.dialogFontSize ||
      oldSettings.overallScale !== newSettings.overallScale ||
      oldSettings.blacklist !== newSettings.blacklist ||
      // 快捷键比较逻辑不再需要
      oldSettings.autoSummarize !== newSettings.autoSummarize ||
      oldSettings.dialogSelectable !== newSettings.dialogSelectable ||
      oldSettings.enableCache !== newSettings.enableCache ||
      oldSettings.cacheDuration !== newSettings.cacheDuration ||
      oldSettings.enableTTS !== newSettings.enableTTS ||
      oldSettings.ttsApiEndpoint !== newSettings.ttsApiEndpoint ||
      oldSettings.ttsRetryCount !== newSettings.ttsRetryCount ||
      oldSettings.ttsVoice !== newSettings.ttsVoice ||
      oldSettings.ttsRate !== newSettings.ttsRate ||
      oldSettings.ttsPitch !== newSettings.ttsPitch ||
      oldSettings.ttsBackgroundPlay !== newSettings.ttsBackgroundPlay;

    chrome.storage.sync.set(newSettings, () => {
      const saveButtonText = document.getElementById('save-button-text');

      if (hasChanges) {
        saveButtonText.textContent = '选项已保存。';

        // 只有当设置有变化时才刷新当前活动的标签页
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs && tabs.length > 0) {
            chrome.tabs.reload(tabs.id);
          }
        });
        
        setTimeout(() => {
          saveButtonText.textContent = '保存设置';
        }, 1500);

      } else {
        saveButtonText.textContent = '设置未变化';
        // 1.5秒后仅清除消息
        setTimeout(() => {
          saveButtonText.textContent = '保存设置';
        }, 1500);
      }
    });
  });
}

// 使用存储在 chrome.storage 中的首选项恢复表单字段。
function restoreOptions() {
  chrome.storage.sync.get({
    apiEndpoint: '',
    apiKey: '',
    modelName: 'gpt-4', // 默认值
    prompt: '请以一个动漫少女的口吻，用中文总结并评论以下网页内容，忽略其中无关的文字，抓住主题，字数控制在300字左右。', // 默认值
    maxTokens: '1000', // 默认值
    retryCount: 3, // 默认值
    characterModel: 'shizuku', // 默认角色
    enableFloatingButton: true, // 默认启用
    askPrompt: '请以一个动漫少女的口吻，结合网页上下文解释我页面中选中的这个内容“{selection}”，直接解释，不要总结其他内容，不超过100字。\n\n网页上下文：{context}', // 默认提示词
    enableFollowUp: true,
    dialogOpacity: 0.6, // 默认透明度
    dialogFontSize: 14, // 默认字体大小
    overallScale: 100, // 默认整体缩放
    blacklist: '', // 默认黑名单为空
    // refreshShortcut 和 closeShortcut 的默认值不再需要
    autoSummarize: true, // 默认启用自动总结
    dialogSelectable: false,
    enableCache: true,
    cacheDuration: 5,
    enableTTS: false,
    ttsApiEndpoint: 'https://libretts.is-an.org/api/tts',
    ttsRetryCount: 2,
    ttsVoice: 'zh-CN-XiaoxiaoNeural',
    ttsRate: 0,
    ttsPitch: 0,
    ttsBackgroundPlay: false
  }, (items) => {
    document.getElementById('api-endpoint').value = items.apiEndpoint;
    document.getElementById('api-key').value = items.apiKey;
    document.getElementById('prompt').value = items.prompt;
    document.getElementById('max-tokens').value = items.maxTokens;
    document.getElementById('retry-count').value = items.retryCount;
    document.getElementById('character-model').value = items.characterModel;
    document.getElementById('enable-floating-button').checked = items.enableFloatingButton;
    document.getElementById('ask-prompt').value = items.askPrompt;
    document.getElementById('enable-follow-up').checked = items.enableFollowUp;
    document.getElementById('dialog-opacity').value = items.dialogOpacity;
    document.getElementById('opacity-value').textContent = items.dialogOpacity;
    document.getElementById('dialog-font-size').value = items.dialogFontSize;
    document.getElementById('font-size-value').textContent = items.dialogFontSize;
    document.getElementById('overall-scale').value = items.overallScale;
    document.getElementById('overall-scale-value').textContent = items.overallScale;
    document.getElementById('blacklist').value = items.blacklist;
    document.getElementById('auto-summarize').checked = items.autoSummarize;
    document.getElementById('dialog-selectable').checked = items.dialogSelectable;
    document.getElementById('enable-cache').checked = items.enableCache;
    document.getElementById('cache-duration').value = items.cacheDuration;
    document.getElementById('enable-tts').checked = items.enableTTS;
    document.getElementById('tts-api-endpoint').value = items.ttsApiEndpoint;
    document.getElementById('tts-retry-count').value = items.ttsRetryCount;
    document.getElementById('tts-rate').value = items.ttsRate;
    document.getElementById('tts-rate-value').textContent = `${items.ttsRate}%`;
    document.getElementById('tts-pitch').value = items.ttsPitch;
    document.getElementById('tts-pitch-value').textContent = `${items.ttsPitch}%`;
    document.getElementById('tts-background-play').checked = items.ttsBackgroundPlay;


    // 初始化UI状态
    updateAskPromptUI();
    updateCacheDurationUI();
    updateTTSOptionsUI();
    fetchTTSVoices(items.ttsVoice);

    // 移除API设置的自动隐藏功能，现在API设置始终可见

    // 保存当前选中的模型名称，以便在获取模型列表后恢复
    const savedModelName = items.modelName;
    
    // 不再自动获取模型列表，只有用户手动点击时才获取
    // 恢复保存的模型名称到下拉框
    const modelSelect = document.getElementById('model-name');
    if (savedModelName) {
      // 如果保存的模型不在列表中，添加它作为选项
      let optionExists = false;
      for (let option of modelSelect.options) {
        if (option.value === savedModelName) {
          optionExists = true;
          break;
        }
      }
      
      if (!optionExists) {
        const newOption = document.createElement('option');
        newOption.value = savedModelName;
        newOption.textContent = savedModelName;
        modelSelect.appendChild(newOption);
      }
      modelSelect.value = savedModelName;
    }
  });
}

// 根据启用状态，更新提示词输入框的UI
function updateAskPromptUI() {
  const enableFloatingButton = document.getElementById('enable-floating-button').checked;
  const askPromptGroup = document.getElementById('ask-prompt-group');
  const askPromptTextarea = document.getElementById('ask-prompt');

  if (enableFloatingButton) {
    askPromptGroup.style.opacity = '1';
    askPromptTextarea.disabled = false;
  } else {
    askPromptGroup.style.opacity = '0.5';
    askPromptTextarea.disabled = true;
  }
}

// 根据启用状态，更新缓存时长输入框的UI
function updateCacheDurationUI() {
  const enableCache = document.getElementById('enable-cache').checked;
  const cacheDurationGroup = document.getElementById('cache-duration-group');
  const cacheDurationInput = document.getElementById('cache-duration');

  if (enableCache) {
    cacheDurationGroup.style.opacity = '1';
    cacheDurationInput.disabled = false;
  } else {
    cacheDurationGroup.style.opacity = '0.5';
    cacheDurationInput.disabled = true;
  }
}
// 设置API设置区域的折叠/展开功能
function setupApiSettingsToggle() {
  const apiSettingsToggle = document.getElementById('api-settings-toggle');
  const apiSettingsContainer = document.getElementById('api-settings-container');

  // 检查元素是否存在，因为现在API设置始终可见，不需要折叠功能
  if (apiSettingsToggle && apiSettingsContainer) {
    apiSettingsToggle.addEventListener('click', () => {
      const isVisible = apiSettingsContainer.style.display !== 'none';
      apiSettingsContainer.style.display = isVisible ? 'none' : 'block';
      apiSettingsToggle.textContent = isVisible ? 'API 设置 ▸' : 'API 设置 ▾';
    });
  }
}

// 获取TTS声音列表
async function fetchTTSVoices(savedVoice) {
  const voiceSelect = document.getElementById('tts-voice');
  try {
    // 同时获取API的声音列表和本地的翻译文件
    const [voiceResponse, speakersResponse] = await Promise.all([
      fetch('https://libretts.is-an.org/api/voices'),
      fetch(chrome.runtime.getURL('speakers.json'))
    ]);

    const voices = await voiceResponse.json();
    const speakersData = await speakersResponse.json();
    const speakerMappings = speakersData['edge-api'].speakers;

    voiceSelect.innerHTML = ''; // 清空现有选项

    // 根据语言进行分组
    const groupedVoices = voices.reduce((acc, voice) => {
      const lang = voice.Locale.split('-'); // 使用语言代码作为分组依据
      if (!acc[lang]) {
        acc[lang] = [];
      }
      acc[lang].push(voice);
      return acc;
    }, {});

    // 排序并创建选项组
    Object.keys(groupedVoices).sort().forEach(lang => {
      const optgroup = document.createElement('optgroup');
      optgroup.label = lang.toUpperCase();
      
      groupedVoices[lang].forEach(voice => {
        const option = document.createElement('option');
        option.value = voice.ShortName;
        // 使用speakers.json中的翻译，如果找不到则回退到API的DisplayName
        const translatedName = speakerMappings[voice.ShortName] || voice.DisplayName;
        option.textContent = `${translatedName} (${voice.Gender})`;
        optgroup.appendChild(option);
      });
      
      voiceSelect.appendChild(optgroup);
    });

    if (savedVoice) {
      voiceSelect.value = savedVoice;
    }

  } catch (error) {
    console.error('获取TTS声音列表失败:', error);
    const option = document.createElement('option');
    option.value = '';
    option.textContent = '加载声音列表失败';
    voiceSelect.appendChild(option);
  }
}

// 更新TTS选项的UI
function updateTTSOptionsUI() {
  const enableTTS = document.getElementById('enable-tts').checked;
  const ttsOptionsGroup = document.getElementById('tts-options-group');

  if (enableTTS) {
    ttsOptionsGroup.style.display = 'block';
  } else {
    ttsOptionsGroup.style.display = 'none';
  }
}

// 左右导航切换功能
function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const panels = document.querySelectorAll('.settings-panel');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetPanel = item.getAttribute('data-panel');
      
      // 移除所有活动状态
      navItems.forEach(nav => nav.classList.remove('active'));
      panels.forEach(panel => panel.classList.remove('active'));
      
      // 添加当前活动状态
      item.classList.add('active');
      const targetPanelElement = document.getElementById(targetPanel);
      if (targetPanelElement) {
        targetPanelElement.classList.add('active');
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  restoreOptions();
  setupApiSettingsToggle();
  setupNavigation(); // 添加导航功能
  // 确保在restoreOptions完成后再添加事件监听器
  setTimeout(() => {
    document.getElementById('enable-floating-button').addEventListener('change', updateAskPromptUI);
    document.getElementById('enable-cache').addEventListener('change', updateCacheDurationUI);
    document.getElementById('enable-tts').addEventListener('change', updateTTSOptionsUI);
  }, 100);

  // 获取并显示版本号
  const version = chrome.runtime.getManifest().version;
  const versionDisplay = document.getElementById('version-display');
  if (versionDisplay) {
    versionDisplay.textContent = `版本号 v${version}`;
    versionDisplay.href = `https://github.com/xusonfan/myChromeFriend/releases/tag/${version}`;
  }
});
document.getElementById('save-button').addEventListener('click', saveOptions);
document.getElementById('fetch-models-button').addEventListener('click', fetchModels);

document.getElementById('dialog-opacity').addEventListener('input', (event) => {
  document.getElementById('opacity-value').textContent = event.target.value;
});

document.getElementById('dialog-font-size').addEventListener('input', (event) => {
  document.getElementById('font-size-value').textContent = event.target.value;
});

document.getElementById('overall-scale').addEventListener('input', (event) => {
  document.getElementById('overall-scale-value').textContent = event.target.value;
});

document.getElementById('tts-rate').addEventListener('input', (event) => {
  document.getElementById('tts-rate-value').textContent = `${event.target.value}%`;
});

document.getElementById('tts-pitch').addEventListener('input', (event) => {
  document.getElementById('tts-pitch-value').textContent = `${event.target.value}%`;
});

document.getElementById('test-tts-button').addEventListener('click', testTTS);

document.getElementById('reset-tts-button').addEventListener('click', () => {
  document.getElementById('tts-rate').value = 0;
  document.getElementById('tts-rate-value').textContent = '0%';
  document.getElementById('tts-pitch').value = 0;
  document.getElementById('tts-pitch-value').textContent = '0%';
});

// 添加一个事件监听器来打开快捷键设置页面
document.getElementById('manage-shortcuts').addEventListener('click', () => {
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});

// 测试TTS发音
async function testTTS() {
  const ttsApiEndpoint = document.getElementById('tts-api-endpoint').value;
  const ttsVoice = document.getElementById('tts-voice').value;
  const ttsRate = document.getElementById('tts-rate').value;
  const ttsPitch = document.getElementById('tts-pitch').value;
  const testButton = document.getElementById('test-tts-button');

  if (!ttsVoice) {
    alert('请先选择一个声音。');
    return;
  }

  const originalButtonText = testButton.textContent;
  testButton.textContent = '正在生成...';
  testButton.disabled = true;

  try {
    const response = await fetch(ttsApiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: '你好，这是一个测试声音。',
        voice: ttsVoice,
        rate: ttsRate / 100, // API需要-1.0到1.0之间的值
        pitch: ttsPitch / 100, // API需要-1.0到1.0之间的值
        preview: true
      }),
    });

    if (!response.ok) {
      throw new Error(`TTS API 请求失败: ${response.statusText}`);
    }

    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    audio.play();

    audio.onended = () => {
      URL.revokeObjectURL(audioUrl);
      testButton.textContent = originalButtonText;
      testButton.disabled = false;
    };

  } catch (error) {
    console.error('TTS 测试失败:', error);
    alert('TTS 测试失败，请检查API端点和网络连接。');
    testButton.textContent = originalButtonText;
    testButton.disabled = false;
  }
}