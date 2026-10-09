// bio-unlock.js — WebAuthn 生物识别解锁（PWA / 浏览器版专用）
// 注意：小工具容器包会排除本文件（容器禁凭据 API，且无需生物识别解锁）
(function () {
  'use strict';
  if (typeof window === 'undefined') return;
  function tryUnlock(onOk, onErr) {
    if (!window.PublicKeyCredential) {
      if (onErr) onErr(new Error('当前环境不支持生物识别'));
      return;
    }
    navigator.credentials.get({
      publicKey: {
        challenge: new Uint8Array(32),
        rpId: location.hostname,
        userVerification: 'required',
        allowCredentials: []
      }
    })
      .then(function () { if (onOk) onOk(); })
      .catch(function (err) { if (onErr) onErr(err); });
  }
  window.BioUnlock = { tryUnlock: tryUnlock };
})();
