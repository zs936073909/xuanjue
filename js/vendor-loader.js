// vendor-loader.js — 术数大库按需加载
// 首屏不加载 iching/tarot/qimen/iztro 等大库（合计约 4MB），点用时即时注入；
// 空闲时后台预载，离线场景由 Service Worker 缓存兜底。
(function(global){
  const MAP={
    iching:{src:'js/vendor/iching-shifa.min.js',test:function(){return !!global.IchingShifa;}},
    tarot:{src:'js/vendor/tarot-kit.min.js',test:function(){return !!global.TarotKit;}},
    qimen:{src:'js/vendor/qimendunjia-standalone.min.js',test:function(){return !!global.QimenDunJia;}},
    iztro:{src:'js/iztro.min.js',test:function(){return !!global.iztro;}}
  };
  // 术数名 → 依赖库（无依赖的术数不在此列：大六壬/梅花/小六壬/八字为内置实现）
  const METHOD_DEPS={
    '六爻':['iching'],
    '塔罗':['tarot'],
    '奇门遁甲':['qimen'],
    '紫微斗数':['iztro']
  };
  const loading={};
  const listeners={};
  function flush(key,ok){
    (listeners[key]||[]).forEach(cb=>{try{cb(ok);}catch(e){}});
    listeners[key]=[];
  }
  function loaded(key){const m=MAP[key];return !!(m&&m.test());}
  function load(key){
    if(loaded(key))return Promise.resolve(true);
    if(loading[key])return loading[key];
    const m=MAP[key];
    if(!m)return Promise.resolve(false);
    loading[key]=new Promise(res=>{
      const s=document.createElement('script');
      s.src=m.src;
      s.onload=function(){res(true);flush(key,true);};
      s.onerror=function(){res(false);flush(key,false);};
      document.head.appendChild(s);
    });
    return loading[key];
  }
  // 注册"库就绪"回调（不触发加载）
  function onReady(key,cb){
    if(loaded(key)){cb(true);return;}
    (listeners[key]=listeners[key]||[]).push(cb);
  }
  // 确保一组术数所需库就绪；返回是否全部成功（失败时由调用侧走降级文案）
  function ensure(methods){
    const arr=typeof methods==='string'?[methods]:(methods||[]);
    const keys=[];
    arr.forEach(m=>{(METHOD_DEPS[m]||[]).forEach(k=>{if(!keys.includes(k))keys.push(k);});});
    if(!keys.length)return Promise.resolve(true);
    return Promise.all(keys.map(load)).then(rs=>rs.every(Boolean));
  }
  // 首帧渲染后空闲预载全部库（不阻塞首屏；测试环境跳过）
  function preloadIdle(){
    if(global.navigator&&/jsdom/i.test(global.navigator.userAgent))return;
    // 省流模式或 2G/慢 2G 网络不预载：四个库合计约 2.8MB，弱网/计费流量下白送这些字节不划算。
    // 用户真点开对应术数时，ensure() 仍会即时加载，功能不受影响。
    const conn=global.navigator&&(global.navigator.connection||global.navigator.mozConnection||global.navigator.webkitConnection);
    if(conn){
      if(conn.saveData)return;
      if(/(^|-)(2g|slow-2g)$/i.test(String(conn.effectiveType||'')))return;
    }
    const keys=Object.keys(MAP);
    const kick=function(){keys.forEach(load);};
    if(typeof global.requestIdleCallback==='function')global.requestIdleCallback(kick,{timeout:4000});
    else setTimeout(kick,2500);
  }
  global.Vendor={load:load,loaded:loaded,onReady:onReady,ensure:ensure,preloadIdle:preloadIdle,MAP:MAP,METHOD_DEPS:METHOD_DEPS};
})(window);
