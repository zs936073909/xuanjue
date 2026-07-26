// test_core.js — 验证核心算法
const fs=require('fs');
const vm=require('vm');
const _store={};
const ctx={console,Date,Math,localStorage:{
  getItem:k=>Object.prototype.hasOwnProperty.call(_store,k)?_store[k]:null,
  setItem:(k,v)=>{_store[k]=String(v);},
  removeItem:k=>{delete _store[k];}
}};
ctx.window=ctx;ctx.global=ctx;
// classics.js 需要 require 支持（用于 Node 环境读取数据文件）
ctx.require=require;ctx.__filename=require('path').resolve('js/classics.js');ctx.__dirname=require('path').resolve('js');
vm.createContext(ctx);
['js/lunar.js','js/huangli.js','js/daliuren.js','js/shushu.js','js/classics.js','js/cross.js','js/store.js','js/ai.js'].forEach(f=>{
  vm.runInContext(fs.readFileSync(f,'utf8'),ctx);
});
const {Lunar,DaLiuRen,Huangli,ShuShu}=ctx.window;

let pass=0,fail=0;
function eq(name,a,b){const ok=JSON.stringify(a)===JSON.stringify(b);console.log((ok?'✓':'✗')+' '+name+' => '+JSON.stringify(a)+(ok?'':' (期望 '+JSON.stringify(b)+')'));ok?pass++:fail++;}

// 1. 干支日柱锚点
eq('2000-01-01 日柱=戊午', Lunar.getBaZi(new Date(2000,0,1,12)).day.gz,'戊午');
eq('1949-10-01 日柱=甲子', Lunar.getBaZi(new Date(1949,9,1,12)).day.gz,'甲子');
// 2024-02-10 (春节) 检查
const d2024=new Date(2024,1,10,12);
const bz2024=Lunar.getBaZi(d2024);
console.log('2024-02-10 四柱:',bz2024.year.gz,bz2024.month.gz,bz2024.day.gz,bz2024.hour.gz);
eq('2024 立春前 年柱=癸卯', Lunar.getBaZi(new Date(2024,1,1,12)).year.gz,'癸卯');
eq('2024 立春后 年柱=甲辰', Lunar.getBaZi(new Date(2024,1,5,12)).year.gz,'甲辰');

// 2. 时辰
eq('23点=子时', Lunar.getShiChen(new Date(2024,1,10,23,0)).name,'子时');
eq('11点=午时', Lunar.getShiChen(new Date(2024,1,10,11,0)).name,'午时');

// 3. 节气
const jq=Lunar.currentNextJieQi(new Date(2024,5,15));
console.log('2024-06-15 节气:',jq.cur&&jq.cur.name,'→',jq.next&&jq.next.name);

// 4. 月将（中气定将）
// 2024-06-15 在 小满(5/20)后 夏至(6/21)前 → 月将=申(8)
const yjSummer=Lunar.getYueJiang(new Date(2024,5,15));
eq('小满后月将=申(8)', yjSummer.zhiIdx, 8);
// 2024-11-25 在 小雪(11/22)后 → 月将=寅(2)
const yjWinter=Lunar.getYueJiang(new Date(2024,10,25));
eq('小雪后月将=寅(2)', yjWinter.zhiIdx, 2);
// 2024-01-10 在 冬至(12/22/2023)后 大寒(1/20)前 → 月将=丑(1)
const yjJan=Lunar.getYueJiang(new Date(2024,0,10));
eq('冬至后大寒前月将=丑(1)', yjJan.zhiIdx, 1);

// 5. 农历
const ln=Lunar.solarToLunar(new Date(2024,1,10));
console.log('2024-02-10 农历:',ln.monthStr,ln.dayStr);

// 6. 黄历建除
const hl=Huangli.getDayYiJi(bz2024.month.zhiIdx,bz2024.day.zhiIdx);
console.log('2024-02-10 建除:',hl.jianchu,'宜:',hl.yi.join(','),'忌:',hl.ji.join(','));

// 7. 大六壬起课（验证结构完整）
const testDate=new Date(2024,5,15,14,30); // 午时
const comp=ctx.window.App?null:(function(){
  const baZi=Lunar.getBaZi(testDate);
  const yj=Lunar.getYueJiang(testDate);
  const sc=Lunar.getShiChen(testDate);
  const ke=DaLiuRen.qiKe(testDate,baZi,yj.zhiIdx,sc.index,{questionType:'感情关系'});
  return{ke,sc,yj};
})();
const ke=comp.ke;
console.log('\n=== 大六壬起课 (2024-06-15 14:30 午时) ===');
console.log('月将:',ke.yueJiang.zhi,'占时:',ke.zhanShi.zhi,'('+comp.sc.name+')');
console.log('日干支:',ke.baZi.day.gz,'时干支:',ke.baZi.hour.gz);
console.log('贵人:',ke.guiRen.label,ke.guiRen.zhi,'乘',ke.guiRen.chengShen);
console.log('空亡:',Lunar.ZHI[ke.kongWang[0]]+Lunar.ZHI[ke.kongWang[1]]);
console.log('格局:',ke.geju.join(','));
console.log('四课:');
ke.lessons.forEach((l,i)=>console.log('  第'+['一','二','三','四'][i]+'课: 上 '+Lunar.ZHI[l.up]+'('+l.upTJ+') 下 '+l.downLabel));
console.log('三传('+ke.sanChuan.method+'):');
console.log('  初传',ke.sanChuan.chu.zhi,ke.sanChuan.chu.tj,ke.sanChuan.chu.wx);
console.log('  中传',ke.sanChuan.zhong.zhi,ke.sanChuan.zhong.tj);
console.log('  末传',ke.sanChuan.mo.zhi,ke.sanChuan.mo.tj);
console.log('神煞:',JSON.stringify(ke.shenSha));
console.log('类神:',ke.leishenName,'乘',ke.leishenShen!==null?Lunar.ZHI[ke.leishenShen]:'—');

