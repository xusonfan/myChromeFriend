// offscreen.js
const audio = document.getElementById('tts-audio');

let currentTabId = null;
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'PLAY_TTS') {
    currentTabId = request.tabId;
    // 从Blob URL播放音频
    audio.src = request.audioUrl;
    audio.play()
      .then(() => {
        // 播放成功
      })
      .catch(error => {
        console.error('Offscreen audio playback failed:', error);
        // 即使播放失败，也通知后台脚本，以免队列卡住
        if (currentTabId) {
          chrome.runtime.sendMessage({ type: 'TTS_PLAYBACK_FINISHED', tabId: currentTabId });
        }
      });
  } else if (request.type === 'STOP_TTS') {
    audio.pause();
    audio.src = '';
  }
});

audio.onended = () => {
  // 播放完成后，通知后台脚本
  if (currentTabId) {
    chrome.runtime.sendMessage({ type: 'TTS_PLAYBACK_FINISHED', tabId: currentTabId });
  }
};