// offscreen.js
// offscreen.js - 使用 Web Audio API 实现音量放大
const audioContext = new (window.AudioContext || window.webkitAudioContext)();
const gainNode = audioContext.createGain();
gainNode.connect(audioContext.destination);

let currentSource = null;
let currentTabId = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'PLAY_TTS') {
    // 如果有正在播放的音频，先停止
    if (currentSource) {
      currentSource.stop();
      currentSource = null;
    }

    currentTabId = request.tabId;
    const volume = request.volume !== undefined ? request.volume : 100;
    gainNode.gain.value = volume / 100; // 设置增益，可以超过1.0

    fetch(request.audioUrl)
      .then(response => response.arrayBuffer())
      .then(arrayBuffer => audioContext.decodeAudioData(arrayBuffer))
      .then(audioBuffer => {
        currentSource = audioContext.createBufferSource();
        currentSource.buffer = audioBuffer;
        currentSource.connect(gainNode);
        
        currentSource.onended = () => {
          if (currentTabId) {
            chrome.runtime.sendMessage({ type: 'TTS_PLAYBACK_FINISHED', tabId: currentTabId });
          }
          currentSource = null;
        };
        
        currentSource.start(0);
      })
      .catch(error => {
        console.error('Web Audio API 播放失败:', error);
        if (currentTabId) {
          chrome.runtime.sendMessage({ type: 'TTS_PLAYBACK_FINISHED', tabId: currentTabId });
        }
      });

  } else if (request.type === 'STOP_TTS') {
    if (currentSource) {
      currentSource.stop();
      currentSource = null;
    }
  }
});