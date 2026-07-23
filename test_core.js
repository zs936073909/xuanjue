// test_core.js — 验证核心算法
const fs=require('fs');
const vm=require('vm');
const ctx={console,Date,Math,localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}}};
ctx.window=ctx;ctx.global=ctx;vm.createContext(ctx);
['js/lunar.js','js/huangli.js','js/daliuren.js','js/shushu.js','js/store.js','js/ai.js'].forEach(f=>{
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

console.log('\n=========================');
console.log('通过:',pass,'失败:',fail);
process.exit(fail?1:0);
