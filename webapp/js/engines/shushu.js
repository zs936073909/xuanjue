// shushu.js — P1 术数模块（离线）：小六壬 / 梅花易数 / 六爻 / 塔罗 / 八字
// 各模块返回 { name, result, plain } 结构，plain 与大六壬一致，便于统一渲染
(function(global){
  const ZHI=Lunar.ZHI,GAN=Lunar.GAN,SX=Lunar.SX;
  const WX_NAME=['水','土','木','木','土','火','火','土','金','金','土','水']; // 地支五行

  // ============ 通用常量 ============
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
  // 主题映射表：按问事类型调整机会、风险、行动、信号；focus 为不同主题的白话侧重点，用于区分 plain.state
  const XLR_THEME={
    '感情关系':{opps:['主动表达心意','制造相处机会','倾听对方需求'],risks:['避免情绪化争吵','忌翻旧账'],doAct:['真诚沟通','适度示好','观察对方反应'],signals:['看时宫是否生合月宫','注意空亡主缘分未至'],focus:'感情之事重在双方和合，看时宫是否生合月宫，空亡主缘分未至'},
    '事业合作':{opps:['寻找互补伙伴','推进关键项目','争取上级支持'],risks:['防范口舌是非','合同细节需看清'],doAct:['明确权责','稳步推进','保留书面记录'],signals:['时宫生月宫则贵人助','赤口宫慎签合约'],focus:'事业合作重在贵人扶持，时宫生月宫则得人助，赤口慎签约'},
    '学习考试':{opps:['制定复习计划','查漏补缺','请教师长'],risks:['贪多嚼不烂','临时抱佛脚'],doAct:['按部就班','专注基础','减少分心'],signals:['大安/速喜利学业','空亡主准备不足'],focus:'学业考试看大安速喜为吉，空亡主准备不足'},
    '出行移动':{opps:['选择吉时出发','提前规划路线'],risks:['空亡/赤口主阻滞','留连主延误'],doAct:['提前出发','检查交通工具','保持联络'],signals:['时宫为速喜/小吉利出行'],focus:'出行看时宫为速喜小吉利行，空亡赤口主阻滞'},
    '签约交易':{opps:['条款清晰可签','速喜宫宜快速成交'],risks:['赤口主合同纠纷','空亡主落空'],doAct:['逐条核对','保留证据','必要时延后'],signals:['时宫生/比和日宫为吉'],focus:'签约交易看时宫与日宫生比，赤口空亡主落空纠纷'},
    '人际沟通':{opps:['化解误会','建立信任'],risks:['赤口主口舌','留连主纠缠'],doAct:['换位思考','委婉表达','避免指责'],signals:['时宫生月宫得人助'],focus:'人际沟通看时宫生月宫得人助，赤口主口舌'},
    '财务决策':{opps:['小吉宫小利财','速喜宫短期收益'],risks:['空亡主破财','赤口主损财'],doAct:['稳健理财','避免冲动投资','分散风险'],signals:['时宫五行生月宫为财来'],focus:'求财之事看时宫五行生月宫为财来，空亡赤口主破财损财'},
    '健康倾向':{opps:['及时调整作息','寻求专业建议'],risks:['空亡主虚证','白虎/赤口主急症'],doAct:['注意休息','饮食清淡','及早就医'],signals:['大安主平稳，空亡需调养'],focus:'健康看大安主平稳，空亡主虚证，赤口白虎主急症'},
    '失物寻找':{opps:['速喜宫可速得','小吉宫可寻回'],risks:['空亡主难寻','留连主被拖延'],doAct:['回忆最后位置','询问周边','扩大搜索'],signals:['时宫克日宫主难寻，生则易得'],focus:'失物看速喜可速得小吉可寻回，空亡难寻留连拖延'},
    '二选一决策':{opps:['比较两宫五行生克','选得时宫生者'],risks:['空亡宫选项多落空'],doAct:['列出优劣','参考三宫连锁','听取建议'],signals:['三宫相生则趋势顺畅'],focus:'二选一看三宫相生则趋势顺畅，空亡宫选项多落空'},
    '其他':{opps:['顺势而为','把握当下'],risks:['过犹不及'],doAct:['稳扎稳打','审时度势'],signals:['以时宫五行为主'],focus:'通用占事以时宫五行为主，三宫平和则顺其自然'}
  };
  // 主题映射表：把 app.js 的问事主题（求财/谋事等）映射到 XLR_THEME 的 questionType
  const XLR_TOPIC_MAP={'求财':'财务决策','谋事':'事业合作','感情':'感情关系','出行':'出行移动','失物':'失物寻找','等待消息':'人际沟通','疾病倾向':'健康倾向','人际沟通':'人际沟通','其他':'其他'};
  function xiaoLiuRen(date,topic){
    topic=topic||'其他';
    // 把 app.js 主题（求财/谋事等）映射到 XLR_THEME 的 questionType；若传入的已是 questionType 则直接使用
    const questionType=XLR_TOPIC_MAP[topic]||topic;
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
    const theme=XLR_THEME[questionType]||XLR_THEME['其他'];
    // 三宫生克连锁：以时宫五行为主，看月、日宫对时宫的生克
    const wxm=XLR_DETAIL[month].wx,wxd=XLR_DETAIL[day].wx,wxt=det.wx;
    let chain='';
    if(wxSheng(wxm,wxt)&&wxSheng(wxd,wxt))chain='月、日宫皆生时宫，大势顺畅';
    else if(wxKe(wxm,wxt)&&wxKe(wxd,wxt))chain='月、日宫皆克时宫，阻力重重';
    else if(wxSheng(wxm,wxt)||wxSheng(wxd,wxt))chain='有生扶之力，可借势而为';
    else if(wxKe(wxm,wxt)||wxKe(wxd,wxt))chain='有克制之力，宜谨慎防守';
    else chain='三宫比和或平和，顺其自然';
    const plain={
      state:`小六壬三宫：月落「${month}」、日落「${day}」、时落「${time}」(${det.attr}·${det.wx})，${det.desc}。问「${topic}」（${questionType}）：${theme.focus||'以时宫所主为结果'}。`,
      tendency:det.ji==='吉'?'宜主动':(det.ji==='凶'?'宜谨慎':'宜等待'),
      opps:theme.opps,
      risks:[det.risk].concat(theme.risks),
      doAct:theme.doAct,
      dontAct:det.dont,
      signals:theme.signals.concat([`月${month}(${wxm})→日${day}(${wxd})→时${time}(${wxt})`,chain]),
      env:`月宫${month}、日宫${day}为铺垫，时宫${time}为当下结果；${chain}`,
      reviewDays:7,
      sources:[
        {type:'rule',desc:'小六壬以月、日、时辰数起大安，顺行六宫'},
        {type:'rule',desc:'时宫为结果，月、日宫为起因与发展'},
        {type:'rule',desc:`三宫五行生克：${wxm}、${wxd}、${wxt}`},
        {type:'rule',desc:`主题映射：${questionType}`},
        {type:'rule',desc:`问事主题：${topic}，重点宫位：${time}`}
      ]
    };
    return{name:'小六壬',result:{month,day,time,detail:det,positions:[{k:'月',v:month},{k:'日',v:day},{k:'时',v:time}],chain,questionType,topic},plain};
  }

  // ============ 梅花易数 ============
  // 八卦三爻自下而上，111=乾，110=兑，101=离，100=震，011=巽，010=坎，001=艮，000=坤
  const TRIGRAM_BITS=[[1,1,1],[1,1,0],[1,0,1],[1,0,0],[0,1,1],[0,1,0],[0,0,1],[0,0,0]];
  function bitsToGua(bits){
    // bits 为自下而上 3 位，1=阳；二进制值 7-v 对应 BAGUA 索引
    const v=parseInt(bits.join(''),2);
    return BAGUA[7-v];
  }
  function trigramBits(idx){return TRIGRAM_BITS[idx];}
  function meiHuaInner(date){
    const baZi=Lunar.getBaZi(date);
    const yZhi=baZi.year.zhiIdx+1; // 年支数（子=1...）
    const lunar=Lunar.solarToLunar(date);
    const m=lunar?lunar.month:date.getMonth()+1;
    const d=lunar?lunar.day:date.getDate();
    const t=baZi.hour.zhiIdx+1;
    // 先天八卦：余 0 对应坤（第 8），余 1-7 依次乾…巽；BAGUA 索引 0=乾,7=坤
    const upIdx=((yZhi+m+d-1)%8+8)%8; // 上卦
    const dnIdx=((yZhi+m+d+t-1)%8+8)%8; // 下卦
    const dong=(yZhi+m+d+t)%6; // 动爻 1-6（0→6）
    const dongLine=dong===0?6:dong;
    return buildMeiHua(upIdx,dnIdx,dongLine,{year:yZhi,month:m,day:d,time:t});
  }
  function buildMeiHua(upIdx,dnIdx,dongLine,numbers){
    const guaName=GUA64[upIdx][dnIdx];
    const up=BAGUA[upIdx],dn=BAGUA[dnIdx];
    // 本卦六爻自下而上：下卦 3 位 + 上卦 3 位
    const dnBits=trigramBits(dnIdx),upBits=trigramBits(upIdx);
    const benBits=dnBits.concat(upBits);
    // 动爻在上卦？上卦为 4-6 爻
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
    // 互卦：二三四爻为下卦，三四五爻为上卦
    const huDnBits=[benBits[1],benBits[2],benBits[3]];
    const huUpBits=[benBits[2],benBits[3],benBits[4]];
    const huUp=bitsToGua(huUpBits),huDn=bitsToGua(huDnBits);
    const huGuaName=GUA64[BAGUA.indexOf(huUp)][BAGUA.indexOf(huDn)];
    // 变卦：翻转动爻
    const bianBits=benBits.slice();
    bianBits[dongLine-1]=bianBits[dongLine-1]?0:1;
    const bianUpBits=bianBits.slice(3),bianDnBits=bianBits.slice(0,3);
    const bianUp=bitsToGua(bianUpBits),bianDn=bitsToGua(bianDnBits);
    const bianGuaName=GUA64[BAGUA.indexOf(bianUp)][BAGUA.indexOf(bianDn)];
    return{
      guaName,up,dn,dongLine,tiGua,yongGua,rel,relGood,
      huGua:{name:huGuaName,up:huUp,dn:huDn},
      bianGua:{name:bianGuaName,up:bianUp,dn:bianDn},
      numbers
    };
  }
  function meiHuaByInput(inputType,input,questionType,date){
    questionType=questionType||'其他';
    let upIdx,dnIdx,dongLine,numbers={};
    if(inputType==='time'){
      const r=meiHuaInner(date);
      r.inputType='time';r.questionType=questionType;
      return wrapMeiHua(r,date,questionType);
    }
    if(inputType==='random'){
      upIdx=Math.floor(Math.random()*8);
      dnIdx=Math.floor(Math.random()*8);
      dongLine=Math.floor(Math.random()*6)+1;
      numbers={type:'random',up:upIdx,down:dnIdx,dong:dongLine};
    }else if(inputType==='number'){
      const nums=String(input).split(/[,，\s]/).filter(x=>x!=='').map(x=>parseInt(x)).filter(x=>!isNaN(x));
      let n1=nums[0]||0,n2=nums[1];
      if(n2===undefined)n2=n1+7; // 单数时以 n+7 为第二数
      upIdx=((n1%8)+7)%8; // 先天八卦：1→乾(0)…0→坤(7)
      dnIdx=((n2%8)+7)%8;
      dongLine=((n1+n2)%6)||6;
      numbers={type:'number',n1,n2,dong:dongLine};
    }else if(inputType==='hanzi'){
      let code=0;for(let i=0;i<String(input).length;i++)code+=String(input).charCodeAt(i);
      upIdx=((code%8)+7)%8;
      dnIdx=(((code*7)%8)+7)%8;
      dongLine=(code%6)||6;
      numbers={type:'hanzi',code,dong:dongLine};
    }else{
      // 默认按时间
      const r=meiHuaInner(date);
      r.inputType='time';r.questionType=questionType;
      return wrapMeiHua(r,date,questionType);
    }
    const r=buildMeiHua(upIdx,dnIdx,dongLine,numbers);
    r.inputType=inputType;r.questionType=questionType;
    return wrapMeiHua(r,date,questionType);
  }
  function wrapMeiHua(r,date,questionType){
    const plain={
      state:`梅花易数得「${r.guaName}」，上卦${r.up.n}(${r.up.attr})下卦${r.dn.n}(${r.dn.attr})，第${r.dongLine}爻动。体卦${r.tiGua.n}(${r.tiGua.wx})，用卦${r.yongGua.n}(${r.yongGua.wx})，${r.rel}。互卦${r.huGua.name}，变卦${r.bianGua.name}。`,
      tendency:r.relGood?'宜主动':(r.rel.includes('克体')?'宜谨慎':'宜等待'),
      opps:r.relGood?[`${r.rel}，事可成`,'顺势而为']:[`互卦${r.huGua.name}提示中间过程`,'守正待时'],
      risks:r.rel.includes('克体')?[`用克体，${r.yongGua.n}${r.yongGua.wx}克${r.tiGua.n}${r.tiGua.wx}，阻力较大`,'变卦'+r.bianGua.name+'为最终结果']:[r.rel.includes('泄')?'体生用，耗损精力':'暂无明显阻力','变卦'+r.bianGua.name+'为最终结果'],
      doAct:r.relGood?['可决断推进','把握动爻所示时机']:['暂缓重大决定','观察变卦趋势'],
      dontAct:r.rel.includes('克体')?['不宜强为','不宜对抗']:['不可贪进'],
      signals:[`本卦${r.guaName}`,`互卦${r.huGua.name}`,`变卦${r.bianGua.name}`,`动爻第${r.dongLine}爻`,`体用${r.rel}`],
      env:`体卦${r.tiGua.n}主自身，用卦${r.yongGua.n}主所问之事，互卦看过程，变卦看结果`,
      reviewDays:14,
      sources:[
        {type:'rule',desc:'梅花易数以先天八卦数起卦：乾一兑二离三震四巽五坎六艮七坤八'},
        {type:'rule',desc:'上卦、下卦、动爻取数，动爻定体用'},
        {type:'rule',desc:'互卦取二三四爻为下卦、三四五爻为上卦'},
        {type:'rule',desc:'变卦为动爻阴阳翻转后的卦象'},
        {type:'rule',desc:`起卦方式：${r.inputType||'time'}`}
      ]
    };
    return{name:'梅花易数',result:r,plain};
  }
  function meiHua(date){
    return meiHuaByInput('time','',null,date);
  }

  // ============ 六爻 ============
  // 64卦爻象（自下而上，1阳0阴）
  const YAO64=[];
  (function(){
    const bits=[[1,1,1],[1,1,0],[1,0,1],[1,0,0],[0,1,1],[0,1,0],[0,0,1],[0,0,0]];
    for(let u=0;u<8;u++)for(let d=0;d<8;d++){
      const arr=bits[d].concat(bits[u]); // 下卦3爻+上卦3爻，自下而上
      YAO64.push({name:GUA64[u][d],yao:arr});
    }
  })();
  // 八纯卦纳甲（自下而上）
  const NA_JIA={
    '乾':['甲子','甲寅','甲辰','壬午','壬申','壬戌'],
    '兑':['丁巳','丁卯','丁丑','丁亥','丁酉','丁未'],
    '离':['己卯','己丑','己亥','己酉','己未','己巳'],
    '震':['庚子','庚寅','庚辰','庚午','庚申','庚戌'],
    '巽':['辛丑','辛亥','辛酉','辛未','辛巳','辛卯'],
    '坎':['戊寅','戊辰','戊午','戊申','戊戌','戊子'],
    '艮':['丙辰','丙午','丙申','丙戌','丙子','丙寅'],
    '坤':['乙未','乙巳','乙卯','癸丑','癸亥','癸酉']
  };
  // 卦宫五行
  const PALACE_WX={'乾':'金','兑':'金','离':'火','震':'木','巽':'木','坎':'水','艮':'土','坤':'土'};
  // 64卦所属宫与世爻位置（应爻由世爻推导：((shi+2)%6)+1）
  const PALACE_SHI={
    '乾为天':{p:'乾',s:6},'天风姤':{p:'乾',s:1},'天山遁':{p:'乾',s:2},'天地否':{p:'乾',s:3},
    '风地观':{p:'乾',s:4},'山地剥':{p:'乾',s:5},'火地晋':{p:'乾',s:4},'火天大有':{p:'乾',s:3},
    '兑为泽':{p:'兑',s:6},'泽水困':{p:'兑',s:1},'泽地萃':{p:'兑',s:2},'泽山咸':{p:'兑',s:3},
    '水山蹇':{p:'兑',s:4},'地山谦':{p:'兑',s:5},'雷山小过':{p:'兑',s:4},'雷泽归妹':{p:'兑',s:3},
    '离为火':{p:'离',s:6},'火山旅':{p:'离',s:1},'火风鼎':{p:'离',s:2},'水火未济':{p:'离',s:3},
    '山水蒙':{p:'离',s:4},'风水涣':{p:'离',s:5},'天水讼':{p:'离',s:4},'天火同人':{p:'离',s:3},
    '震为雷':{p:'震',s:6},'雷地豫':{p:'震',s:1},'雷水解':{p:'震',s:2},'雷风恒':{p:'震',s:3},
    '地风升':{p:'震',s:4},'水风井':{p:'震',s:5},'泽风大过':{p:'震',s:4},'泽雷随':{p:'震',s:3},
    '巽为风':{p:'巽',s:6},'风天小畜':{p:'巽',s:1},'风火家人':{p:'巽',s:2},'风雷益':{p:'巽',s:3},
    '天雷无妄':{p:'巽',s:4},'火雷噬嗑':{p:'巽',s:5},'山雷颐':{p:'巽',s:4},'山风蛊':{p:'巽',s:3},
    '坎为水':{p:'坎',s:6},'水泽节':{p:'坎',s:1},'水雷屯':{p:'坎',s:2},'水火既济':{p:'坎',s:3},
    '泽火革':{p:'坎',s:4},'雷火丰':{p:'坎',s:5},'地火明夷':{p:'坎',s:4},'地水师':{p:'坎',s:3},
    '艮为山':{p:'艮',s:6},'山火贲':{p:'艮',s:1},'山天大畜':{p:'艮',s:2},'山泽损':{p:'艮',s:3},
    '火泽睽':{p:'艮',s:4},'天泽履':{p:'艮',s:5},'风泽中孚':{p:'艮',s:4},'风山渐':{p:'艮',s:3},
    '坤为地':{p:'坤',s:6},'地雷复':{p:'坤',s:1},'地泽临':{p:'坤',s:2},'地天泰':{p:'坤',s:3},
    '雷天大壮':{p:'坤',s:4},'泽天夬':{p:'坤',s:5},'水天需':{p:'坤',s:4},'水地比':{p:'坤',s:3}
  };
  // 用神映射
  const LIUYAO_YONGSHEN={
    '感情关系':{target:'官鬼',desc:'问感情婚姻以官鬼爻为用神（女问男/婚姻）'},
    '事业合作':{target:'官鬼',desc:'事业功名、工作晋升以官鬼爻为用神'},
    '学习考试':{target:'父母',desc:'学业考试、文书证照以父母爻为用神'},
    '出行移动':{target:'世爻',desc:'出行安危以世爻为用神'},
    '签约交易':{target:'父母',desc:'合同契约以父母爻为用神'},
    '人际沟通':{target:'应爻',desc:'人际对方以应爻为用神'},
    '财务决策':{target:'妻财',desc:'钱财投资以妻财爻为用神'},
    '健康倾向':{target:'世爻',desc:'健康以世爻为用神，官鬼为病爻参考'},
    '失物寻找':{target:'妻财',desc:'失物以妻财爻为用神'},
    '二选一决策':{target:'世爻',desc:'决策以世爻为用神'},
    '其他':{target:'世爻',desc:'其他事项以世爻为用神'}
  };
  // 主题映射表：把 app.js 的问事主题（求财/谋事等）映射到 LIUYAO_YONGSHEN 的 questionType
  const LIUYAO_TOPIC_MAP={'求财':'财务决策','谋事':'事业合作','感情':'感情关系','出行':'出行移动','失物':'失物寻找','等待消息':'人际沟通','疾病倾向':'健康倾向','人际沟通':'人际沟通','其他':'其他'};
  // 六亲判定：以卦宫五行为"我"
  function liuQin(palaceWx,zhiWx){
    if(zhiWx===palaceWx)return '兄弟';
    if(wxSheng(zhiWx,palaceWx))return '父母'; // 生我者父母
    if(wxSheng(palaceWx,zhiWx))return '子孙'; // 我生者子孙
    if(wxKe(zhiWx,palaceWx))return '官鬼'; // 克我者官鬼
    if(wxKe(palaceWx,zhiWx))return '妻财'; // 我克者妻财
    return '兄弟';
  }
  // 旬空
  function xunKong(dayGzIdx){
    const start=Math.floor(dayGzIdx/10)*10;
    const map={0:'戌亥',10:'申酉',20:'午未',30:'辰巳',40:'寅卯',50:'子丑'};
    return map[start]||'—';
  }
  // 日辰对用神关系
  function dayRelation(dayWx,yongWx){
    if(dayWx===yongWx)return '比和';
    if(wxSheng(dayWx,yongWx))return '日生辰用神，得助';
    if(wxSheng(yongWx,dayWx))return '用神生日辰，泄气';
    if(wxKe(dayWx,yongWx))return '日辰克用神，受制';
    if(wxKe(yongWx,dayWx))return '用神克日辰，耗力';
    return '平和';
  }
  // 三合、六合局（用于神煞与关系推演）
  const SAN_HE=[
    {zhis:['申','子','辰'],wx:'水',name:'申子辰水局'},
    {zhis:['亥','卯','未'],wx:'木',name:'亥卯未木局'},
    {zhis:['寅','午','戌'],wx:'火',name:'寅午戌火局'},
    {zhis:['巳','酉','丑'],wx:'金',name:'巳酉丑金局'}
  ];
  const LIU_HE=[
    {pair:['子','丑'],name:'子丑合土'},{pair:['寅','亥'],name:'寅亥合木'},
    {pair:['卯','戌'],name:'卯戌合火'},{pair:['辰','酉'],name:'辰酉合金'},
    {pair:['巳','申'],name:'巳申合水'},{pair:['午','未'],name:'午未合土'}
  ];
  function calcSanHeLiuHe(yaos){
    const zhis=yaos.map(y=>y.zhi).filter(Boolean);
    const san=[];
    SAN_HE.forEach(ju=>{
      const match=ju.zhis.filter(z=>zhis.includes(z));
      if(match.length>=2){
        const lines=yaos.filter(y=>ju.zhis.includes(y.zhi)).map(y=>y.idx);
        san.push({name:ju.name,wx:ju.wx,match,lines});
      }
    });
    const liu=[];
    LIU_HE.forEach(h=>{
      const [a,b]=h.pair;
      const hasA=yaos.find(y=>y.zhi===a);
      const hasB=yaos.find(y=>y.zhi===b);
      if(hasA&&hasB){
        liu.push({name:h.name,pair:[a,b],lines:[hasA.idx,hasB.idx]});
      }
    });
    return{sanHe:san,liuHe:liu};
  }
  // 将 iching-shifa 爻对象转换为应用内部格式
  function mapIchingYaoList(list){
    return list.map((y,idx)=>{
      const gz=y.naJia||'—';
      const gan=gz[0]||'';
      const zhi=gz[1]||'';
      const zhiIdx=ZHI.indexOf(zhi);
      return{
        idx:y.position||idx+1,
        val:y.yaoValue,
        yang:(y.yaoValue%2)===1,
        dong:!!y.isMoving,
        gz:gz,
        gan:gan,
        zhi:zhi,
        zhiIdx:zhiIdx,
        zhiWx:y.wuXing||'',
        liuQin:y.liuQin||'',
        liuShou:y.liuShou||'',
        xingXiu:y.xingXiu||'',
        suoBo:y.suoBo||'',
        naYin:y.naYin||'',
        shiYing:y.shiYing||'',
        isShi:y.shiYing==='世',
        isYing:y.shiYing==='应'
      };
    });
  }
  function liuYaoByYaos(yaos,questionType,askInfo){
    questionType=questionType||'其他';
    const topic=questionType;
    questionType=LIUYAO_TOPIC_MAP[questionType]||questionType;
    const date=(askInfo&&askInfo.date)||new Date();
    const baZi=Lunar.getBaZi(date);
    const yaoString=yaos.map((y,idx)=>{
      const val=(typeof y==='object'&&y!==null)?y.val:Number(y);
      return val;
    }).join('');
    const I=(typeof window!=='undefined'&&window.IchingShifa)?window.IchingShifa:(typeof global!=='undefined'&&global.IchingShifa?global.IchingShifa:{});
    const dayGz=baZi.day.gz;
    // 本卦排盘（纳甲、六亲、六神、世应、星宿、锁泊、纳音、伏神）
    const benPan=I.decodeGua?I.decodeGua(yaoString,dayGz):null;
    if(!benPan||!benPan.yaoList||!benPan.yaoList.length){
      // 库未加载时给出基础提示，不阻塞渲染
      return{name:'六爻',result:{error:'六爻排盘库未加载',yaoString,dayGz},plain:{state:'六爻排盘库未加载',tendency:'不可用',opps:['请检查 js/vendor/iching-shifa.min.js 是否加载'],risks:[],doAct:[],dontAct:[],signals:['库缺失'],env:'',reviewDays:0,sources:[{type:'rule',desc:'需要 iching-shifa 排盘库'}]}};
    }
    // 变卦、互卦
    const bianString=I.getZhiGua?I.getZhiGua(yaoString):yaoString.replace(/9/g,'8').replace(/6/g,'7');
    const bianGuaName=I.getGuaName?I.getGuaName(bianString):'';
    const huString=I.getHuGua?I.getHuGua(yaoString):'';
    const huGuaName=huString&&I.getGuaName?I.getGuaName(huString):'';
    const yaoDetails=mapIchingYaoList(benPan.yaoList);
    const dongPositions=yaoDetails.filter(y=>y.dong).map(y=>y.idx);
    const dongCount=dongPositions.length;
    const palace=benPan.palace||'乾';
    const palaceWx=benPan.palaceWuXing||'金';
    const shiLine=(yaoDetails.find(y=>y.isShi)||{}).idx||6;
    const yingLine=(yaoDetails.find(y=>y.isYing)||{}).idx||((shiLine+2)%6)+1;
    // 用神
    const yongMap=LIUYAO_YONGSHEN[questionType]||LIUYAO_YONGSHEN['其他'];
    let yongYao=null,yongFound=false;
    if(yongMap.target==='世爻'){
      yongYao=yaoDetails.find(y=>y.isShi)||yaoDetails[0];yongFound=true;
    }else if(yongMap.target==='应爻'){
      yongYao=yaoDetails.find(y=>y.isYing)||yaoDetails[5];yongFound=true;
    }else{
      yongYao=yaoDetails.find(y=>y.liuQin===yongMap.target);
      if(yongYao){yongFound=true;}else{yongYao=yaoDetails.find(y=>y.isShi)||yaoDetails[0];yongFound=false;}
    }
    // 空亡、月破、日辰
    const kongWang=I.calcXunKong?I.calcXunKong(dayGz):xunKong(baZi.day.index);
    const yuePoZhi=ZHI[(baZi.month.zhiIdx+6)%12];
    const yuePoLines=yaoDetails.filter(y=>y.zhi===yuePoZhi).map(y=>y.idx);
    const dayZhiWx=WX_NAME[baZi.day.zhiIdx];
    const dayGanWx=GAN_WX[baZi.day.gan];
    const yongWx=yongYao.zhiWx;
    const dayRiRelation=dayRelation(dayZhiWx,yongWx);
    const dongAny=dongCount>0;
    // 三合六合
    const {sanHe,liuHe}=calcSanHeLiuHe(yaoDetails);
    // 伏神/旁伏神
    const fuShenArr=(benPan.fuShen||[]).map(f=>({liuQin:f.fuLiuQin,naJia:f.fuNaJia,wuXing:f.fuWuXing,naYin:f.fuNaYin||'',hostPosition:f.hostPosition}));
    const pangFuShenArr=(benPan.pangFuShen||[]).map(f=>({liuQin:f.fuLiuQin,naJia:f.fuNaJia,wuXing:f.fuWuXing,naYin:f.fuNaYin||'',hostPosition:f.hostPosition}));
    const fuShenStr=fuShenArr.length?`伏神：${fuShenArr.map(f=>`第${f.hostPosition}爻伏${f.liuQin}${f.naJia}`).join('，')}`:'';
    const sanHeStr=sanHe.length?`三合：${sanHe.map(s=>s.name+`（第${s.lines.join('、')}爻）`).join('，')}`:'无三合局';
    const liuHeStr=liuHe.length?`六合：${liuHe.map(h=>h.name+`（第${h.lines.join('、')}爻）`).join('，')}`:'无六合';
    // 场景化白话：按问事主题给机会/风险/行动建议
    const LIUYAO_SCENE={
      '感情关系':{opps:['主动表达或回应对方','借六合/三合之势推进关系','关注应爻与用神互动'],risks:['空亡主缘分未至','月破主感情波动','世应相冲主意见不合'],do:['真诚沟通','观察对方态度','避免情绪化'],dont:['操之过急','翻旧账','冷战拖延']},
      '事业合作':{opps:['借势三合局聚合资源','争取上级/贵人支持','用神旺相时推进项目'],risks:['官鬼持世压力重','兄弟爻动主竞争','月破主计划受阻'],do:['明确权责','保留书面记录','稳步进取'],dont:['轻信口头承诺','贸然跳槽','独断专行']},
      '学习考试':{opps:['父母爻旺利文运','官鬼爻生父母利功名','静下心来查漏补缺'],risks:['财爻动克父母主分心','子孙爻动克官鬼主懈怠'],do:['制定计划','专注基础','请教师长'],dont:['临时抱佛脚','贪多嚼不烂','沉迷娱乐']},
      '出行移动':{opps:['世爻旺相利出行','用神生世主一路顺风','官鬼安静无大阻'],risks:['官鬼发动主旅途不顺','月破空亡主延误'],do:['提前规划','检查交通','保持联络'],dont:['疲劳驾驶','临时改道','携带贵重物品招摇']},
      '签约交易':{opps:['父母爻旺利文书','财爻旺相利成交','应爻生世主对方配合'],risks:['兄弟爻动主破财','官鬼发动主合同陷阱','空亡主签约无效'],do:['逐条核对条款','保留证据','必要时延后'],dont:['口头承诺代替合同','冲动签约','忽视违约责任']},
      '人际沟通':{opps:['应爻生世主对方有助','三合局主多方和合','父母爻旺利解释澄清'],risks:['应爻克世主对方抵触','朱雀动主口舌','月破主关系裂痕'],do:['换位思考','委婉表达','寻找共同利益'],dont:['指责对方','激化矛盾','背后议论']},
      '财务决策':{opps:['妻财爻旺相主财运','子孙爻动生财主财源','三合财局主大额进益'],risks:['兄弟爻动主破财','财爻空亡主落空','官鬼发动主官方损耗'],do:['稳健理财','分散风险','见好就收'],dont:['冲动投资','借贷冒险','贪图暴利']},
      '健康倾向':{opps:['子孙爻旺相主康复','世爻旺相主体质','官鬼安静无病扰'],risks:['官鬼爻动主病症','世爻月破主身体虚弱','忌神旺相主反复'],do:['及早就医','调整作息','饮食清淡'],dont:['讳疾忌医','过度劳累','乱服药物']},
      '失物寻找':{opps:['妻财爻旺相主可寻','子孙爻动主失物自回','用神生世主易得'],risks:['财爻空亡主难寻','官鬼发动主被盗窃','月破主已损坏'],do:['回忆最后位置','扩大搜索','询问周边'],dont:['拖延不报','随意放弃','轻信陌生人']},
      '二选一决策':{opps:['比较用神旺衰','看世应生克','参考动爻所主'],risks:['两爻均衰主皆不利','用神伏藏主时机未到'],do:['列出优劣','听取建议','小步验证'],dont:['凭感觉决断','忽视关键风险','反复无常']},
      '其他':{opps:['以用神旺衰定吉凶','动爻为事之机','世爻为我之状态'],risks:['用神空破主事不成','忌神发动主有阻'],do:['稳扎稳打','审时度势','顺势而为'],dont:['逆势而为','贸然行动','犹豫不决']}
    };
    const scene=LIUYAO_SCENE[questionType]||LIUYAO_SCENE['其他'];
    const plainOpps=[...(dongAny?[`${dongCount}爻发动，事有变动之机`,`用神${yongMap.target}临${yongYao.zhi}(${yongYao.zhiWx})`]:['无动爻，事态平稳'])];
    if(sanHe.length)plainOpps.push(sanHe.map(s=>s.name+'主事有聚合之势').join('，'));
    if(liuHe.length)plainOpps.push(liuHe.map(h=>h.name+'主和合之象').join('，'));
    plainOpps.push(...scene.opps.slice(0,2));
    const plainRisks=[...scene.risks.slice(0,2)];
    if(yuePoLines.length)plainRisks.unshift(`月破：第${yuePoLines.join('、')}爻逢月破(${yuePoZhi})`);
    if(!plainRisks.length)plainRisks.push('暂无明显险象');
    const plainDoAct=[...(dongAny?['观察动爻所主之事','顺势调整','参考用神旺衰']:['保持现状','蓄势待发']),...scene.do.slice(0,2)];
    const plainDontAct=[...(dayRiRelation.includes('受制')?['不宜逆势而为','忌贸然决策']:['忌无端变动']),...scene.dont.slice(0,2)];
    const plain={
      state:`六爻起得「${benPan.guaName}」${dongAny?`变「${bianGuaName}」`:''}，第${dongPositions.join('、')||'无'}爻动。世爻第${shiLine}爻，应爻第${yingLine}爻。卦宫${palace}(${palaceWx})。问「${topic}」以${yongMap.target}为用神${yongFound?'，现临'+yongYao.liuQin+' '+yongYao.gz:'（卦中无此六亲，伏藏待查）'}。`,
      tendency:dongAny?(dayRiRelation.includes('得助')||dayRiRelation.includes('比和')?'宜主动':'宜谨慎'):'宜等待',
      opps:plainOpps,
      risks:plainRisks,
      doAct:plainDoAct,
      dontAct:plainDontAct,
      signals:[`本卦${benPan.guaName}`,`变卦${bianGuaName}`,`动爻${dongCount}个`,`世${shiLine}应${yingLine}`,`用神${yongMap.target}`,`空亡${kongWang}`,`月破${yuePoZhi}`,sanHeStr,liuHeStr],
      env:`卦宫五行${palaceWx}定六亲，日辰${dayGz}日支${baZi.day.zhi}(${dayZhiWx})对用神${dayRiRelation}${fuShenStr?'；'+fuShenStr:''}`,
      reviewDays:21,
      sources:[
        {type:'rule',desc:'六爻以铜钱摇出六爻，6老阴、7少阳、8少阴、9老阳，老阴老阳为动爻'},
        {type:'rule',desc:`本卦${benPan.guaName}，变卦${bianGuaName}，动爻位置${dongPositions.join('、')||'无'}`},
        {type:'rule',desc:`纳甲：卦宫${palace}(${palaceWx})，六神依日干${baZi.day.gan}起`},
        {type:'rule',desc:`世应：世${shiLine}爻、应${yingLine}爻`},
        {type:'rule',desc:`用神规则：${questionType}→${yongMap.target}（${yongMap.desc}）`},
        {type:'rule',desc:`空亡：日柱${dayGz}，旬空${kongWang}`},
        {type:'rule',desc:`月破：月建${baZi.month.zhi}冲${yuePoZhi}`},
        {type:'rule',desc:`日辰：${dayGz}日支${baZi.day.zhi}(${dayZhiWx})对用神${dayRiRelation}`},
        {type:'rule',desc:`三合六合：${sanHeStr}；${liuHeStr}`},
        {type:'rule',desc:`伏神：${fuShenArr.length?fuShenArr.map(f=>`第${f.hostPosition}爻伏${f.liuQin}${f.naJia}`).join('，'):'无伏神'}`},
        {type:'rule',desc:`卦辞：${(benPan.guaCi||'').slice(0,40)}${(benPan.guaCi||'').length>40?'…':''}`}
      ]
    };
    return{name:'六爻',result:{
      benGua:benPan.guaName,bianGua:bianGuaName,huGua:huGuaName,yaos:yaoDetails,dongCount,dongPositions,
      palace,palaceWx,shiLine,yingLine,naJia:yaoDetails.map(y=>y.gz),questionType,topic,
      yongShen:{target:yongMap.target,yao:yongYao,desc:yongMap.desc,found:yongFound},
      kongWang,yuePo:{zhi:yuePoZhi,lines:yuePoLines},dayRiRelation,
      dayGanWx,dayZhiWx,dayGan:baZi.day.gan,dayGz,
      fuShen:fuShenArr,pangFuShen:pangFuShenArr,sanHe,liuHe,
      guaCi:benPan.guaCi||'',yaoCi:benPan.yaoCi||[],tuanCi:benPan.tuanCi||'',shenYao:benPan.shenYao
    },plain};
  }
  function liuYao(date){
    // 时间起卦兼容：生成随机六爻并调用新接口
    const seed=date.getTime();
    let rng=seed;
    function r(){rng=(rng*9301+49297)%233280;return rng/233280;}
    const yaos=[];
    for(let i=0;i<6;i++){
      const s=Math.floor(r()*4)+6;
      yaos.push({val:s});
    }
    return liuYaoByYaos(yaos,'其他',{date,note:'时间起卦，六爻为随机生成'});
  }

  // ============ 塔罗（78 张全牌库 + 多种牌阵）============
  // 大阿卡纳本地化（繁体转简中）
  const TAROT_NAME_ZH={
    'the-fool':'愚者','the-magician':'魔术师','the-high-priestess':'女祭司','the-empress':'皇后','the-emperor':'皇帝',
    'the-hierophant':'教皇','the-lovers':'恋人','the-chariot':'战车','strength':'力量','the-hermit':'隐士',
    'wheel-of-fortune':'命运之轮','justice':'正义','the-hanged-man':'倒吊人','death':'死神','temperance':'节制',
    'the-devil':'恶魔','the-tower':'高塔','the-star':'星星','the-moon':'月亮','the-sun':'太阳','judgement':'审判','the-world':'世界'
  };
  const SUIT_NAME={wands:'权杖',cups:'圣杯',swords:'宝剑',pentacles:'星币',coins:'星币'};
  const SUIT_WX={wands:'火',cups:'水',swords:'风',pentacles:'土',coins:'土'};
  const MAJOR_WX={
    'the-fool':'风','the-magician':'水星','the-high-priestess':'月','the-empress':'金星','the-emperor':'火星',
    'the-hierophant':'木星','the-lovers':'水星','the-chariot':'巨蟹','strength':'狮子','the-hermit':'处女',
    'wheel-of-fortune':'木星','justice':'金星','the-hanged-man':'海王','death':'冥王','temperance':'射手',
    'the-devil':'土星','the-tower':'火星','the-star':'水瓶','the-moon':'双鱼','the-sun':'太阳','judgement':'冥王','the-world':'土星'
  };
  function getTarotKit(){return (typeof window!=='undefined'&&window.TarotKit)?window.TarotKit:(typeof global!=='undefined'&&global.TarotKit?global.TarotKit:null);}
  function tarotCardName(card){return card.arcana==='major'?(TAROT_NAME_ZH[card.id]||(card.name&&card.name.zh)||card.id):(SUIT_NAME[card.suit]||card.suit||'')+(card.number||'');}
  function tarotCardElement(card){return card.arcana==='major'?(MAJOR_WX[card.id]||''):(SUIT_WX[card.suit]||'');}
  function tarotCardMeaning(card,reverse){
    const m=card.meaning||{};
    const side=reverse?(m.reversed||{}):(m.upright||{});
    return side.zh||side.en||card.coreKeyword&&card.coreKeyword.zh||card.coreKeyword&&card.coreKeyword.en||'';
  }
  // 在模块加载时构建 78 张牌的内部缓存；若 TarotKit 未加载则留空，运行时由 tarot 兜底
  const TAROT=(function(){
    const T=getTarotKit();
    if(!T||!T.cards)return [];
    return T.cards.map(c=>({id:c.id,name:tarotCardName(c),key:String(c.number||0),up:c.meaning&&c.meaning.upright?c.meaning.upright.zh:'',rev:c.meaning&&c.meaning.reversed?c.meaning.reversed.zh:'',el:tarotCardElement(c),arcana:c.arcana,suit:c.suit}));
  })();
  // 牌阵配置
  const SPREAD_CFG={
    single:{name:'单张牌阵',pos:['今日指引']},
    three:{name:'三牌阵（过去-现在-未来）',pos:['过去','现在','未来']},
    relation:{name:'关系牌阵（我-对方-关系现状）',pos:['我','对方','关系现状']},
    choice:{name:'二选一牌阵（选项A-选项B-建议）',pos:['选项A','选项B','建议']},
    celtic:{name:'凯尔特十字牌阵',pos:['现状','阻碍','根基','过去','目标','未来','自我','环境','希望','结果']}
  };
  // 基于日期种子的确定性抽牌（替代 Math.random，保证同一时刻结果稳定）
  function seededDraw(seed,count,reverseMode){
    const T=getTarotKit();
    const all=T&&T.cards?T.cards:(TAROT&&TAROT.length?TAROT.map(t=>{return{id:t.id,name:{zh:t.name,en:t.name},arcana:t.arcana||'major',suit:t.suit,meaning:{upright:{zh:t.up},reversed:{zh:t.rev}}}}):[]);
    if(!all.length)return [];
    let rng=seed>>>0;
    function next(){rng=(rng*1664525+1013904223)>>>0;return rng/4294967296;}
    const deck=[...all];
    for(let i=deck.length-1;i>0;i--){const j=Math.floor(next()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}
    const pickCount=Math.min(count,deck.length);
    return deck.slice(0,pickCount).map(card=>{
      let reverse=false;
      if(reverseMode==='仅正位')reverse=false;
      else if(reverseMode==='仅逆位')reverse=true;
      else reverse=next()<0.5;
      return {card,reverse};
    });
  }
  function tarot(date,spread,reverseMode){
    spread=spread||'three';
    reverseMode=reverseMode||'随机正逆位';
    const cfg=SPREAD_CFG[spread]||SPREAD_CFG['three'];
    const pos=cfg.pos;
    const seed=date.getTime();
    const drawn=seededDraw(seed,pos.length,reverseMode);
    if(!drawn.length){
      return{name:'塔罗',result:{error:'塔罗牌库未加载',spread},plain:{state:'塔罗牌库未加载',tendency:'不可用',opps:['请检查 js/vendor/tarot-kit.min.js 是否加载'],risks:[],doAct:[],dontAct:[],signals:['库缺失'],env:'',reviewDays:0,sources:[{type:'rule',desc:'需要 tarot-kit 牌库'}]}};
    }
    const cards=drawn.map((d,i)=>{
      const c=d.card;
      return{pos:pos[i],name:tarotCardName(c),nameZh:tarotCardName(c),key:String(c.number||0),reverse:d.reverse,meaning:tarotCardMeaning(c,d.reverse),element:tarotCardElement(c),up:!d.reverse,id:c.id,arcana:c.arcana,suit:c.suit};
    });
    const total=cards.length;
    const allUp=cards.filter(c=>c.up).length;
    const upRatio=total>0?allUp/total:0;
    const negNames=['高塔','恶魔','死神','宝剑十','宝剑九','宝剑五'];
    const hasNeg=cards.some(c=>negNames.includes(c.name)||(c.reverse&&['死神','高塔','恶魔','宝剑十','宝剑九'].includes(c.name)));
    const cardStr=cards.map(c=>`${c.pos}「${c.name}${c.reverse?'(逆)':''}」`).join('、');
    const focusIndex=(spread==='three'?1:(spread==='celtic'?9:total-1));
    const focus=cards[focusIndex]||cards[total-1];
    const majorCount=cards.filter(c=>c.arcana==='major').length;
    const minorCount=cards.filter(c=>c.arcana==='minor').length;
    const elements=[...new Set(cards.map(c=>c.element).filter(Boolean))];
    const wxCount={};
    elements.forEach(e=>wxCount[e]=(wxCount[e]||0)+cards.filter(c=>c.element===e).length);
    const dominantEl=Object.keys(wxCount).sort((a,b)=>wxCount[b]-wxCount[a])[0]||'';
    const elHints={'火':'行动力强，宜主动推进','水':'情绪与直觉主导，宜倾听内心','风':'思考与沟通，宜收集信息','土':'务实稳定，宜稳扎稳打','风/水':'思绪起伏，宜先整理再行动'};
    const elementHint=elHints[dominantEl]||'能量多元，宜因时制宜';
    const suitHints={wands:'权杖多主行动与创造力，宜积极开拓',cups:'圣杯多主情感与人际，宜重视关系',swords:'宝剑多主思考与冲突，宜理性沟通',pentacles:'星币多主物质与务实，宜脚踏实地',coins:'星币多主物质与务实，宜脚踏实地'};
    const suitCounts={};cards.filter(c=>c.suit).forEach(c=>suitCounts[c.suit]=(suitCounts[c.suit]||0)+1);
    const dominantSuit=Object.keys(suitCounts).sort((a,b)=>suitCounts[b]-suitCounts[a])[0]||'';
    const suitHint=suitHints[dominantSuit]||'';
    const plain={
      state:`塔罗${cfg.name}（${total}张，${minorCount}张小阿卡纳）：${cardStr}。`,
      tendency:upRatio>=0.6?'宜主动':(upRatio<=0.4?'宜谨慎':'宜等待'),
      opps:[`${focus.pos}「${focus.name}」：${focus.meaning}`,upRatio>=0.5?'整体能量积极，可把握当下':'',elementHint,suitHint].filter(Boolean),
      risks:hasNeg?[`出现挑战牌，需正视而非回避`,`末位${cards[total-1].meaning}`]:['暂无明显阻碍信号'],
      doAct:['参考关键位的牌义行动','结合整体牌阵反思','注意正逆位组合',`关注${dominantEl||'整体'}元素动向`].filter(Boolean),
      dontAct:hasNeg?['忌回避问题','忌冲动对抗']:['忌固步自封'],
      signals:cards.map(c=>`${c.pos}：${c.name}(${c.up?'正':'逆'})`),
      env:`整体正位 ${allUp}/${total}，大阿卡纳 ${majorCount} 张，小阿卡纳 ${minorCount} 张；主导元素 ${dominantEl||'—'}（${elementHint}）${suitHint?'；'+suitHint:''}`,
      reviewDays:30,
      sources:[
        {type:'rule',desc:`塔罗采用78张全牌库${cfg.name}`},
        {type:'rule',desc:'基于时间种子随机抽取并随机正逆位，同阵不重复抽牌'},
        {type:'rule',desc:`牌阵位置：${pos.join('→')}`},
        {type:'rule',desc:`正逆位模式：${reverseMode}`},
        {type:'rule',desc:`元素分布：${elements.join('、')||'—'}`},
        {type:'rule',desc:`大小阿卡纳：大阿卡纳${majorCount}张，小阿卡纳${minorCount}张`}
      ]
    };
    return{name:'塔罗',result:{cards,spread,spreadName:cfg.name},plain};
  }

  // ============ 八字（四柱展示+五行+十神+大运）============
  const GAN_WX={甲:'木',乙:'木',丙:'火',丁:'火',戊:'土',己:'土',庚:'金',辛:'金',壬:'水',癸:'水'};
  const ZHI_WX=WX_NAME;
  // 藏干
  const CANG_GAN={
    '子':['癸'],'丑':['己','癸','辛'],'寅':['甲','丙','戊'],'卯':['乙'],
    '辰':['戊','乙','癸'],'巳':['丙','戊','庚'],'午':['丁','己'],
    '未':['己','丁','乙'],'申':['庚','壬','戊'],'酉':['辛'],
    '戌':['戊','辛','丁'],'亥':['壬','甲']
  };
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
    '癸':{'甲':'伤官','乙':'食神','丙':'正财','丁':'偏财','戊':'正官','己':'七杀','庚':'正印','辛':'偏印','壬':'劫财','癸':'比肩'}
  };
  // ============ 古籍算法查表（《子平真诠》《渊海子平》《滴天髓》《三命通会》）============
  // 60 甲子纳音表（每纳音管 2 个干支，共 30 纳音；索引 i → NA_YIN[floor(i/2)]）
  const NA_YIN=['海中金','炉中火','大林木','路旁土','剑锋金','山头火','涧下水','城头土','白蜡金','杨柳木',
    '泉中水','屋上土','霹雳火','松柏木','长流水','沙中金','山下火','平地木','壁上土','金箔金',
    '覆灯火','天河水','大驿土','钗钏金','桑柘木','大溪水','沙中土','天上火','石榴木','大海水'];
  // 由 60 甲子真序号取纳音
  function naYinByIndex(i){i=((i%60)+60)%60;return NA_YIN[Math.floor(i/2)];}
  // 由干支序号(ganIdx%10, zhiIdx%12 同奇偶必有解)反推真 60 甲子序号
  function gz60Index(gi,zi){let i=((gi%10)+10)%10;const z=((zi%12)+12)%12;while(i%12!==z)i+=10;return i%60;}
  // 天乙贵人（日干起）：甲戊庚→丑未，乙己→子申，丙丁→亥酉，辛→寅午，壬癸→卯巳
  const GUI_REN={'甲':['丑','未'],'戊':['丑','未'],'庚':['丑','未'],
    '乙':['子','申'],'己':['子','申'],
    '丙':['亥','酉'],'丁':['亥','酉'],
    '辛':['寅','午'],
    '壬':['卯','巳'],'癸':['卯','巳']};
  // 文昌（日干起）
  const WEN_CHANG={'甲':'巳','乙':'午','丙':'申','戊':'申','丁':'酉','己':'酉','庚':'亥','辛':'子','壬':'寅','癸':'卯'};
  // 驿马（年支起，三合局首支之冲）
  const YI_MA={'申':'寅','子':'寅','辰':'寅','寅':'申','午':'申','戌':'申','巳':'亥','酉':'亥','丑':'亥','亥':'巳','卯':'巳','未':'巳'};
  // 桃花（年支起，三合局四正）
  const TAO_HUA={'申':'酉','子':'酉','辰':'酉','寅':'卯','午':'卯','戌':'卯','巳':'午','酉':'午','丑':'午','亥':'子','卯':'子','未':'子'};
  // 华盖（年支起，三合局墓库）
  const HUA_GAI={'申':'辰','子':'辰','辰':'辰','寅':'戌','午':'戌','戌':'戌','巳':'丑','酉':'丑','丑':'丑','亥':'未','卯':'未','未':'未'};
  // 将星（年支起，三合局旺支）
  const JIANG_XING={'申':'子','子':'子','辰':'子','寅':'午','午':'午','戌':'午','巳':'酉','酉':'酉','丑':'酉','亥':'卯','卯':'卯','未':'卯'};
  // 羊刃（日干起，帝旺地支）
  const YANG_REN={'甲':'卯','乙':'辰','丙':'午','戊':'午','丁':'未','己':'未','庚':'酉','辛':'戌','壬':'子','癸':'丑'};
  // 五行生克反查（以日主为我）
  const WX_SHENG_ME={'金':'土','土':'火','火':'木','木':'水','水':'金'}; // 生我者=印
  const WX_I_SHENG={'金':'水','水':'木','木':'火','火':'土','土':'金'}; // 我生=食伤
  const WX_I_KE={'金':'木','木':'土','土':'水','水':'火','火':'金'};    // 我克=财
  const WX_KE_ME={'金':'火','木':'金','土':'木','水':'土','火':'水'};    // 克我=官杀
  // 真太阳时简化实现：根据出生地经度粗略修正平太阳时
  // 中国标准时间为 120°E（UTC+8），每偏东 1° 早 4 分钟
  function parseLongitude(place){
    if(!place)return null;
    const cityMap={
      '北京':116.4,'上海':121.5,'广州':113.3,'深圳':114.1,'成都':104.1,'杭州':120.2,
      '南京':118.8,'武汉':114.3,'西安':108.9,'重庆':106.5,'天津':117.2,'苏州':120.6,
      '郑州':113.6,'长沙':112.9,'福州':119.3,'沈阳':123.4,'哈尔滨':126.6,'长春':125.3,
      '石家庄':114.5,'太原':112.5,'济南':117.0,'青岛':120.4,'合肥':117.3,'南昌':115.9,
      '昆明':102.7,'贵阳':106.6,'南宁':108.3,'海口':110.3,'兰州':103.8,'银川':106.2,
      '西宁':101.8,'乌鲁木齐':87.6,'拉萨':91.1,'呼和浩特':111.7,'台北':121.5,'香港':114.2,
      '澳门':113.5
    };
    for(const k in cityMap){if(place.includes(k))return cityMap[k];}
    const m1=place.match(/东经\s*(\d+(\.\d+)?)/);if(m1)return parseFloat(m1[1]);
    const m2=place.match(/(\d+(\.\d+)?)\s*[°度]?\s*[Ee东]/);if(m2)return parseFloat(m2[1]);
    const m3=place.match(/[Ee]\s*(\d+(\.\d+)?)/);if(m3)return parseFloat(m3[1]);
    const dms=place.match(/(\d+)[°度](\d+)[′'分](\d+(\.\d+)?)[″"秒]?\s*[Ee东]?/);
    if(dms){const d=parseInt(dms[1],10),m=parseInt(dms[2],10),s=parseFloat(dms[3]);return d+m/60+s/3600;}
    return null;
  }
  function applyZhenTaiyang(date,place){
    const lng=parseLongitude(place);
    if(lng==null)return{date,offsetMin:0,note:'未能从地点解析经度，按平太阳时计算'};
    const offsetMin=(lng-120)*4; // 每度 4 分钟
    const adjusted=new Date(date.getTime()+offsetMin*60000);
    return{date:adjusted,offsetMin,note:`已按真太阳时校正：经度 ${lng.toFixed(1)}°E，${offsetMin>=0?'+'+offsetMin:offsetMin} 分钟`};
  }

  function baZiByBirth(birthInfo){
    const gender=birthInfo.gender||'男';
    let rawDate=birthInfo.date||new Date();
    const unknownHour=!!birthInfo.unknownHour;
    let zhenNote='';
    if(birthInfo.zhenTaiyang){
      const zt=applyZhenTaiyang(rawDate,birthInfo.place);
      rawDate=zt.date;
      zhenNote=zt.note;
    }
    const date=rawDate;
    const bz=Lunar.getBaZi(date);
    const dayGan=bz.day.gan;
    const dayWx=GAN_WX[dayGan];
    // 四柱
    const pillars=[];
    const buildPillar=(name,p)=>{
      const zhiWx=ZHI_WX[p.zhiIdx];
      const cangList=CANG_GAN[p.zhi].map(g=>({gan:g,wx:GAN_WX[g],shen:SHISHEN[dayGan][g]}));
      // cangGan：地支所藏天干及其十神；天干无藏干，故天干部分仅地支柱位有值
      const cangGan=cangList.map(c=>({gan:c.gan,shiShen:c.shen}));
      return{name:name,gz:p.gz,gan:p.gan,zhi:p.zhi,ganWx:GAN_WX[p.gan],zhiWx,ganShen:SHISHEN[dayGan][p.gan],cang:cangList,cangGan};
    };
    pillars.push(buildPillar('年柱',bz.year));
    pillars.push(buildPillar('月柱',bz.month));
    pillars.push(Object.assign(buildPillar('日柱',bz.day),{ganShen:'日主'}));
    if(!unknownHour){
      pillars.push(buildPillar('时柱',bz.hour));
    }else{
      pillars.push({name:'时柱',gz:'未知',gan:'',zhi:'',ganWx:'',zhiWx:'',ganShen:'—',cang:[],cangGan:[],unknown:true});
    }
    // 五行统计：四柱天干地支（8个）+ 含藏干（全量）
    const wxCount={金:0,木:0,水:0,火:0,土:0};
    const wxCountAll={金:0,木:0,水:0,火:0,土:0};
    pillars.forEach(p=>{
      if(p.ganWx){wxCount[p.ganWx]++;wxCountAll[p.ganWx]++;}
      if(p.zhiWx){wxCount[p.zhiWx]++;wxCountAll[p.zhiWx]++;}
      p.cang.forEach(c=>wxCountAll[c.wx]++);
    });
    const wxStr=Object.keys(wxCountAll).map(k=>`${k}${wxCountAll[k]}`).join(' ');
    // 日主强弱（粗略：日主五行数量>=2 且月令生扶为强）
    const monthShengWo=wxSheng(ZHI_WX[bz.month.zhiIdx],dayWx);
    const dayStrong=wxCountAll[dayWx]>=2&&(monthShengWo||wxCountAll[dayWx]>=3);
    // 用神参考
    const shengWo={金:'土',土:'火',火:'木',木:'水',水:'金'};
    const woSheng={金:'水',水:'木',木:'火',火:'土',土:'金'};
    const yongShen=dayStrong?(woSheng[dayWx]+'泄秀'):(shengWo[dayWx]+'扶身');
    // 大运
    // 月柱的 60 甲子序数（用于大运顺逆排）
    const monthGz60=(function(gi,zi){let i=gi;while(i%12!==zi)i+=10;return i%60;})(bz.month.ganIdx,bz.month.zhiIdx);
    const daYunInfo=computeDaYun(date,gender,bz.year.gan,monthGz60);
    const daYun=daYunInfo.pillars; // 大运数组：每项 {gz, startAge, startYear, index}
    const daYunStartAge=daYunInfo.startAge;
    const daYunForward=daYunInfo.forward;
    // 当前流年、流月
    const now=new Date();
    const liuNian=Lunar.getBaZi(now).year;
    const liuYue=Lunar.getBaZi(now).month;
    // ============ 古籍算法补全 ============
    const birthYear=date.getFullYear();
    // 真 60 甲子序号（year/day 的 index 已为真序号；monthGz60 上面已算；hour 的 index 非 60 制，需换算）
    const yearGz60=bz.year.index;
    const dayGz60=bz.day.index;
    const hourGz60=unknownHour?null:gz60Index(bz.hour.ganIdx,bz.hour.zhiIdx);
    const yearZhi=bz.year.zhi,dayZhi=bz.day.zhi,monthZhi=bz.month.zhi;

    // 1. 大运增强：每步补 gan/zhi/ganWx/zhiWx/ganShen/endAge/endYear/ageRange/yearRange/liuNianList
    const daYunEnriched=daYun.map((dy,i)=>{
      const g=dy.gz[0],z=dy.gz[1];
      const zIdx=dy.index%12;
      const endAge=(i<daYun.length-1)?daYun[i+1].startAge:(dy.startAge+10);
      const endYear=dy.startYear+Math.round((endAge-dy.startAge));
      const liuNianList=[];
      for(let yr=dy.startYear;yr<endYear;yr++){
        const ly=Lunar.getBaZi(new Date(yr,5,1)).year;
        liuNianList.push({gz:ly.gz,gan:ly.gan,zhi:ly.zhi,ganShen:SHISHEN[dayGan][ly.gan],year:yr,age:yr-birthYear+1});
      }
      return Object.assign({},dy,{
        gan:g,zhi:z,
        ganWx:GAN_WX[g],zhiWx:ZHI_WX[zIdx],
        ganShen:SHISHEN[dayGan][g],
        endAge,endYear,
        ageRange:`${dy.startAge}-${endAge}岁`,
        yearRange:`${dy.startYear}-${endYear}`,
        liuNianList
      });
    });

    // 2. 神煞
    const guiRen=GUI_REN[dayGan]||[];
    const wenChang=WEN_CHANG[dayGan];
    const yiMa=YI_MA[yearZhi];
    const taoHua=TAO_HUA[yearZhi];
    const huaGai=HUA_GAI[yearZhi];
    const jiangXing=JIANG_XING[yearZhi];
    const yangRen=YANG_REN[dayGan];
    // 空亡（日柱旬空）：旬首序号 xunShou，空亡为旬首地支后两位
    const xunShou=Math.floor(dayGz60/10)*10;
    const kongWang=[Lunar.ZHI[(xunShou%12+10)%12],Lunar.ZHI[(xunShou%12+11)%12]];
    const shenSha={
      '天乙贵人':guiRen,'文昌':wenChang,'驿马':yiMa,'桃花':taoHua,
      '华盖':huaGai,'将星':jiangXing,'羊刃':yangRen,'空亡':kongWang
    };
    // 四柱神煞落位（按地支比对，命主相关神煞皆落于地支）
    const shenShaInPillars=pillars.filter(p=>p.zhi).map(p=>{
      const hits=[];
      if(guiRen.includes(p.zhi))hits.push('天乙');
      if(wenChang===p.zhi)hits.push('文昌');
      if(yiMa===p.zhi)hits.push('驿马');
      if(taoHua===p.zhi)hits.push('桃花');
      if(huaGai===p.zhi)hits.push('华盖');
      if(jiangXing===p.zhi)hits.push('将星');
      if(yangRen===p.zhi)hits.push('羊刃');
      if(kongWang.includes(p.zhi))hits.push('空亡');
      return{pillar:p.name,shenSha:hits};
    }).filter(p=>p.shenSha.length>0);

    // 3. 纳音（四柱 60 甲子纳音查表）
    const naYin={
      '年柱':naYinByIndex(yearGz60),
      '月柱':naYinByIndex(monthGz60),
      '日柱':naYinByIndex(dayGz60),
      '时柱':unknownHour?'—':naYinByIndex(hourGz60)
    };

    // 4. 胎元 / 命宫 / 身宫
    // 胎元：月柱天干进一位、地支进三位
    const tyGanIdx=(bz.month.ganIdx+1)%10;
    const tyZhiIdx=(bz.month.zhiIdx+3)%12;
    const taiYuan={gz:Lunar.GAN[tyGanIdx]+Lunar.ZHI[tyZhiIdx],gan:Lunar.GAN[tyGanIdx],zhi:Lunar.ZHI[tyZhiIdx]};
    // 命宫/身宫：月数（寅=1）与时支序（子=1,...,亥=12），年干五虎遁定天干
    const monthNum=(bz.month.zhiIdx-2+12)%12+1;        // 寅=1,...,丑=12
    const hourZhiOrd=bz.hour.zhiIdx+1;                 // 子=1,...,亥=12
    const yinGan=((bz.year.ganIdx%5)*2+2)%10;          // 年干起五虎遁之寅月干
    function gzByWuHu(zhiIdx){return Lunar.GAN[(yinGan+(zhiIdx-2+12)%12)%10]+Lunar.ZHI[zhiIdx];}
    const mgZhi=((14-monthNum-hourZhiOrd)%12+12)%12;
    const sgZhi=((monthNum+hourZhiOrd+2)%12+12)%12;
    const mingGong={gz:gzByWuHu(mgZhi),gan:gzByWuHu(mgZhi)[0],zhi:gzByWuHu(mgZhi)[1]};
    const shenGong={gz:gzByWuHu(sgZhi),gan:gzByWuHu(sgZhi)[0],zhi:gzByWuHu(sgZhi)[1]};

    // 5. 格局（《子平真诠》月令本气透干定格法）
    const cangOfMo=CANG_GAN[monthZhi]||[];
    const ganPos={'年干':bz.year.gan,'月干':bz.month.gan};
    if(!unknownHour)ganPos['时干']=bz.hour.gan;
    let matchedGan=null,matchedPos=null,matchedQiIdx=-1;
    for(let k=0;k<cangOfMo.length;k++){
      for(const pos in ganPos){
        if(ganPos[pos]===cangOfMo[k]){matchedGan=cangOfMo[k];matchedPos=pos;matchedQiIdx=k;break;}
      }
      if(matchedGan)break;
    }
    const benQi=cangOfMo[0];
    const benQiShen=benQi?SHISHEN[dayGan][benQi]:null;
    function shenToGeName(shen){
      if(shen==='比肩')return '建禄格';
      if(shen==='劫财')return '羊刃格';
      return shen+'格';
    }
    const geJuYongMap={
      '正官格':'喜财生官、印护官，忌伤官见官','七杀格':'喜食神制杀、印化杀，忌财党杀',
      '正财格':'喜食伤生财、官护财，忌比劫夺财','偏财格':'喜食伤生财，忌比劫争夺',
      '正印格':'喜官杀生印，忌财坏印','偏印格':'喜官杀生印，忌食神受夺',
      '食神格':'喜财养食、官护，忌枭神夺食','伤官格':'喜财泄伤、印制伤，忌官星见伤',
      '建禄格':'喜财官食伤克泄，忌印比再扶','羊刃格':'喜官杀制刃、食伤泄秀，忌财旺党刃'
    };
    let geJuName,geJuMethod;
    if(matchedGan){
      const shen=SHISHEN[dayGan][matchedGan];
      const qiLabel=(matchedQiIdx===0)?'月令本气':(matchedQiIdx===1?'月令中气':'月令余气');
      geJuName=shenToGeName(shen);
      geJuMethod=`${qiLabel}${matchedGan}透于${matchedPos}，为日主${dayGan}之${shen}，立${geJuName}`;
    }else{
      geJuName=shenToGeName(benQiShen);
      geJuMethod=`月令${monthZhi}本气${benQi}不透干，以本气十神${benQiShen}定格（杂气格）`;
    }
    const geJu={name:geJuName,method:geJuMethod,yongShen:geJuYongMap[geJuName]||('参考用神'+yongShen)};

    // 6. 刑冲合害（四柱地支间）
    const ZHI_LIST=pillars.map((p,idx)=>({short:['年','月','日','时'][idx],zhi:p.zhi})).filter(p=>p.zhi);
    const LIU_HE_KEY={'子丑':1,'寅亥':1,'卯戌':1,'辰酉':1,'巳申':1,'午未':1};
    const LIU_CHONG_KEY={'子午':1,'丑未':1,'寅申':1,'卯酉':1,'辰戌':1,'巳亥':1};
    const LIU_HAI_KEY={'子未':1,'丑午':1,'寅巳':1,'卯辰':1,'申亥':1,'酉戌':1};
    const liuHe=[],liuChong=[],liuHai=[],xing=[];
    const summaryParts=[];
    for(let i=0;i<ZHI_LIST.length;i++){
      for(let j=i+1;j<ZHI_LIST.length;j++){
        const a=ZHI_LIST[i],b=ZHI_LIST[j];
        const pair=a.zhi+b.zhi,rev=b.zhi+a.zhi;
        const isHe=!!LIU_HE_KEY[pair]||!!LIU_HE_KEY[rev];
        const isChong=!!LIU_CHONG_KEY[pair]||!!LIU_CHONG_KEY[rev];
        const isHai=!!LIU_HAI_KEY[pair]||!!LIU_HAI_KEY[rev];
        const sumPrefix=`${a.short}${b.short}${a.zhi}${b.zhi}`;
        if(isHe){liuHe.push({a:`${a.short}支${a.zhi}`,b:`${b.short}支${b.zhi}`});summaryParts.push(sumPrefix+'合');}
        if(isChong){liuChong.push({a:`${a.short}支${a.zhi}`,b:`${b.short}支${b.zhi}`});summaryParts.push(sumPrefix+'冲');}
        if(isHai){liuHai.push({a:`${a.short}支${a.zhi}`,b:`${b.short}支${b.zhi}`});summaryParts.push(sumPrefix+'害');}
        if((a.zhi==='子'&&b.zhi==='卯')||(a.zhi==='卯'&&b.zhi==='子')){xing.push('子卯无礼之刑');summaryParts.push(sumPrefix+'刑');}
      }
    }
    const zhiSet=ZHI_LIST.map(p=>p.zhi);
    const sanHe=[];
    [['申','子','辰','水'],['寅','午','戌','火'],['巳','酉','丑','金'],['亥','卯','未','木']].forEach(g=>{
      const tri=g.slice(0,3),present=tri.filter(z=>zhiSet.includes(z));
      if(present.length>=3){sanHe.push(`${tri.join('')}合${g[3]}局`);summaryParts.push(`${tri.join('')}合${g[3]}局`);}
      else if(present.length===2&&present.includes(g[1])){sanHe.push(`${present.join('')}半合${g[3]}局`);summaryParts.push(`${present.join('')}半合${g[3]}局`);}
    });
    [['寅','巳','申','寅巳申无恩之刑'],['丑','戌','未','丑戌未恃势之刑']].forEach(g=>{
      if(g.slice(0,3).every(z=>zhiSet.includes(z))){xing.push(g[3]);summaryParts.push(g[3]);}
    });
    const ziCnt={};zhiSet.forEach(z=>{ziCnt[z]=(ziCnt[z]||0)+1;});
    ['辰','午','酉','亥'].forEach(z=>{if((ziCnt[z]||0)>=2){xing.push(`${z}自刑`);summaryParts.push(`${z}自刑`);}});
    const xingChong={三合:sanHe,六合:liuHe,三刑:xing,六冲:liuChong,六害:liuHai,summary:summaryParts.join('，')||'四柱地支无明显刑冲合害'};

    // 7. 喜忌神（日主强弱 + 月令调候）
    const shengMeWx=WX_SHENG_ME[dayWx],iShengWx=WX_I_SHENG[dayWx],iKeWx=WX_I_KE[dayWx],keMeWx=WX_KE_ME[dayWx];
    let xiSet,jiSet;
    if(dayStrong){xiSet=[iShengWx,iKeWx,keMeWx];jiSet=[shengMeWx,dayWx];}
    else{xiSet=[shengMeWx,dayWx];jiSet=[iShengWx,iKeWx,keMeWx];}
    let tiaoHouWx=null,tiaoHouDesc='';
    if(['亥','子','丑'].includes(monthZhi)){tiaoHouWx='火';tiaoHouDesc=`冬月${ZHI_WX[bz.month.zhiIdx]}旺，喜火暖局调候`;}
    else if(['巳','午','未'].includes(monthZhi)){tiaoHouWx='水';tiaoHouDesc=`夏月${ZHI_WX[bz.month.zhiIdx]}旺，喜水润局调候`;}
    else{tiaoHouDesc=`${monthZhi}月${ZHI_WX[bz.month.zhiIdx]}当令，调候随局中和`;}
    if(tiaoHouWx){if(!xiSet.includes(tiaoHouWx))xiSet.push(tiaoHouWx);jiSet=jiSet.filter(w=>w!==tiaoHouWx);}
    const xi=Array.from(new Set(xiSet)),ji=Array.from(new Set(jiSet));
    const reason=`日主${dayGan}${dayWx}生于${monthZhi}月${dayStrong?'得令偏强':'失令偏弱'}，喜${xi.join('、')}${dayStrong?'克泄耗':'生扶'}，忌${ji.join('、')}`;
    const xiJi={xi,ji,tiaoHou:tiaoHouDesc,reason};

    let note=unknownHour?'时辰未知，本盘时柱仅供参考，子女宫、晚年运势等涉及时柱的判断从略。':'此盘基于真实生辰';
    if(zhenNote)note+='；'+zhenNote;
    const plain={
      state:`八字四柱：${pillars.map(p=>p.name+p.gz).join(' ')}。日主${dayGan}(${dayWx})${dayStrong?'偏强':'偏弱'}，五行${wxStr}。${note}。`,
      tendency:dayStrong?'宜主动':(dayStrong===false?'宜谨慎':'宜等待'),
      opps:[`日主${dayGan}(${dayWx})，参考用神「${yongShen}」`,'当前流年'+liuNian.gz,'当前流月'+liuYue.gz],
      risks:dayStrong?['身强需防过刚易折','注意比劫夺财']:[`身弱需防压力过重`,`注意官杀克身`],
      doAct:[`顺${yongShen}方向决策`,dayStrong?'宜泄宜克宜财':'宜生宜扶'],
      dontAct:dayStrong?['忌再助身(印比)']:['忌耗泄太过'],
      signals:[`日主${dayGan}${dayWx}`,`强弱：${dayStrong?'强':'弱'}`,`用神：${yongShen}`,`大运起运${daYunStartAge.toFixed(1)}岁`,`格局：${geJu.name}`,`喜忌：喜${xi.join('、')}/忌${ji.join('、')}`],
      env:`月令${bz.month.zhi}(${ZHI_WX[bz.month.zhiIdx]})为令，定日主衰旺`,
      reviewDays:30,
      note:note,
      sources:[
        {type:'rule',desc:'八字以立春为年界、节令为月界（《渊海子平》）'},
        {type:'rule',desc:'十神以日干为我，论其余干支'},
        {type:'rule',desc:'藏干按地支所藏天干计算'},
        {type:'rule',desc:`日主强弱：${dayStrong?'偏强':'偏弱'}，用神参考${yongShen}`},
        {type:'rule',desc:`大运：${gender==='男'?'男命':'女命'}，年干${bz.year.gan}，${daYunForward?'顺排':'逆排'}`},
        {type:'rule',desc:`格局（《子平真诠》月令透干定格）：${geJu.name}——${geJu.method}`},
        {type:'rule',desc:`纳音：年${naYin['年柱']}、月${naYin['月柱']}、日${naYin['日柱']}、时${naYin['时柱']}`},
        {type:'rule',desc:`神煞：天乙${guiRen.join('/')}、文昌${wenChang}、驿马${yiMa}、桃花${taoHua}、羊刃${yangRen}、空亡${kongWang.join('/')}`},
        {type:'rule',desc:`胎元${taiYuan.gz}、命宫${mingGong.gz}、身宫${shenGong.gz}（五虎遁定干）`},
        {type:'rule',desc:`刑冲合害：${xingChong.summary}`},
        {type:'rule',desc:`喜忌神：${reason}；${tiaoHouDesc}`},
        {type:'rule',desc:note}
      ]
    };
    return{name:'八字',result:{pillars,dayGan,dayWx,wxCount,wxCountAll,dayStrong,yongShen,wxStr,daYun:daYunEnriched,daYunStartAge,daYunForward,liuNian,liuYue,unknownHour,note,birthDate:date,zhenTaiyang:!!birthInfo.zhenTaiyang,zhenTaiyangNote:zhenNote||undefined,shenSha,shenShaInPillars,naYin,taiYuan,mingGong,shenGong,geJu,xingChong,xiJi},plain};
  }
  function computeDaYun(birthDate,gender,yearGan,monthGzIdx){
    // 阳年：甲丙戊庚壬；阴年：乙丁己辛癸
    const yangGan=['甲','丙','戊','庚','壬'].includes(yearGan);
    const forward=(gender==='男'&&yangGan)||(gender==='女'&&!yangGan);
    // 节列表（12个节，按公历年内顺序）
    const jieIdx=[2,4,6,8,10,12,14,16,18,20,22,0]; // 立春、惊蛰、清明、立夏、芒种、小暑、立秋、白露、寒露、立冬、大雪、小寒
    // 找相邻节
    const y=birthDate.getFullYear();
    let target=null,diffDays=0;
    const allJie=[];
    [y-1,y,y+1].forEach(yy=>{
      jieIdx.forEach(n=>{allJie.push({date:Lunar.sTermDate(yy,n),n});});
    });
    allJie.sort((a,b)=>a.date-b.date);
    for(let i=0;i<allJie.length;i++){
      if(forward){
        if(allJie[i].date>birthDate){target=allJie[i].date;diffDays=(target-birthDate)/86400000;break;}
      }else{
        if(allJie[i].date>birthDate&&i>0){target=allJie[i-1].date;diffDays=(birthDate-target)/86400000;break;}
      }
    }
    if(!target){target=allJie[allJie.length-1].date;diffDays=Math.abs((target-birthDate)/86400000);}
    const startAgeBase=diffDays/3; // 三天折一岁
    const birthYear=birthDate.getFullYear();
    const dy=[];
    let curIdx=monthGzIdx;
    for(let i=0;i<8;i++){
      const startAge=Math.round((startAgeBase+i*10)*10)/10;
      const startYear=birthYear+Math.round(startAge); // 起运公元年份
      curIdx=((curIdx%60)+60)%60;
      dy.push({gz:Lunar.gzFromIndex(curIdx),startAge,startYear,index:curIdx});
      curIdx=forward?curIdx+1:curIdx-1;
    }
    return{forward,startAge:Math.round(startAgeBase*10)/10,pillars:dy};
  }
  // 已移除基于当前时间的实时八字。八字必须基于真实出生信息，通过 baZiByBirth 使用。
  function baZi(date){
    return {name:'八字',result:null,error:'八字需基于真实出生日期排盘，不支持实时起卦',plain:{state:'八字不支持以当前时间起盘，请在「命理排盘」或问事向导中填写真实出生信息。',tendency:'不可用',opps:[],risks:[],doAct:['使用出生日期排盘'],dontAct:['以当前时间当八字用'],signals:['需真实生辰'],env:'',reviewDays:0,sources:[{type:'rule',desc:'八字必须以真实出生年月日时排盘'}]}};
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

  // ============ 奇门遁甲（qimendunjia-standalone 离线排盘）============
  const QIMEN_GOD_WX={值符:'土',腾蛇:'火',太阴:'金',六合:'木',白虎:'金',玄武:'水',九地:'土',九天:'金'};
  const QIMEN_STAR_WX={天蓬:'水',天任:'土',天冲:'木',天辅:'木',天英:'火',天芮:'土',天柱:'金',天心:'金',禽芮:'土'};
  const QIMEN_GATE_WX={休门:'水',生门:'土',伤门:'木',杜门:'木',景门:'火',死门:'土',惊门:'金',开门:'金'};
  const QIMEN_SCENE={
    '感情关系':{targets:['六合','天乙','休门'],opps:['看六合宫与乙庚关系','天乙生用神则对方有情','休门旺相主感情和谐'],risks:['白虎/玄武入感情宫主口舌或隐瞒','死门主关系停滞'],do:['真诚沟通','观察对方态度','创造相处机会'],dont:['冲动表白','冷战','疑神疑鬼']},
    '事业合作':{targets:['开门','值符','日干'],opps:['开门旺相利事业','值符生用神得上级助','日干乘吉神利我方'],risks:['惊门主是非变动','白虎主压力竞争','空亡主机会不实'],do:['明确目标','借助贵人','稳步推进'],dont:['独断专行','轻信口头承诺','急于求成']},
    '学习考试':{targets:['天辅','杜门','日干'],opps:['天辅生用神利文运','杜门旺主专注','景门旺主文书利'],risks:['惊门动主分心','玄武主迷糊'],do:['制定计划','专注基础','查漏补缺'],dont:['临时抱佛脚','贪多嚼不烂']},
    '出行移动':{targets:['九天','马星','日干'],opps:['九天主远行顺利','开门旺相利出行','日干旺动身吉'],risks:['白虎主旅途阻滞','天蓬主风险','空亡主延误'],do:['提前规划','检查交通','保持联络'],dont:['疲劳驾驶','临时改道','夜间独行']},
    '签约交易':{targets:['开门','日干','时干'],opps:['开门旺相利签约','日干时干相生主双方和合','值符临宫主有贵人'],risks:['惊门主合同纠纷','玄武主欺诈','空亡主签约无效'],do:['逐条核对','保留证据','选择吉时'],dont:['冲动签约','口头承诺','忽视违约责任']},
    '人际沟通':{targets:['六合','日干','时干'],opps:['六合主和合','日干生时干主我方能推动','太阴主暗中得助'],risks:['腾蛇主口舌纠缠','白虎主冲突','玄武主隐瞒'],do:['换位思考','委婉表达','寻找共同利益'],dont:['指责对方','激化矛盾','背后议论']},
    '财务决策':{targets:['生门','甲子戊','日干'],opps:['生门旺相主财源','戊+生门利投资','日干生门主我能得财'],risks:['天乙（庚金）克用神主破财','空亡主财落空','玄武主被骗'],do:['稳健理财','分散风险','见好就收'],dont:['冲动投资','借贷冒险','贪图暴利']},
    '健康倾向':{targets:['天芮','日干','时干'],opps:['天芮受制主病轻','日干旺主体质可恢复','天心/乙奇主医药有效'],risks:['天芮旺而无制主病重','死门主病程缠绵','白虎主急症'],do:['及早就医','调整作息','饮食清淡'],dont:['讳疾忌医','过度劳累','乱服药物']},
    '失物寻找':{targets:['时干','日干','玄武'],opps:['时干生用神主可寻','玄武退主失物自现','生门旺主可得'],risks:['时干空亡主难寻','玄武旺主被盗窃','死门主已损坏'],do:['回忆最后位置','扩大搜索','询问周边'],dont:['拖延不报','随意放弃','轻信陌生人']},
    '二选一决策':{targets:['日干','时干','值符'],opps:['比较用神旺衰','看值符倾向','参考开门/生门'],risks:['两宫皆衰主皆不利','空亡宫选项多落空'],do:['列出优劣','听取建议','小步验证'],dont:['凭感觉决断','忽视关键风险','反复无常']},
    '其他':{targets:['值符','日干','时干'],opps:['值符为事体','日干为我','时干为事'],risks:['用神入墓/空亡主无力','凶星克用神主有阻'],do:['稳扎稳打','审时度势','顺势而为'],dont:['逆势而为','贸然行动','犹豫不决']}
  };
  // 九宫标准排布（洛书数）：4 9 2 / 3 5 7 / 8 1 6
  const QIMEN_LAYOUT=[[4,9,2],[3,5,7],[8,1,6]];
  function qimenDunJia(date,questionType){
    questionType=questionType||'其他';
    const Q=(typeof window!=='undefined'&&window.QimenDunJia)?window.QimenDunJia:(typeof global!=='undefined'&&global.QimenDunJia?global.QimenDunJia:null);
    if(!Q||!Q.calculate)return{name:'奇门遁甲',result:{error:'奇门遁甲排盘库未加载'},plain:{state:'奇门遁甲排盘库未加载',tendency:'不可用',opps:['请检查 js/vendor/qimendunjia-standalone.min.js 是否加载'],risks:[],doAct:[],dontAct:[],signals:['库缺失'],env:'',reviewDays:0,sources:[{type:'rule',desc:'需要 qimendunjia-standalone 排盘库'}]}};
    const r=Q.calculate(date,{method:'时家',type:'三元'});
    if(r.error)return{name:'奇门遁甲',result:{error:r.message||'排盘失败'},plain:{state:'奇门遁甲排盘失败',tendency:'不可用',opps:[],risks:[r.message||'排盘异常'],doAct:['请检查时间是否有效'],dontAct:[],signals:[r.message||'异常'],env:'',reviewDays:0,sources:[]}};
    // 构建九宫数据（按洛书布局）
    const palaces=[];
    QIMEN_LAYOUT.forEach((row,ri)=>{
      row.forEach((num,ci)=>{
        const key=String(num);
        const base=(r.raw.diPan&&r.raw.diPan[key])||'';
        const tianpan=(r.raw.tianPan&&r.raw.tianPan[key])||'';
        const star=(r.raw.jiuXing&&r.raw.jiuXing[key])||'';
        const gate=(r.raw.baMen&&r.raw.baMen[key])||'';
        const god=(r.raw.baShen&&r.raw.baShen[key])||'';
        const anGan=(r.raw.anGan&&r.raw.anGan[key])||'';
        palaces.push({num,key,row:ri,col:ci,base,tianpan,star,gate,god,anGan,wx:{god:QIMEN_GOD_WX[god]||'',star:QIMEN_STAR_WX[star]||'',gate:QIMEN_GATE_WX[gate]||''}});
      });
    });
    const info=r.info;
    const scene=QIMEN_SCENE[questionType]||QIMEN_SCENE['其他'];
    // 找用神宫：优先取第一个 target 对应的宫
    const targetMap={值符:'值符',天乙:'天心',六合:'六合',天辅:'天辅',开门:'开门',生门:'生门',休门:'休门',杜门:'杜门',景门:'景门',死门:'死门',惊门:'惊门',伤门:'伤门',天芮:'天芮',甲子戊:'戊',日干:info.siZhu.day[0],时干:info.siZhu.time[0]};
    let targetPal=null,targetName='';
    for(const t of scene.targets){
      const tk=targetMap[t]||t;
      targetPal=palaces.find(p=>{
        if(t==='日干')return p.tianpan.includes(tk)||p.base.includes(tk);
        if(t==='时干')return p.tianpan.includes(tk)||p.base.includes(tk);
        if(t==='甲子戊')return p.base.includes('戊')||p.tianpan.includes('戊');
        return p.star===tk||p.gate===tk||p.god===tk||p.tianpan.includes(tk)||p.base.includes(tk);
      });
      if(targetPal){targetName=t;break;}
    }
    const dayGan=info.siZhu.day[0],timeGan=info.siZhu.time[0];
    const dayPal=palaces.find(p=>p.tianpan.includes(dayGan)||p.base.includes(dayGan));
    const timePal=palaces.find(p=>p.tianpan.includes(timeGan)||p.base.includes(timeGan));
    const targetGateWx=targetPal?targetPal.wx.gate:'';
    const dayGateWx=dayPal?dayPal.wx.gate:'';
    let relation='';
    if(targetGateWx&&dayGateWx){
      if(targetGateWx===dayGateWx)relation='比和';
      else if(wxSheng(dayGateWx,targetGateWx))relation='日生生门（用神），得助';
      else if(wxKe(dayGateWx,targetGateWx))relation='日克用神，可控';
      else if(wxSheng(targetGateWx,dayGateWx))relation='用神生日干，泄气';
      else if(wxKe(targetGateWx,dayGateWx))relation='用神克日干，受制';
    }
    const targetStar=targetPal?targetPal.star:'';
    const targetGod=targetPal?targetPal.god:'';
    const opps=[...scene.opps];
    if(targetPal)opps.unshift(`${targetName}落${targetPal.key}宫（${targetPal.god}·${targetPal.star}·${targetPal.gate}）`);
    const risks=[...scene.risks];
    if(targetPal && (targetPal.god==='白虎'||targetPal.god==='玄武'))risks.unshift(`${targetPal.god}临用神宫，需防${targetPal.god==='白虎'?'压力冲突':'欺瞒暗算'}`);
    if(targetPal && !targetPal.tianpan && !targetPal.star)risks.unshift('用神宫空亡，力量不实');
    const plain={
      state:`奇门遁甲时家排盘：${info.jieqi}，${info.ju}，值符${info.fu.replace('值符：','')}，值使${info.shi.replace('值使：','')}。问「${questionType}」以${targetName||scene.targets[0]}为用神${targetPal?'，落'+targetPal.key+'宫':'（未明显落宫）'}。`,
      tendency:relation.includes('得助')||relation.includes('比和')?'宜主动':(relation.includes('受制')||relation.includes('泄气')?'宜谨慎':'宜观察'),
      opps:opps,
      risks:risks,
      doAct:[...scene.do],
      dontAct:[...scene.dont],
      signals:[
        `局：${info.ju}`,
        `值符：${info.fu}`,
        `值使：${info.shi}`,
        `空亡：${info.kong}`,
        `用神：${targetName||'—'}`,
        `用神宫：${targetPal?targetPal.key+'宫':'—'}`,
        `日干${dayGan}落${dayPal?dayPal.key+'宫':'—'}`,
        `时干${timeGan}落${timePal?timePal.key+'宫':'—'}`,
        `日用神关系：${relation||'—'}`
      ],
      env:`四柱 ${info.siZhu.year} ${info.siZhu.month} ${info.siZhu.day} ${info.siZhu.time}，旬首 ${info.xunshou}。九宫排布以洛书数为准，中五宫寄坤二宫。`,
      reviewDays:30,
      sources:[
        {type:'rule',desc:'奇门遁甲以二十四节气定局，拆补/置闰/茅山法起局数'},
        {type:'rule',desc:`当前局：${info.jieqi} ${info.ju}，值符${info.fu}，值使${info.shi}`},
        {type:'rule',desc:`空亡：${info.kong}，旬首：${info.xunshou}`},
        {type:'rule',desc:`用神规则：${questionType}→${scene.targets.join('/')}`},
        {type:'rule',desc:`日干${dayGan}落${dayPal?dayPal.key+'宫':'—'}，时干${timeGan}落${timePal?timePal.key+'宫':'—'}`}
      ]
    };
    return{name:'奇门遁甲',result:{info,palaces,dayPal,timePal,targetPal,targetName,relation,questionType},plain};
  }

  // ============ 紫微斗数（iztro 离线排盘 + 基础解读）============
  const ZW_STAR_HINTS={
    '紫微':{tend:'宜稳健把握',opp:'发挥领导与统筹能力',risk:'期望过高或过于固执',do:'制定中长期计划',dont:'独断专行'},
    '天府':{tend:'宜守成积累',opp:'稳健守成，善于管理资源',risk:'保守错过变化时机',do:'巩固既有基础',dont:'过度囤积、回避改变'},
    '天相':{tend:'宜协调沟通',opp:'重视协调与形象',risk:'顾虑过多、优柔寡断',do:'借助团队与规则推进',dont:'为面子而勉强'},
    '天梁':{tend:'宜守成助人',opp:'善于照顾与指导他人',risk:'承担过多责任',do:'稳步帮助他人',dont:'过度干涉'},
    '廉贞':{tend:'宜明辨取舍',opp:'情感细腻、原则性强',risk:'情绪起伏影响判断',do:'分清主次再行动',dont:'感情用事'},
    '七杀':{tend:'宜主动求变',opp:'行动力强、敢于突破',risk:'冲动带来波动',do:'把握关键节点果断推进',dont:'盲目冒进'},
    '破军':{tend:'宜破旧立新',opp:'开创力强、不惧变化',risk:'变动过大导致不稳',do:'在必要处革新',dont:'为变而变'},
    '贪狼':{tend:'宜灵活应变',opp:'多才多艺、善于交际',risk:'欲望分散、定力不足',do:'聚焦核心目标',dont:'贪多求全'},
    '太阳':{tend:'宜积极表达',opp:'热情外向、乐于助人',risk:'过度付出或锋芒太露',do:'主动沟通、公开表达',dont:'强出头'},
    '巨门':{tend:'宜深入沟通',opp:'洞察力强、善于分析',risk:'口舌是非或过度猜疑',do:'以事实为依据表达',dont:'暗箭伤人'},
    '天机':{tend:'宜思考观察',opp:'机敏灵活、善谋划',risk:'思虑过多、行动迟缓',do:'调研后再决策',dont:'反复犹豫'},
    '武曲':{tend:'宜务实理财',opp:'务实坚韧、重视效率',risk:'过于刚硬、忽视人情',do:'踏实推进具体事务',dont:'唯利是图'},
    '天同':{tend:'宜柔和顺势',opp:'性情温和、易得贵人',risk:'安逸懒散、逃避冲突',do:'以和为贵、顺势而为',dont:'一味退让'},
    '太阴':{tend:'宜内敛筹划',opp:'细腻周到、善于储备',risk:'多虑内向、行动不足',do:'幕后规划、稳健执行',dont:'封闭消极'}
  };
  function ziWeiDouShu(birthInfo){
    if(!window.iztro || !window.iztro.astro || (!window.iztro.astro.bySolar && !window.iztro.astro.byLunar))return null;
    const info=birthInfo||{};
    let d=info.date;
    if(!d)return null;
    if(!(d instanceof Date))d=new Date(d);
    if(isNaN(d.getTime()))return null;
    // iztro 的 timeIndex：0=早子(00:00-01:00),1=丑,...,11=亥,12=晚子(23:00-24:00)
    // 本地 Lunar.getShiChen 的 idx：0=子时(合并早晚子),1=丑,...,11=亥
    // 修复原 sc.index+1 的系统性错位（曾导致所有紫微排盘按下一时辰排，命宫身宫主星整体错位）
    const sc=Lunar.getShiChen(d);
    let timeIndex=1; // fallback 丑时
    if(sc&&typeof sc.index==='number'){
      const h=d.getHours();
      if(sc.index===0){
        timeIndex=(h>=23)?12:0; // 23:00-23:59→晚子(12)；00:00-00:59→早子(0)
      }else{
        timeIndex=sc.index;     // 丑(1)…亥(11) 与 iztro 一一对应
      }
    }
    const gender=info.gender==='女'?'女':'男';
    try{
      let astrolabe;
      let solarDate=`${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
      // 农历路径：若 info.calendar==='lunar' 且提供 lunarDateStr，走 iztro.byLunar
      if(info.calendar==='lunar' && window.iztro.astro.byLunar && info.lunarDateStr){
        // lunarDateStr 格式 "YYYY-M-D"，isLeap=info.isLeapMonth||false
        astrolabe=window.iztro.astro.byLunar(info.lunarDateStr,timeIndex,gender,!!info.isLeapMonth,'zh-CN');
        solarDate='农历 '+info.lunarDateStr+(info.isLeapMonth?'(闰)':'');
      }else{
        astrolabe=window.iztro.astro.bySolar(solarDate,timeIndex,gender,true,'zh-CN');
      }
      const soulPalace=astrolabe.palace('命宫');
      const bodyPalace=astrolabe.palace('身宫');
      const majorNames=soulPalace&&soulPalace.majorStars?soulPalace.majorStars.map(s=>s.name).filter(Boolean):[];
      const palaceName=soulPalace?soulPalace.name:'命宫';
      const bodyName=bodyPalace?bodyPalace.name:'身宫';
      const opps=[], risks=[], doAct=[], dontAct=[];
      let tendency='宜观察学习';
      majorNames.forEach(star=>{
        const h=ZW_STAR_HINTS[star];
        if(h){tendency=h.tend;opps.push(h.opp);risks.push(h.risk);doAct.push(h.do);dontAct.push(h.dont);}
      });
      if(!opps.length)opps.push('观察命宫与身宫星曜组合，理解自身倾向');
      risks.push('单一命宫论断有限，需结合现实判断');
      doAct.push('用于自我觉察与文化研习');
      doAct.push('重大决定请结合现实信息');
      dontAct.push('不用于医疗、法律、投资等决策');
      dontAct.push('不迷信单一星曜论断');

      // ===== 运限（大限/流年/流月）与四化 =====
      // 基于"当前时间"查询运限；优先调用 iztro 的 astrolabe.horoscope 接口，
      // 接口异常或字段缺失时回退到本地规则（五行局起运 + 流年地支定宫）。
      const nowZW=new Date();
      const nowStr=`${nowZW.getFullYear()}-${nowZW.getMonth()+1}-${nowZW.getDate()}`;
      const palacesArr=astrolabe.palaces||[];
      const majorNamesOf=p=>(p&&p.majorStars?p.majorStars.map(s=>s.name).filter(Boolean):[]);

      // 生年天干（用于生年四化）：优先取八字年干，回退到星盘 chineseDate
      let birthYearGan='';
      try{ birthYearGan=((Lunar.getBaZi(d).year)||{}).gan||''; }catch(_){}
      if(!birthYearGan && astrolabe.rawDates && astrolabe.rawDates.chineseDate && astrolabe.rawDates.chineseDate.yearly){
        birthYearGan=astrolabe.rawDates.chineseDate.yearly[0]||'';
      }

      // 生年天干四化表：[化禄,化权,化科,化忌] 对应星名
      const SIHUA_TABLE={
        '甲':['廉贞','破军','武曲','太阳'],
        '乙':['天机','天梁','紫微','太阴'],
        '丙':['天同','天机','文昌','廉贞'],
        '丁':['太阴','天同','天机','巨门'],
        '戊':['贪狼','太阴','右弼','天机'],
        '己':['武曲','贪狼','天梁','文曲'],
        '庚':['太阳','武曲','太阴','天同'],
        '辛':['巨门','太阳','文曲','文昌'],
        '壬':['天梁','紫微','左辅','武曲'],
        '癸':['破军','巨门','太阴','贪狼']
      };
      const SIHUA_TYPES=['化禄','化权','化科','化忌'];
      // 星名→所在宫名 索引（主/辅/杂星皆纳入，用于四化落宫查找）
      const starToPalace={};
      palacesArr.forEach(p=>{
        [].concat(p.majorStars||[],p.minorStars||[],p.adjectiveStars||[]).forEach(s=>{
          if(s&&s.name && !starToPalace[s.name]) starToPalace[s.name]=p.name;
        });
      });
      // 解析五行局起运岁：水二/木三/金四/土五/火六 局
      const juM=(astrolabe.fiveElementsClass||'').match(/([二三四五六])局/);
      const juStartAge=juM?({二:2,三:3,四:4,五:5,六:6}[juM[1]]||0):0;

      let decadal=null,yearly=null,monthly=null;
      // 1) 优先用 iztro horoscope 接口（首参为日期字符串 'YYYY-M-D'）
      try{
        if(typeof astrolabe.horoscope==='function'){
          const h=astrolabe.horoscope(nowStr,'decadal');
          if(h && h.decadal){
            const dp=palacesArr[h.decadal.index]||{};
            const rng=(dp.decadal&&dp.decadal.range)||[null,null];
            decadal={palaceIndex:h.decadal.index,palaceName:dp.name||'',heavenlyStem:h.decadal.heavenlyStem||'',earthlyBranch:h.decadal.earthlyBranch||'',ageRange:rng,startAge:rng[0],endAge:rng[1],stars:majorNamesOf(dp),juStartAge};
          }
          if(h && h.yearly){
            const yp=palacesArr[h.yearly.index]||{};
            yearly={palaceIndex:h.yearly.index,palaceName:yp.name||'',heavenlyStem:h.yearly.heavenlyStem||'',earthlyBranch:h.yearly.earthlyBranch||'',yearlyGanZhi:(h.yearly.heavenlyStem||'')+(h.yearly.earthlyBranch||''),stars:majorNamesOf(yp)};
          }
          if(h && h.monthly){
            const mp=palacesArr[h.monthly.index]||{};
            monthly={palaceIndex:h.monthly.index,palaceName:mp.name||'',heavenlyStem:h.monthly.heavenlyStem||'',earthlyBranch:h.monthly.earthlyBranch||'',stars:majorNamesOf(mp)};
          }
        }
      }catch(_e){ /* 接口异常，走规则回退 */ }

      // 2) 回退：以规则自行计算
      if(!decadal||!yearly){
        const nominalAge=nowZW.getFullYear()-d.getFullYear()+1;
        if(!decadal){
          const dp=palacesArr.find(p=>p.decadal&&p.decadal.range&&nominalAge>=p.decadal.range[0]&&nominalAge<=p.decadal.range[1]);
          if(dp) decadal={palaceIndex:dp.index,palaceName:dp.name||'',heavenlyStem:dp.heavenlyStem||'',earthlyBranch:dp.earthlyBranch||'',ageRange:dp.decadal.range,startAge:dp.decadal.range[0],endAge:dp.decadal.range[1],stars:majorNamesOf(dp),juStartAge};
        }
        if(!yearly){
          try{
            const ly=(Lunar.getBaZi(nowZW).year)||{};
            const yp=palacesArr.find(p=>p.earthlyBranch===ly.zhi);
            if(yp) yearly={palaceIndex:yp.index,palaceName:yp.name||'',heavenlyStem:yp.heavenlyStem||'',earthlyBranch:yp.earthlyBranch||'',yearlyGanZhi:(ly.gan||'')+(ly.zhi||''),stars:majorNamesOf(yp)};
          }catch(_){}
        }
      }

      // 3) 四化：iztro majorStars.mutagen 为空时，按生年天干自行推算
      let siHua=null;
      if(birthYearGan && SIHUA_TABLE[birthYearGan]){
        const s4=SIHUA_TABLE[birthYearGan];
        siHua={
          生年:birthYearGan,
          化禄:s4[0],化权:s4[1],化科:s4[2],化忌:s4[3],
          byPalace:SIHUA_TYPES.map((t,i)=>({palace:starToPalace[s4[i]]||'',star:s4[i],type:t}))
        };
      }

      const plain={
        state:`紫微斗数排盘：命宫在${palaceName}，主星 ${majorNames.join('、')||'无主星'}；身宫在${bodyName}。五行局 ${astrolabe.fiveElementsClass||'未知'}。`,
        tendency:tendency,
        opps:opps,
        risks:risks,
        doAct:doAct,
        dontAct:dontAct,
        signals:[
          `命宫：${palaceName}`,
          `命主：${astrolabe.soul||'未知'}`,
          `身主：${astrolabe.body||'未知'}`,
          `主星：${majorNames.join('、')||'无'}`,
          `大限：${decadal?`${decadal.palaceName}(${decadal.heavenlyStem}${decadal.earthlyBranch}) ${decadal.startAge}-${decadal.endAge}岁`:'未知'}`,
          `流年：${yearly?`${yearly.yearlyGanZhi} ${yearly.palaceName}(${yearly.heavenlyStem}${yearly.earthlyBranch})`:'未知'}`,
          `四化：${siHua?`化禄${siHua.化禄}·化权${siHua.化权}·化科${siHua.化科}·化忌${siHua.化忌}`:'未知'}`
        ],
        env:`出生时间 ${solarDate} ${astrolabe.time||''}，${info.zhenTaiyang?'已启用真太阳时校正':''}`,
        reviewDays:60,
        sources:[
          {type:'rule',desc:'紫微斗数以出生年月日时排布十二宫'},
          {type:'rule',desc:'命宫所在地支决定命主，身宫反映后天发展'},
          {type:'rule',desc:'主星特性提供倾向参考，不做深度断盘'},
          {type:'rule',desc:`大限以五行局定起运岁（${astrolabe.fiveElementsClass||'未知'}${juStartAge?'，'+juStartAge+'岁起运':''}），每限十年，自命宫阳男阴女顺行、阴男阳女逆行`},
          {type:'rule',desc:'流年以流年地支定所在宫位，流年天干定流年四化'},
          {type:'rule',desc:`生年四化按生年天干（${birthYearGan||'未知'}）：甲廉破武阳、乙机梁紫阴、丙同机昌廉、丁阴同机巨、戊贪阴右机、己武贪梁曲、庚阳武阴同、辛巨阳曲昌、壬梁紫左武、癸破巨阴贪`}
        ]
      };
      return{name:'紫微斗数',result:{astrolabe,soulPalace:palaceName,bodyPalace:bodyName,majorStars:majorNames,solarDate,timeIndex,decadal,yearly,monthly,siHua},plain};
    }catch(e){
      return{name:'紫微斗数',result:null,error:String(e.message||e),plain:{state:'紫微斗数排盘失败',tendency:'不可用',opps:[],risks:['排盘异常'],doAct:['请检查出生时间'],dontAct:[],signals:[String(e.message||e)],env:'',reviewDays:0,sources:[]}};
    }
  }

  // 统一入口
  function compute(name,data){
    // data 可为 Date（旧兼容）或对象 {date, questionType, askInfo, methodInput}
    const isObj=data && typeof data==='object' && !(data instanceof Date);
    const date=isObj?(data.date||new Date()):data;
    const questionType=isObj?(data.questionType||'其他'):'其他';
    const askInfo=isObj?(data.askInfo||{}):{};
    const methodInput=isObj?data.methodInput:'';
    switch(name){
      case '小六壬':return xiaoLiuRen(date,questionType);
      case '梅花易数':{
        let inputType='time',input='';
        if(data && data.inputType){inputType=data.inputType;input=methodInput||'';}
        else if(methodInput){
          if(/^\d+(,\d+)*$/.test(methodInput)){inputType='number';input=methodInput;}
          else if(/[\u4e00-\u9fa5]/.test(methodInput)){inputType='hanzi';input=methodInput;}
          else if(methodInput==='random'){inputType='random';input='';}
        }
        return meiHuaByInput(inputType,input,questionType,date);
      }
      case '六爻':{
        if(askInfo && Array.isArray(askInfo.yaos))return liuYaoByYaos(askInfo.yaos,questionType,askInfo);
        return liuYao(date);
      }
      case '塔罗':return tarot(date,isObj?data.spread:undefined,isObj?data.tarotReverse:undefined);
      case '八字':{
        if(askInfo && askInfo.birthInfo)return baZiByBirth(askInfo.birthInfo);
        // 八字不再支持无出生信息的实时起盘
        return null;
      }
      case '紫微斗数':{
        if(askInfo && askInfo.birthInfo)return ziWeiDouShu(askInfo.birthInfo);
        return null;
      }
      case '奇门遁甲':return qimenDunJia(date,questionType);
      default:return null;
    }
  }

  global.ShuShu={compute,xiaoLiuRen,meiHua,meiHuaByInput,liuYao,liuYaoByYaos,tarot,baZi,baZiByBirth,ziWeiDouShu,qimenDunJia,XLR_POS,BAGUA,TAROT};
})(window);