// 验证天盘旋转：直接用 qiKe 控制月将与占时
// 伏吟：月将==占时 → 天盘=地盘
const fuBaZi=Lunar.getBaZi(testDate);
const vKe=DaLiuRen.qiKe(testDate,fuBaZi,5,5,{}); // 月将=巳(5) 占时=巳(5)
console.log('\n伏吟测试 月将=巳 占时=巳 isFuYin=',vKe.isFuYin,'天盘[0]=',Lunar.ZHI[vKe.tianPan[0]],'(应为子)');
eq('伏吟: 月将==占时', vKe.isFuYin, true);
eq('伏吟天盘=地盘(天盘[0]=子0)', vKe.tianPan[0], 0);
eq('伏吟天盘[5]=巳5', vKe.tianPan[5], 5);

// 返吟：月将与占时相冲(差6) → 天盘对冲地盘
const rKe=DaLiuRen.qiKe(testDate,fuBaZi,5,11,{}); // 月将=巳(5) 占时=亥(11) 冲
console.log('\n返吟测试 月将=巳 占时=亥 isFanYin=',rKe.isFanYin,'天盘[0]=',Lunar.ZHI[rKe.tianPan[0]],'(应为午)');
eq('返吟: 月将占时相冲', rKe.isFanYin, true);
eq('返吟天盘[0]=午6(子午冲)', rKe.tianPan[0], 6);
eq('返吟天盘[5]=亥11(巳亥冲)', rKe.tianPan[5], 11);

// 白话生成
const plain=DaLiuRen.plainLang(ke,'感情关系');
console.log('\n白话倾向:',plain.tendency);
console.log('白话状态:',plain.state);
console.log('风险:',plain.risks);
console.log('建议:',plain.doAct);

// AI 提示词
const AI=ctx.window.AI;
const prompt=AI.buildPrompt(Object.assign(ke,{dateStr:'2024-06-15 14:30',scStr:'午时'}),plain,{questionType:'感情关系',title:'测试'},ctx.window.Store.getSettings());
console.log('\nAI提示词长度:',prompt.length,'字符');
eq('提示词含禁止词规则', prompt.includes('禁止必然性预测'), true);

// 敏感词检测
eq('敏感词:自杀', AI.detectSensitive('我想自杀')&&AI.detectSensitive('我想自杀').cat, 'selfHarm');
eq('敏感词:能赚多少', AI.detectSensitive('能赚多少钱')&&AI.detectSensitive('能赚多少钱').cat, 'invest');
eq('禁止词替换', AI.sanitize('一定发财'), '可能发财可能'.replace('可能发财可能','可能发财')||'可能');

// ===== P1 术数模块测试 =====
console.log('\n--- P1 术数模块 ---');
const p1Date=new Date(2024,5,15,14,30); // 2024-06-15 14:30

// 小六壬
const xlr=ShuShu.xiaoLiuRen(p1Date);
eq('小六壬返回 name',xlr.name,'小六壬');
eq('小六壬时宫在六宫内',ShuShu.XLR_POS.includes(xlr.result.time),true);
eq('小六壬 plain.tendency 非空',typeof xlr.plain.tendency==='string'&&xlr.plain.tendency.length>0,true);
eq('小六壬 doAct 非空',xlr.plain.doAct.length>0,true);
console.log('小六壬:',xlr.result.month,'→',xlr.result.day,'→',xlr.result.time,'(',xlr.result.detail.ji,')');

// 梅花易数
const mh=ShuShu.meiHua(p1Date);
eq('梅花易数返回 name',mh.name,'梅花易数');
eq('梅花易数卦名非空',typeof mh.result.guaName==='string'&&mh.result.guaName.length>0,true);
eq('梅花易数动爻 1-6',mh.result.dongLine>=1&&mh.result.dongLine<=6,true);
eq('梅花易数体用关系含字',mh.result.rel.length>0,true);
eq('梅花易数 plain 有 signals',Array.isArray(mh.plain.signals),true);
console.log('梅花:',mh.result.guaName,'动',mh.result.dongLine,'爻',mh.result.rel);

