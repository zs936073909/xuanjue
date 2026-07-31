// 大六壬算法验证（按古籍《大六壬大全》《大六壬指南》案例校验）
const fs = require('fs');
const path = require('path');

// 创建共享 window 沙箱
const sandbox = {console, Date, Math, parseInt, parseFloat, isNaN, Array, Object, String, Number, Boolean, RegExp, JSON, Map, Set};
sandbox.window = sandbox;

function loadFile(p){
  return fs.readFileSync(path.join(__dirname,p),'utf8');
}
function runSrc(src){
  const fn = new Function('window','Lunar','console','Date','Math','parseInt','parseFloat','isNaN','Array','Object','String','Number','Boolean','RegExp','JSON','Map','Set', src);
  fn.call(sandbox, sandbox, sandbox.Lunar, sandbox.console, sandbox.Date, sandbox.Math, sandbox.parseInt, sandbox.parseFloat, sandbox.isNaN, sandbox.Array, sandbox.Object, sandbox.String, sandbox.Number, sandbox.Boolean, sandbox.RegExp, sandbox.JSON, sandbox.Map, sandbox.Set);
}
runSrc(loadFile('js/lunar.js'));
sandbox.Lunar = sandbox.window.Lunar;
runSrc(loadFile('js/daliuren.js'));
const Lunar = sandbox.Lunar;
const DaLiuRen = sandbox.window.DaLiuRen;
const ZHI = Lunar.ZHI;

let pass=0, fail=0;
function assert(name, cond, info){
  if(cond){pass++;console.log('  ✓ '+name);}
  else{fail++;console.log('  ✗ '+name+(info?' | '+info:''));}
}

// ============ 一、昼夜贵人判断（古籍: 卯-申为昼, 酉-寅为夜） ============
console.log('\n=== 一、昼夜贵人 ===');
assert('卯时为昼', DaLiuRen.isDayTime(3)===true);
assert('辰时为昼', DaLiuRen.isDayTime(4)===true);
assert('巳时为昼', DaLiuRen.isDayTime(5)===true);
assert('午时为昼', DaLiuRen.isDayTime(6)===true);
assert('未时为昼', DaLiuRen.isDayTime(7)===true);
assert('申时为昼', DaLiuRen.isDayTime(8)===true);
assert('酉时为夜', DaLiuRen.isDayTime(9)===false);
assert('戌时为夜', DaLiuRen.isDayTime(10)===false);
assert('亥时为夜', DaLiuRen.isDayTime(11)===false);
assert('子时为夜', DaLiuRen.isDayTime(0)===false);
assert('丑时为夜', DaLiuRen.isDayTime(1)===false);
assert('寅时为夜', DaLiuRen.isDayTime(2)===false);

