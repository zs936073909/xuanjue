// jsdom 测试：验证大六壬盘面与各界面的退出/重试通道
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('/tmp/node_modules/jsdom');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

// 移除 HTML 中的 <script src>，避免 jsdom 异步加载失败；改用 textContent 注入
const cleanHtml = html.replace(/<script[^>]*src=[^>]*><\/script>/g, '');
const dom = new JSDOM(cleanHtml, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'http://localhost/',
});
const { window } = dom;

// 注入最低限度 browser polyfill
window.matchMedia = window.matchMedia || function(){ return { matches:false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} }; };
window.scrollTo = ()=>{};
window.alert = ()=>{};
window.confirm = ()=>true;
if(!window.navigator) window.navigator = { serviceWorker:{register:()=>Promise.resolve()} };
else window.navigator.serviceWorker = { register:()=>Promise.resolve() };

// 加载所有脚本（按 index.html 顺序）
window.addEventListener('error', e => console.log('SCRIPT ERROR:', e.message, e.filename, e.lineno));
const files=['js/lunar.js','js/huangli.js','js/daliuren.js','js/iztro.min.js','js/shushu.js','js/store.js','js/ai.js','js/classics.js','js/cross.js','js/app.js'];
files.forEach(f=>{
  const src = fs.readFileSync(path.join(__dirname, f), 'utf8');
  const script = window.document.createElement('script');
  script.textContent = src;
  window.document.body.appendChild(script);
});
console.log('App =', typeof window.App, '| Lunar =', typeof window.Lunar, '| DaLiuRen =', typeof window.DaLiuRen, '| Store =', typeof window.Store);
console.log('btnEnter disabled =', window.document.querySelector('#btnEnter') && window.document.querySelector('#btnEnter').disabled);

// 等待 init
function wait(ms){return new Promise(r=>setTimeout(r,ms));}

