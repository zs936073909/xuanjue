// test_dom.mjs — jsdom 端到端 UI 测试
import {JSDOM} from 'jsdom';
const errors=[];
const dom=await JSDOM.fromURL('http://localhost:8765/',{
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

// 3. 查看完整盘面
d.getElementById('btnViewBoard').click();
await sleep(60);
ok('盘面中心含实时起课', pc.textContent.includes('实时起课'));
ok('盘面中心含命理排盘', pc.textContent.includes('命理排盘'));
ok('盘面中心含命理趣玩', pc.textContent.includes('命理趣玩'));
// 进入大六壬详细盘面
d.getElementById('btnDlNow').click();
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
ok('问事步骤3术数选择', pc.textContent.includes('选择术数')||pc.textContent.includes('大六壬'));
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

// 7. 案例列表
d.querySelector('.tab[data-tab="case"]').click();
await sleep(40);
ok('案例列表显示案例', pc.textContent.includes('这段关系要不要继续'));
ok('案例列表含已复盘统计', pc.textContent.includes('已复盘'));
// 复盘统计（T1 改为独立页面）
d.getElementById('btnStat').click();
await sleep(40);
ok('统计页显示应验率', pc.textContent.includes('应验率')||pc.textContent.includes('准确率'));
// 返回案例列表
d.querySelector('.tab[data-tab="case"]').click();
await sleep(30);

// 8. 我的 / 设置
d.querySelector('.tab[data-tab="me"]').click();
await sleep(40);
ok('我的页含术数设置', pc.textContent.includes('术数设置'));
ok('我的页含AI设置', pc.textContent.includes('AI 设置'));
ok('我的页含备份', pc.textContent.includes('备份与恢复'));
ok('我的页含隐私与安全入口', pc.textContent.includes('隐私与安全'));
ok('我的页含应用锁入口', !!d.getElementById('btnLockSetting'));
ok('我的页含版本', pc.textContent.includes('V1.0.1'));
// 关于
d.getElementById('btnAbout').click();
await sleep(40);
ok('关于弹窗含免责声明', d.querySelector('.modal').textContent.includes('不构成'));
d.querySelector('.modal .btn.ghost').click();
await sleep(30);

// 9. 验证禁止词在 AI 解读中不出现（敏感问题）
// 触发一个含禁止词的问题，检查敏感拦截
d.querySelector('.tab[data-tab="ask"]').click();
await sleep(40);
// 重置 ask：点类型
const t2=[...d.querySelectorAll('.chip')].find(c=>c.textContent.trim()==='财务决策');
t2.click();await sleep(30);
d.getElementById('nextStep').click();await sleep(30);
d.getElementById('fTitle').value='投资能不能赚大钱';
d.getElementById('fTitle').dispatchEvent(new w.Event('input'));
d.getElementById('fDesc').value='能赚多少';
d.getElementById('fDesc').dispatchEvent(new w.Event('input'));
d.getElementById('nextStep').click();await sleep(30); // step2 -> step3
// 默认仅大六壬，step3 直接生成结果
d.getElementById('nextStep').click();await sleep(60);
ok('敏感问题含提示', pc.textContent.includes('敏感')||pc.textContent.includes('投资有风险'));
const aiText=pc.textContent;
ok('AI 解读不含"一定"', !aiText.includes('一定'));
ok('AI 解读不含"必然"', !aiText.includes('必然'));

// 10. 导出备份按钮存在并可点（不实际下载）
d.querySelector('.tab[data-tab="me"]').click();await sleep(40);
ok('导出备份按钮存在', !!d.getElementById('btnExport'));
ok('清除按钮存在', !!d.getElementById('btnClear'));
ok('导入备份按钮存在', !!d.getElementById('btnImport'));
// T5：存储信息显示
ok('备份卡显示存储信息', !!d.querySelector('.storage-info'));
ok('版本号显示 V1.0.1', pc.textContent.includes('V1.0.1'));
ok('我的页含术数模块列表', pc.textContent.includes('大六壬')&&pc.textContent.includes('塔罗'));
ok('我的页含古籍库统计', pc.textContent.includes('古籍库'));
ok('我的页含不上传声明', pc.textContent.includes('不上传'));

// 11. T5：首页待复盘提醒（构造到期案例）
// 通过 localStorage 注入到期未复盘案例
const pastDue=Date.now()-86400000*3; // 3天前到期
const injectCase={
  id:'DOMDUE1',title:'DOM到期测试案例',questionType:'感情关系',shushu:'大六壬',
  reviewDue:pastDue,reviewed:false,createdAt:Date.now(),qikeTime:Date.now()
};
w.localStorage.setItem('xuanjue_cases',JSON.stringify([injectCase]));
// 回到首页触发重新渲染
d.querySelector('.tab[data-tab="home"]').click();await sleep(60);
ok('首页显示待复盘提醒', pc.textContent.includes('待复盘提醒'));
ok('首页显示到期条数', pc.textContent.includes('已到复盘时间')||pc.textContent.includes('1 条案例'));
ok('首页显示到期案例标题', pc.textContent.includes('DOM到期测试案例'));

// 12. T5：案例列表到期标记
d.querySelector('.tab[data-tab="case"]').click();await sleep(60);
ok('案例列表显示到期标记', pc.textContent.includes('到期'));
ok('案例列表含红色小圆点', !!d.querySelector('.due-dot'));
ok('筛选栏含到期待复盘选项', [...d.querySelectorAll('#fResult option')].some(o=>o.value==='到期待复盘'));

// 13. T5：案例详情页到期橙色提示条
const caseItem=[...d.querySelectorAll('[data-case]')].find(e=>e.dataset.case==='DOMDUE1');
if(caseItem){caseItem.click();await sleep(60);}
ok('案例详情显示到期提示条', pc.textContent.includes('已到复盘时间'));
ok('案例详情含橙色提示条样式', !!d.querySelector('.due-banner'));
ok('案例详情含立即复盘按钮', !!d.getElementById('btnReview'));

// 14. T5：关于弹窗含 v0.3 和术数模块
d.querySelector('.tab[data-tab="me"]').click();await sleep(40);
d.getElementById('btnAbout').click();await sleep(40);
ok('关于弹窗含 V1.0.1', d.querySelector('.modal').textContent.includes('V1.0.1'));
ok('关于弹窗含术数模块', d.querySelector('.modal').textContent.includes('术数模块'));
d.querySelector('.modal .btn.ghost').click();await sleep(30);

// 15. 提醒与重要日期
// 开启每日时课提醒
w.localStorage.setItem('xuanjue_settings', JSON.stringify(Object.assign({}, JSON.parse(w.localStorage.getItem('xuanjue_settings')||'{}'), {remindDaily:true, remindImportant:true})));
d.querySelector('.tab[data-tab="home"]').click();await sleep(60);
ok('首页开启每日提醒后显示今日时课', pc.textContent.includes('今日时课'));
// 注入重要日期并刷新
const tomorrowDate=new Date();tomorrowDate.setDate(tomorrowDate.getDate()+1);
const tdStr=tomorrowDate.getFullYear()+'-'+String(tomorrowDate.getMonth()+1).padStart(2,'0')+'-'+String(tomorrowDate.getDate()).padStart(2,'0');
w.localStorage.setItem('xuanjue_important', JSON.stringify([{id:'IMPDOM1',name:'DOM重要测试',date:tdStr,note:'备注'}]));
d.querySelector('.tab[data-tab="home"]').click();await sleep(60);
ok('首页显示重要日期提醒', pc.textContent.includes('重要日期提醒'));
ok('首页显示重要日期名称', pc.textContent.includes('DOM重要测试'));
ok('首页显示明天', pc.textContent.includes('明天'));
// 进入重要日期管理
w.localStorage.removeItem('xuanjue_remind_state');
d.querySelector('.tab[data-tab="me"]').click();await sleep(40);
d.getElementById('btnImportant').click();await sleep(60);
ok('重要日期管理页显示', pc.textContent.includes('添加重要日期'));
ok('重要日期管理页列出测试项', pc.textContent.includes('DOM重要测试'));
// 返回
const backBtn=[...d.querySelectorAll('.phead .ptitle')].find(el=>el.textContent==='重要日期');
// 通过底部“我的”Tab 返回设置页
d.querySelector('.tab[data-tab="me"]').click();await sleep(40);
ok('设置页含重要日期管理入口', !!d.getElementById('btnImportant'));

// 15b. 重要日期农历与重复标签
d.getElementById('btnImportant').click();await sleep(60);
d.getElementById('btnAddImportant').click();await sleep(60);
const modal=d.querySelector('.modal');
ok('重要日期编辑弹窗出现', !!modal);
if(modal){
  d.getElementById('iName').value='DOM农历重复';
  d.getElementById('iDate').value='1990-05-20';
  d.getElementById('iLunar').checked=true;
  d.getElementById('iRepeat').checked=true;
  modal.querySelector('.btn.primary').click();await sleep(60);
}
ok('重要日期列表含农历标签', pc.textContent.includes('农历'));
ok('重要日期列表含每年标签', pc.textContent.includes('每年'));
// 返回设置页
d.querySelector('.tab[data-tab="me"]').click();await sleep(40);

// 16. 应用锁入口与弹窗
ok('设置页含隐私与安全', pc.textContent.includes('隐私与安全'));
d.getElementById('btnLockSetting').click();await sleep(60);
ok('应用锁设置弹窗出现', pc.textContent.includes('设置应用锁')||pc.textContent.includes('管理应用锁'));
const lockModal=d.querySelector('.modal');
if(lockModal)lockModal.querySelector('.btn.ghost').click();
await sleep(30);

// 17. 典籍页与古籍库数据加载
d.querySelector('.tab[data-tab="classics"]').click();await sleep(200);
ok('典籍页显示古籍库', pc.textContent.includes('古籍知识库')||pc.textContent.includes('古籍库'));
ok('典籍页列出书籍', pc.textContent.includes('增删卜易')||pc.textContent.includes('大六壬指南'));

// 清理注入的测试数据
w.localStorage.removeItem('xuanjue_cases');
w.localStorage.removeItem('xuanjue_important');
w.localStorage.removeItem('xuanjue_remind_state');
w.localStorage.removeItem('xuanjue_lock');

console.log('\n=========================');
console.log('DOM 测试 通过:',pass,'失败:',fail);
console.log('控制台/错误数:',errors.length);
if(errors.length){console.log('--- 错误明细 ---');errors.slice(0,10).forEach(e=>console.log(e));}
process.exit(fail||errors.length?1:0);
