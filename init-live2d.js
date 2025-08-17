// 从DOM中读取模型URL并初始化看板娘
const widget = document.getElementById('live2d-widget');
const modelUrl = widget.dataset.modelUrl;

if (modelUrl) {
  L2Dwidget.init({
    "model": { "jsonPath": modelUrl, "scale": 1 },
    "display": { "position": "left", "width": 80, "height": 120, "hOffset": 0, "vOffset": -20 },
    "mobile": { "show": true, "scale": 0.5 },
    "react": { "opacity": 0.7 },
    "dev": { "border": false }
  });
}