// 六爻
const ly=ShuShu.liuYao(p1Date);
eq('六爻返回 name',ly.name,'六爻');
eq('六爻本卦名非空',ly.result.benGua.length>0,true);
eq('六爻 6 爻',ly.result.yaos.length,6);
eq('六爻动爻数 0-6',ly.result.dongCount>=0&&ly.result.dongCount<=6,true);
eq('六爻每爻 val 6-9',ly.result.yaos.every(y=>y.val>=6&&y.val<=9),true);
console.log('六爻:',ly.result.benGua,'→',ly.result.bianGua,'动',ly.result.dongCount);

// 塔罗
const tr=ShuShu.tarot(p1Date);
eq('塔罗返回 name',tr.name,'塔罗');
eq('塔罗 3 张牌',tr.result.cards.length,3);
eq('塔罗位置 过去/现在/未来',tr.result.cards.map(c=>c.pos).join(','),'过去,现在,未来');
eq('塔罗牌名非空',tr.result.cards.every(c=>c.name.length>0),true);
eq('塔罗 22 大阿卡纳内',ShuShu.TAROT.length,22);
eq('塔罗三牌不重复',new Set(tr.result.cards.map(c=>c.name)).size,3);
console.log('塔罗:',tr.result.cards.map(c=>c.name+'('+(c.up?'正':'逆')+')').join(' '));

// 八字
const bz=ShuShu.baZi(p1Date);
eq('八字返回 name',bz.name,'八字');
eq('八字 4 柱',bz.result.pillars.length,4);
eq('八字日柱 ganShen=日主',bz.result.pillars[2].ganShen,'日主');
eq('八字五行总数=8',Object.values(bz.result.wxCount).reduce((a,b)=>a+b,0),8);
eq('八字用神非空',bz.result.yongShen.length>0,true);
eq('八字日干与日柱干一致',bz.result.dayGan,bz.result.pillars[2].gan,true);
console.log('八字:',bz.result.pillars.map(p=>p.gz).join(' '),'日主',bz.result.dayGan,'(',bz.result.dayStrong?'强':'弱',')');

// 统一入口
eq('compute 入口-小六壬',ShuShu.compute("小六壬",p1Date).name,'小六壬');
eq('compute 入口-未知返回 null',ShuShu.compute("不存在",p1Date),null);

// ===== T0 整改测试 =====
console.log('\n--- T0 整改验证 ---');

// 塔罗四种牌阵
const trSingle=ShuShu.tarot(p1Date,'single');
eq('塔罗单张牌阵 cards 数=1',trSingle.result.cards.length,1);
eq('塔罗单张位置=今日指引',trSingle.result.cards[0].pos,'今日指引');
eq('塔罗单张 result.spread=single',trSingle.result.spread,'single');

const trRelation=ShuShu.tarot(p1Date,'relation');
eq('塔罗关系牌阵 cards 数=3',trRelation.result.cards.length,3);
eq('塔罗关系位置',trRelation.result.cards.map(c=>c.pos).join(','),'我,对方,关系现状');

const trChoice=ShuShu.tarot(p1Date,'choice');
eq('塔罗二选一 cards 数=3',trChoice.result.cards.length,3);
eq('塔罗二选一位置',trChoice.result.cards.map(c=>c.pos).join(','),'选项A,选项B,建议');

const trThree=ShuShu.tarot(p1Date,'three');
eq('塔罗三牌阵保持',trThree.result.cards.map(c=>c.pos).join(','),'过去,现在,未来');
eq('塔罗旧调用默认 three',ShuShu.tarot(p1Date).result.spread,'three');
eq('塔罗关系牌不重复',new Set(trRelation.result.cards.map(c=>c.name)).size,3);

// 小六壬主题联动
const xlrCai=ShuShu.xiaoLiuRen(p1Date,'求财');
eq('小六壬求财 topic 传入',xlrCai.result.topic,'求财');
eq('小六壬求财 sources 含主题',xlrCai.plain.sources.some(s=>s.desc&&s.desc.includes('求财')),true);
const xlrQing=ShuShu.xiaoLiuRen(p1Date,'感情');
eq('小六壬感情 topic 传入',xlrQing.result.topic,'感情');
eq('小六壬感情与求财解释不同',xlrCai.plain.state!==xlrQing.plain.state,true);

// 梅花 random 模式不再崩溃
const mhRand=ShuShu.meiHuaByInput('random',null,'其他',p1Date);
eq('梅花 random 不崩溃',mhRand.name,'梅花易数');
eq('梅花 random 互卦存在',typeof mhRand.result.huGua.name==='string',true);
eq('梅花 random 变卦存在',typeof mhRand.result.bianGua.name==='string',true);

// 梅花数字/汉字起卦
const mhNum=ShuShu.meiHuaByInput('number','3,8','其他',p1Date);
eq('梅花数字起卦',mhNum.name,'梅花易数');
eq('梅花数字动爻 1-6',mhNum.result.dongLine>=1&&mhNum.result.dongLine<=6,true);
const mhHan=ShuShu.meiHuaByInput('hanzi','玄','其他',p1Date);
eq('梅花汉字起卦',mhHan.name,'梅花易数');
eq('梅花汉字卦名非空',typeof mhHan.result.guaName==='string'&&mhHan.result.guaName.length>0,true);

