// 从DOM中读取模型URL并初始化看板娘
const widget = document.getElementById('live2d-widget');
const modelUrl = widget.dataset.modelUrl;
const overallScale = widget.dataset.overallScale || 100;

if (modelUrl) {
  const scale = overallScale / 100;
  const width = Math.round(80 * scale);
  const height = Math.round(120 * scale);

  L2Dwidget.init({
    "model": { "jsonPath": modelUrl, "scale": 1 },
    "display": { "position": "left", "width": width, "height": height, "hOffset": 0, "vOffset": -20 },
    "mobile": { "show": true, "scale": 0.5 },
    "react": { "opacity": 0.7 },
    "dev": { "border": false }
  });
}