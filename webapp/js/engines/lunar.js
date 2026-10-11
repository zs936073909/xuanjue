// lunar.js — 农历/干支/节气/时辰 核心算法（离线，无依赖）
// 干支日柱以 JDN 验证：1949-10-01=甲子日，2000-01-01=戊午日（公式 JDN+49 mod 60，0=甲子）
(function(global){
  const GAN=['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
  const ZHI=['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
  // 生肖
  const SX=['鼠','牛','虎','兔','龙','蛇','马','羊','猴','鸡','狗','猪'];
  // 农历信息表 1900-2100（6tail lunar 标准表）
  const lunarInfo=[
  0x04bd8,0x04ae0,0x0a570,0x054d5,0x0d260,0x0d950,0x16554,0x056a0,0x09ad0,0x055d2,
  0x04ae0,0x0a5b6,0x0a4d0,0x0d250,0x1d255,0x0b540,0x0d6a0,0x0ada2,0x095b0,0x14977,
  0x04970,0x0a4b0,0x0b4b5,0x06a50,0x06d40,0x1ab54,0x02b60,0x09570,0x052f2,0x04970,
  0x06566,0x0d4a0,0x0ea50,0x06e95,0x05ad0,0x02b60,0x186e3,0x092e0,0x1c8d7,0x0c950,
  0x0d4a0,0x1d8a6,0x0b550,0x056a0,0x1a5b4,0x025d0,0x092d0,0x0d2b2,0x0a950,0x0b557,
  0x06ca0,0x0b550,0x15355,0x04da0,0x0a5b0,0x14573,0x052b0,0x0a9a8,0x0e950,0x06aa0,
  0x0aea6,0x0ab50,0x04b60,0x0aae4,0x0a570,0x05260,0x0f263,0x0d950,0x05b57,0x056a0,
  0x096d0,0x04dd5,0x04ad0,0x0a4d0,0x0d4d4,0x0d250,0x0d558,0x0b540,0x0b6a0,0x195a6,
  0x095b0,0x049b0,0x0a974,0x0a4b0,0x0b27a,0x06a50,0x06d40,0x0af46,0x0ab60,0x09570,
  0x04af5,0x04970,0x064b0,0x074a3,0x0ea50,0x06b58,0x055c0,0x0ab60,0x096d5,0x092e0,
  0x0c960,0x0d954,0x0d4a0,0x0da50,0x07552,0x056a0,0x0abb7,0x025d0,0x092d0,0x0cab5,
  0x0a950,0x0b4a0,0x0baa4,0x0ad50,0x055d9,0x04ba0,0x0a5b0,0x15176,0x052b0,0x0a930,
  0x07954,0x06aa0,0x0ad50,0x05b52,0x04b60,0x0a6e6,0x0a4e0,0x0d260,0x0ea65,0x0d530,
  0x05aa0,0x076a3,0x096d0,0x04afb,0x04ad0,0x0a4d0,0x1d0b6,0x0d250,0x0d520,0x0dd45,
  0x0b5a0,0x056d0,0x055b2,0x049b0,0x0a577,0x0a4b0,0x0aa50,0x1b255,0x06d20,0x0ada0,
  0x14b63,0x09370,0x049f8,0x04970,0x064b0,0x168a6,0x0ea50,0x06b20,0x1a6c4,0x0aae0,
  0x0a2e0,0x0d2e3,0x0c960,0x0d557,0x0d4a0,0x0da50,0x05d55,0x056a0,0x0a6d0,0x055d4,
  0x052d0,0x0a9b8,0x0a950,0x0b4a0,0x0b6a6,0x0ad50,0x055a0,0x0aba4,0x0a5b0,0x052b0,
  0x0b273,0x06930,0x07337,0x06aa0,0x0ad50,0x14b55,0x04b60,0x0a570,0x054e4,0x0d160,
  0x0e968,0x0d520,0x0daa0,0x16aa6,0x056d0,0x04ae0,0x0a9d4,0x0a2d0,0x0d150,0x0f252,
  0x0d520];
  // 月份
  const MONTHS=['正','二','三','四','五','六','七','八','九','十','冬','腊'];
  const DATE=['初一','初二','初三','初四','初五','初六','初七','初八','初九','初十','十一','十二','十三','十四','十五','十六','十七','十八','十九','二十','廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'];

  function lYearDays(y){let s=348;for(let i=0x8000;i>0x8;i>>=1)s+=(lunarInfo[y-1900]&i)?1:0;return s+leapDays(y);}
  function leapMonth(y){return lunarInfo[y-1900]&0xf;}
  function leapDays(y){return leapMonth(y)?((lunarInfo[y-1900]&0x10000)?30:29):0;}
  function monthDays(y,m){return(lunarInfo[y-1900]&(0x10000>>m))?30:29;}

  // 24 节气表（小寒=0），基于 1900-01-06 02:05 的分钟偏移
  const sTermInfo=[0,21208,42467,63836,85337,107014,128867,150921,173149,195551,218072,240693,263343,285989,308563,331033,353350,375494,397447,419210,440795,462224,483532,504758];
  const JIEQI=['小寒','大寒','立春','雨水','惊蛰','春分','清明','谷雨','立夏','小满','芒种','夏至','小暑','大暑','立秋','处暑','白露','秋分','寒露','霜降','立冬','小雪','大雪','冬至'];

  function sTermDate(y,n){
    // 返回该年第 n 个节气的 Date（本地时区，UTC+8 适用）
    const t=new Date(31556925974.7*(y-1900)+sTermInfo[n]*60000+Date.UTC(1900,0,6,2,5));
    return new Date(t.getUTCFullYear(),t.getUTCMonth(),t.getUTCDate(),t.getUTCHours(),t.getUTCMinutes());
  }

  // JDN（公历日期）
  function jdn(y,m,d){
    const a=Math.floor((14-m)/12);
    const y2=y+4800-a, m2=m+12*a-3;
    return d+Math.floor((153*m2+2)/5)+365*y2+Math.floor(y2/4)-Math.floor(y2/100)+Math.floor(y2/400)-32045;
  }

  function gzFromIndex(i){i=((i%60)+60)%60;return GAN[i%10]+ZHI[i%12];}
  function ganzhiOf(i){i=((i%60)+60)%60;return{gz:GAN[i%10]+ZHI[i%12],gan:GAN[i%10],ganIdx:i%10,zhi:ZHI[i%12],zhiIdx:i%12,index:i};}

  // 干支四柱
  function getBaZi(date){
    const y=date.getFullYear(),m=date.getMonth()+1,d=date.getDate();
    // 立春为年界
    const lichun=sTermDate(y,2);
    let gy=y;
    if(date<lichun)gy=y-1;
    const yearIdx=((gy-4)%60+60)%60;
    // 月柱：以"节"定月建。节为节气表偶数序：小寒0,立春2,惊蛰4,...
    // 月支：小寒→丑(1),立春→寅(2),惊蛰→卯(3),清明→辰(4),立夏→巳(5),芒种→午(6),
    //       小暑→未(7),立秋→申(8),白露→酉(9),寒露→戌(10),立冬→亥(11),大雪→子(0)
    const jieStarts=[[0,1],[2,2],[4,3],[6,4],[8,5],[10,6],[12,7],[14,8],[16,9],[18,10],[20,11],[22,0]];
    let mZhi=0,prev=null;
    for(const[n,z]of jieStarts){
      const dt=sTermDate(y,n);
      if(date>=dt)prev=[z,dt];
    }
    if(!prev){ // 落在上年大雪之前 → 取上年大雪(子月)
      prev=[0,sTermDate(y-1,22)];
    }
    mZhi=prev[0];
    // 月干：五虎遁 寅月起
    const yGan=yearIdx%10;
    const yinGan=((yGan%5)*2+2)%10; // 寅月干
    let mGan=(mZhi>=2)?(yinGan+(mZhi-2))%10:(yinGan+(mZhi+10))%10;
    // 日柱
    const dayIdx=(jdn(y,m,d)+49)%60;
    // 时柱
    const h=date.getHours();
    let sZhi=Math.floor(((h+1)%24)/2); // 23-1=子(0)
    const dGan=dayIdx%10;
    const ziGan=(dGan%5)*2; // 子时干
    const sGan=(ziGan+sZhi)%10;
    return{
      year:ganzhiOf(yearIdx),
      month:{gz:GAN[mGan]+ZHI[mZhi],gan:GAN[mGan],ganIdx:mGan,zhi:ZHI[mZhi],zhiIdx:mZhi,index:mGan*12+mZhi},
      day:ganzhiOf(dayIdx),
      hour:{gz:GAN[sGan]+ZHI[sZhi],gan:GAN[sGan],ganIdx:sGan,zhi:ZHI[sZhi],zhiIdx:sZhi,index:sGan*12+sZhi}
    };
  }

  // 公历转农历
  function solarToLunar(date){
    let y=date.getFullYear();
    if(y<1900||y>2100)return null;
    // 历元：1900-01-31（农历 1900 正月初一），与 lYearDays/leapMonth 匹配
    let offset=Math.floor((date-new Date(1900,0,31))/86400000);
    let i,leap=0,temp=0;
    for(i=1900;i<2100&&offset>0;i++){
      temp=lYearDays(i);offset-=temp;
    }
    if(offset<0){offset+=temp;i--;}
    y=i;leap=leapMonth(i);
    let isLeap=false;
    for(i=1;i<13&&offset>0;i++){
      if(leap>0&&i===leap+1&&isLeap===false){i--;isLeap=true;temp=leapDays(y);}
      else{temp=monthDays(y,i);}
      if(isLeap&&i===leap+1)isLeap=false;
      offset-=temp;
    }
    if(offset===0&&leap>0&&i===leap+1){if(isLeap)isLeap=false;else{isLeap=true;i--;}}
    if(offset<0){offset+=temp;i--;}
    const m=i;const day=offset+1;
    return{year:y,month:m,day,isLeap,lunarMonth:MONTHS[m-1],lunarDay:DATE[day-1],
      monthStr:(isLeap?'闰':'')+MONTHS[m-1]+'月',dayStr:DATE[day-1]};
  }

  // 当前/下一节气
  function currentNextJieQi(date){
    const y=date.getFullYear();
    const list=[];
    for(let n=0;n<24;n++){list.push({name:JIEQI[n],date:sTermDate(y,n)});}
    for(let n=0;n<24;n++){list.push({name:JIEQI[n],date:sTermDate(y+1,n)});}
    let cur=null,next=null;
    for(let i=0;i<list.length;i++){
      if(date>=list[i].date){cur=list[i];next=list[i+1];}
    }
    return{cur,next};
  }

  // 时辰
  const SHICHEN=['子时','丑时','寅时','卯时','辰时','巳时','午时','未时','申时','酉时','戌时','亥时'];
  const SHICHEN_RANGE=['23:00-01:00','01:00-03:00','03:00-05:00','05:00-07:00','07:00-09:00','09:00-11:00','11:00-13:00','13:00-15:00','15:00-17:00','17:00-19:00','19:00-21:00','21:00-23:00'];
  function getShiChen(date){
    const h=date.getHours();
    const idx=Math.floor(((h+1)%24)/2);
    return{name:SHICHEN[idx],range:SHICHEN_RANGE[idx],index:idx};
  }

  // 月将（中气定将）：返回地支索引
  // 雨水后→亥(11? no 子=0) 子=0丑=1寅=2卯=3辰=4巳=5午=6未=7申=8酉=9戌=10亥=11
  // 雨水后→亥(11),春分→戌(10),谷雨→酉(9),小满→申(8),夏至→未(7),大暑→午(6),处暑→巳(5),秋分→辰(4),霜降→卯(3),小雪→寅(2),冬至→丑(1),大寒→子(0)
  const YUEJIANG_MAP={
    '雨水':11,'春分':10,'谷雨':9,'小满':8,'夏至':7,'大暑':6,'处暑':5,'秋分':4,'霜降':3,'小雪':2,'冬至':1,'大寒':0
  };
  // 节气定将：取最近一次节气（含节和气）。节气序号 n 与月将地支索引
  // 立春(2)→亥, 惊蛰(4)→戌, 清明(6)→酉, 立夏(8)→申, 芒种(10)→未,
  // 小暑(12)→午, 立秋(14)→巳, 白露(16)→辰, 寒露(18)→卯, 立冬(20)→寅,
  // 大雪(22)→丑, 小寒(0)→子
  const YUEJIANG_JIEQI_MAP={
    '立春':11,'惊蛰':10,'清明':9,'立夏':8,'芒种':7,'小暑':6,
    '立秋':5,'白露':4,'寒露':3,'立冬':2,'大雪':1,'小寒':0
  };
  function getYueJiang(date,mode){
    mode=mode||'中气定将';
    const y=date.getFullYear();
    const cands=[];
    if(mode==='节气定将'){
      // 取最近一次节气（含节和气）
      const qi=[[0,0],[2,11],[4,10],[6,9],[8,8],[10,7],[12,6],[14,5],[16,4],[18,3],[20,2],[22,1]];
      [y-1,y,y+1].forEach(yy=>qi.forEach(([n,mj])=>cands.push({dt:sTermDate(yy,n),mj,name:JIEQI[n]})));
      cands.sort((a,b)=>a.dt-b.dt);
      let cur={zhiIdx:1,zhi:ZHI[1],jieqi:'冬至'};
      for(const c of cands){if(date>=c.dt)cur={zhiIdx:c.mj,zhi:ZHI[c.mj],jieqi:c.name};else break;}
      return cur;
    }
    // 中气定将：取最近一次中气
    const qi=[[1,0],[3,11],[5,10],[7,9],[9,8],[11,7],[13,6],[15,5],[17,4],[19,3],[21,2],[23,1]];
    [y-1,y,y+1].forEach(yy=>qi.forEach(([n,mj])=>cands.push({dt:sTermDate(yy,n),mj,name:JIEQI[n]})));
    cands.sort((a,b)=>a.dt-b.dt);
    let cur={zhiIdx:1,zhi:ZHI[1],jieqi:'冬至'};
    for(const c of cands){if(date>=c.dt)cur={zhiIdx:c.mj,zhi:ZHI[c.mj],jieqi:c.name};else break;}
    return cur;
  }

  global.Lunar={GAN,ZHI,SX,MONTHS,DATE,JIEQI,
    ganzhiOf,gzFromIndex,getBaZi,solarToLunar,
    sTermDate,currentNextJieQi,getShiChen,getYueJiang,
    lYearDays,leapMonth,leapDays,monthDays};
})(window);