// 六爻日辰生克用日支
const yaos6=[{val:7},{val:8},{val:9},{val:6},{val:7},{val:8}];
const lyT0=ShuShu.liuYaoByYaos(yaos6,'求财',{});
eq('六爻日辰用日支字段',typeof lyT0.result.dayZhiWx==='string',true);
eq('六爻纳甲每爻有 gz',lyT0.result.yaos.every(y=>typeof y.gz==='string'&&y.gz.length>0),true);
eq('六爻六亲每爻有 liuQin',lyT0.result.yaos.every(y=>typeof y.liuQin==='string'),true);
eq('六爻世应有标记',lyT0.result.yaos.some(y=>y.isShi)&&lyT0.result.yaos.some(y=>y.isYing),true);
eq('六爻用神求财=妻财',lyT0.result.yongShen.target,'妻财');

// 八字未知时辰降级
const bzUnknown=ShuShu.baZiByBirth({gender:'男',date:new Date(1990,5,15,12,0),unknownHour:true});
eq('八字未知时辰时柱=未知',bzUnknown.result.pillars[3].ganShen==='未知'||bzUnknown.result.pillars[3].gz==='未知',true);
eq('八字未知时辰有提示',bzUnknown.plain.note&&bzUnknown.plain.note.length>0,true);

// 八字大运流年存在
const bzNormal=ShuShu.baZiByBirth({gender:'男',date:new Date(1990,5,15,12,0),unknownHour:false});
eq('八字大运数组存在',Array.isArray(bzNormal.result.daYun)&&bzNormal.result.daYun.length>0,true);
eq('八字流年存在',typeof bzNormal.result.liuNian==='object',true);
eq('八字流月存在',typeof bzNormal.result.liuYue==='object',true);
eq('八字藏干存在',bzNormal.result.pillars.every(p=>Array.isArray(p.cangGan)),true);

// 大六壬九法三传
const bzTestT0=Lunar.getBaZi(testDate);
// 伏吟：月将=占时
const fuKe=DaLiuRen.qiKe(testDate,bzTestT0,5,5,{});
eq('伏吟检测',fuKe.isFuYin,true);
eq('伏吟三传 method 含伏吟',fuKe.sanChuan.method.includes('伏吟'),true);
// 返吟：月将与占时相冲
const fanKe=DaLiuRen.qiKe(testDate,bzTestT0,5,11,{});
eq('返吟检测',fanKe.isFanYin,true);
eq('返吟三传 method 含返吟',fanKe.sanChuan.method.includes('返吟'),true);
// 九法覆盖：扫描不同日期
const methods=new Set();
const testDates=[new Date(2024,0,1),new Date(2024,0,2),new Date(2024,1,1),new Date(2024,2,1),new Date(2024,3,1),new Date(2024,4,1),new Date(2024,5,1),new Date(2024,6,1),new Date(2024,7,1),new Date(2024,8,1),new Date(2024,9,1),new Date(2024,10,1),new Date(2024,11,1)];
testDates.forEach(d=>{
  const b=Lunar.getBaZi(d);
  const yj=Lunar.getYueJiang(d);
  const sc=Lunar.getShiChen(d);
  const k=DaLiuRen.qiKe(d,b,yj.zhiIdx,sc.index,{});
  if(k.sanChuan&&k.sanChuan.method)methods.add(k.sanChuan.method);
});
console.log('九法覆盖(methods):',Array.from(methods).join(','));
eq('九法覆盖>=5种',methods.size>=5,true);

// RAG 盘面特征提取
if(ctx.window.ClassicLibrary){
  const CL=ctx.window.ClassicLibrary;
  const feats=CL.extractBoardFeatures('六爻',lyT0.result);
  eq('RAG 六爻特征提取非空',Array.isArray(feats)&&feats.length>0,true);
  eq('RAG 六爻特征含妻财',feats.includes('妻财'),true);
  const featsDlr=CL.extractBoardFeatures('大六壬',fuKe);
  eq('RAG 大六壬特征含伏吟',featsDlr.includes('伏吟'),true);
  const featsBz=CL.extractBoardFeatures('八字',bzNormal.result);
  eq('RAG 八字特征非空',featsBz.length>0,true);
  // RAG 检索带盘面特征
  const hits=CL.search({shushu:'六爻',board_features:['妻财','空亡'],limit:5});
  eq('RAG 盘面特征检索命中',hits.length>0,true);
  // RAG 空命中
  const AI=ctx.window.AI;
  const emptyPrompt=AI.appendClassicsToPrompt('test prompt',[]);
  eq('RAG 空命中提示',emptyPrompt.includes('未检索到直接相关古籍依据'),true);
  const fullPrompt=AI.appendClassicsToPrompt('test',hits);
  eq('RAG 有命中注入',fullPrompt.length>'test'.length,true);
}

