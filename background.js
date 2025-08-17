// 监听来自content.js的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_SUMMARY') {
    // 从Chrome存储中获取API配置
    chrome.storage.sync.get(['apiEndpoint', 'apiKey', 'modelName', 'prompt', 'maxTokens'], (config) => {
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
      const PROMPT = config.prompt || '请以一个动漫少女的口吻，用中文总结并评论以下网页内容：'; // 使用保存的提示词或默认值
      const MAX_TOKENS = config.maxTokens || '1000'; // 使用保存的最大令牌数或默认值

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

      // 使用fetch发送请求
      fetch(chatEndpoint, {
        method: 'POST',
        headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}` // 根据你的API要求修改认证方式
      },
      body: JSON.stringify(requestData)
    })
    .then(response => {
      console.log("收到API的原始响应:", response);
      if (!response.ok) {
        throw new Error(`HTTP 错误! 状态码: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      console.log("API响应数据 (JSON解析后):", data);
      let summary = "未能获取总结，或API返回格式不正确。";

      if (data.choices && data.choices.length > 0) {
        const firstChoice = data.choices[0]; // 修正：正确获取数组的第一个元素
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
      console.error('调用AI API时出错:', error);
      sendResponse({ summary: `调用API时出错: ${error.message}。请检查后台日志获取详细信息。` });
    });
    });

    // 返回true表示我们将异步发送响应
    return true;
  }
});