// content.js

// 首先检查当前网址是否在黑名单中
chrome.storage.sync.get({
  blacklist: ''
}, (items) => {
  const blacklist = items.blacklist.split('\n')
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => {
      // 尝试去除协议头，以支持用户输入完整URL
      try {
        // 如果用户输入的是没有协议的域名，需要补充一个，否则URL构造函数会失败
        let url = item;
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          url = 'https://' + url;
        }
        return new URL(url).hostname;
      } catch (e) {
        // 如果不是有效的URL，就假定它是一个域名
        return item;
      }
    });
    
  const currentHostname = window.location.hostname;
    
  const isOnBlacklist = blacklist.some(blacklistedDomain => {
    // 完全匹配或匹配子域名
    // 例如 blacklistedDomain = 'google.com'
    // currentHostname = 'www.google.com' -> true
    // currentHostname = 'google.com' -> true
    // currentHostname = 'evilgoogle.com' -> false
    return currentHostname === blacklistedDomain || currentHostname.endsWith('.' + blacklistedDomain);
  });

  if (isOnBlacklist) {
    console.log(`当前域名 (${currentHostname}) 在黑名单中，不加载看板娘。`);
    return;
  }

  // 如果不在黑名单中，则继续加载看板娘
  initializeLive2D();
});