// ===== T1 复盘统计模块测试 =====
console.log('\n--- T1 复盘统计 ---');
const Store=ctx.window.Store;
// 清空测试数据
ctx.localStorage.removeItem('xuanjue_cases');
// 构造测试案例
const c1=Store.saveCase({id:'T1',title:'测试1',questionType:'感情关系',shushu:'大六壬',mood:'平静',tendency:'宜主动',createdAt:Date.now()-86400000*30});
const c2=Store.saveCase({id:'T2',title:'测试2',questionType:'事业合作',shushu:'六爻',mood:'焦虑',tendency:'宜等待',createdAt:Date.now()-86400000*20});
const c3=Store.saveCase({id:'T3',title:'测试3',questionType:'财务决策',shushu:'八字',mood:'急切',tendency:'宜谨慎',createdAt:Date.now()-86400000*10});
// 复盘
Store.addReview('T1',{time:Date.now()-86400000*25,actual:'确实主动推进了',unhit:'',reflect:'时机把握准确',result:'应验',score:5,tags:['时机准确','盘面清晰'],reviewTime:'2024-06-20'});
Store.addReview('T2',{time:Date.now()-86400000*15,actual:'确实等待了',unhit:'但结果比预期晚',reflect:'应更耐心',result:'部分应验',score:3,tags:['方向偏差'],reviewTime:'2024-07-05'});
Store.addReview('T3',{time:Date.now()-86400000*5,actual:'谨慎是对的',unhit:'',reflect:'避免了损失',result:'应验',score:4,tags:['AI解释有用'],reviewTime:'2024-07-15'});

const stats=Store.reviewStats();
eq('统计-总案例数',stats.total,3);
eq('统计-已复盘数',stats.reviewedCount,3);
eq('统计-复盘率=100',stats.reviewRate,1);
eq('统计-严格应验率=2/3',Math.round(stats.strictAcc*100),67);
eq('统计-宽松应验率=100',Math.round(stats.looseAcc*100),100);
eq('统计-平均评分=4',stats.avgScore,4);
eq('统计-按应验程度应验=2',stats.byResult['应验'],2);
eq('统计-按评分5星=1',stats.byScore[5],1);
eq('统计-按术数大六壬=1',stats.byShu['大六壬'],1);

// 筛选测试
const filtered1=Store.listCasesByFilter({shushu:'六爻'});
eq('筛选-六爻=1条',filtered1.length,1);
const filtered2=Store.listCasesByFilter({result:'应验'});
eq('筛选-应验=2条',filtered2.length,2);
const filtered3=Store.listCasesByFilter({reviewed:true});
eq('筛选-已复盘=3条',filtered3.length,3);
const filtered4=Store.listCasesByFilter({reviewed:false});
eq('筛选-未复盘=0条',filtered4.length,0);
const filtered5=Store.listCasesByFilter({tag:'时机准确'});
eq('筛选-标签=1条',filtered5.length,1);

// 清理测试数据
Store.deleteCase('T1');Store.deleteCase('T2');Store.deleteCase('T3');

// ===== T3 多盘交叉摘要测试 =====
console.log('\n--- T3 多盘交叉摘要 ---');
const Cross=ctx.window.CrossAnalyzer;
// 一致点测试：两个术数都"宜主动"
const res1={
  '大六壬':{name:'大六壬',result:{},plain:{tendency:'宜主动',doAct:['主动推进沟通'],risks:['对方态度不明'],signals:['青龙入传'],reviewDays:21}},
  '六爻':{name:'六爻',result:{},plain:{tendency:'宜主动',doAct:['可决断推进','把握时机'],risks:['月破'],signals:['世爻旺相'],reviewDays:14}}
};
const cross1=Cross.analyze('大六壬',res1);
eq('交叉-一致点非空',cross1.consistent.length>0,true);
eq('交叉-综合建议非空',cross1.advice.length>0,true);
eq('交叉-观察信号非空',cross1.signals.length>0,true);
eq('交叉-复盘天数合理',cross1.reviewDays>=14&&cross1.reviewDays<=21,true);
eq('交叉-有免责声明',cross1.disclaimer.length>0,true);

// 冲突点测试：一个主动一个等待
const res2={
  '大六壬':{name:'大六壬',result:{},plain:{tendency:'宜主动',doAct:['立即行动'],risks:[],signals:[],reviewDays:21}},
  '小六壬':{name:'小六壬',result:{},plain:{tendency:'宜等待',doAct:['暂缓决定'],risks:['急则有失'],signals:[],reviewDays:7}}
};
const cross2=Cross.analyze('大六壬',res2);
eq('交叉-冲突点非空',cross2.conflict.length>0,true);

// 无大六壬主盘
const res3={
  '六爻':{name:'六爻',result:{},plain:{tendency:'宜谨慎',doAct:['观察'],risks:['空亡'],signals:['世应'],reviewDays:14}},
  '塔罗':{name:'塔罗',result:{},plain:{tendency:'宜谨慎',doAct:['反思'],risks:['挑战牌'],signals:['死神逆位'],reviewDays:30}}
};
const cross3=Cross.analyze(null,res3);
eq('交叉-无主盘取第一个',cross3.advice.length>0,true);
eq('交叉-无主盘一致点',cross3.consistent.length>0,true);

