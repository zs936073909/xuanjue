// test_dom.mjs — jsdom 端到端 UI 测试
import {JSDOM} from 'jsdom';
import fs from 'fs';
const errors=[];
function makeStorage(){
  const map=new Map();
  return {
    getItem(k){return map.has(k)?map.get(k):null;},
    setItem(k,v){map.set(String(k),String(v));},
    removeItem(k){map.delete(k);},
    clear(){map.clear();},
    get length(){return map.size;},
    key(i){return Array.from(map.keys())[i]||null;}
  };
}
const polyfill='<script>(function(){try{var _=localStorage;}catch(e){window.localStorage='+makeStorage.toString()+'();window.sessionStorage='+makeStorage.toString()+'();}})();</script>';
let html=fs.readFileSync('./index.html','utf8');
html=html.replace('<head>','<head>'+polyfill);
const dom=new JSDOM(html,{
  url:'file://'+process.cwd()+'/index.html',
  runScripts:'dangerously',resources:'usable',pretendToBeVisual:true
});
const w=dom.window;const d=w.document;
w.onerror=(msg,src,line,col,err)=>errors.push('window.onerror: '+msg+(err&&err.stack?(' | '+err.stack):''));
w.addEventListener('error',e=>errors.push('error event: '+(e.error?e.error.stack:e.message)));
const origErr=w.console.error;
w.console.error=(...a)=>{errors.push('console.error: '+a.map(String).join(' '));origErr.apply(w.console,a);};

function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function wait(cond,timeout=4000){
  return new Promise((resolve,reject)=>{
    const t0=Date.now();
    (function check(){
      try{if(cond())return resolve(true);}catch(e){}
      if(Date.now()-t0>timeout)return reject(new Error('timeout'));
      setTimeout(check,50);
    })();
  });
}
let pass=0,fail=0;
function ok(name,cond){console.log((cond?'✓':'✗')+' '+name);cond?pass++:fail++;}

await wait(()=>d.readyState==='complete');
await sleep(400); // 等 DOMContentLoaded + init

// 1. 免责声明
ok('免责声明页显示', !d.getElementById('screen-disclaimer').classList.contains('hidden'));
ok('主界面隐藏', d.getElementById('main').classList.contains('hidden'));
ok('进入按钮初始禁用', d.getElementById('btnEnter').disabled);

d.getElementById('agreeCheck').checked=true;
d.getElementById('agreeCheck').dispatchEvent(new w.Event('change'));
await sleep(30);
ok('勾选后进入按钮启用', !d.getElementById('btnEnter').disabled);
d.getElementById('btnEnter').click();
await sleep(50);
ok('进入后主界面显示', !d.getElementById('main').classList.contains('hidden'));

// 2. 首页
const pc=d.getElementById('page-container');
ok('首页标题玄决', pc.textContent.includes('玄决'));
ok('首页含此刻大六壬时课', pc.textContent.includes('此刻大六壬时课'));
ok('首页含快速问事', pc.textContent.includes('快速问事'));
ok('首页含月将', pc.textContent.includes('月将'));
ok('首页含空亡或干支', pc.textContent.includes('干支')||pc.textContent.includes('时辰'));

// 3. 查看完整盘面（首页按钮直接进入大六壬详细盘面）
d.getElementById('btnViewBoard').click();
await sleep(60);
ok('详细盘面含四课', pc.textContent.includes('四课'));
ok('详细盘面含三传', pc.textContent.includes('三传'));
ok('详细盘面含格局', pc.textContent.includes('格局'));
ok('详细盘面含天地盘', pc.textContent.includes('天地盘'));
ok('详细盘面含神煞', pc.textContent.includes('神煞'));
ok('详细盘面含AI白话解读', pc.textContent.includes('AI 白话解读'));
ok('详细盘面含免责声明', pc.textContent.includes('免责声明')||pc.textContent.includes('不构成'));

// 切换白话模式
const plainBtn=[...d.querySelectorAll('.mode-toggle button')].find(b=>b.dataset.mode==='plain');
plainBtn.click();
await sleep(40);
ok('白话模式含当前状态', pc.textContent.includes('当前状态'));
ok('白话模式含建议行动', pc.textContent.includes('建议行动'));

// 切回专业
const proBtn=[...d.querySelectorAll('.mode-toggle button')].find(b=>b.dataset.mode==='pro');
proBtn.click();
await sleep(40);
ok('专业模式恢复含天地盘', pc.textContent.includes('天地盘'));

// 4. 问事向导
d.querySelector('.tab[data-tab="ask"]').click();
await sleep(40);
ok('问事步骤1显示类型', pc.textContent.includes('感情关系'));
const typeChip=[...d.querySelectorAll('.chip')].find(c=>c.textContent.trim()==='感情关系');
typeChip.click();
await sleep(30);
d.getElementById('nextStep').click();
await sleep(30);
ok('问事步骤2背景填写', d.querySelector('#fTitle')!==null);
d.getElementById('fTitle').value='这段关系要不要继续';
d.getElementById('fTitle').dispatchEvent(new w.Event('input'));
d.getElementById('nextStep').click();
await sleep(30);
ok('问事步骤3术数选择', pc.textContent.includes('实时起课')||pc.textContent.includes('大六壬'));
// 默认仅大六壬，无需信息补充，直接进入结果
d.getElementById('nextStep').click();
await sleep(60);
ok('问事步骤5结果生成', pc.textContent.includes('大六壬盘面'));