// ============ 二、桃花计算（古籍: 寅午戌→卯, 申子辰→酉, 巳酉丑→午, 亥卯未→子） ============
console.log('\n=== 二、神煞·桃花 ===');
// 找一天支为寅(2)/午(6)/戌(10)的日子验证桃花=卯(3)
// 三合[2,6,10]代表寅午戌, 中间字=午(6), 桃花应为卯(3)
// 我们用 mock baZi 来测 computeShenSha
const mockBaZi1={year:{zhiIdx:0},month:{zhiIdx:0},day:{zhiIdx:2}}; // 寅日
const ss1=DaLiuRen.qiKe?null:null;
// computeShenSha 是内部函数，我们通过 qiKe 间接验证
// 寅日(2): 桃花应为卯
// 用任意时间起课，仅检查 shenSha
const d1=new Date(2024,5,15,12,0); // 午时
const bz1=Lunar.getBaZi(d1);
// 强制 day zhi = 寅(2): 用 2024-02-08 (甲辰 丙寅 壬寅?)
// 这里用一个能产生寅日的日期: 2024-02-10 是甲辰年丙寅月甲辰日, 不对
// 直接构造 mock baZi 来验证
const mockBzTiger={year:{zhiIdx:2},month:{zhiIdx:2},day:{zhiIdx:2,index:0}}; // 寅日, 占位 index
// 由于 computeShenSha 没有导出, 我们用日支查表
// 改用直接调用 qiKe 验证: 找真实寅日
// 2024-02-04 立春后第一寅日: 2024-02-12 (甲辰 丙寅 壬寅? 校验)
for(let day=1; day<=28; day++){
  const d=new Date(2024,1,day,12,0);
  const bz=Lunar.getBaZi(d);
  if(bz.day.zhiIdx===2){ // 寅日
    const yj=Lunar.getYueJiang(d,'中气定将');
    const sc=Lunar.getShiChen(d);
    const ke=DaLiuRen.qiKe(d, bz, yj.zhiIdx, sc.index, {});
    assert('寅日(三合寅午戌)桃花=卯', ke.shenSha.taohua==='卯', '实际: '+ke.shenSha.taohua);
    break;
  }
}
// 申子辰→酉
for(let day=1; day<=28; day++){
  const d=new Date(2024,0,day,12,0);
  const bz=Lunar.getBaZi(d);
  if(bz.day.zhiIdx===8){ // 申日
    const yj=Lunar.getYueJiang(d,'中气定将');
    const sc=Lunar.getShiChen(d);
    const ke=DaLiuRen.qiKe(d, bz, yj.zhiIdx, sc.index, {});
    assert('申日(三合申子辰)桃花=酉', ke.shenSha.taohua==='酉', '实际: '+ke.shenSha.taohua);
    break;
  }
}
// 巳酉丑→午
for(let day=1; day<=28; day++){
  const d=new Date(2024,4,day,12,0);
  const bz=Lunar.getBaZi(d);
  if(bz.day.zhiIdx===5){ // 巳日
    const yj=Lunar.getYueJiang(d,'中气定将');
    const sc=Lunar.getShiChen(d);
    const ke=DaLiuRen.qiKe(d, bz, yj.zhiIdx, sc.index, {});
    assert('巳日(三合巳酉丑)桃花=午', ke.shenSha.taohua==='午', '实际: '+ke.shenSha.taohua);
    break;
  }
}
// 亥卯未→子
for(let day=1; day<=28; day++){
  const d=new Date(2024,2,day,12,0);
  const bz=Lunar.getBaZi(d);
  if(bz.day.zhiIdx===3){ // 卯日
    const yj=Lunar.getYueJiang(d,'中气定将');
    const sc=Lunar.getShiChen(d);
    const ke=DaLiuRen.qiKe(d, bz, yj.zhiIdx, sc.index, {});
    assert('卯日(三合亥卯未)桃花=子', ke.shenSha.taohua==='子', '实际: '+ke.shenSha.taohua);
    break;
  }
}

// ============ 三、驿马、华盖 ============
console.log('\n=== 三、神煞·驿马·华盖 ===');
// 寅日: 驿马=申(寅之冲), 华盖=戌
for(let day=1; day<=28; day++){
  const d=new Date(2024,1,day,12,0);
  const bz=Lunar.getBaZi(d);
  if(bz.day.zhiIdx===2){
    const yj=Lunar.getYueJiang(d,'中气定将');
    const sc=Lunar.getShiChen(d);
    const ke=DaLiuRen.qiKe(d, bz, yj.zhiIdx, sc.index, {});
    assert('寅日驿马=申', ke.shenSha.yima==='申', '实际: '+ke.shenSha.yima);
    assert('寅日华盖=戌', ke.shenSha.huagai==='戌', '实际: '+ke.shenSha.huagai);
    break;
  }
}

// ============ 四、空亡（按旬首计算） ============
console.log('\n=== 四、空亡 ===');
// 甲子旬(0-9): 戌亥空 (10,11)
// 甲戌旬(10-19): 申酉空 (8,9)
// 甲申旬(20-29): 午未空 (6,7)
// 甲午旬(30-39): 辰巳空 (4,5)
// 甲辰旬(40-49): 寅卯空 (2,3)
// 甲寅旬(50-59): 子丑空 (0,1)
for(let n=0; n<60; n+=10){
  const xun=n/10;
  const exp=[[10,11],[8,9],[6,7],[4,5],[2,3],[0,1]][xun];
  // 构造一个日 index = n 的 mock baZi
  const mockBz={year:{zhiIdx:0},month:{zhiIdx:0},day:{zhiIdx:n%12,index:n}};
  // qiKe 内部会用 baZi.day.index 算空亡
  // 找一个真实日期: 2024-02-04(立春) 为甲子日 index=0, 2024-02-05=乙丑(1)...
  // 2024-02-04 + n 天 = 甲辰年丙寅月第 n 个干支日
  const d=new Date(2024,1,4+n,12,0);
  const bz=Lunar.getBaZi(d);
  if(bz.day.index%10===0){
    const yj=Lunar.getYueJiang(d,'中气定将');
    const sc=Lunar.getShiChen(d);
    const ke=DaLiuRen.qiKe(d, bz, yj.zhiIdx, sc.index, {});
    const got=[ZHI.indexOf(ke.kongWang[0]!==undefined?ZHI[ke.kongWang[0]]:''), ZHI.indexOf(ZHI[ke.kongWang[1]])];
    assert('旬首 index='+n+' 空亡='+ZHI[exp[0]]+ZHI[exp[1]],
      ke.kongWang[0]===exp[0] && ke.kongWang[1]===exp[1],
      '实际: '+(ke.kongWang[0]>=0?ZHI[ke.kongWang[0]]:'?')+(ke.kongWang[1]>=0?ZHI[ke.kongWang[1]]:'?'));
  }
}