// 禁用词检查
const res4={
  '大六壬':{name:'大六壬',result:{},plain:{tendency:'宜主动',doAct:['必然成功','一定发财'],risks:[],signals:[],reviewDays:21}}
};
const cross4=Cross.analyze('大六壬',res4);
const allAdvice=cross4.advice.join('');
eq('交叉-禁用词替换',!allAdvice.includes('必然')&&!allAdvice.includes('一定'),true);

// ===== 大六壬三传修正测试（涉害路径深度 / 孟仲季 / 伏吟杜传 / 别责中末传） =====
console.log('\n--- 大六壬三传修正 ---');
const DLR=ctx.window.DaLiuRen;
const ZHI_=ctx.window.Lunar.ZHI;

// 1. 涉害深度函数：上神与下神相同 → 0
eq('涉害深度-相同位=0',DLR.sheHaiDepth(2,2),0);
// 上神=寅(2,木)，下神=子(0,水)：从子位顺走至寅位，途经子(水生木,不克)、丑(土,木克土不克木)、寅(到位)，深度=0
eq('涉害深度-子→寅=0',DLR.sheHaiDepth(2,0),0);
// 上神=寅(2,木)，下神=申(8,金)：从申顺走至寅，途经申(金克木,克!)、酉(金,克!)、戌(土)、亥(水)、子(水)、丑(土)、寅(到位)
eq('涉害深度-申→寅=2(申酉金克木)',DLR.sheHaiDepth(2,8),2);
// 上神=午(6,火)，下神=子(0,水)：从子顺走至午，途经子(水克火,克!)、丑(土)、寅(木)、卯(木)、辰(土)、巳(火)、午(到位)，深度=1
eq('涉害深度-子→午=1(子水克午火)',DLR.sheHaiDepth(6,0),1);

// 2. 孟仲季函数
eq('孟仲季-寅=孟(0)',DLR.mengZhongJi(2),0);
eq('孟仲季-申=孟(0)',DLR.mengZhongJi(8),0);
eq('孟仲季-子=仲(1)',DLR.mengZhongJi(0),1);
eq('孟仲季-酉=仲(1)',DLR.mengZhongJi(9),1);
eq('孟仲季-辰=季(2)',DLR.mengZhongJi(4),2);
eq('孟仲季-丑=季(2)',DLR.mengZhongJi(1),2);

// 3. 伏吟杜传格：刚日自任格，中传=初传，末传=初传之冲
// 月将=巳(5) 占时=巳(5) 日干=庚(刚日) → 伏吟-自任
// 初传=干寄宫(庚寄申8) 上神 = 天盘[8] = 8 (伏吟天盘=地盘)
// 中传=天盘[8]=8 = 初传 → 杜传，末传=8冲=2(寅)
const fuBaZi2=Lunar.getBaZi(testDate); // 庚日
const fuKeGang=DLR.qiKe(testDate,fuBaZi2,5,5,{});
eq('伏吟-自任 method',fuKeGang.sanChuan.method.includes('伏吟-自任'),true);
eq('伏吟-自任 含杜传',fuKeGang.sanChuan.method.includes('杜传'),true);
eq('伏吟-自任 初传=庚寄宫申8',fuKeGang.sanChuan.chu.idx,8);
eq('伏吟-自任 中传=初传',fuKeGang.sanChuan.zhong.idx,8);
eq('伏吟-自任 末传=初传之冲寅2',fuKeGang.sanChuan.mo.idx,2);

// 4. 伏吟柔日自信格：月将=巳(5) 占时=巳(5)，柔日（乙丁己辛癸）
// 找一个柔日：2024-06-16 为辛日（柔日）
const rouDate=new Date(2024,5,16,14,30);
const rouBaZi=Lunar.getBaZi(rouDate);
const fuKeRou=DLR.qiKe(rouDate,rouBaZi,5,5,{}); // 月将=巳占时=巳, 但日期不同月将也可能不同
// 仅当 isFuYin 为 true 时验证
if(fuKeRou.isFuYin){
  eq('伏吟-柔日 含自信',fuKeRou.sanChuan.method.includes('自信'),true);
  // 柔日初传=日支上神(=日支 itself 伏吟)
  eq('伏吟-柔日 初传=日支',fuKeRou.sanChuan.chu.idx,fuKeRou.dayZhiIdx);
  eq('伏吟-柔日 含杜传',fuKeRou.sanChuan.method.includes('杜传'),true);
  // 末传=初传之冲
  eq('伏吟-柔日 末传=初传之冲',(fuKeRou.sanChuan.mo.idx+6)%12,fuKeRou.sanChuan.chu.idx);
}