function initializeLive2D() {
  // 优化：在单页应用（SPA）中，如果窗口部件已存在，则不重新加载
  if (document.getElementById('live2d-widget')) {
    console.log('看板娘已存在，跳过重复加载。');
    return;
  }

  // 创建Live2D挂件容器和Canvas
  const live2dWidget = document.createElement('div');
  live2dWidget.id = 'live2d-widget';

  const live2dCanvas = document.createElement('canvas');
  live2dCanvas.id = 'live2dcanvas';
  live2dCanvas.width = 300;
  live2dCanvas.height = 600;

  live2dWidget.appendChild(live2dCanvas);
  document.body.appendChild(live2dWidget);

  // 从存储中获取用户选择的模型和缩放设置，然后注入脚本
  chrome.storage.sync.get({
    characterModel: 'shizuku', // 默认角色
    overallScale: 100
  }, (items) => {
    const modelName = items.characterModel;
    live2dWidget.dataset.modelUrl = chrome.runtime.getURL(`live2d_models/${modelName}/${modelName}.model.json`);
    live2dWidget.dataset.overallScale = items.overallScale;

    // 首先注入劫持脚本，以禁用废弃的DOM事件
    const hijackScript = document.createElement('script');
    hijackScript.src = chrome.runtime.getURL('hijack.js');
    document.head.appendChild(hijackScript);

    // 劫持脚本加载后，再加载L2D库
    hijackScript.onload = () => {
      // 依次注入所有必需的脚本到页面主世界（注意正确的加载顺序）
      const mainScript = document.createElement('script');
      mainScript.src = chrome.runtime.getURL('lib/L2Dwidget.min.js');
      document.head.appendChild(mainScript);

      mainScript.onload = () => {
        const chunkScript = document.createElement('script');
        chunkScript.src = chrome.runtime.getURL('lib/L2Dwidget.0.min.js');
        document.head.appendChild(chunkScript);

        chunkScript.onload = () => {
          const initScript = document.createElement('script');
          initScript.src = chrome.runtime.getURL('init-live2d.js');
          document.head.appendChild(initScript);
        };
      };
    };
  });

  let conversationHistory = []; // 用于存储对话历史
  let ttsSettings = {};
  let ttsQueue = [];
  let audioUrlQueue = [];
  let isSpeaking = false;
  let isFetching = false;
  let currentAudio = null;
  
  // 用于流式输出的变量
  let streamTimer = null; // 用于控制流式输出的定时器
  let currentStreamText = ''; // 存储当前流式文本
  let streamTextCallback = null; // 存储流式输出完成后的回调函数
  let dialogAtMouseEnabled = false;
  let isSelectionQueryDialogOpen = false; // 新增状态，追踪是否为划词提问对话框
  let lastMousePosition = { x: 0, y: 0 };

  // 使用 mousedown 事件在捕获阶段更新鼠标相对于视口的位置
  document.addEventListener('mousedown', (e) => {
    lastMousePosition = { x: e.clientX, y: e.clientY };
  }, true);

  // 创建一个包裹对话框和按钮的容器
  const dialogWrapper = document.createElement('div');
  dialogWrapper.id = 'dialog-wrapper';
  dialogWrapper.style.position = 'fixed';
  dialogWrapper.style.zIndex = '9999';
  dialogWrapper.style.bottom = '180px';
  dialogWrapper.style.left = '0px';
  dialogWrapper.style.display = 'none'; // 默认隐藏
  dialogWrapper.style.transition = 'top 0.3s ease'; // 为位置调整添加平滑过渡

  // 创建一个div作为对话框
  const dialogBox = document.createElement('div');
  dialogBox.id = 'dialog-box';
  dialogBox.style.position = 'relative'; // 改为相对定位
  dialogBox.style.width = '200px'; // 减小宽度
  dialogBox.style.maxWidth = '300px'; // 限制最大宽度
  dialogBox.style.padding = '8px'; // 移除为按钮预留的底部空间
  dialogBox.style.maxHeight = 'calc(100vh - 220px)'; // 限制最大高度，避免超出视窗
  dialogBox.style.overflowY = 'auto'; // 内容超出时显示滚动条
  dialogBox.style.border = '1px solid rgba(0, 0, 0, 0.2)'; // 半透明边框
  dialogBox.style.borderRadius = '12px';
  // dialogBox 自身不再控制显示/隐藏，交由 wrapper
  dialogBox.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.2)'; // 增强阴影效果
  dialogBox.style.pointerEvents = 'none'; // 添加鼠标穿透功能
  dialogBox.style.transition = 'all 0.3s ease'; // 添加过渡效果

  // 创建对话框内容容器
  const dialogContent = document.createElement('div');
  dialogContent.style.wordWrap = 'break-word'; // 长单词自动换行
  // 美化字体
  dialogContent.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  dialogContent.style.lineHeight = '1.4';
  dialogContent.style.color = '#333';
  dialogContent.style.letterSpacing = '0.2px';
  dialogBox.appendChild(dialogContent);

  // 隐藏滚动条样式但保留滚动功能
  dialogBox.style.scrollbarWidth = 'none'; // Firefox

  // 创建按钮容器
  const buttonContainer = document.createElement('div');
  buttonContainer.id = 'dialog-button-container';
  Object.assign(buttonContainer.style, {
    position: 'absolute',
    bottom: '-30px', // 调整到对话框外部，但更近
    right: '0px',
    display: 'flex',
    flexDirection: 'row',
    gap: '8px',
    opacity: '0',
    visibility: 'hidden',
    transition: 'opacity 0.3s ease, visibility 0.3s ease, transform 0.3s ease',
    transform: 'translateY(10px)',
    pointerEvents: 'none', // 默认无指针事件
  });

  // 创建关闭按钮
  const closeButton = document.createElement('span');
  // 显著放大关闭按钮SVG，使其视觉上更协调
  closeButton.innerHTML = '<svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><path d="M5.293 5.293a1 1 0 0 1 1.414 0L8 6.586l1.293-1.293a1 1 0 1 1 1.414 1.414L9.414 8l1.293 1.293a1 1 0 0 1-1.414 1.414L8 9.414l-1.293 1.293a1 1 0 0 1-1.414-1.414L6.586 8 5.293 6.707a1 1 0 0 1 0-1.414z"/></svg>';
  // 移除绝对定位，样式由flex容器控制
  closeButton.style.cursor = 'pointer';
  closeButton.style.display = 'flex';
  closeButton.style.alignItems = 'center';
  closeButton.style.justifyContent = 'center';
  closeButton.style.width = '18px';
  closeButton.style.height = '18px';
  closeButton.style.color = '#666';
  closeButton.style.transition = 'all 0.2s ease';
  closeButton.style.pointerEvents = 'auto'; // 按钮本身可以接收事件

  // 添加关闭事件
  closeButton.addEventListener('click', (e) => {
    e.stopPropagation(); // 防止事件冒泡
    dialogWrapper.style.display = 'none'; // 控制 wrapper 的显示
    isSelectionQueryDialogOpen = false; // 关闭时重置状态
    // 关闭对话框时，也隐藏追问输入框
    if (askInput) {
      askInput.style.display = 'none';
    }
  });

  // 添加悬停效果
  closeButton.addEventListener('mouseenter', () => {
    closeButton.style.color = '#007bff'; // 增强悬停颜色
    closeButton.style.transform = 'scale(1.1)';
  });

  closeButton.addEventListener('mouseleave', () => {
    closeButton.style.color = '#666';
    closeButton.style.transform = 'scale(1)';
  });
   
  // 创建刷新按钮
  const refreshButton = document.createElement('span');
  // 使用SVG图标以确保正确的纵横比和对齐
  refreshButton.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/><path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/></svg>';
  // 移除绝对定位
  refreshButton.style.cursor = 'pointer';
  refreshButton.style.display = 'flex';
  refreshButton.style.alignItems = 'center';
  refreshButton.style.justifyContent = 'center';
  refreshButton.style.width = '16px';
  refreshButton.style.height = '16px';
  refreshButton.style.color = '#666';
  refreshButton.style.transition = 'all 0.2s ease';
  refreshButton.style.pointerEvents = 'auto';
   
  // 添加刷新事件
  refreshButton.addEventListener('click', (e) => {
    e.stopPropagation();
    getSummaryOnLoad(true); // 强制刷新
  });
   
  // 添加悬停效果
  refreshButton.addEventListener('mouseenter', () => {
    refreshButton.style.color = '#007bff'; // 增强悬停颜色
    refreshButton.style.transform = 'scale(1.1)';
  });
   
  refreshButton.addEventListener('mouseleave', () => {
    refreshButton.style.color = '#666';
    refreshButton.style.transform = 'scale(1)';
  });
   
  // 创建追问按钮
  const askButton = document.createElement('span');
  // 使用SVG图标以确保正确的纵横比和对齐
  askButton.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M14 1a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4.414A2 2 0 0 0 3 11.586l-2 2V2a1 1 0 0 1 1-1h12zM2 0a2 2 0 0 0-2 2v12.793a.5.5 0 0 0 .854.353l2.853-2.853A1 1 0 0 1 4.414 12H14a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H2z"/></svg>';
  // 移除绝对定位
  askButton.style.cursor = 'pointer';
  // 设置为flex容器以完美居中SVG
  askButton.style.display = 'flex';
  askButton.style.alignItems = 'center';
  askButton.style.justifyContent = 'center';
  askButton.style.width = '16px';
  askButton.style.height = '16px';
  askButton.style.color = '#666';
  askButton.style.transition = 'all 0.2s ease';
  askButton.style.pointerEvents = 'auto';

  // 创建追问输入框
  const askInput = document.createElement('input');
  askInput.type = 'text';
  askInput.placeholder = '对当前内容进行追问...';
  askInput.style.position = 'absolute';
  askInput.style.bottom = '30px';
  askInput.style.left = '8px';
  askInput.style.right = '8px';
  askInput.style.width = 'calc(100% - 16px)';
  askInput.style.border = 'none';
  askInput.style.borderRadius = '12px';
  askInput.style.padding = '8px';
  askInput.style.background = 'rgba(255, 255, 255, 0.8)';
  askInput.style.boxShadow = 'inset 0 1px 3px rgba(0, 0, 0, 0.1)';
  askInput.style.outline = 'none';
  askInput.style.color = '#333';
  askInput.style.display = 'none'; // 默认隐藏
  askInput.style.pointerEvents = 'auto';

  dialogBox.appendChild(askInput);

  // 防止对话框滚动时带动页面滚动
  dialogBox.addEventListener('wheel', (e) => {
    // 如果对话框内容本身就不可滚动，则什么都不做
    if (dialogBox.scrollHeight <= dialogBox.clientHeight) {
      return;
    }

    const isAtTop = dialogBox.scrollTop === 0;
    // 检查是否滚动到底部（添加1px的容差以处理可能的像素不整数）
    const isAtBottom = dialogBox.scrollTop + dialogBox.clientHeight >= dialogBox.scrollHeight - 1;

    // 如果鼠标向上滚动且已经到顶，或者鼠标向下滚动且已经到底，则阻止页面滚动
    if ((isAtTop && e.deltaY < 0) || (isAtBottom && e.deltaY > 0)) {
      e.preventDefault();
    }
  }, { passive: false }); // 必须设置 passive 为 false 才能调用 preventDefault

  // 对话框滚动检测和渐变效果控制
  const updateGradientVisibility = () => {
    // 检查内容是否可以滚动
    const canScroll = dialogBox.scrollHeight > dialogBox.clientHeight;
    // 检查是否滚动到底部（添加2px容差）
    const isAtBottom = dialogBox.scrollTop + dialogBox.clientHeight >= dialogBox.scrollHeight - 2;
    
    // 当内容可以滚动且未滚动到底部时显示渐变
    if (canScroll && !isAtBottom) {
      dialogWrapper.classList.add('show-gradient');
    } else {
      dialogWrapper.classList.remove('show-gradient');
    }
  };

  // 监听滚动事件
  dialogBox.addEventListener('scroll', updateGradientVisibility);
  
  // 初始化时检查一次渐变显示状态
  setTimeout(updateGradientVisibility, 100);

  // 添加追问按钮事件
  askButton.addEventListener('click', (e) => {
    e.stopPropagation();
    askInput.style.display = askInput.style.display === 'none' ? 'block' : 'none';
    if (askInput.style.display === 'block') {
      askInput.focus();
    }
  });

  // 添加追问输入框事件
  askInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      askInput.style.display = 'none';
      return;
    }
    if (e.key === 'Enter' && askInput.value.trim() !== '') {
      stopTTS(); // 用户追问时停止TTS
      const question = askInput.value.trim();
      askInput.value = '';
      askInput.style.display = 'none';

      // 将用户追问添加到历史记录
      conversationHistory.push({ role: 'user', content: question });

      dialogBox.firstChild.innerHTML = '正在思考中...';
      // 发送包含历史记录的请求，添加isFollowUp标识
      chrome.runtime.sendMessage({ type: 'GET_SUMMARY', history: conversationHistory, isFollowUp: true }, (response) => {
        if (response && response.summary) {
          streamText(dialogBox, response.summary, 15, (fullText) => {
            // 将AI的完整回答添加到历史记录
            conversationHistory.push({ role: 'assistant', content: fullText });
          });
        } else {
          streamText(dialogBox, '未能获取响应。');
          // 如果请求失败，从历史记录中移除刚才的用户追问
          conversationHistory.pop();
        }
      });
    }
  });

  // 添加悬停效果
  askButton.addEventListener('mouseenter', () => {
    askButton.style.color = '#007bff'; // 增强悬停颜色
    askButton.style.transform = 'scale(1.1)';
  });

  askButton.addEventListener('mouseleave', () => {
    askButton.style.color = '#666';
    askButton.style.transform = 'scale(1)';
  });

  // 点击页面其他地方时隐藏追问输入框
  document.addEventListener('mousedown', (e) => {
    // 检查追问框是否可见，以及点击事件是否发生在追问框和追问按钮之外
    if (askInput.style.display === 'block' && e.target !== askInput && !askButton.contains(e.target)) {
      askInput.style.display = 'none';
    }
  });

  // 将按钮添加到按钮容器
  buttonContainer.appendChild(askButton);
  buttonContainer.appendChild(refreshButton);
  buttonContainer.appendChild(closeButton);

  // 添加带延迟的鼠标悬浮事件，以解决按钮无法点击的问题
  let hideButtonsTimeout = null;

  const showButtons = () => {
    if (hideButtonsTimeout) {
      clearTimeout(hideButtonsTimeout);
      hideButtonsTimeout = null;
    }
    buttonContainer.style.opacity = '1';
    buttonContainer.style.visibility = 'visible';
    buttonContainer.style.transform = 'translateY(0)';
    buttonContainer.style.pointerEvents = 'auto';
  };

  const hideButtons = () => {
    // 如果追问输入框是打开的，则不隐藏按钮
    if (askInput.style.display === 'block') {
      return;
    }
    buttonContainer.style.opacity = '0';
    buttonContainer.style.visibility = 'hidden';
    buttonContainer.style.transform = 'translateY(10px)';
    buttonContainer.style.pointerEvents = 'none';
  };

  const startHideTimer = () => {
    hideButtonsTimeout = setTimeout(hideButtons, 300);
  };

  dialogWrapper.addEventListener('mouseenter', showButtons);
  dialogWrapper.addEventListener('mouseleave', startHideTimer);
  buttonContainer.addEventListener('mouseenter', showButtons);
  buttonContainer.addEventListener('mouseleave', startHideTimer);

  // 将对话框和按钮容器添加到 wrapper
  dialogWrapper.appendChild(dialogBox);
  dialogWrapper.appendChild(buttonContainer);
  document.body.appendChild(dialogWrapper);

  // 新增：点击对话框外部时关闭对话框
  document.addEventListener('mousedown', (e) => {
    // 检查对话框是否可见，是否为划词提问对话框，以及点击事件是否发生在对话框之外
    if (isSelectionQueryDialogOpen && dialogWrapper.style.display === 'block' && !dialogWrapper.contains(e.target)) {
      dialogWrapper.style.display = 'none';
      isSelectionQueryDialogOpen = false; // 关闭时重置状态
      stopTTS(); // 关闭时停止TTS
      // 同时隐藏追问输入框
      if (askInput) {
        askInput.style.display = 'none';
      }
    }
  });

  // 从存储中获取设置并应用样式
  chrome.storage.sync.get({
    dialogOpacity: 0.6,
    dialogFontSize: 14,
    overallScale: 100,
    dialogSelectable: false,
    enableFollowUp: true,
    dialogAtMouse: false
  }, (items) => {
    dialogAtMouseEnabled = items.dialogAtMouse; // 只保存设置，不在此时定位
    if (!items.enableFollowUp) {
      askButton.style.display = 'none';
    }
    const scale = items.overallScale / 100;
    dialogBox.style.background = `rgba(255, 255, 255, ${items.dialogOpacity})`;
    dialogContent.style.fontSize = `${items.dialogFontSize}px`;
    
    // 基于缩放比例调整对话框宽度和位置
    const bottomPosition = 180 * scale;
    dialogBox.style.width = `${200 * scale}px`;
    dialogBox.style.maxWidth = `${300 * scale}px`; // 同时缩放maxWidth
    dialogWrapper.style.bottom = `${bottomPosition}px`; // 应用到 wrapper
    
    // 根据设置决定对话框是否可以被选中，并调整最大高度
    if (items.dialogSelectable) {
      dialogBox.style.pointerEvents = 'auto';
      // 如果不允许鼠标穿透，那么限制对话框的最大高度为可见高度的30%
      dialogBox.style.maxHeight = '30vh';
    } else {
      dialogBox.style.pointerEvents = 'none';
      // 动态调整maxHeight以防止其超出视窗顶部，恢复40px的顶部间距
      dialogBox.style.maxHeight = `calc(100vh - ${bottomPosition + 40}px)`;
    }
  });
   
  // 添加Webkit滚动条隐藏样式
  const style = document.createElement('style');
  style.textContent = `
    @keyframes floatAnimation {
      0%, 100% {
        transform: translateY(0);
      }
      50% {
        transform: translateY(-5px);
      }
    }
    #dialog-box {
      -ms-overflow-style: none;  /* IE and Edge */
      scrollbar-width: none;  /* Firefox */
      animation: floatAnimation 2s ease-in-out infinite !important;
    }
    #dialog-box::-webkit-scrollbar {
      width: 0px;
      display: none;
    }
    #dialog-box::-webkit-scrollbar-track {
      background: transparent;
    }
    #dialog-box::-webkit-scrollbar-thumb {
      background: transparent;
    }
    
    /* 对话框底部渐变效果 */
    #dialog-wrapper::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 20px;
      background: linear-gradient(to bottom,
        rgba(255, 255, 255, 0) 0%,
        rgba(255, 255, 255, 0.4) 30%,
        rgba(255, 255, 255, 0.7) 60%,
        rgba(255, 255, 255, 0.9) 100%
      );
      border-radius: 0 0 12px 12px;
      pointer-events: none;
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.3s ease, visibility 0.3s ease;
      z-index: 1;
    }
    
    #dialog-wrapper.show-gradient::after {
      opacity: 1;
      visibility: visible;
    }
  `;
  document.head.appendChild(style);

  // 简单的markdown解析函数
  function parseMarkdown(text) {
    return text
      // 标题
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      // 粗体
      .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
      // 斜体
      .replace(/\*(.*?)\*/gim, '<em>$1</em>')
      // 代码
      .replace(/`(.*)`/gim, '<code>$1</code>')
      // 链接
      .replace(/\[([^\]]+)\]\(([^)]+)\)/gim, '<a href="$2" target="_blank">$1</a>')
      // 换行
      .replace(/\n/gim, '<br>');
  }

  // 清理文本以用于TTS
  function cleanTextForTTS(text) {
    return text
      // 移除Markdown格式
      .replace(/#{1,6} /g, '') // 标题
      .replace(/\*\*|__|`|\*|_/g, '') // 粗体, 斜体, 代码
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // 链接
      // 移除Emoji (一个基础的范围，可能不全)
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
      .trim();
  }

  // TTS处理队列
  // 预加载下一个音频
  async function fetchNextAudio() {
    if (isFetching || ttsQueue.length === 0) {
      return;
    }
    isFetching = true;
    const textToSpeak = ttsQueue.shift();
    const retries = ttsSettings.ttsRetryCount || 0;

    for (let i = 0; i <= retries; i++) {
      try {
        const response = await fetch(ttsSettings.ttsApiEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: textToSpeak,
            voice: ttsSettings.ttsVoice,
            rate: ttsSettings.ttsRate / 100,
            pitch: ttsSettings.ttsPitch / 100,
          }),
        });
        if (!response.ok) throw new Error(`TTS API request failed with status ${response.status}`);
        
        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        audioUrlQueue.push(audioUrl);
        playNextAudio(); // 尝试播放
        
        // 成功后退出循环
        break;

      } catch (error) {
        console.error(`TTS音频获取失败 (尝试 ${i + 1}/${retries + 1}):`, error);
        if (i === retries) {
          // 这是最后一次尝试，仍然失败
          console.error(`TTS请求在 ${retries + 1} 次尝试后最终失败。`);
        }
      }
    }

    isFetching = false;
    // 立即尝试获取下一个，实现连续预加载
    fetchNextAudio();
  }

  // 播放队列中的下一个音频
  function playNextAudio() {
    if (isSpeaking || audioUrlQueue.length === 0) {
      return;
    }
    isSpeaking = true;
    const audioUrl = audioUrlQueue.shift();
    chrome.runtime.sendMessage({ type: 'PLAY_TTS_REQUEST', audioUrl: audioUrl });
    // 开始播放后，立即尝试预加载下一个
    fetchNextAudio();
  }

  // 停止TTS朗读
  function stopTTS() {
    // 向后台发送停止命令
    chrome.runtime.sendMessage({ type: 'STOP_TTS' });
    
    // 释放所有已创建的Blob URL
    audioUrlQueue.forEach(url => URL.revokeObjectURL(url));
    ttsQueue = [];
    audioUrlQueue = [];
    isSpeaking = false;
    isFetching = false;
  }

  /**
   * 流式显示函数（集成TTS）
   * @param {HTMLElement} element 要在其中显示文本的元素。
   * @param {string} text 要显示的文本。
   * @param {(number | {timeInterval: number})} [speed=15] 打字速度（毫秒）或包含 timeInterval 的对象。
   * @param {(fullText: string) => void} [callback] 流式输出完成后的回调函数。
   */
  function streamText(element, text, speed = 15, callback) {
    stopTTS(); // 开始新的流式输出前，停止之前的朗读
    if (streamTimer) clearTimeout(streamTimer);

    const contentElement = element.firstChild;
    contentElement.innerHTML = '';
    let index = 0;
    currentStreamText = '';
    let ttsBuffer = '';

    function typeWriter() {
      if (index < text.length) {
        currentStreamText += text.charAt(index);
        ttsBuffer += text.charAt(index);
        index++;

        contentElement.innerHTML = parseMarkdown(currentStreamText);
        updateGradientVisibility();

        // 检查是否形成完整段落用于TTS (以换行符为界)
        if (ttsSettings.enableTTS && ttsSettings.autoPlayTTS && ttsBuffer.includes('\n')) {
          const paragraphs = ttsBuffer.split('\n');
          // 处理所有完整的段落（除了最后一个可能不完整的）
          for (let i = 0; i < paragraphs.length - 1; i++) {
            const cleanedParagraph = cleanTextForTTS(paragraphs[i]);
            if (cleanedParagraph) {
              ttsQueue.push(cleanedParagraph);
              fetchNextAudio(); // 触发预加载
            }
          }
          // 更新缓冲区，只留下最后一个不完整的段落
          ttsBuffer = paragraphs[paragraphs.length - 1];
        }

        // 如果speed是数字，则使用固定速度；如果是对象且包含timeInterval，则使用动态速度
        let delay = 15; // 默认速度
        if (typeof speed === 'number') {
          delay = speed;
        } else if (typeof speed === 'object' && speed.timeInterval !== undefined) {
          delay = Math.max(1, speed.timeInterval); // 确保至少1ms的延迟
        }

        streamTimer = setTimeout(typeWriter, delay);
      } else {
        // 处理剩余的文本
        // 检查是否启用了TTS和自动播放
        if (ttsSettings.enableTTS && ttsSettings.autoPlayTTS && ttsBuffer.trim()) {
          const cleanedParagraph = cleanTextForTTS(ttsBuffer);
          if (cleanedParagraph) {
            ttsQueue.push(cleanedParagraph);
            fetchNextAudio(); // 触发预加载
          }
        }
        streamTimer = null;
        if (callback) callback(text);
      }
    }
    typeWriter();
  }

  // 页面加载后自动获取总结
  // 页面加载后自动获取总结
  function getSummaryOnLoad(forceRefresh = false) {
    chrome.storage.sync.get({
      enableCache: true,
      cacheDuration: 5
    }, (items) => {
      // 刷新时，隐藏追问输入框
      if (askInput) {
        askInput.style.display = 'none';
      }
      
      const contentElement = dialogBox.firstChild;
      isSelectionQueryDialogOpen = false; // 自动/手动总结时，禁用点击外部关闭
      // 恢复固定的左下角位置
      const scale = (live2dWidget.dataset.overallScale || 100) / 100;
      const bottomPosition = 180 * scale;
      dialogWrapper.style.left = '0px';
      dialogWrapper.style.top = 'auto';
      dialogWrapper.style.bottom = `${bottomPosition}px`;
      dialogWrapper.style.display = 'block'; // 控制 wrapper 的显示
      
      const CACHE_KEY = 'myChromeFriendSummaryCache';
      const CACHE_DURATION = (items.cacheDuration || 5) * 60 * 1000;
      const now = new Date().getTime();

      if (forceRefresh || !items.enableCache) {
        sessionStorage.removeItem(CACHE_KEY);
        if (forceRefresh) console.log("强制刷新，已清除缓存。");
        if (!items.enableCache) console.log("缓存已禁用，清除缓存。");
      } else {
        const cachedData = sessionStorage.getItem(CACHE_KEY);
        if (cachedData) {
          try {
            const { summary, timestamp } = JSON.parse(cachedData);
            if (summary && (now - timestamp < CACHE_DURATION)) {
              console.log("使用缓存的总结内容。");
              conversationHistory = []; // 每次都重置历史
              // 通过克隆body并移除插件UI来获取纯净的页面文本
              const documentClone = document.cloneNode(true);
              const dialogClone = documentClone.querySelector('#dialog-wrapper');
              if (dialogClone) {
                dialogClone.remove();
              }
              const floatingButtonClone = documentClone.querySelector('#floating-ask-button');
              if (floatingButtonClone) {
                floatingButtonClone.remove();
              }
              const article = new Readability(documentClone, {
                maxElemsToParse: 20000, // 设置最大解析元素数量以提高性能
                disableJSONLD: true, // 禁用JSON-LD元数据解析
              }).parse();
              const pageText = article ? article.textContent : documentClone.body.innerText;
              const userMessage = { role: 'user', content: pageText };
              conversationHistory.push(userMessage);

              streamText(dialogBox, summary, 15, (fullText) => {
                conversationHistory.push({ role: 'assistant', content: fullText });
                setTimeout(updateGradientVisibility, 100);
              });
              return;
            }
          } catch (e) {
            console.error("解析缓存失败", e);
            sessionStorage.removeItem(CACHE_KEY);
          }
        }
      }

      // 立即显示"正在思考中"并保持可见
      contentElement.innerHTML = '飞速阅读中...';
      conversationHistory = []; // 开始新的总结时，清空历史记录
      
      // 更新渐变显示状态
      setTimeout(updateGradientVisibility, 100);

      // 从页面获取文本内容
      // 使用一个小的延迟来确保动态加载的页面内容也能被捕获
      setTimeout(() => {
        // 通过克隆body并移除插件UI来获取纯净的页面文本
        const documentClone = document.cloneNode(true);
        const dialogClone = documentClone.querySelector('#dialog-wrapper');
        if (dialogClone) {
          dialogClone.remove();
        }
        const floatingButtonClone = documentClone.querySelector('#floating-ask-button');
        if (floatingButtonClone) {
          floatingButtonClone.remove();
        }
        const article = new Readability(documentClone, {
          maxElemsToParse: 20000, // 设置最大解析元素数量以提高性能
          disableJSONLD: true, // 禁用JSON-LD元数据解析
        }).parse();
        const pageText = article ? article.textContent : documentClone.body.innerText;
        const userMessage = { role: 'user', content: pageText };
        conversationHistory.push(userMessage);

        // 发送消息到background.js
        chrome.runtime.sendMessage({ type: 'GET_SUMMARY', history: conversationHistory }, (response) => {
          if (response && response.summary) {
            // 如果启用了缓存，则更新缓存
            if (items.enableCache) {
              const cacheValue = {
                summary: response.summary,
                timestamp: new Date().getTime()
              };
              sessionStorage.setItem(CACHE_KEY, JSON.stringify(cacheValue));
            }

            // 使用流式显示，并在结束后更新历史记录
            // 传递一个对象，包含timeInterval属性，初始为15ms
            streamText(dialogBox, response.summary, { timeInterval: 15 }, (fullText) => {
              conversationHistory.push({ role: 'assistant', content: fullText });
              // 流式输出完成后再次检查渐变状态
              setTimeout(updateGradientVisibility, 100);
            });
          } else {
            // 如果没有收到有效的响应，也显示错误信息
            streamText(dialogBox, '未能获取响应。');
            conversationHistory.pop(); // 移除失败的用户消息
          }
        });
      }, 500); // 500毫秒的延迟
    });
  }
  // 根据用户设置决定是否启用划词提问功能
  chrome.storage.sync.get({
    enableFloatingButton: true, // 默认启用
    askPrompt: '这是我选中的文本：\n\n"{selection}"\n\n请基于以下网页内容，以动漫少女的口吻解释这段文本：\n\n{context}' // 默认提示词
  }, (items) => {
    if (items.enableFloatingButton) {
      const askPromptTemplate = items.askPrompt;
      // 创建浮动按钮
      const floatingButton = document.createElement('div');
      floatingButton.id = 'floating-ask-button';
      floatingButton.innerText = '问问看板娘';
      Object.assign(floatingButton.style, {
        position: 'absolute',
        display: 'none',
        zIndex: '10000',
        padding: '5px 10px',
        background: 'white',
        color: '#333', // 设置字体颜色为深灰色
        fontSize: '14px', // 设置固定字体大小以确保在不同网页中大小一致
        border: '1px solid #ccc',
        borderRadius: '5px',
        cursor: 'pointer',
        boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
      });
      document.body.appendChild(floatingButton);

      let lastSelectedText = '';

      // 监听鼠标抬起事件，以检测文本选择
      document.addEventListener('mouseup', (e) => {
        // 确保点击的不是我们的浮动按钮
        if (e.target === floatingButton) {
          return;
        }
        
        // 延迟一小段时间以确保选区信息已更新
        setTimeout(() => {
          const selection = window.getSelection();
          const selectedText = selection.toString().trim();

          if (selectedText) {
            lastSelectedText = selectedText; // 暂存选中的文本
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            
            // 定位按钮到选区右下角
            floatingButton.style.left = `${window.scrollX + rect.right}px`;
            floatingButton.style.top = `${window.scrollY + rect.bottom}px`;
            floatingButton.style.display = 'block';
          } else {
            floatingButton.style.display = 'none';
          }
        }, 10);
      });

      // 点击按钮时触发解释
      floatingButton.addEventListener('click', () => {
        if (lastSelectedText) {
          stopTTS(); // 划词提问时停止TTS
          const contentElement = dialogBox.firstChild;
          contentElement.innerHTML = '正在思考中...';
          isSelectionQueryDialogOpen = true; // 划词提问时，启用点击外部关闭
          if (dialogAtMouseEnabled) {
            // 将对话框的左上角定位到鼠标位置，使其出现在鼠标右下角
            dialogWrapper.style.left = `${lastMousePosition.x}px`;
            dialogWrapper.style.top = `${lastMousePosition.y}px`;
            dialogWrapper.style.bottom = 'auto';
          } else {
           // 恢复固定的左下角位置
           const scale = (live2dWidget.dataset.overallScale || 100) / 100;
           const bottomPosition = 180 * scale;
           dialogWrapper.style.left = '0px';
           dialogWrapper.style.top = 'auto';
           dialogWrapper.style.bottom = `${bottomPosition}px`;
          }
          dialogWrapper.style.display = 'block'; // 控制 wrapper 的显示
          conversationHistory = []; // 开始新的划词提问时，清空历史记录
          
          // 更新渐变显示状态
          setTimeout(updateGradientVisibility, 100);

          // 通过克隆body并移除插件UI来获取纯净的页面上下文
          const documentClone = document.cloneNode(true);
          const dialogClone = documentClone.querySelector('#dialog-wrapper');
          if (dialogClone) {
            dialogClone.remove();
          }
          const floatingButtonClone = documentClone.querySelector('#floating-ask-button');
          if (floatingButtonClone) {
            floatingButtonClone.remove();
          }
          const article = new Readability(documentClone, {
            maxElemsToParse: 20000, // 设置最大解析元素数量以提高性能
            disableJSONLD: true, // 禁用JSON-LD元数据解析
          }).parse();
          const pageContext = article ? article.textContent : documentClone.body.innerText;
          const combinedText = askPromptTemplate
            .replace('{selection}', lastSelectedText)
            .replace('{context}', pageContext);
          
          const userMessage = { role: 'user', content: combinedText };
          conversationHistory.push(userMessage);

          chrome.runtime.sendMessage({ type: 'GET_SUMMARY', history: conversationHistory, isFollowUp: true }, (response) => {
            if (response && response.summary) {
              streamText(dialogBox, response.summary, 15, (fullText) => {
                conversationHistory.push({ role: 'assistant', content: fullText });
                // 流式输出完成后再次检查渐变状态
                setTimeout(updateGradientVisibility, 100);

                // 新增：检查并调整对话框位置，确保其在视口内
                const rect = dialogWrapper.getBoundingClientRect();
                const viewportHeight = window.innerHeight;
                if (rect.bottom > viewportHeight) {
                  const overflow = rect.bottom - viewportHeight;
                  const newTop = rect.top - overflow - 10; // 向上移动并留出10px边距
                  dialogWrapper.style.top = `${newTop}px`;
                }
              });
            } else {
              streamText(dialogBox, '未能获取响应。');
              conversationHistory.pop();
            }
          });
        }
        // 点击后隐藏按钮
        floatingButton.style.display = 'none';
        lastSelectedText = ''; // 清空暂存的文本
      });

      // 点击页面其他地方时隐藏按钮
      document.addEventListener('mousedown', (e) => {
        if (e.target !== floatingButton) {
          floatingButton.style.display = 'none';
        }
      });
    }
  });

  // 一次性加载所有需要的设置，以避免竞争条件
  chrome.storage.sync.get({
    autoSummarize: true,
    enableTTS: false,
    ttsApiEndpoint: 'https://libretts.is-an.org/api/tts',
    ttsRetryCount: 2,
    ttsVoice: 'zh-CN-XiaoxiaoNeural',
    ttsRate: 0,
    ttsPitch: 0,
    ttsBackgroundPlay: false,
    autoPlayTTS: true
  }, items => {
    // 首先，将所有TTS相关的设置加载到内存中
    ttsSettings = items;

    // 然后，在确认设置已加载后，再根据autoSummarize的设置决定是否执行总结
    if (items.autoSummarize) {
      getSummaryOnLoad();
    }
  });

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'TTS_PLAYBACK_FINISHED') {
        isSpeaking = false;
        playNextAudio(); // 播放完成，尝试播放下一个
    } else if (request.type === 'STREAM_CHUNK') {
        // 处理流式响应数据块
        if (request.isEnd) {
            // 流结束，执行回调
            if (streamTextCallback) {
                streamTextCallback(currentStreamText);
                streamTextCallback = null;
            }
        } else {
            // 流数据块，更新显示
            streamText(dialogBox, request.chunk, { timeInterval: request.timeInterval });
        }
    } else if (request.type === "STOP_TTS") {
        stopTTS();
    } else if (request.type === "REFRESH_SUMMARY") {
      console.log("收到刷新总结内容的命令");
      stopTTS();
      getSummaryOnLoad(true); // 强制刷新
    } else if (request.type === "CLOSE_DIALOG") {
      console.log("收到关闭对话框的命令，将清空内容并隐藏。");
      stopTTS();
      const dialogWrapper = document.getElementById('dialog-wrapper');
      if (dialogWrapper) {
        dialogWrapper.style.display = 'none';
        // 隐藏追问输入框
        const askInput = document.querySelector('#dialog-box input[type="text"]');
        if (askInput) {
          askInput.style.display = 'none';
        }
        // 停止任何正在进行的流式输出
        if (streamTimer) {
          clearTimeout(streamTimer);
          streamTimer = null;
        }
        // 清空对话框内容
        if (dialogBox.firstChild) {
          dialogBox.firstChild.innerHTML = '';
        }
      }
    } else if (request.type === "TOGGLE_VISIBILITY") {
      console.log("收到切换对话框可见性的命令");
      const dialogWrapper = document.getElementById('dialog-wrapper');
      const dialogBox = document.getElementById('dialog-box');
      if (dialogWrapper && dialogBox) {
        const hasContent = dialogBox.firstChild && dialogBox.firstChild.innerHTML.trim() !== '';
        if (dialogWrapper.style.display === 'none') {
          // 仅当有内容时才显示
          if (hasContent) {
            dialogWrapper.style.display = 'block';
          } else {
            console.log("对话框内容为空，不执行显示操作。");
          }
        } else {
          dialogWrapper.style.display = 'none';
          stopTTS(); // 隐藏时停止TTS
          // 隐藏对话框时，也隐藏追问输入框
          const askInput = document.querySelector('#dialog-box input[type="text"]');
          if (askInput) {
            askInput.style.display = 'none';
          }
        }
      }
    } else if (request.type === "TOGGLE_FOLLOW_UP") {
      console.log("收到切换追问输入框的命令");
      // 模拟点击追问按钮
      if (askButton.style.display !== 'none') {
        askButton.click();
      }
    } else if (request.type === "TOGGLE_TTS") {
      console.log("收到切换TTS播放状态的命令");
      if (isSpeaking) {
        stopTTS();
      } else {
        // 如果没有在说话，则开始朗读当前对话框的全部内容
        const fullText = dialogContent.innerText;
        if (fullText && ttsSettings.enableTTS) {
          const cleanedText = cleanTextForTTS(fullText);
          const paragraphs = cleanedText.split('\n').filter(p => p.trim() !== '');
          paragraphs.forEach(p => ttsQueue.push(p));
          fetchNextAudio();
        }
      }
    } else if (request.type === "BOSS_KEY") {
      console.log(`收到老板键命令，状态: ${request.isHidden}`);
      const live2dWidget = document.getElementById('live2d-widget');
      const dialogWrapper = document.getElementById('dialog-wrapper');
      if (live2dWidget && dialogWrapper) {
        const displayStyle = request.isHidden ? 'none' : 'block';
        live2dWidget.style.display = displayStyle;
        dialogWrapper.style.display = displayStyle;
        if (request.isHidden) {
          stopTTS(); // 隐藏时停止TTS
        }
      }
    }
  });
}