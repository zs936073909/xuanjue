// startup.js — 启动引导：容器环境检测 + 离线缓存注册（外置于 index.html，容器 CSP 禁止内联脚本）
(function () {
  // 小工具容器环境标记：容器内禁联网、禁 Service Worker，供全应用降级判断
  try {
    var isMiniTool = !!(window.xhs && window.xhs.miniTool) || /miniTool|RedSkill/i.test(navigator.userAgent || '');
  } catch (e) {
    isMiniTool = false;
  }
  window.XUANJUE_CONTAINER = isMiniTool;

  // 注册 PWA Service Worker（离线缓存 + 系统通知通道）
  // 容器环境：SW 不可用且禁联网，跳过注册
  if (!isMiniTool && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(function () {});
  }
})();
