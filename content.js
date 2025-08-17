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
  const modelUrl = chrome.runtime.getURL(`live2d_models/${modelName}/${modelName}.model.json`);
  live2dWidget.dataset.modelUrl = modelUrl;

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
});


// 创建一个div作为对话框
const dialogBox = document.createElement('div');
dialogBox.id = 'dialog-box';
dialogBox.style.position = 'fixed';
dialogBox.style.bottom = '180px'; // 将对话框下移，使其更贴近人物
dialogBox.style.left = '0px'; // 直接放在人物头顶
dialogBox.style.width = '200px'; // 减小宽度
dialogBox.style.maxWidth = '300px'; // 限制最大宽度
dialogBox.style.padding = '8px';
dialogBox.style.background = 'rgba(255, 255, 255, 0.9)'; // 提高透明度
dialogBox.style.border = '1px solid rgba(0, 0, 0, 0.2)'; // 半透明边框
dialogBox.style.borderRadius = '12px';
dialogBox.style.display = 'none'; // 默认隐藏
dialogBox.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.2)'; // 增强阴影效果
dialogBox.style.wordWrap = 'break-word'; // 长单词自动换行
dialogBox.style.pointerEvents = 'none'; // 添加鼠标穿透功能
// 美化字体
dialogBox.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
dialogBox.style.fontSize = '13px';
dialogBox.style.lineHeight = '1.4';
dialogBox.style.color = '#333';
dialogBox.style.letterSpacing = '0.2px';
dialogBox.style.transition = 'all 0.3s ease'; // 添加过渡效果

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
closeButton.style.fontSize = '16px';
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

// 流式显示函数（增强版）
function streamText(element, text, speed = 15) {
  // 保存按钮
  const closeButton = element.querySelector('span[innerHTML="&times;"]');
  const refreshButton = element.querySelector('span[innerHTML="&#x21bb;"]');
  element.innerHTML = '';
  let index = 0;
  let currentText = '';
  
  function typeWriter() {
    if (index < text.length) {
      // 每次添加一个字符
      currentText += text.charAt(index);
      index++;
      
      // 实时解析markdown并显示
      element.innerHTML = parseMarkdown(currentText);
      
      // 重新添加关闭按钮
      if (refreshButton) {
        element.appendChild(refreshButton);
      }
      if (closeButton) {
        element.appendChild(closeButton);
      }
      
      // 继续下一个字符
      setTimeout(typeWriter, speed);
    }
  }
  
  typeWriter();
}

// 页面加载后自动获取总结
function getSummaryOnLoad() {
  // 保存按钮
  const closeButton = dialogBox.querySelector('span[innerHTML="&times;"]');
  const refreshButton = dialogBox.querySelector('span[innerHTML="&#x21bb;"]');
  // 立即显示"正在思考中"并保持可见
  dialogBox.innerHTML = '飞速阅读中...';
  // 重新添加按钮
  if (refreshButton) {
    dialogBox.appendChild(refreshButton);
  }
  if (closeButton) {
    dialogBox.appendChild(closeButton);
  }
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

// 脚本加载时立即执行
getSummaryOnLoad();