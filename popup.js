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

  chrome.storage.sync.set({
    apiEndpoint: apiEndpoint,
    apiKey: apiKey,
    modelName: modelName,
    prompt: prompt,
    maxTokens: maxTokens,
    characterModel: characterModel
  }, () => {
    // 更新状态，让用户知道选项已保存。
    const status = document.getElementById('status');
    status.textContent = '选项已保存。';
    setTimeout(() => {
      status.textContent = '';
    }, 1500);
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
    characterModel: 'shizuku' // 默认角色
  }, (items) => {
    document.getElementById('api-endpoint').value = items.apiEndpoint;
    document.getElementById('api-key').value = items.apiKey;
    document.getElementById('prompt').value = items.prompt;
    document.getElementById('max-tokens').value = items.maxTokens;
    document.getElementById('character-model').value = items.characterModel;

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

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('save-button').addEventListener('click', saveOptions);
document.getElementById('fetch-models-button').addEventListener('click', fetchModels);