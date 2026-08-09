// 视觉验证：检查新增的旺相休囚标识与课体格局详解卡是否正确渲染
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const cleanHtml = html.replace(/<script[^>]*src=[^>]*><\/script>/g, '');
const dom = new JSDOM(cleanHtml, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'http://localhost/',
});
const { window } = dom;

window.matchMedia = window.matchMedia || function(){ return { matches:false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} }; };
window.scrollTo = ()=>{};
window.alert = ()=>{};
window.confirm = ()=>true;
if(!window.navigator) window.navigator = { serviceWorker:{register:()=>Promise.resolve()} };
else window.navigator.serviceWorker = { register:()=>Promise.resolve() };

const files=['js/lunar.js','js/huangli.js','js/daliuren.js','js/iztro.min.js','js/shushu.js','js/store.js','js/ai.js','js/classics.js','js/cross.js','js/app.js'];
files.forEach(f=>{
  const src = fs.readFileSync(path.join(__dirname, f), 'utf8');
  const script = window.document.createElement('script');
  script.textContent = src;
  window.document.body.appendChild(script);
});

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

  await wait(80);
  const agree = $('#agreeCheck');
  agree.checked = true;
  fire(agree, 'change');
  await wait(10);
  fire($('#btnEnter'), 'click');
  await wait(50);

  console.log('\n=== 验证 1：盘面入口起课 ===');
  fire($$('.tab[data-tab="board"]')[0], 'click');
  await wait(30);
  fire($('#btnDlNow'), 'click');
  await wait(80);

  // === 验证旺相休囚标识 ===
  console.log('\n=== 验证 2：四课旺相休囚标识 ===');
  const lessonStates = $$('.dl-lesson .zhi .wx-state');
  assert('四课中有旺相标签出现', lessonStates.length>0, '实际数量: '+lessonStates.length);
  const stateTexts = Array.from(new Set(Array.from(lessonStates).map(e=>e.textContent.trim())));
  console.log('    旺相状态集合:', stateTexts.join('/'));
  const validStates=['旺','相','休','囚','死'];
  const allValid = stateTexts.every(s=>validStates.includes(s));
  assert('所有旺相标签字符合法', allValid, '非法字符: '+stateTexts.filter(s=>!validStates.includes(s)).join(','));

  console.log('\n=== 验证 3：三传旺相休囚标识 ===');
  const scStates = $$('.dl-sanchuan .sc-zhi .wx-state');
  assert('三传中有旺相标签', scStates.length===3, '实际数量: '+scStates.length);
  console.log('    三传旺相:', Array.from(scStates).map(e=>e.textContent.trim()).join(' / '));

  console.log('\n=== 验证 4：课体格局详解卡 ===');
  const gejuCard = $('.dl-geju-list');
  assert('课体格局详解卡存在', !!gejuCard, '找不到 .dl-geju-list');
  if(gejuCard){
    const rows = $$('.dl-geju-list .geju-row');
    assert('格局详解至少3条', rows.length>=3, '实际: '+rows.length);
    const labels = Array.from($$('.dl-geju-list .gj-lbl')).map(e=>e.textContent.trim());
    console.log('    格局条目:', labels.join(' / '));
    assert('包含取法说明', labels.includes('取法'));
    assert('包含传变说明', labels.includes('传变'));
    assert('包含总评', labels.includes('总评'));
  }

  console.log('\n=== 验证 5：四课方位字段已添加 ===');
  // 验证刚才新增的 l.upFW 显示在四课 sx 行
  const lessonSxAll = $$('.dl-lesson .sx');
  if(lessonSxAll.length>0){
    const sample = lessonSxAll[0].textContent;
    // 应包含方位字（北/东北/东/东南/南/西南/西/西北）
    const hasFW = /北|东|南|西/.test(sample);
    assert('四课方位字段渲染', hasFW, '样例: '+sample);
  }

  console.log('\n=== 验证 6：explainGeju 函数可用 ===');
  assert('DaLiuRen.explainGeju 为函数', typeof window.DaLiuRen.explainGeju==='function');
  assert('DaLiuRen.wangXiang 为函数', typeof window.DaLiuRen.wangXiang==='function');

  console.log('\n=== 验证 7：盘面核心结构未受损 ===');
  assert('四课渲染', $$('.dl-lesson').length===4);
  assert('三传渲染', $$('.sc-cell').length===3);
  assert('天地盘宫位渲染', $$('.tp-node').length===12);
  assert('十二天将渲染', $$('.tj-item').length===12);
  assert('神煞/类神卡渲染', $$('.dl-info-grid .info-cell').length>=5);
  assert('顶部返回按钮', !!$('#btnDlBack'));
  assert('顶部重试按钮', !!$('#btnDlRetry'));
  assert('底部重试按钮', !!$('#btnDlRetry2'));
  assert('底部返回按钮', !!$('#btnDlHome'));

  // 验证不同月令下的旺相变化（多组样本，依据《五行大义》）
  console.log('\n=== 验证 8：旺相休囚随月令变化（多个起课样本）===');
  // 直接调用算法验证
  const DL = window.DaLiuRen;
  // 寅月(2) - 木旺: 春木旺、火相、土死、金囚、水休
  assert('寅月 寅(木) 旺', DL.wangXiang(2, 2)==='旺');
  assert('寅月 卯(木) 旺', DL.wangXiang(3, 2)==='旺');
  assert('寅月 巳(火) 相（木生火）', DL.wangXiang(5, 2)==='相');
  assert('寅月 亥(水) 休（水生木）', DL.wangXiang(11, 2)==='休');
  assert('寅月 申(金) 囚（金克木）', DL.wangXiang(8, 2)==='囚');
  assert('寅月 辰(土) 死（木克土）', DL.wangXiang(4, 2)==='死');
  // 午月(6) - 火旺: 夏火旺、土相、金死、水囚、木休
  assert('午月 午(火) 旺', DL.wangXiang(6, 6)==='旺');
  assert('午月 辰(土) 相（火生土）', DL.wangXiang(4, 6)==='相');
  assert('午月 寅(木) 休（木生火）', DL.wangXiang(2, 6)==='休');
  assert('午月 子(水) 囚（水克火）', DL.wangXiang(0, 6)==='囚');
  assert('午月 申(金) 死（火克金）', DL.wangXiang(8, 6)==='死');
  // 申月(8) - 金旺: 秋金旺、水相、木死、火囚、土休
  assert('申月 卯(木) 死（金克木）', DL.wangXiang(3, 8)==='死');
  assert('申月 巳(火) 囚（火克金）', DL.wangXiang(5, 8)==='囚');

  console.log('\n========================================');
  console.log('总计: '+pass+' 通过, '+fail+' 失败');
  console.log('========================================');
  process.exit(fail>0?1:0);
})();
