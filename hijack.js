(function() {
  const originalAddEventListener = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function(type, listener, options) {
    if (type === 'DOMNodeInsertedIntoDocument' || type === 'DOMNodeRemovedFromDocument') {
      // 拦截并忽略L2Dwidget.min.js中对这个废弃事件的监听
      console.log('拦截了废弃的DOM事件监听:', type);
      return;
    }
    originalAddEventListener.call(this, type, listener, options);
  };
})();