// ============ 五、干寄宫（按《大六壬大全》"甲课寅兮乙课辰，丙戊课巳不须论，
// 丁己课未庚申上，辛戌壬亥是其真。癸课原来丑宫坐，分明不用四正神"） ============
console.log('\n=== 五、干寄宫 ===');
const GAN_JI_EXP={甲:'寅',乙:'辰',丙:'巳',丁:'未',戊:'巳',己:'未',庚:'申',辛:'戌',壬:'亥',癸:'丑'};
Object.keys(GAN_JI_EXP).forEach(g=>{
  const idx=DaLiuRen.GAN_JI[g];
  assert('干寄宫 '+g+'→'+GAN_JI_EXP[g], ZHI[idx]===GAN_JI_EXP[g], '实际: '+ZHI[idx]);
});

// ============ 六、贵人歌诀 ============
console.log('\n=== 六、贵人歌诀 ===');
// 甲戊庚牛羊(丑未), 乙己鼠猴乡(子申), 丙丁猪鸡位(亥酉), 壬癸蛇兔藏(巳卯), 六辛逢马虎(午寅)
const GUIREN_EXP={
  '甲':{day:'丑',night:'未'},'戊':{day:'丑',night:'未'},'庚':{day:'丑',night:'未'},
  '乙':{day:'子',night:'申'},'己':{day:'子',night:'申'},
  '丙':{day:'亥',night:'酉'},'丁':{day:'亥',night:'酉'},
  '壬':{day:'卯',night:'巳'},'癸':{day:'卯',night:'巳'},
  '辛':{day:'午',night:'寅'}
};
Object.keys(GUIREN_EXP).forEach(g=>{
  const gr=DaLiuRen.GUIREN[g];
  assert('昼贵 '+g+'→'+GUIREN_EXP[g].day, ZHI[gr.day]===GUIREN_EXP[g].day, '实际: '+ZHI[gr.day]);
  assert('夜贵 '+g+'→'+GUIREN_EXP[g].night, ZHI[gr.night]===GUIREN_EXP[g].night, '实际: '+ZHI[gr.night]);
});

// ============ 七、伏吟课（月将=占时） ============
console.log('\n=== 七、伏吟课 ===');
// 强制月将=占时: 取午时(6), 找一个夏至后(月将=未7)... 月将=未时占时也是未
// 2024-07-15 13:30 = 未时, 月将=未(夏至后大暑前? 实际看节气)
// 简化: 直接传入 yueJiangIdx = zhanShiIdx = 6 (午)
const dFu=new Date(2024,6,15,12,0);
const bzFu=Lunar.getBaZi(dFu);
const keFu=DaLiuRen.qiKe(dFu, bzFu, 6, 6, {}); // 月将=午, 占时=午 → 伏吟
assert('伏吟课标识', keFu.isFuYin===true);
assert('伏吟课三传法以"伏吟-"开头', keFu.sanChuan.method.startsWith('伏吟-'), '实际: '+keFu.sanChuan.method);
// 伏吟杜传: 末传 = 初传之冲
const c1Fu=ZHI.indexOf(keFu.sanChuan.chu.zhi);
const c3Fu=ZHI.indexOf(keFu.sanChuan.mo.zhi);
assert('伏吟末传=初传之冲', (c1Fu+6)%12===c3Fu, '初='+keFu.sanChuan.chu.zhi+' 末='+keFu.sanChuan.mo.zhi);
// 中传=初传 (杜传)
assert('伏吟中传=初传', keFu.sanChuan.zhong.zhi===keFu.sanChuan.chu.zhi, '初='+keFu.sanChuan.chu.zhi+' 中='+keFu.sanChuan.zhong.zhi);

// ============ 八、返吟课（月将-占时 = ±6） ============
console.log('\n=== 八、返吟课 ===');
// 月将=午(6), 占时=子(0) → 差6, 返吟
const dFan=new Date(2024,6,15,12,0);
const bzFan=Lunar.getBaZi(dFan);
// 午时是12:00, 即占时=午(6). 要返吟则月将=子(0). 但月将由节气决定.
// 我们直接传 yueJiangIdx=0, zhanShiIdx=6
const keFan=DaLiuRen.qiKe(dFan, bzFan, 0, 6, {});
assert('返吟课标识', keFan.isFanYin===true);
assert('返吟课三传法以"返吟-"开头', keFan.sanChuan.method.startsWith('返吟-'), '实际: '+keFan.sanChuan.method);

