// daliuren.js — 大六壬起课算法（离线）：月将加时/天地盘/四课/三传/天将/神煞/格局/白话
(function(global){
  const ZHI=Lunar.ZHI;
  const GAN=Lunar.GAN;
  // 地支五行 子水丑土寅木卯木辰土巳火午火未土申金酉金戌土亥水
  const WX=['水','土','木','木','土','火','火','土','金','金','土','水'];
  const WX_CODE={水:0,木:1,火:2,土:3,金:4};
  // 五行相克：金克木 木克土 土克水 水克火 火克金
  function wxKe(aWx,bWx){
    if(aWx==='金'&&bWx==='木')return true;
    if(aWx==='木'&&bWx==='土')return true;
    if(aWx==='土'&&bWx==='水')return true;
    if(aWx==='水'&&bWx==='火')return true;
    if(aWx==='火'&&bWx==='金')return true;
    return false;
  }
  function wxSheng(aWx,bWx){
    if(aWx==='金'&&bWx==='水')return true;
    if(aWx==='水'&&bWx==='木')return true;
    if(aWx==='木'&&bWx==='火')return true;
    if(aWx==='火'&&bWx==='土')return true;
    if(aWx==='土'&&bWx==='金')return true;
    return false;
  }
  // 干寄宫
  const GAN_JI={甲:2,乙:4,丙:5,丁:7,戊:5,己:7,庚:8,辛:10,壬:11,癸:1};
  // 天将
  const TIANJIANG=['贵人','螣蛇','朱雀','六合','勾陈','青龙','天空','白虎','太常','玄武','太阴','天后'];
  const TJ_JI={贵人:1,螣蛇:-1,朱雀:-1,六合:1,勾陈:-1,青龙:1,天空:-1,白虎:-1,太常:1,玄武:-1,太阴:1,天后:1};
  // 贵人地支（昼/夜）by 日干
  const GUIREN={
    '甲':{day:1,night:7},'戊':{day:1,night:7},'庚':{day:1,night:7},
    '乙':{day:0,night:8},'己':{day:0,night:8},
    '丙':{day:11,night:9},'丁':{day:11,night:9},
    '壬':{day:3,night:5},'癸':{day:3,night:5},
    '辛':{day:6,night:2}
  };
  // 类神 by 问题类型
  const LEISHEN={
    '感情关系':'六合','事业合作':'青龙','学习考试':'朱雀','出行移动':'白虎',
    '签约交易':'青龙','人际沟通':'六合','财务决策':'太常','健康倾向':'白虎',
    '失物寻找':'玄武','二选一决策':'六合','其他':'贵人'
  };

  function isDayTime(zhanShiIdx){return zhanShiIdx>=2&&zhanShiIdx<=7;} // 寅-未

  // 起课主函数
  // date: Date; dayGz: {gan,zhi,ganIdx,zhiIdx,index}; hourGz:{...}; yueJiangIdx; zhanShiIdx
  function qiKe(date,baZi,yueJiangIdx,zhanShiIdx,opts){
    opts=opts||{};
    const dayGan=baZi.day.gan, dayGanIdx=baZi.day.ganIdx, dayZhiIdx=baZi.day.zhiIdx;
    const offset=(yueJiangIdx-zhanShiIdx+12)%12;
    // 天盘[p] = 天盘神 above 地盘位p
    const tianPan=[];
    for(let p=0;p<12;p++)tianPan[p]=(p+offset)%12;
    // 日干寄宫
    const ganJi=GAN_JI[dayGan];
    // 四课
    // 第一课：上=天盘[干寄宫] 下=干寄宫(代表日干)
    const c1shang=tianPan[ganJi];
    // 第二课：上=天盘[c1shang] 下=c1shang
    const c2shang=tianPan[c1shang];
    // 第三课：上=天盘[日支] 下=日支
    const c3shang=tianPan[dayZhiIdx];
    // 第四课：上=天盘[c3shang] 下=c3shang
    const c4shang=tianPan[c3shang];
    const lessons=[
      {up:c1shang,down:ganJi,downLabel:dayGan,role:'日干(一课)'},
      {up:c2shang,down:c1shang,downLabel:ZHI[c1shang],role:'干阴(二课)'},
      {up:c3shang,down:dayZhiIdx,downLabel:ZHI[dayZhiIdx],role:'日支(三课)'},
      {up:c4shang,down:c3shang,downLabel:ZHI[c3shang],role:'支阴(四课)'}
    ];

    // 贵人
    const gr=GUIREN[dayGan];
    const day=isDayTime(zhanShiIdx);
    const guiZhiIdx=day?gr.day:gr.night;
    const guiChengShen=tianPan[guiZhiIdx]; // 贵人乘神
    // 天将乘神表
    const tjByShen={};
    for(let i=0;i<12;i++){
      const shen=day?(guiChengShen+i)%12:(guiChengShen-i+12)%12;
      tjByShen[shen]=TIANJIANG[i];
    }
    // 给四课加天将
    lessons.forEach(l=>{l.upTJ=tjByShen[l.up];l.downTJ=tjByShen[l.down];});

    // 空亡
    const xunShou=Math.floor(baZi.day.index/10)*10;
    const k1=(10-2*(xunShou/10)+12)%12, k2=(11-2*(xunShou/10)+12)%12;
    const kongWang=[k1,k2];

    // 三传：贼克法
    const sanChuan=computeSanChuan(lessons,dayGan,dayGanIdx,tianPan,tjByShen,offset);

    // 格局
    const geju=detectGeju(yueJiangIdx,zhanShiIdx,lessons,baZi,sanChuan);

    // 神煞
    const shenSha=computeShenSha(baZi,dayZhiIdx);

    // 类神
    const leishenName=LEISHEN[opts.questionType]||'贵人';
    let leishenShen=null;
    for(const shen in tjByShen){if(tjByShen[shen]===leishenName){leishenShen=parseInt(shen);break;}}

    return{
      yueJiang:{idx:yueJiangIdx,zhi:ZHI[yueJiangIdx]},
      zhanShi:{idx:zhanShiIdx,zhi:ZHI[zhanShiIdx]},
      offset,tianPan,
      dayGan,dayGanIdx,dayZhiIdx,ganJi,
      guiRen:{idx:guiZhiIdx,zhi:ZHI[guiZhiIdx],chengShen:ZHI[guiChengShen],isDay:day,label:day?'昼贵':'夜贵'},
      tjByShen,
      lessons,sanChuan,geju,shenSha,kongWang,leishenName,leishenShen,
      isFuYin:yueJiangIdx===zhanShiIdx,
      isFanYin:(Math.abs(yueJiangIdx-zhanShiIdx)%12)===6,
      date,baZi
    };
  }

  // 三传计算
  function computeSanChuan(lessons,dayGan,dayGanIdx,tianPan,tjByShen,offset){
    // 收集克
    const kes=[];
    lessons.forEach((l,i)=>{
      const uw=WX[l.up],dw=WX[l.down];
      if(wxKe(uw,dw))kes.push({idx:i,up:l.up,down:l.down,type:'克',dir:'上克下'});
      else if(wxKe(dw,uw))kes.push({idx:i,up:l.up,down:l.down,type:'贼',dir:'下贼上'});
    });
    let chosen=null,method='';
    if(kes.length===0){
      // 无克：遥克法简化 — 取上神与日干有克者；若无则取日干上神
      // 简化处理：取第一课上神为初传(昴星/别责近似)
      chosen={up:lessons[0].up,from:0};
      method='无克(取干上神)';
    }else if(kes.length===1){
      chosen={up:kes[0].up,from:kes[0].idx};
      method=kes[0].type==='贼'?'重审':'元首';
    }else{
      // 多克：先取贼(下贼上)，无则取克
      let pool=kes.filter(k=>k.type==='贼');
      let baseType='贼';
      if(pool.length===0){pool=kes.filter(k=>k.type==='克');baseType='克';}
      if(pool.length===1){
        chosen={up:pool[0].up,from:pool[0].idx};
        method=baseType==='贼'?'重审(多贼取一)':'元首(多克取一)';
      }else{
        // 比用：取与日干阴阳同性者
        const ganYang=dayGanIdx%2===0;
        let bi=pool.filter(k=>{
          // 上神阴阳：子寅辰午申戌为阳(偶idx? 子0阳 丑1阴 寅2阳) → idx偶为阳
          return(k.up%2===0)===ganYang;
        });
        if(bi.length===1){
          chosen={up:bi[0].up,from:bi[0].idx};
          method='比用';
        }else if(bi.length>1){
          // 涉害：取受克最多者
          let best=bi[0],bestN=-1;
          bi.forEach(k=>{
            let n=0;
            pool.forEach(o=>{if(o!==k&&wxKe(WX[o.down]||WX[o.up],WX[k.up]))n++;});
            // 受克计数：其它课的上下五行克此上神
            if(n>bestN){bestN=n;best=k;}
          });
          chosen={up:best.up,from:best.idx};
          method='涉害';
        }else{
          // 无比用，取涉害于全部
          let best=pool[0],bestN=-1;
          pool.forEach(k=>{
            let n=0;
            pool.forEach(o=>{if(o!==k&&wxKe(WX[o.up],WX[k.up]))n++;});
            if(n>bestN){bestN=n;best=k;}
          });
          chosen={up:best.up,from:best.idx};
          method='涉害';
        }
      }
    }
    const c1=chosen.up;
    const c2=tianPan[c1];
    const c3=tianPan[c2];
    return{
      chu:{zhi:ZHI[c1],idx:c1,tj:tjByShen[c1],wx:WX[c1]},
      zhong:{zhi:ZHI[c2],idx:c2,tj:tjByShen[c2],wx:WX[c2]},
      mo:{zhi:ZHI[c3],idx:c3,tj:tjByShen[c3],wx:WX[c3]},
      method,fromLesson:chosen.from
    };
  }

  // 格局
  function detectGeju(yueJiangIdx,zhanShiIdx,lessons,baZi,sanChuan){
    const list=[];
    if(yueJiangIdx===zhanShiIdx)list.push('伏吟课');
    if(Math.abs(yueJiangIdx-zhanShiIdx)%12===6)list.push('返吟课');
    if(sanChuan.method.includes('元首'))list.push('元首课');
    if(sanChuan.method.includes('重审'))list.push('重审课');
    if(sanChuan.method==='比用')list.push('比用课');
    if(sanChuan.method==='涉害')list.push('涉害课');
    // 八专：日干支同气
    const dg=baZi.day.gan, dz=baZi.day.zhi;
    if((dg==='甲'&&dz==='寅')||(dg==='乙'&&dz==='辰')||(dg==='丁'&&dz==='未')||(dg==='己'&&dz==='未')||(dg==='庚'&&dz==='申')||(dg==='辛'&&dz==='戌')||(dg==='癸'&&dz==='丑'))list.push('八专课');
    return list.length?list:['常课'];
  }

  // 神煞
  function computeShenSha(baZi,dayZhiIdx){
    const sanhe=[[8,0,4],[2,6,10],[5,9,1],[11,3,7]]; // 申子辰/寅午戌/巳酉丑/亥卯未
    let ma=-1,tao=-1,gai=-1;
    for(const g of sanhe){
      if(g.includes(dayZhiIdx)){
        // 驿马=三合第一字之冲
        ma=g[0];ma=(ma+6)%12;
        // 桃花=三合中间字(咸池)
        tao=g[1];
        // 华盖=三合末字
        gai=g[2];
        break;
      }
    }
    return{
      yima:ma>=0?ZHI[ma]:'—',taohua:tao>=0?ZHI[tao]:'—',huagai:gai>=0?ZHI[gai]:'—',
      taiSui:ZHI[baZi.year.zhiIdx],yueJian:ZHI[baZi.month.zhiIdx]
    };
  }

  // 白话生成（基于盘面结构化数据，全部标注传统规则参考）
  function plainLang(ke,questionType){
    const sc=ke.sanChuan;
    const chuTJ=sc.chu.tj, moTJ=sc.mo.tj;
    const chuJi=TJ_JI[chuTJ], moJi=TJ_JI[moTJ];
    // 倾向
    let tendency='宜观察';
    if(chuJi>0&&moJi>0)tendency='宜主动';
    else if(chuJi<0&&moJi<0)tendency='宜谨慎';
    else if(chuJi>0&&moJi<0)tendency='宜速决';
    else if(chuJi<0&&moJi>0)tendency='宜等待';
    // 风险
    const risks=[];
    if(ke.kongWang.includes(sc.chu.idx))risks.push('初传落空亡，所谋恐虚');
    if(chuTJ==='玄武')risks.push('初传乘玄武，防欺瞒失窃');
    if(chuTJ==='白虎')risks.push('初传乘白虎，防病灾口舌');
    if(ke.isFanYin)risks.push('返吟课，事多反复动摇');
    if(ke.isFuYin)risks.push('伏吟课，事多伏匿不动');
    // 机会
    const opps=[];
    if(chuTJ==='贵人')opps.push('贵人临传，可得助力');
    if(chuTJ==='青龙')opps.push('青龙临传，有财喜文书之喜');
    if(chuTJ==='六合'&&questionType==='感情关系')opps.push('六合临传，关系有和合之象');
    if(!ke.kongWang.includes(sc.mo.idx)&&moJi>0)opps.push('末传吉将，结局有望');
    // 对方/环境
    let env='第三课(日支)上神 '+ZHI[ke.lessons[2].up]+' 乘 '+ke.lessons[2].upTJ+'，反映所问对象或环境状态。';
    // 建议
    const doAct=[],dontAct=[];
    if(tendency==='宜主动'){doAct.push('可推进当前计划');dontAct.push('不宜久拖生变');}
    else if(tendency==='宜等待'){doAct.push('宜暂缓观察，待时而动');dontAct.push('不宜强行推进');}
    else if(tendency==='宜谨慎'){doAct.push('宜核实信息、防备风险');dontAct.push('不宜贸然承诺或签约');}
    else {doAct.push('宜多方观察、收集信息');dontAct.push('不宜仓促决断');}
    if(risks.length)dontAct.push(risks[0]);
    // 观察信号
    const signals=[];
    signals.push('初传 '+sc.chu.zhi+'('+sc.chu.tj+') → 中传 '+sc.zhong.zhi+'('+sc.zhong.tj+') → 末传 '+sc.mo.zhi+'('+sc.mo.tj+')');
    if(ke.leishenShen!==null)signals.push('类神「'+ke.leishenName+'」乘 '+ZHI[ke.leishenShen]+(ke.kongWang.includes(ke.leishenShen)?'（落空亡，力量减弱）':''));
    signals.push('空亡：'+ZHI[ke.kongWang[0]]+ZHI[ke.kongWang[1]]);
    return{
      state:'当前状态以初传 '+sc.chu.zhi+' 乘 '+chuTJ+' 为主，'+(chuJi>0?'稍有利':'多阻逆')+'；末传 '+sc.mo.zhi+' 乘 '+moTJ+' 示结局 '+(moJi>0?'向好':'未尽如人意')+'。',
      tendency,risks,opps,env,doAct,dontAct,signals,
      reviewDays:7
    };
  }

  global.DaLiuRen={
    qiKe,plainLang,
    GAN_JI,TIANJIANG,TJ_JI,GUIREN,LEISHEN,WX,
    wxKe,wxSheng,isDayTime
  };
})(window);