// 5. 别责法中末传：不再使用 zhongMoUseZhiShang，应按默认阴神递进
// 别责法触发条件：八专日(干支同位)+阳日+四课无克无遥克
// 八专日：甲寅/乙卯/丁巳/戊午/己未/庚申/辛酉/癸亥
// 找一个甲寅日：1900-01-01 不一定，扫描
let biezeKe=null;
for(let dy=1;dy<=365*2;dy++){
  const dd=new Date(2024,0,dy,12,0);
  const b=Lunar.getBaZi(dd);
  if(b.day.gz==='甲寅'){
    const yj=Lunar.getYueJiang(dd);
    const sc=Lunar.getShiChen(dd);
    const k=DLR.qiKe(dd,b,yj.zhiIdx,sc.index,{});
    if(k.sanChuan.method==='别责'){biezeKe=k;break;}
  }
}
if(biezeKe){
  console.log('别责法实例 甲寅日 method:',biezeKe.sanChuan.method,
    '初',biezeKe.sanChuan.chu.zhi,'中',biezeKe.sanChuan.zhong.zhi,'末',biezeKe.sanChuan.mo.zhi);
  // 别责：初传=干合神(甲合己)寄宫(己寄午6)之上神
  // 中传=天盘[初传]（默认阴神递进）
  // 末传=天盘[中传]
  // 验证中末传不是"日支上神重复"
  const zhiShang=biezeKe.tianPan[bieZeZhiShangIdx(biezeKe)];
  eq('别责-中传非日支上神重复',biezeKe.sanChuan.zhong.idx!==biezeKe.sanChuan.mo.idx||biezeKe.sanChuan.zhong.idx!==zhiShang,true);
  // 验证中末传是阴神递进（中传=tianPan[初传], 末传=tianPan[中传]）
  eq('别责-中传=天盘[初传]',biezeKe.sanChuan.zhong.idx,biezeKe.tianPan[biezeKe.sanChuan.chu.idx]);
  eq('别责-末传=天盘[中传]',biezeKe.sanChuan.mo.idx,biezeKe.tianPan[biezeKe.sanChuan.zhong.idx]);
}
function bieZeZhiShangIdx(k){return k.tianPan[k.dayZhiIdx];}

// 6. 九法覆盖（修正后再次验证）
const methods2=new Set();
for(let m=0;m<12;m++){
  for(let d=1;d<=28;d++){
    const dd=new Date(2024,m,d,12,0);
    const b=Lunar.getBaZi(dd);
    const yj=Lunar.getYueJiang(dd);
    const sc=Lunar.getShiChen(dd);
    const k=DLR.qiKe(dd,b,yj.zhiIdx,sc.index,{});
    if(k.sanChuan&&k.sanChuan.method)methods2.add(k.sanChuan.method);
  }
}
console.log('九法覆盖(修正后):',Array.from(methods2).join(','));
eq('九法覆盖修正后>=6种',methods2.size>=6,true);
// 关键法都应被覆盖（贼克/比用/涉害/遥克/伏吟/返吟 至少出现）
const allMethodsStr=Array.from(methods2).join('');
eq('九法-含贼克(重审/元首)',/重审|元首/.test(allMethodsStr),true);
eq('九法-含涉害',allMethodsStr.includes('涉害'),true);
eq('九法-含伏吟',allMethodsStr.includes('伏吟'),true);
eq('九法-含返吟',allMethodsStr.includes('返吟'),true);

// ===== T5 备份与复盘提醒测试 =====
console.log('\n--- T5 备份与复盘提醒 ---');
// 清空再准备
ctx.localStorage.removeItem('xuanjue_cases');
ctx.localStorage.removeItem('xuanjue_settings');
ctx.localStorage.removeItem('xuanjue_profile');

// 1. exportBackup version=0.3 + caseCount
Store.saveCase({id:'B1',title:'备份测试1',questionType:'感情关系',shushu:'大六壬',createdAt:Date.now()});
Store.saveCase({id:'B2',title:'备份测试2',questionType:'事业合作',shushu:'六爻',createdAt:Date.now()});
const exp=Store.exportBackup();
eq('exportBackup-version=0.3',exp.version,'0.3');
eq('exportBackup-caseCount=2',exp.caseCount,2);
eq('exportBackup-cases 数组完整',Array.isArray(exp.cases)&&exp.cases.length,2);
eq('exportBackup-app=玄决',exp.app,'玄决');
eq('exportBackup-exportedAt 存在',typeof exp.exportedAt==='string'&&exp.exportedAt.length>0,true);
eq('exportBackup-profile 存在',typeof exp.profile==='object',true);
eq('exportBackup-settings 不含 apiKey(默认)',exp.settings.aiApiKey,'');

// 2. importBackup 新增计数：清空后导入
ctx.localStorage.removeItem('xuanjue_cases');
const ret1=Store.importBackup(exp);
eq('importBackup-新增计数 added=2',ret1.added,2);
eq('importBackup-覆盖计数 updated=0',ret1.updated,0);
eq('importBackup-total=2',ret1.total,2);
eq('importBackup-导入后案例数',Store.listCases().length,2);

// 3. importBackup 覆盖计数：再次导入相同数据
const ret2=Store.importBackup(exp);
eq('importBackup-覆盖计数 updated=2',ret2.updated,2);
eq('importBackup-新增计数 added=0',ret2.added,0);
eq('importBackup-total 仍=2',ret2.total,2);
eq('importBackup-覆盖后不重复',Store.listCases().length,2);

