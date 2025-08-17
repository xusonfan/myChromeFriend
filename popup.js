// popup.js - 处理设置弹出窗口的逻辑。

// 获取模型列表
async function fetchModels() {
  return new Promise(async (resolve, reject) => {
  const apiEndpoint = document.getElementById('api-endpoint').value;
  const apiKey = document.getElementById('api-key').value;
  const modelDatalist = document.getElementById('model-list');
  const modelInput = document.getElementById('model-name');
  const status = document.getElementById('status');

  console.log('开始获取模型列表...');
  console.log('API端点:', apiEndpoint);
  console.log('datalist元素:', modelDatalist);
  console.log('model输入框元素:', modelInput);

  if (!apiEndpoint) {
    status.textContent = '请先输入AI API端点。';
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
    status.textContent = 'API端点URL格式错误。';
    return;
  }

  status.textContent = '正在获取模型...';

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
    modelSelect.innerHTML = ''; // 清空现有选项
    
    if (!Array.isArray(models)) {
      console.error('模型数据不是数组格式:', models);
      status.textContent = '模型数据格式错误。';
      return;
    }

    // 添加默认空选项
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = '请选择模型...';
    modelSelect.appendChild(defaultOption);

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
      }
    });

    console.log('最终select内容:', modelSelect.innerHTML);
    console.log('select子元素数量:', modelSelect.children.length);

    status.textContent = `模型列表已更新，共${modelSelect.children.length - 1}个模型。`;
    resolve(); // 成功时解析Promise

  } catch (error) {
    console.error('获取模型失败:', error);
    status.textContent = '获取模型失败，请检查端点和密钥。';
    reject(error); // 失败时拒绝Promise
  } finally {
    setTimeout(() => {
      if (status.textContent.includes('获取') || status.textContent.includes('更新')) {
        status.textContent = '';
      }
    }, 2000);
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
  const characterModel = document.getElementById('character-model').value;
  const enableFloatingButton = document.getElementById('enable-floating-button').checked;
  const askPrompt = document.getElementById('ask-prompt').value;
  const dialogOpacity = document.getElementById('dialog-opacity').value;

  // 先获取当前保存的设置，用于比较是否有变化
  chrome.storage.sync.get({
    apiEndpoint: '',
    apiKey: '',
    modelName: 'gpt-4',
    prompt: '请以一个动漫少女的口吻，用中文总结并评论以下网页内容：',
    maxTokens: '1000',
    characterModel: 'shizuku',
    enableFloatingButton: true,
    askPrompt: '请以一个动漫少女的口吻，结合网页上下文解释我页面中选中的这个内容"{selection}"，直接解释，不要总结其他内容，不超过100字。\\n\\n网页上下文：{context}',
    dialogOpacity: 0.6
  }, (oldSettings) => {
    // 检查设置是否有变化
    const newSettings = {
      dialogOpacity: dialogOpacity,
      apiEndpoint: apiEndpoint,
      apiKey: apiKey,
      modelName: modelName,
      prompt: prompt,
      maxTokens: maxTokens,
      characterModel: characterModel,
      enableFloatingButton: enableFloatingButton,
      askPrompt: askPrompt
    };

    const hasChanges =
      oldSettings.apiEndpoint !== newSettings.apiEndpoint ||
      oldSettings.apiKey !== newSettings.apiKey ||
      oldSettings.modelName !== newSettings.modelName ||
      oldSettings.prompt !== newSettings.prompt ||
      oldSettings.maxTokens !== newSettings.maxTokens ||
      oldSettings.characterModel !== newSettings.characterModel ||
      oldSettings.enableFloatingButton !== newSettings.enableFloatingButton ||
      oldSettings.askPrompt !== newSettings.askPrompt ||
      oldSettings.dialogOpacity !== newSettings.dialogOpacity;

    chrome.storage.sync.set(newSettings, () => {
      // 更新状态，让用户知道选项已保存。
      const status = document.getElementById('status');
      if (hasChanges) {
        status.textContent = '选项已保存。';
      } else {
        status.textContent = '设置未变化，无需保存。';
      }
      setTimeout(() => {
        status.textContent = '';
      }, 1500);

      // 只有当设置有变化时才刷新当前活动的标签页
      if (hasChanges) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs && tabs.length > 0) {
            chrome.tabs.reload(tabs[0].id);
          }
        });
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
    prompt: '请以一个动漫少女的口吻，用中文总结并评论以下网页内容：', // 默认值
    maxTokens: '1000', // 默认值
    characterModel: 'shizuku', // 默认角色
    enableFloatingButton: true, // 默认启用
    askPrompt: '请以一个动漫少女的口吻，结合网页上下文解释我页面中选中的这个内容“{selection}”，直接解释，不要总结其他内容，不超过100字。\n\n网页上下文：{context}', // 默认提示词
    dialogOpacity: 0.6 // 默认透明度
  }, (items) => {
    document.getElementById('api-endpoint').value = items.apiEndpoint;
    document.getElementById('api-key').value = items.apiKey;
    document.getElementById('prompt').value = items.prompt;
    document.getElementById('max-tokens').value = items.maxTokens;
    document.getElementById('character-model').value = items.characterModel;
    document.getElementById('enable-floating-button').checked = items.enableFloatingButton;
    document.getElementById('ask-prompt').value = items.askPrompt;
    document.getElementById('dialog-opacity').value = items.dialogOpacity;
    document.getElementById('opacity-value').textContent = items.dialogOpacity;

    // 初始化UI状态
    updateAskPromptUI();

    // 保存当前选中的模型名称，以便在获取模型列表后恢复
    const savedModelName = items.modelName;
    
    // 自动获取模型列表
    fetchModels().then(() => {
      // 在获取模型列表后，尝试恢复保存的模型名称
      const modelSelect = document.getElementById('model-name');
      if (savedModelName) {
        // 检查保存的模型是否在选项列表中
        let optionExists = false;
        for (let option of modelSelect.options) {
          if (option.value === savedModelName) {
            optionExists = true;
            break;
          }
        }
        
        if (optionExists) {
          modelSelect.value = savedModelName;
        } else {
          // 如果保存的模型不在列表中，添加它作为选项
          const newOption = document.createElement('option');
          newOption.value = savedModelName;
          newOption.textContent = savedModelName;
          modelSelect.appendChild(newOption);
          modelSelect.value = savedModelName;
        }
      }
    });
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

document.addEventListener('DOMContentLoaded', () => {
  restoreOptions();
  // 确保在restoreOptions完成后再添加事件监听器
  setTimeout(() => {
    document.getElementById('enable-floating-button').addEventListener('change', updateAskPromptUI);
  }, 100);
});
document.getElementById('save-button').addEventListener('click', saveOptions);
document.getElementById('fetch-models-button').addEventListener('click', fetchModels);

document.getElementById('dialog-opacity').addEventListener('input', (event) => {
  document.getElementById('opacity-value').textContent = event.target.value;
});