// 5. 保存案例
d.getElementById('btnSaveCase').click();
await sleep(60);
ok('保存后跳转案例详情', pc.textContent.includes('案例详情'));
ok('案例详情含标题', pc.textContent.includes('这段关系要不要继续'));
ok('案例详情含立即复盘', !!d.getElementById('btnReview'));

// 6. 复盘
d.getElementById('btnReview').click();
await sleep(50);
ok('复盘弹窗出现', !!d.querySelector('.modal'));
d.getElementById('rActual').value='对方主动联系，关系缓和';
const resChip=[...d.querySelectorAll('#rResChips .chip')].find(c=>c.textContent.trim()==='部分应验');
resChip.click();
await sleep(20);
d.querySelector('.modal .btn.primary').click();
await sleep(50);
ok('复盘后显示应验程度', pc.textContent.includes('部分应验'));
ok('复盘后显示实际结果', pc.textContent.includes('对方主动联系'));

// 7. 典籍页与古籍库数据加载
d.querySelector('.tab[data-tab="classics"]').click();
await sleep(200);
ok('典籍页显示古籍库', pc.textContent.includes('古籍知识库')||pc.textContent.includes('古籍库'));
ok('典籍页列出书籍', pc.textContent.includes('增删卜易')||pc.textContent.includes('大六壬指南'));

// 8. 我的 / 设置
d.querySelector('.tab[data-tab="me"]').click();
await sleep(40);
ok('我的页含术数设置', pc.textContent.includes('术数设置'));
ok('我的页含AI设置', pc.textContent.includes('AI 设置'));
ok('我的页含备份', pc.textContent.includes('备份与恢复'));
ok('我的页含隐私与安全入口', pc.textContent.includes('隐私与安全'));
ok('我的页含应用锁入口', !!d.getElementById('btnLockSetting'));
ok('我的页含版本', pc.textContent.includes('V1.0.7'));
ok('导出备份按钮存在', !!d.getElementById('btnExport'));
ok('清除按钮存在', !!d.getElementById('btnClear'));
ok('导入备份按钮存在', !!d.getElementById('btnImport'));
ok('备份卡显示存储信息', !!d.querySelector('.storage-info'));
ok('版本号显示 V1.0.7', pc.textContent.includes('V1.0.7'));

// 9. 关于弹窗
d.getElementById('btnAbout').click();
await sleep(40);
ok('关于弹窗含免责声明', d.querySelector('.modal').textContent.includes('不构成'));
ok('关于弹窗含 V1.0.7', d.querySelector('.modal').textContent.includes('V1.0.7'));
d.querySelector('.modal .btn.ghost').click();
await sleep(30);

// 10. 应用锁入口与弹窗
d.getElementById('btnLockSetting').click();
await sleep(60);
ok('应用锁设置弹窗出现', pc.textContent.includes('设置应用锁')||pc.textContent.includes('管理应用锁'));
const lockModal=d.querySelector('.modal');
if(lockModal)lockModal.querySelector('.btn.ghost').click();
await sleep(30);

// 11. 验证禁止词在 AI 解读中不出现（敏感问题）
d.querySelector('.tab[data-tab="ask"]').click();
await sleep(40);
const t2=[...d.querySelectorAll('.chip')].find(c=>c.textContent.trim()==='财务决策');
t2.click();await sleep(30);
d.getElementById('nextStep').click();await sleep(30);
d.getElementById('fTitle').value='投资能不能赚大钱';
d.getElementById('fTitle').dispatchEvent(new w.Event('input'));
d.getElementById('fDesc').value='能赚多少';
d.getElementById('fDesc').dispatchEvent(new w.Event('input'));
d.getElementById('nextStep').click();await sleep(30);
d.getElementById('nextStep').click();await sleep(60);
ok('敏感问题含提示', pc.textContent.includes('敏感')||pc.textContent.includes('投资有风险'));
const aiText=pc.textContent;
ok('AI 解读不含"一定"', !aiText.includes('一定'));
ok('AI 解读不含"必然"', !aiText.includes('必然'));

// 12. 首页待复盘提醒（构造到期案例）
const pastDue=Date.now()-86400000*3;
const injectCase={
  id:'DOMDUE1',title:'DOM到期测试案例',questionType:'感情关系',shushu:'大六壬',
  reviewDue:pastDue,reviewed:false,createdAt:Date.now(),qikeTime:Date.now()
};
w.eval('Store.saveCase('+JSON.stringify(injectCase)+')');
d.querySelector('.tab[data-tab="home"]').click();await sleep(60);
ok('首页最近案例含待复盘标记', pc.textContent.includes('待复盘'));
ok('首页显示到期案例标题', pc.textContent.includes('DOM到期测试案例'));

// 清理注入的测试数据
w.eval('Store.deleteCase("DOMDUE1");');

console.log('\n=========================');
console.log('DOM 测试 通过:',pass,'失败:',fail);
console.log('控制台/错误数:',errors.length);
if(errors.length){console.log('--- 错误明细 ---');errors.slice(0,10).forEach(e=>console.log(e));}
process.exit(fail||errors.length?1:0);