// 4. importBackup 混合计数：现有2条 + 导入1条新1条覆盖
const mixedExp={app:'玄决',version:'0.3',exportedAt:new Date().toISOString(),
  cases:[
    {id:'B2',title:'备份测试2-修改',questionType:'事业合作',shushu:'六爻',createdAt:Date.now()}, // 覆盖
    {id:'B3',title:'备份测试3',questionType:'财务决策',shushu:'八字',createdAt:Date.now()}        // 新增
  ]};
const ret3=Store.importBackup(mixedExp);
eq('importBackup-混合 added=1',ret3.added,1);
eq('importBackup-混合 updated=1',ret3.updated,1);
eq('importBackup-混合 total=3',ret3.total,3);
// 验证覆盖生效
const b2=Store.getCase('B2');
eq('importBackup-覆盖内容生效',b2.title,'备份测试2-修改');

// 5. importBackup 格式校验失败
let threw=false;
try{Store.importBackup({app:'其他'});}catch(e){threw=true;}
eq('importBackup-app 错误抛异常',threw,true);
threw=false;
try{Store.importBackup({app:'玄决'});}catch(e){threw=true;} // 缺 cases
eq('importBackup-缺 cases 抛异常',threw,true);
threw=false;
try{Store.importBackup({app:'玄决',cases:'不是数组'});}catch(e){threw=true;}
eq('importBackup-cases 非数组抛异常',threw,true);

// 6. importBackup settings 白名单仍生效
const withSettings={app:'玄决',version:'0.3',cases:[],
  settings:{aiTone:'直接简洁',aiLength:'简短',evilField:'应被忽略'}};
const ret4=Store.importBackup(withSettings);
const s=Store.getSettings();
eq('importBackup-白名单 aiTone 生效',s.aiTone,'直接简洁');
eq('importBackup-白名单 aiLength 生效',s.aiLength,'简短');
eq('importBackup-非白名单字段被忽略',s.evilField,undefined);

// 7. storageSizeEstimate
ctx.localStorage.removeItem('xuanjue_cases');
const sz0=Store.storageSizeEstimate();
eq('storageSizeEstimate-空案例数=0',sz0.caseCount,0);
eq('storageSizeEstimate-空 sizeBytes=4([])',sz0.sizeBytes,4); // "[]" 长度2 × 2 = 4
eq('storageSizeEstimate-空 sizeText=B',sz0.sizeText,'4 B');
Store.saveCase({id:'S1',title:'存储测试',questionType:'感情关系',shushu:'大六壬',createdAt:Date.now()});
const sz1=Store.storageSizeEstimate();
eq('storageSizeEstimate-1条案例数=1',sz1.caseCount,1);
eq('storageSizeEstimate-1条 sizeBytes>4',sz1.sizeBytes>4,true);
// 验证 sizeText 格式：< 1024 B 显示 "N B"，否则 KB
if(sz1.sizeBytes<1024){
  eq('storageSizeEstimate-B 格式',/^\d+ B$/.test(sz1.sizeText),true);
}else{
  eq('storageSizeEstimate-KB 格式',/^\d+\.\d KB$/.test(sz1.sizeText),true);
}
// 构造大案例验证 KB 格式
for(let i=0;i<100;i++){
  Store.saveCase({id:'S'+i,title:'存储测试案例'+i+'号'.padEnd(50,'测'),questionType:'感情关系',shushu:'大六壬',createdAt:Date.now()});
}
const szBig=Store.storageSizeEstimate();
eq('storageSizeEstimate-大案例 KB 格式',/KB$/.test(szBig.sizeText),true);

// 8. 到期筛选：构造到期未复盘案例
ctx.localStorage.removeItem('xuanjue_cases');
const pastDue=Date.now()-86400000*3; // 3天前到期
const futureDue=Date.now()+86400000*7; // 7天后到期
Store.saveCase({id:'D1',title:'到期案例',questionType:'感情关系',shushu:'大六壬',reviewDue:pastDue,reviewed:false,createdAt:Date.now()});
Store.saveCase({id:'D2',title:'未到期案例',questionType:'感情关系',shushu:'大六壬',reviewDue:futureDue,reviewed:false,createdAt:Date.now()});
Store.saveCase({id:'D3',title:'已复盘案例',questionType:'感情关系',shushu:'大六壬',reviewDue:pastDue,reviewed:true,review:{result:'应验'},createdAt:Date.now()});
const dueList=Store.listCasesByFilter({duePending:true});
eq('到期筛选-只返回到期未复盘',dueList.length,1);
eq('到期筛选-返回 D1',dueList[0].id,'D1');
// 应验程度筛选不受 duePending 影响
const reviewedList=Store.listCasesByFilter({reviewed:true});
eq('到期筛选-已复盘筛选正常',reviewedList.length,1);

// 清理 T5 测试数据
['B1','B2','B3','S1','D1','D2','D3'].forEach(id=>Store.deleteCase(id));
for(let i=0;i<100;i++)Store.deleteCase('S'+i);
ctx.localStorage.removeItem('xuanjue_cases');
ctx.localStorage.removeItem('xuanjue_settings');
ctx.localStorage.removeItem('xuanjue_profile');

console.log('\n=========================');
console.log('通过:',pass,'失败:',fail);
process.exit(fail?1:0);