// ============ 九、基本起课四课 ============
console.log('\n=== 九、四课完整性 ===');
const d9=new Date(2024,5,15,14,30);
const bz9=Lunar.getBaZi(d9);
const yj9=Lunar.getYueJiang(d9,'中气定将');
const sc9=Lunar.getShiChen(d9);
const ke9=DaLiuRen.qiKe(d9, bz9, yj9.zhiIdx, sc9.index, {questionType:'事业合作'});
assert('四课长度=4', ke9.lessons.length===4);
ke9.lessons.forEach((l,i)=>{
  assert('课 '+(i+1)+' 上神非空', l.up!==undefined && l.up>=0 && l.up<12);
  assert('课 '+(i+1)+' 下神非空', l.down!==undefined && l.down>=0 && l.down<12);
  assert('课 '+(i+1)+' 上神天将', typeof l.upTJ==='string' && l.upTJ.length>0);
  assert('课 '+(i+1)+' 五行关系', ['生','克','同','被生','被克','无'].includes(l.relation));
});

// ============ 十、三传完整性 ============
console.log('\n=== 十、三传完整性 ===');
const sc10=ke9.sanChuan;
assert('三传法非空', typeof sc10.method==='string' && sc10.method.length>0);
['chu','zhong','mo'].forEach(k=>{
  const t=sc10[k];
  assert(k+' 地支', typeof t.zhi==='string' && t.zhi.length===1);
  assert(k+' 天将', typeof t.tj==='string' && t.tj.length>0);
  assert(k+' 五行', typeof t.wx==='string' && ['水','木','火','土','金'].includes(t.wx));
  assert(k+' 生肖', typeof t.sx==='string' && t.sx.length>0);
  assert(k+' 方位', typeof t.fw==='string' && t.fw.length>0);
  assert(k+' 八卦宫', typeof t.bg==='string' && t.bg.length>0);
  assert(k+' 空亡标识', typeof t.isKong==='boolean');
});
assert('初→中关系', ['生','克','同','被生','被克','无'].includes(sc10.chuToZhong));
assert('中→末关系', ['生','克','同','被生','被克','无'].includes(sc10.zhongToMo));

// ============ 十一、天将落宫表完整性 ============
console.log('\n=== 十一、天将落宫表 ===');
assert('天将表长度=12', ke9.tjList.length===12);
ke9.tjList.forEach((tj,i)=>{
  assert('天将['+i+'] '+tj.name+' 落宫', tj.zhi>=0 && tj.zhi<12);
  assert('天将['+i+'] 五行', ['水','木','火','土','金'].includes(tj.wx));
});

// ============ 十二、类神映射 ============
console.log('\n=== 十二、类神映射 ===');
const LEISHEN_EXP={
  '感情关系':'六合','事业合作':'青龙','学习考试':'朱雀','出行移动':'白虎',
  '签约交易':'青龙','人际沟通':'六合','财务决策':'太常','健康倾向':'白虎',
  '失物寻找':'玄武','二选一决策':'六合','其他':'贵人'
};
Object.keys(LEISHEN_EXP).forEach(qt=>{
  assert('类神 '+qt+'→'+LEISHEN_EXP[qt], DaLiuRen.LEISHEN[qt]===LEISHEN_EXP[qt], '实际: '+DaLiuRen.LEISHEN[qt]);
});

// ============ 十三、涉害深度计算 ============
console.log('\n=== 十三、涉害深度 ===');
// 例: 上神未(土,7), 下神卯(木,3). 路径: 卯→辰→巳→午→未(不含)
// 卯(木)克未(土): 是, n=1
// 辰(土)克未(土): 否
// 巳(火)克未(土): 否(火生土)
// 午(火)克未(土): 否
// 深度=1
assert('涉害 未/卯 深度=1', DaLiuRen.sheHaiDepth(7,3)===1, '实际: '+DaLiuRen.sheHaiDepth(7,3));
// 上神=下神, 深度=0
assert('涉害 同位 深度=0', DaLiuRen.sheHaiDepth(5,5)===0);

