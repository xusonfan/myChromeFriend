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
  // 创建Live2D挂件容器和Canvas
  const live2dWidget = document.createElement('div');
  live2dWidget.id = 'live2d-widget';

  const live2dCanvas = document.createElement('canvas');
  live2dCanvas.id = 'live2dcanvas';
  live2dCanvas.width = 300;
  live2dCanvas.height = 600;

  live2dWidget.appendChild(live2dCanvas);
  document.body.appendChild(live2dWidget);

  // 从存储中获取用户选择的模型，然后注入脚本
  chrome.storage.sync.get({
    characterModel: 'shizuku' // 默认角色
  }, (items) => {
    const modelName = items.characterModel;
    live2dWidget.dataset.modelUrl = chrome.runtime.getURL(`live2d_models/${modelName}/${modelName}.model.json`);

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

  // 创建一个div作为对话框
  const dialogBox = document.createElement('div');
  dialogBox.id = 'dialog-box';
  dialogBox.style.position = 'fixed';
  dialogBox.style.zIndex = '9999'; // 设置一个很高的z-index值
  dialogBox.style.bottom = '180px'; // 将对话框下移，使其更贴近人物
  dialogBox.style.left = '0px'; // 直接放在人物头顶
  dialogBox.style.width = '200px'; // 减小宽度
  dialogBox.style.maxWidth = '300px'; // 限制最大宽度
  dialogBox.style.padding = '8px';
  dialogBox.style.maxHeight = 'calc(100vh - 220px)'; // 限制最大高度，避免超出视窗
  dialogBox.style.overflowY = 'auto'; // 内容超出时显示滚动条
  dialogBox.style.border = '1px solid rgba(0, 0, 0, 0.2)'; // 半透明边框
  dialogBox.style.borderRadius = '12px';
  dialogBox.style.display = 'none'; // 默认隐藏
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

  // 创建关闭按钮
  const closeButton = document.createElement('span');
  closeButton.innerHTML = '&times;'; // 'X' 符号
  closeButton.style.position = 'absolute';
  closeButton.style.bottom = '5px';
  closeButton.style.right = '8px';
  closeButton.style.cursor = 'pointer';
  closeButton.style.fontSize = '16px';
  closeButton.style.lineHeight = '1';
  closeButton.style.color = '#666';
  closeButton.style.transition = 'all 0.2s ease';
  closeButton.style.pointerEvents = 'auto'; // 关闭按钮需要能够接收鼠标事件

  // 添加关闭事件
  closeButton.addEventListener('click', (e) => {
    e.stopPropagation(); // 防止事件冒泡
    dialogBox.style.display = 'none';
  });

  // 添加悬停效果
  closeButton.addEventListener('mouseenter', () => {
    closeButton.style.color = '#333';
    closeButton.style.transform = 'scale(1.1)';
  });

  closeButton.addEventListener('mouseleave', () => {
    closeButton.style.color = '#666';
    closeButton.style.transform = 'scale(1)';
  });
   
  // 创建刷新按钮
  const refreshButton = document.createElement('span');
  refreshButton.innerHTML = '&#x21bb;'; // 刷新符号
  refreshButton.style.position = 'absolute';
  refreshButton.style.bottom = '5px';
  refreshButton.style.right = '28px'; // 调整位置，使其在关闭按钮左侧
  refreshButton.style.cursor = 'pointer';
  refreshButton.style.fontSize = '16px';
  refreshButton.style.lineHeight = '1';
  refreshButton.style.color = '#666';
  refreshButton.style.transition = 'all 0.2s ease';
  refreshButton.style.pointerEvents = 'auto';
   
  // 添加刷新事件
  refreshButton.addEventListener('click', (e) => {
    e.stopPropagation();
    getSummaryOnLoad();
  });
   
  // 添加悬停效果
  refreshButton.addEventListener('mouseenter', () => {
    refreshButton.style.color = '#333';
    refreshButton.style.transform = 'scale(1.1)';
  });
   
  refreshButton.addEventListener('mouseleave', () => {
    refreshButton.style.color = '#666';
    refreshButton.style.transform = 'scale(1)';
  });
   
  dialogBox.appendChild(refreshButton);
  dialogBox.appendChild(closeButton);
  document.body.appendChild(dialogBox);

  // 从存储中获取设置并应用样式
  chrome.storage.sync.get({
    dialogOpacity: 0.6,
    dialogFontSize: 14
  }, (items) => {
    dialogBox.style.background = `rgba(255, 255, 255, ${items.dialogOpacity})`;
    dialogContent.style.fontSize = `${items.dialogFontSize}px`;
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
      animation: floatAnimation 2s ease-in-out infinite;
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
      .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
      // 斜体
      .replace(/\*(.*)\*/gim, '<em>$1</em>')
      // 代码
      .replace(/`(.*)`/gim, '<code>$1</code>')
      // 链接
      .replace(/\[([^\]]+)\]\(([^)]+)\)/gim, '<a href="$2" target="_blank">$1</a>')
      // 换行
      .replace(/\n/gim, '<br>');
  }

  let streamTimer = null; // 用于控制流式输出的定时器

  // 流式显示函数（增强版）
  function streamText(element, text, speed = 15) {
    // 清除之前的定时器
    if (streamTimer) {
      clearTimeout(streamTimer);
    }

    const contentElement = element.firstChild;
    contentElement.innerHTML = '';
    let index = 0;
    let currentText = '';
    
    function typeWriter() {
      if (index < text.length) {
        // 每次添加一个字符
        currentText += text.charAt(index);
        index++;
        
        // 实时解析markdown并显示
        contentElement.innerHTML = parseMarkdown(currentText);
        
        // 继续下一个字符
        streamTimer = setTimeout(typeWriter, speed);
      } else {
        streamTimer = null; // 输出完成，清除定时器ID
      }
    }
    
    typeWriter();
  }

  // 页面加载后自动获取总结
  function getSummaryOnLoad() {
    const contentElement = dialogBox.firstChild;
    // 立即显示"正在思考中"并保持可见
    contentElement.innerHTML = '飞速阅读中...';
    dialogBox.style.display = 'block';

    // 从页面获取文本内容
    // 使用一个小的延迟来确保动态加载的页面内容也能被捕获
    setTimeout(() => {
      const pageText = document.body.innerText;

      // 发送消息到background.js
      chrome.runtime.sendMessage({ type: 'GET_SUMMARY', text: pageText }, (response) => {
        if (response && response.summary) {
          // 使用流式显示
          streamText(dialogBox, response.summary);
        } else {
          // 如果没有收到有效的响应，也显示错误信息
          streamText(dialogBox, '未能获取响应。');
        }
      });
    }, 500); // 500毫秒的延迟
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
          const contentElement = dialogBox.firstChild;
          contentElement.innerHTML = '正在思考中...';
          dialogBox.style.display = 'block';

          const pageContext = document.body.innerText;
          const combinedText = askPromptTemplate
            .replace('{selection}', lastSelectedText)
            .replace('{context}', pageContext);

          chrome.runtime.sendMessage({ type: 'GET_SUMMARY', text: combinedText }, (response) => {
            if (response && response.summary) {
              streamText(dialogBox, response.summary);
            } else {
              streamText(dialogBox, '未能获取响应。');
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

  // 根据设置决定是否在加载时自动总结
  chrome.storage.sync.get({
    autoSummarize: true // 默认启用
  }, (items) => {
    if (items.autoSummarize) {
      // 脚本加载时立即执行
      getSummaryOnLoad();
    }
  });

  // 监听来自background.js的消息
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "REFRESH_SUMMARY") {
      console.log("收到刷新总结内容的命令");
      getSummaryOnLoad();
    } else if (request.type === "CLOSE_DIALOG") {
      console.log("收到关闭对话框的命令，将清空内容并隐藏。");
      const dialogBox = document.getElementById('dialog-box');
      if (dialogBox) {
        dialogBox.style.display = 'none';
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
      const dialogBox = document.getElementById('dialog-box');
      if (dialogBox) {
        const hasContent = dialogBox.firstChild && dialogBox.firstChild.innerHTML.trim() !== '';
        if (dialogBox.style.display === 'none') {
          // 仅当有内容时才显示
          if (hasContent) {
            dialogBox.style.display = 'block';
          } else {
            console.log("对话框内容为空，不执行显示操作。");
          }
        } else {
          dialogBox.style.display = 'none';
        }
      }
    }
  });
}