(async ()=>{
  let pass=0, fail=0;
  function assert(name, cond, info){
    if(cond){pass++;console.log('  ✓ '+name);}
    else{fail++;console.log('  ✗ '+name+(info?' | '+info:''));}
  }

  const $ = sel => window.document.querySelector(sel);
  const $$ = sel => Array.from(window.document.querySelectorAll(sel));
  const fire = (el, type) => {
    if(!el) return false;
    const ev = new window.Event(type, {bubbles:true});
    el.dispatchEvent(ev);
    return true;
  };

  // === 启动：等待 init (DOMContentLoaded 异步触发) ===
  await wait(80);
  // === 同意并进入 ===
  const agree = $('#agreeCheck');
  agree.checked = true;
  fire(agree, 'change');
  await wait(10);
  const btnEnter = $('#btnEnter');
  assert('进入按钮可点击', !btnEnter.disabled);
  fire(btnEnter, 'click');
  await wait(50);
  assert('主界面显示', !$('#main').classList.contains('hidden'));
  assert('首页已渲染', $('#page-container').innerHTML.length > 100);

  // === 场景 1：盘面 Tab → 大六壬此刻起课 → 验证返回/重试按钮存在且绑定 ===
  console.log('\n=== 场景 1：盘面中心 → 大六壬起课 ===');
  fire($$('.tab[data-tab="board"]')[0], 'click');
  await wait(30);
  assert('盘面 Tab 渲染', !!$('#btnDlNow'));
  fire($('#btnDlNow'), 'click');
  await wait(80);
  // 检查顶部 topbar 与底部操作区
  const topBack = $('#btnDlBack');
  const topRetry = $('#btnDlRetry');
  const botRetry2 = $('#btnDlRetry2');
  const botHome = $('#btnDlHome');
  assert('顶部「返回」按钮存在', !!topBack, '找不到 #btnDlBack');
  assert('顶部「重新起课」按钮存在', !!topRetry, '找不到 #btnDlRetry');
  assert('底部「重新起课」按钮存在', !!botRetry2, '找不到 #btnDlRetry2');
  assert('底部「返回」按钮存在', !!botHome, '找不到 #btnDlHome');
  // 检查盘面是否完整渲染
  assert('四课渲染', $$('.dl-lesson').length===4, '实际: '+$$('.dl-lesson').length);
  assert('三传渲染', $$('.sc-cell').length===3, '实际: '+$$('.sc-cell').length);
  assert('天地盘宫位渲染', $$('.tp-node').length===12, '实际: '+$$('.tp-node').length);
  assert('十二天将渲染', $$('.tj-item').length===12, '实际: '+$$('.tj-item').length);

  // 点击顶部「返回盘面」→ 应回到盘面 Tab
  let beforeTab = window.XUANJUE_STATE ? window.XUANJUE_STATE.tab : null;
  fire(topBack, 'click');
  await wait(30);
  assert('顶部返回 → 回到盘面 Tab', !!$('#btnDlNow'), '未回到盘面 Tab');

  // === 场景 2：再次起课 → 测试底部「返回盘面」 ===
  console.log('\n=== 场景 2：底部返回按钮 ===');
  fire($('#btnDlNow'), 'click');
  await wait(80);
  assert('重新进入盘面结果页', !!$('#btnDlHome'));
  fire($('#btnDlHome'), 'click');
  await wait(30);
  assert('底部返回 → 回到盘面 Tab', !!$('#btnDlNow'));

  // === 场景 3：重新起课按钮 ===
  console.log('\n=== 场景 3：重新起课 ===');
  fire($('#btnDlNow'), 'click');
  await wait(80);
  const retryBtn = $('#btnDlRetry2') || $('#btnDlRetry');
  assert('找到重试按钮', !!retryBtn);
  if(retryBtn){
    fire(retryBtn, 'click');
    await wait(80);
    assert('重试后仍在盘面结果页', !!$('#btnDlHome') || !!$('#btnDlBack'));
  }

  // === 场景 4：问事向导走完 → 验证返回首页 ===
  console.log('\n=== 场景 4：问事向导 → 返回首页 ===');
  fire($$('.tab[data-tab="ask"]')[0], 'click'); // 新问事
  await wait(30);
  assert('问事步骤 1', !!$('[data-type]'));
  // 选问题类型
  const typeChip = $$('[data-type]')[0];
  fire(typeChip, 'click');
  await wait(30);
  const next1 = $('#nextStep');
  assert('步骤1下一步可用', !!next1 && !next1.disabled);
  fire(next1, 'click');
  await wait(30);
  assert('进入步骤2', !!$('#fTitle'));
  // 填标题，下一步（需触发 input 事件以更新 a.bg.title）
  const fTitle = $('#fTitle');
  fTitle.value = '测试问题';
  fire(fTitle, 'input');
  fire($('#nextStep'), 'click');
  await wait(30);
  assert('进入步骤3', !!$('[data-qike-method]') || !!$('[data-shu]'));
  // 大六壬默认选中，直接下一步
  const next3 = $('#nextStep');
  if(next3){ fire(next3, 'click'); await wait(30); }
  // 步骤4（可能跳过），到步骤5
  const next4 = $('#nextStep');
  if(next4 && $('#fBirthDate')===null){ /* 已直接生成 */ }
  else if(next4){ fire(next4, 'click'); await wait(80); }
  await wait(80);
  assert('进入结果页（步骤5）', !!$('#btnDlHome') || !!$('#btnDlBack'), '未到结果页');
  // 问事向导的返回应回到上一有意义步骤（大六壬-only → 步骤3 术数选择）
  const backBtn = $('#btnDlBack');
  if(backBtn){
    fire(backBtn, 'click');
    await wait(30);
    assert('问事返回 → 步骤3（术数选择）', !!$('[data-shu]') || !!$('[data-qike-method]'), '返回异常');
  }

  // === 场景 5：弹窗关闭（modal 与详情浮层） ===
  console.log('\n=== 场景 5：弹窗可关闭 ===');
  // 触发天地盘宫位详情浮层
  fire($$('.tab[data-tab="board"]')[0], 'click');
  await wait(30);
  fire($('#btnDlNow'), 'click');
  await wait(80);
  const tpNode = $('.tp-node');
  if(tpNode){
    fire(tpNode, 'click');
    await wait(30);
    const dpClose = $('.dp-close');
    const dpMask = $('.dp-mask');
    assert('宫位详情浮层已弹出', !!dpClose, '未弹出详情');
    if(dpClose){
      fire(dpClose, 'click');
      await wait(20);
      assert('宫位详情浮层可关闭', !$('.dp-close'), '关闭失败');
    }
  }

  // === 场景 6：案例详情可返回 ===
  console.log('\n=== 场景 6：案例详情返回 ===');
  // 先保存一个案例
  fire($$('.tab[data-tab="board"]')[0], 'click');
  await wait(30);
  fire($('#btnDlNow'), 'click');
  await wait(80);
  const btnSave = $('#btnSaveCase');
  if(btnSave){
    fire(btnSave, 'click');
    await wait(30);
  }
  // 进入案例 Tab
  fire($$('.tab[data-tab="case"]')[0], 'click');
  await wait(40);
  const caseItem = $('[data-case]');
  if(caseItem){
    fire(caseItem, 'click');
    await wait(40);
    const backList = $('#backList');
    assert('案例详情有返回按钮', !!backList);
    if(backList){
      fire(backList, 'click');
      await wait(30);
      assert('案例详情可返回列表', !$('#backList') && !!$('#caseListBody'), '返回失败');
    }
  } else {
    assert('案例详情：存在案例可测', false, '无案例');
  }

  // === 场景 7：硬件返回键（popstate）模拟 ===
  console.log('\n=== 场景 7：硬件返回键（popstate）===');
  // 盘面 → 起课 → popstate 应回到盘面 Tab
  fire($$('.tab[data-tab="board"]')[0], 'click');
  await wait(30);
  fire($('#btnDlNow'), 'click');
  await wait(80);
  assert('进入盘面结果页', !!$('#btnDlBack'));
  const stackBefore = window.App && window.App.__navStack ? window.App.__navStack.length : null;
  // 模拟 Android 硬件返回键：Capacitor 会调用 history.back()，触发 popstate
  const hadHistory = window.history.length > 1;
  try { window.history.back(); } catch(e){}
  await wait(60);
  assert('硬件返回 → 回到盘面 Tab', !!$('#btnDlNow'), '未回到盘面 Tab');

  // 案例详情 → popstate 应回到列表
  fire($$('.tab[data-tab="case"]')[0], 'click');
  await wait(40);
  const ci2 = $('[data-case]');
  if(ci2){
    fire(ci2, 'click');
    await wait(40);
    assert('进入案例详情', !!$('#backList'));
    try { window.history.back(); } catch(e){}
    await wait(60);
    assert('硬件返回 → 回到案例列表', !$('#backList') && !!$('#caseListBody'), '未回到列表');
  }

  // 复盘统计 → popstate 应回到列表
  fire($$('.tab[data-tab="case"]')[0], 'click');
  await wait(40);
  const btnStat = $('#btnStat');
  if(btnStat){
    fire(btnStat, 'click');
    await wait(40);
    assert('进入复盘统计页', !!$('#btnStatsBack'));
    try { window.history.back(); } catch(e){}
    await wait(60);
    assert('硬件返回 → 回到案例列表', !$('#btnStatsBack') && !!$('#caseListBody'), '未回到列表');
  }

  console.log('\n========================================');
  console.log(`总计: ${pass} 通过, ${fail} 失败`);
  console.log('========================================');
  process.exit(fail>0?1:0);
})();
