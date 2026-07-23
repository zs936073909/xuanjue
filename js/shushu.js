// shushu.js — P1 术数模块（离线）：小六壬 / 梅花易数 / 六爻 / 塔罗 / 八字
// 各模块返回 { name, result, plain } 结构，plain 与大六壬一致，便于统一渲染
(function(global){
  const ZHI=Lunar.ZHI,GAN=Lunar.GAN,SX=Lunar.SX;
  const WX_NAME=['水','土','木','木','土','火','火','土','金','金','土','水']; // 地支五行

  // ============ 小六壬（诸葛马前课）============
  // 六宫：大安→留连→速喜→赤口→小吉→空亡，顺时针
  const XLR_POS=['大安','留连','速喜','赤口','小吉','空亡'];
  const XLR_DETAIL={
    '大安':{wx:'木',attr:'青龙',ji:'吉',desc:'事事安和，谋为等候，宜静不宜动',do:['等待时机','稳步推进','签约合作'],dont:['贸然出击','急进冒失'],risk:'过安则怠，易错失良机'},
    '留连':{wx:'水',attr:'玄武',ji:'平',desc:'事未决，纠缠拖延，宜守不宜攻',do:['耐心周旋','查清原委','暂缓行动'],dont:['强求速决','签重要合约'],risk:'久拖生变，耗财费力'},
    '速喜':{wx:'火',attr:'朱雀',ji:'吉',desc:'喜事将至，速有佳音，宜行宜进',do:['主动推进','沟通联络','把握当下'],dont:['犹豫不决','坐失良机'],risk:'过喜则亢，需防乐极生悲'},
    '赤口':{wx:'金',attr:'白虎',ji:'凶',desc:'口舌争讼，惊恐伤财，宜慎宜避',do:['谨言慎行','避免冲突','推迟决定'],dont:['争吵诉讼','签约出行'],risk:'主口舌官非，防小人损伤'},
    '小吉':{wx:'木',attr:'六合',ji:'吉',desc:'小有所得，和合生财，宜谋宜求',do:['求谋合伙','往来沟通','小步进取'],dont:['贪大求全','独断独行'],risk:'虽吉而小，不可过度贪求'},
    '空亡':{wx:'土',attr:'勾陈',ji:'凶',desc:'事多落空，徒劳无功，宜止宜缓',do:['停止行动','重新规划','求神问卜'],dont:['强为行事','投入重资'],risk:'主落空亡，百事不成'}
  };
  function xiaoLiuRen(date){
    const lunar=Lunar.solarToLunar(date);
    const sc=Lunar.getShiChen(date);
    let m,d,t;
    if(lunar){m=lunar.month||1;d=lunar.day||1;}
    else{const dt=date;m=dt.getMonth()+1;d=dt.getDate();}
    t=sc.index+1; // 子=1...亥=12
    // 起大安，顺数月→落宫，自落宫起数日→落宫，自落宫起数时→终宫
    const p1=(m-1)%6;
    const p2=(p1+(d-1))%6;
    const p3=(p2+(t-1))%6;
    const month=XLR_POS[p1],day=XLR_POS[p2],time=XLR_POS[p3];
    const det=XLR_DETAIL[time];
    const plain={
      state:`小六壬三宫：月落「${month}」、日落「${day}」、时落「${time}」(${det.attr}·${det.wx})，${det.desc}`,
      tendency:det.ji==='吉'?'宜主动':(det.ji==='凶'?'宜谨慎':'宜等待'),
      opps:det.ji==='吉'?['时机已至，可顺势而为']:['宜守正待时'],
      risks:[det.risk],
      doAct:det.do,
      dontAct:det.dont,
      signals:[`时落${time}宫`,`属性${det.attr}·${det.wx}`,`吉凶：${det.ji}`],
      env:`月宫${month}、日宫${day}为铺垫，时宫${time}为当下结果`,
      reviewDays:7
    };
    return{name:'小六壬',result:{month,day,time,detail:det,positions:[{k:'月',v:month},{k:'日',v:day},{k:'时',v:time}]},plain};
  }

  // ============ 梅花易数 ============
  // 八卦：乾兑离震巽坎艮坤（先天数 1-8）
  const BAGUA=[
    {n:'乾',sym:'☰',wx:'金',attr:'天',up:true},
    {n:'兑',sym:'☱',wx:'金',attr:'泽',up:true},
    {n:'离',sym:'☲',wx:'火',attr:'火',up:true},
    {n:'震',sym:'☳',wx:'木',attr:'雷',up:true},
    {n:'巽',sym:'☴',wx:'木',attr:'风',up:true},
    {n:'坎',sym:'☵',wx:'水',attr:'水',up:false},
    {n:'艮',sym:'☶',wx:'土',attr:'山',up:true},
    {n:'坤',sym:'☷',wx:'土',attr:'地',up:false}
  ];
  // 64卦名（上卦x下卦，0-7 索引）
  const GUA64=[
    ['乾为天','泽天夬','火天大有','雷天大壮','风天小畜','水天需','山天大畜','地天泰'],
    ['天泽履','兑为泽','火泽睽','雷泽归妹','风泽中孚','水泽节','山泽损','地泽临'],
    ['天火同人','泽火革','离为火','雷火丰','风火家人','水火既济','山火贲','地火明夷'],
    ['天雷无妄','泽雷随','火雷噬嗑','震为雷','风雷益','水雷屯','山雷颐','地雷复'],
    ['天风姤','泽风大过','火风鼎','雷风恒','巽为风','水风井','山风蛊','地风升'],
    ['天水讼','泽水困','火水未济','雷水解','风水涣','坎为水','山水蒙','地水师'],
    ['天山遁','泽山咸','火山旅','雷山小过','风山渐','水山蹇','艮为山','地山谦'],
    ['天地否','泽地萃','火地晋','雷地豫','风地观','水地比','山地剥','坤为地']
  ];
  function meiHua(date){
    const baZi=Lunar.getBaZi(date);
    const yZhi=baZi.year.zhiIdx+1; // 年支数（子=1...）
    const lunar=Lunar.solarToLunar(date);
    const m=lunar?lunar.month:date.getMonth()+1;
    const d=lunar?lunar.day:date.getDate();
    const t=baZi.hour.zhiIdx+1;
    const upIdx=(yZhi+m+d)%8; // 上卦
    const dnIdx=(yZhi+m+d+t)%8; // 下卦
    const dong=(yZhi+m+d+t)%6; // 动爻 1-6（0→6）
    const dongLine=dong===0?6:dong;
    const guaName=GUA64[upIdx][dnIdx];
    const up=BAGUA[upIdx],dn=BAGUA[dnIdx];
    // 体用：动爻所在卦为用，另一卦为体
    // 上卦为1-3爻(从下数)? 梅花易数：下卦为初二三爻，上卦为四五六爻。动爻1-6
    const dongInUp=dongLine>3;
    const tiGua=dongInUp?dn:up; // 动爻在上卦→下卦为体
    const yongGua=dongInUp?up:dn;
    const tiWx=tiGua.wx,yongWx=yongGua.wx;
    // 体用五行生克
    let rel;
    if(tiWx===yongWx)rel='比和';
    else if(wxSheng(tiWx,yongWx))rel='体生用（泄气）';
    else if(wxSheng(yongWx,tiWx))rel='用生体（得助）';
    else if(wxKe(tiWx,yongWx))rel='体克用（得势）';
    else if(wxKe(yongWx,tiWx))rel='用克体（受制）';
    const relGood=(rel.includes('生体')||rel.includes('克用')||rel==='比和');
    const plain={
      state:`梅花易数得「${guaName}」，上卦${up.n}(${up.attr})下卦${dn.n}(${dn.attr})，第${dongLine}爻动。体卦${tiGua.n}(${tiWx})，用卦${yongGua.n}(${yongWx})，${rel}。`,
      tendency:relGood?'宜主动':(rel.includes('克体')?'宜谨慎':'宜等待'),
      opps:relGood?[`${rel}，事可成`,'顺势而为']:['守正待时'],
      risks:rel.includes('克体')?[`用克体，${yongGua.n}${yongWx}克${tiGua.n}${tiWx}，阻力较大`]:[rel.includes('泄')?'体生用，耗损精力':'暂无明显阻力'],
      doAct:relGood?['可决断推进','把握动爻所示时机']:['暂缓重大决定','重新审视形势'],
      dontAct:rel.includes('克体')?['不宜强为','不宜对抗']:['不可贪进'],
      signals:[`本卦${guaName}`,`动爻第${dongLine}爻`,`体用${rel}`],
      env:`体卦${tiGua.n}主自身，用卦${yongGua.n}主所问之事`,
      reviewDays:14
    };
    return{name:'梅花易数',result:{guaName,up,dn,dongLine,tiGua,yongGua,rel,numbers:{year:yZhi,month:m,day:d,time:t}},plain};
  }

  // ============ 六爻 ============
  // 简化：以时间生成6爻（纳甲法略，仅排本卦+动爻+六亲粗判）
  // 64卦爻象（自下而上，1阳0阴）
  const YAO64=[];
  (function(){
    for(let u=0;u<8;u++)for(let d=0;d<8;d++){
      const up=BAGUA[u].sym,dn=BAGUA[d].sym;
      // 取 unicode 符号的爻位：☰=111 ☱=110(下断) 实际 unicode 三爻从下到上
      // 简化：用 BAGUA.up 标志 + 手动编码
      const bits=[[1,1,1],[1,1,0],[1,0,1],[1,0,0],[0,1,1],[0,1,0],[0,0,1],[0,0,0]];
      const arr=bits[d].concat(bits[u]); // 下卦3爻+上卦3爻，自下而上
      YAO64.push({name:GUA64[u][d],yao:arr});
    }
  })();
  function liuYao(date){
    const baZi=Lunar.getBaZi(date);
    const sc=baZi.hour.zhiIdx;
    // 三次掷币法简化：以时辰+随机数生成6爻
    // 每爻：少阳(7)/老阳(9)/少阴(8)/老阴(6)，老阴老阳为动爻
    const seed=date.getTime()+sc*7;
    let rng=seed;
    function r(){rng=(rng*9301+49297)%233280;return rng/233280;}
    const yaos=[];
    for(let i=0;i<6;i++){
      const s=Math.floor(r()*4)+6; // 6,7,8,9
      yaos.push({val:s,yang:s%2===1,dong:s===6||s===9});
    }
    // 本卦
    const benBits=yaos.map(y=>y.yang?1:0);
    // 变卦
    const bianBits=yaos.map(y=>y.dong?(y.yang?0:1):y.yang?1:0);
    const upIdx=parseInt(benBits.slice(3).join(''),2);
    const dnIdx=parseInt(benBits.slice(0,3).join(''),2);
    // bits 数组顺序 [1,1,1]=乾 index0, [0,0,0]=坤 index7 → 与 BAGUA 索引一致需反转
    // YAO64 用 bits=[[1,1,1]...] 顺序为 乾兑离震巽坎艮坤，对应 BAGUA 0-7 ✓
    const benGua=YAO64[upIdx*8+dnIdx];
    const bianUp=parseInt(bianBits.slice(3).join(''),2);
    const bianDn=parseInt(bianBits.slice(0,3).join(''),2);
    const bianGua=YAO64[bianUp*8+bianDn];
    const dongCount=yaos.filter(y=>y.dong).length;
    // 六亲粗判（以日干五行定宫，简化）
    const dayGanWx={甲:'木',乙:'木',丙:'火',丁:'火',戊:'土',己:'土',庚:'金',辛:'金',壬:'水',癸:'水'}[baZi.day.gan];
    const dongAny=dongCount>0;
    const plain={
      state:`六爻起得「${benGua.name}」${dongAny?`变「${bianGua.name}」`:'（无动爻）'}，第${yaos.map((y,i)=>y.dong?(i+1):null).filter(x=>x).join('、')||'无'}爻动。日干${baZi.day.gan}(${dayGanWx})。`,
      tendency:dongAny?(!benGua.name.includes('否')&&!benGua.name.includes('困')?'宜主动':'宜谨慎'):'宜等待',
      opps:dongAny?[`${dongCount}爻发动，事有变动之机`]:['无动爻，事态平稳'],
      risks:benGua.name.includes('困')||benGua.name.includes('蹇')?['卦现困蹇之象，需防进退维谷']:['暂无明显险象'],
      doAct:dongAny?['观察动爻所主之事','顺势调整']:['保持现状','蓄势待发'],
      dontAct:benGua.name.includes('否')?['不宜强求通泰','忌冒进']:['忌无端变动'],
      signals:[`本卦${benGua.name}`,`变卦${bianGua.name}`,`动爻${dongCount}个`],
      env:`日干${dayGanWx}为令，本卦世应为框架`,
      reviewDays:21
    };
    return{name:'六爻',result:{benGua:benGua.name,bianGua:bianGua.name,yaos,dongCount,dayGanWx},plain};
  }

  // ============ 塔罗（22 大阿卡纳，三牌阵）============
  const TAROT=[
    {n:'愚者',k:'0',up:'新的开始·天真·自由',rev:'鲁莽·盲目·冒险',el:'风'},
    {n:'魔术师',k:'1',up:'创造·掌控·行动',rev:'欺骗·滥用·未发挥',el:'水星'},
    {n:'女祭司',k:'2',up:'直觉·静默·智慧',rev:'隐秘·压抑·无知',el:'月'},
    {n:'皇后',k:'3',up:'丰盛·孕育·温柔',rev:'依赖·过度·停滞',el:'金星'},
    {n:'皇帝',k:'4',up:'权威·秩序·掌控',rev:'专制·僵化·软弱',el:'白羊'},
    {n:'教皇',k:'5',up:'信仰·传统·指引',rev:'反叛·教条·误导',el:'金牛'},
    {n:'恋人',k:'6',up:'选择·结合·和谐',rev:'分离·错误选择·失衡',el:'双子'},
    {n:'战车',k:'7',up:'意志·胜利·前进',rev:'失控·挫败·方向迷失',el:'巨蟹'},
    {n:'力量',k:'8',up:'勇气·柔韧·驾驭',rev:'软弱·自我怀疑·失控',el:'狮子'},
    {n:'隐士',k:'9',up:'内省·独行·智慧',rev:'孤立·固执·迷失',el:'处女'},
    {n:'命运之轮',k:'10',up:'转机·循环·机遇',rev:'逆转·厄运·阻滞',el:'木星'},
    {n:'正义',k:'11',up:'公正·因果·决断',rev:'不公·偏颇·逃避责任',el:'天秤'},
    {n:'倒吊人',k:'12',up:'暂停·视角·放下',rev:'无谓牺牲·停滞·抗拒',el:'海王'},
    {n:'死神',k:'13',up:'终结·转化·重生',rev:'抗拒变化·停滞·腐朽',el:'天蝎'},
    {n:'节制',k:'14',up:'平衡·调和·耐心',rev:'失衡·过度·不协调',el:'射手'},
    {n:'恶魔',k:'15',up:'束缚·欲望·物质',rev:'释放·觉醒·挣脱',el:'摩羯'},
    {n:'高塔',k:'16',up:'突变·崩解·启示',rev:'延缓·避免·内在动荡',el:'火星'},
    {n:'星星',k:'17',up:'希望·灵感·疗愈',rev:'绝望·失落·盲目',el:'水瓶'},
    {n:'月亮',k:'18',up:'直觉·幻象·潜意识',rev:'澄清·释放恐惧·真相',el:'双鱼'},
    {n:'太阳',k:'19',up:'成功·喜悦·活力',rev:'暂迟·过度乐观·黯淡',el:'太阳'},
    {n:'审判',k:'20',up:'觉醒·重生·决断',rev:'犹豫·自责·错失良机',el:'冥王'},
    {n:'世界',k:'21',up:'圆满·完成·整合',rev:'未完成·停滞·残缺',el:'土星'}
  ];
  function tarot(date){
    const seed=date.getTime();
    let rng=seed;
    function r(){rng=(rng*9301+49297)%233280;return rng/233280;}
    const used=new Set();
    function pick(){
      let i;do{i=Math.floor(r()*22);}while(used.has(i));used.add(i);return i;
    }
    const pos=['过去','现在','未来'];
    const cards=pos.map(p=>{
      const idx=pick();
      const reverse=r()<0.5;
      const card=TAROT[idx];
      return{pos:p,name:card.n,key:card.k,reverse,meaning:reverse?card.rev:card.up,element:card.el,up:!reverse};
    });
    const allUp=cards.filter(c=>c.up).length;
    const hasNeg=cards.some(c=>c.name==='高塔'||c.name==='恶魔'||(c.reverse&&(c.name==='死神')));
    const plain={
      state:`塔罗三牌阵：过去「${cards[0].name}${cards[0].reverse?'(逆)':''}」、现在「${cards[1].name}${cards[1].reverse?'(逆)':''}」、未来「${cards[2].name}${cards[2].reverse?'(逆)':''}」。`,
      tendency:allUp>=2?'宜主动':(allUp<=1?'宜谨慎':'宜等待'),
      opps:[`现在位「${cards[1].name}」：${cards[1].meaning}`,allUp>=2?'整体能量积极，可把握当下':''],
      risks:hasNeg?[`出现挑战牌，需正视而非回避`,`未来位${cards[2].meaning}`]:['暂无明显阻碍信号'],
      doAct:['参考现在位的牌义行动','结合过去位的启示反思'],
      dontAct:hasNeg?['忌回避问题','忌冲动对抗']:['忌固步自封'],
      signals:cards.map(c=>`${c.pos}：${c.name}(${c.up?'正':'逆'})`),
      env:`整体正位 ${allUp}/3，元素含 ${[...new Set(cards.map(c=>c.element))].join('、')}`,
      reviewDays:30
    };
    return{name:'塔罗',result:{cards},plain};
  }

  // ============ 八字（四柱展示+五行+十神粗判）============
  const GAN_WX={甲:'木',乙:'木',丙:'火',丁:'火',戊:'土',己:'土',庚:'金',辛:'金',壬:'水',癸:'水'};
  const ZHI_WX=WX_NAME;
  // 十神：以日干为我，论其他干
  const SHISHEN={
    '甲':{'甲':'比肩','乙':'劫财','丙':'食神','丁':'伤官','戊':'偏财','己':'正财','庚':'七杀','辛':'正官','壬':'偏印','癸':'正印'},
    '乙':{'甲':'劫财','乙':'比肩','丙':'伤官','丁':'食神','戊':'正财','己':'偏财','庚':'正官','辛':'七杀','壬':'正印','癸':'偏印'},
    '丙':{'甲':'偏印','乙':'正印','丙':'比肩','丁':'劫财','戊':'食神','己':'伤官','庚':'偏财','辛':'正财','壬':'七杀','癸':'正官'},
    '丁':{'甲':'正印','乙':'偏印','丙':'劫财','丁':'比肩','戊':'伤官','己':'食神','庚':'正财','辛':'偏财','壬':'正官','癸':'七杀'},
    '戊':{'甲':'七杀','乙':'正官','丙':'偏印','丁':'正印','戊':'比肩','己':'劫财','庚':'食神','辛':'伤官','壬':'偏财','癸':'正财'},
    '己':{'甲':'正官','乙':'七杀','丙':'正印','丁':'偏印','戊':'劫财','己':'比肩','庚':'伤官','辛':'食神','壬':'正财','癸':'偏财'},
    '庚':{'甲':'偏财','乙':'正财','丙':'七杀','丁':'正官','戊':'偏印','己':'正印','庚':'比肩','辛':'劫财','壬':'食神','癸':'伤官'},
    '辛':{'甲':'正财','乙':'偏财','丙':'正官','丁':'七杀','戊':'正印','己':'偏印','庚':'劫财','辛':'比肩','壬':'伤官','癸':'食神'},
    '壬':{'甲':'食神','乙':'伤官','丙':'偏财','丁':'正财','戊':'七杀','己':'正官','庚':'偏印','辛':'正印','壬':'比肩','癸':'劫财'},
    '癸':{'甲':'伤官','乙':'食神','丙':'正财','丁':'偏财','戊':'正官','己':'七杀','庚':'正印','辛':'偏印','壬':'劫肩','癸':'比肩'}
  };
  function baZi(date){
    const bz=Lunar.getBaZi(date);
    const dayGan=bz.day.gan;
    const dayWx=GAN_WX[dayGan];
    // 四柱
    const pillars=[
      {name:'年柱',gz:bz.year.gz,gan:bz.year.gan,zhi:bz.year.zhi,ganWx:GAN_WX[bz.year.gan],zhiWx:ZHI_WX[bz.year.zhiIdx],ganShen:SHISHEN[dayGan][bz.year.gan]},
      {name:'月柱',gz:bz.month.gz,gan:bz.month.gan,zhi:bz.month.zhi,ganWx:GAN_WX[bz.month.gan],zhiWx:ZHI_WX[bz.month.zhiIdx],ganShen:SHISHEN[dayGan][bz.month.gan]},
      {name:'日柱',gz:bz.day.gz,gan:bz.day.gan,zhi:bz.day.zhi,ganWx:dayWx,zhiWx:ZHI_WX[bz.day.zhiIdx],ganShen:'日主'},
      {name:'时柱',gz:bz.hour.gz,gan:bz.hour.gan,zhi:bz.hour.zhi,ganWx:GAN_WX[bz.hour.gan],zhiWx:ZHI_WX[bz.hour.zhiIdx],ganShen:SHISHEN[dayGan][bz.hour.gan]}
    ];
    // 五行统计
    const wxCount={金:0,木:0,水:0,火:0,土:0};
    pillars.forEach(p=>{wxCount[p.ganWx]++;wxCount[p.zhiWx]++;});
    const total=8;
    const wxStr=Object.keys(wxCount).map(k=>`${k}${wxCount[k]}`).join(' ');
    const dayStrong=wxCount[dayWx]>=2;
    // 日主强弱与用神粗判
    const shengWo={金:'土',土:'火',火:'木',木:'水',水:'金'}; // 生我
    const woSheng={金:'水',水:'木',木:'火',火:'土',土:'金'}; // 我生
    const yongShen=dayStrong?(woSheng[dayWx]+'泄秀'):(shengWo[dayWx]+'扶身');
    const plain={
      state:`八字四柱：年${bz.year.gz} 月${bz.month.gz} 日${bz.day.gz} 时${bz.hour.gz}。日主${dayGan}(${dayWx})${dayStrong?'偏强':'偏弱'}，五行${wxStr}。`,
      tendency:dayStrong?'宜主动':(dayStrong===false?'宜谨慎':'宜等待'),
      opps:[`日主${dayGan}(${dayWx})，参考用神「${yongShen}」`],
      risks:dayStrong?['身强需防过刚易折','注意比劫夺财']:[`身弱需防压力过重`,`注意官杀克身`],
      doAct:[`顺${yongShen}方向决策`,dayStrong?'宜泄宜克宜财':'宜生宜扶'],
      dontAct:dayStrong?['忌再助身(印比)']:['忌耗泄太过'],
      signals:[`日主${dayGan}${dayWx}`,`强弱：${dayStrong?'强':'弱'}`,`用神：${yongShen}`],
      env:`月令${bz.month.zhi}(${ZHI_WX[bz.month.zhiIdx]})为令，定日主衰旺`,
      reviewDays:30
    };
    return{name:'八字',result:{pillars,dayGan,dayWx,wxCount,dayStrong,yongShen,wxStr},plain};
  }

  // 五行辅助
  function wxSheng(a,b){
    if(a==='金'&&b==='水')return true;if(a==='水'&&b==='木')return true;
    if(a==='木'&&b==='火')return true;if(a==='火'&&b==='土')return true;
    if(a==='土'&&b==='金')return true;return false;
  }
  function wxKe(a,b){
    if(a==='金'&&b==='木')return true;if(a==='木'&&b==='土')return true;
    if(a==='土'&&b==='水')return true;if(a==='水'&&b==='火')return true;
    if(a==='火'&&b==='金')return true;return false;
  }

  // 统一入口
  function compute(name,date){
    switch(name){
      case '小六壬':return xiaoLiuRen(date);
      case '梅花易数':return meiHua(date);
      case '六爻':return liuYao(date);
      case '塔罗':return tarot(date);
      case '八字':return baZi(date);
      default:return null;
    }
  }

  global.ShuShu={compute,xiaoLiuRen,meiHua,liuYao,tarot,baZi,XLR_POS,BAGUA,TAROT};
})(window);