// ============ 十四、孟仲季 ============
console.log('\n=== 十四、孟仲季 ===');
// 孟: 寅申巳亥 = 2,8,5,11
[2,8,5,11].forEach(i=>assert('孟 '+ZHI[i], DaLiuRen.mengZhongJi(i)===0));
// 仲: 子午卯酉 = 0,6,3,9
[0,6,3,9].forEach(i=>assert('仲 '+ZHI[i], DaLiuRen.mengZhongJi(i)===1));
// 季: 辰戌丑未 = 4,10,1,7
[4,10,1,7].forEach(i=>assert('季 '+ZHI[i], DaLiuRen.mengZhongJi(i)===2));

// ============ 十五、八专日 ============
console.log('\n=== 十五、八专日 ===');
// 甲寅, 乙卯, 丁巳, 戊午, 己未, 庚申, 辛酉, 癸亥
const BAZHUAN_EXP={'甲':'寅','乙':'卯','丁':'巳','戊':'午','己':'未','庚':'申','辛':'酉','癸':'亥'};
Object.keys(BAZHUAN_EXP).forEach(g=>{
  const zhi=BAZHUAN_EXP[g];
  assert('八专 '+g+zhi, DaLiuRen.isBaZhuanDay(g, ZHI.indexOf(zhi))===true);
});
// 丙午非八专
assert('丙午 非八专', DaLiuRen.isBaZhuanDay('丙', 6)===false);

// ============ 十六、旺相休囚死（按《五行大义》《渊海子平》）============
console.log('\n=== 十六、旺相休囚死 ===');
// 古籍：春木旺、火相、土死、金囚、水休。
// 寅月(木=2)
assert('寅月 寅(木) 旺', DaLiuRen.wangXiang(2, 2)==='旺');
assert('寅月 卯(木) 旺', DaLiuRen.wangXiang(3, 2)==='旺');
assert('寅月 巳(火) 相（木生火）', DaLiuRen.wangXiang(5, 2)==='相');
assert('寅月 午(火) 相（木生火）', DaLiuRen.wangXiang(6, 2)==='相');
assert('寅月 亥(水) 休（水生木）', DaLiuRen.wangXiang(11, 2)==='休');
assert('寅月 子(水) 休（水生木）', DaLiuRen.wangXiang(0, 2)==='休');
assert('寅月 申(金) 囚（金克木）', DaLiuRen.wangXiang(8, 2)==='囚');
assert('寅月 酉(金) 囚（金克木）', DaLiuRen.wangXiang(9, 2)==='囚');
assert('寅月 辰(土) 死（木克土）', DaLiuRen.wangXiang(4, 2)==='死');
assert('寅月 戌(土) 死（木克土）', DaLiuRen.wangXiang(10, 2)==='死');
// 午月(火=6)：火旺、土相、金死、水囚、木休
assert('午月 午(火) 旺', DaLiuRen.wangXiang(6, 6)==='旺');
assert('午月 辰(土) 相（火生土）', DaLiuRen.wangXiang(4, 6)==='相');
assert('午月 寅(木) 休（木生火）', DaLiuRen.wangXiang(2, 6)==='休');
assert('午月 子(水) 囚（水克火）', DaLiuRen.wangXiang(0, 6)==='囚');
assert('午月 申(金) 死（火克金）', DaLiuRen.wangXiang(8, 6)==='死');
// 申月(金=8)：金旺、水相、木死、火囚、土休（《五行大义》秋）
assert('申月 申(金) 旺', DaLiuRen.wangXiang(8, 8)==='旺');
assert('申月 子(水) 相（金生水）', DaLiuRen.wangXiang(0, 8)==='相');
assert('申月 辰(土) 休（土生金）', DaLiuRen.wangXiang(4, 8)==='休');
assert('申月 卯(木) 死（金克木）', DaLiuRen.wangXiang(3, 8)==='死');
assert('申月 巳(火) 囚（火克金）', DaLiuRen.wangXiang(5, 8)==='囚');
// 亥月(水=11)：水旺、木相、火死、土囚、金休（《五行大义》冬）
assert('亥月 亥(水) 旺', DaLiuRen.wangXiang(11, 11)==='旺');
assert('亥月 寅(木) 相（水生木）', DaLiuRen.wangXiang(2, 11)==='相');
assert('亥月 申(金) 休（金生水）', DaLiuRen.wangXiang(8, 11)==='休');
assert('亥月 巳(火) 死（水克火）', DaLiuRen.wangXiang(5, 11)==='死');
assert('亥月 辰(土) 囚（土克水）', DaLiuRen.wangXiang(4, 11)==='囚');

console.log('\n========================================');
console.log('总计: '+pass+' 通过, '+fail+' 失败');
console.log('========================================');
process.exit(fail>0?1:0);
