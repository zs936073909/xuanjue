// ai.js — AI 提示词生成 / 离线规则化解读 / 禁止词与敏感问题拦截
(function(global){
  // 禁止输出关键词
  const FORBIDDEN=['必然','一定','必定','百分之百','必死','必发','必复合','必分手','必发财','必破财','必失败','必成功','改命','消灾','化解','破财消灾','求符','法事','诅咒','还阴债'];
  // 敏感问题关键词
  const SENSITIVE={
    selfHarm:['自杀','自残','不想活','了结自己','轻生','想死'],
    medical:['癌症','绝症','肿瘤','能活多久','会不会死','确诊','病情严重'],
    legal:['判几年','会不会坐牢','能不能胜诉','判决','罪名'],
    invest:['能赚多少','收益多少','翻倍','稳赚','保本保息']
  };

  function detectSensitive(text){
    if(!text)return null;
    for(const cat in SENSITIVE){
      for(const kw of SENSITIVE[cat]){
        if(text.includes(kw))return{cat,keyword:kw};
      }
    }
    return null;
  }
  function hasForbidden(text){return FORBIDDEN.filter(w=>text.includes(w));}
  function sanitize(text){
    let t=text;
    FORBIDDEN.forEach(w=>{t=t.replace(new RegExp(w,'g'),'可能');});
    return t;
  }

  const DISCLAIMER='本解读基于传统术数排盘结构化数据生成，仅供个人文化研究、娱乐参考与自我探索，不构成医疗、法律、投资、婚姻、职业等重大决策依据。术数为参考工具，非确定性预测，请结合现实理性判断。';

  const TONES={
    '专业谨慎':'请以专业、审慎的语气解读，多用限定词，强调不确定性。',
    '温和陪伴':'请以温和、共情、陪伴的语气解读，给予鼓励。',
    '直接简洁':'请用简短要点直接解读，不要铺垫。',
    '传统术数':'请用传统术数古风用词解读。',
    '心理探索':'请以心理探索、引导自我觉察的语气解读。'
  };

  // 构建给外部 AI 的提示词
  function buildPrompt(ke,plain,bg,settings){
    const s=settings||{};
    const L=[];
    L.push('# 角色与原则');
    L.push('你是基于大六壬排盘数据进行白话解读的助手。必须遵守：');
    L.push('1. 只基于下方盘面结构化数据解读，不可凭空编造。');
    L.push('2. 每条结论须标注来源：[来源术数|盘面信息|传统规则/AI推断|参考/确定]。');
    L.push('3. 禁止必然性预测、恐吓式结论、改命消灾化解营销、医疗法律投资断言。');
    L.push('4. 敏感问题转建议咨询专业人士。');
    L.push('5. 语气：'+TONES[s.aiTone||'专业谨慎']);
    L.push('');
    L.push('# 用户问题');
    L.push('问题类型：'+(bg.questionType||'其他'));
    L.push('问题标题：'+(bg.title||''));
    if(bg.desc)L.push('问题描述：'+bg.desc);
    if(bg.mood)L.push('当前情绪：'+bg.mood);
    if(bg.urgent)L.push('紧急程度：'+bg.urgent);
    if(bg.hasOption){
      L.push('选项A：'+(bg.optA||''));
      L.push('选项B：'+(bg.optB||''));
    }
    if(bg.persons)L.push('涉及人物：'+bg.persons);
    if(bg.adviceType&&bg.adviceType.length)L.push('希望建议类型：'+bg.adviceType.join('、'));
    L.push('');
    L.push('# 大六壬盘面数据');
    L.push('起课时间：'+(ke.dateStr||''));
    L.push('日干支：'+ke.baZi.day.gz+'　时干支：'+ke.baZi.hour.gz);
    L.push('月将：'+ke.yueJiang.zhi+'　占时：'+ke.zhanShi.zhi);
    L.push('昼夜：'+ke.guiRen.label+'　贵人：'+ke.guiRen.zhi+'（乘'+ke.guiRen.chengShen+'）');
    L.push('空亡：'+Lunar.ZHI[ke.kongWang[0]]+Lunar.ZHI[ke.kongWang[1]]);
    L.push('格局：'+ke.geju.join('、'));
    L.push('');
    L.push('四课：');
    ke.lessons.forEach((l,i)=>{
      L.push('  第'+['一','二','三','四'][i]+'课：上 '+Lunar.ZHI[l.up]+'('+l.upTJ+') 下 '+l.downLabel+'('+Lunar.ZHI[l.down]+')');
    });
    L.push('三传：');
    const sc=ke.sanChuan;
    L.push('  初传：'+sc.chu.zhi+'（'+sc.chu.tj+'，'+sc.chu.wx+'）');
    L.push('  中传：'+sc.zhong.zhi+'（'+sc.zhong.tj+'，'+sc.zhong.wx+'）');
    L.push('  末传：'+sc.mo.zhi+'（'+sc.mo.tj+'，'+sc.mo.wx+'）');
    L.push('三传取法：'+sc.method);
    L.push('类神：'+ke.leishenName+'（乘'+(ke.leishenShen!==null?Lunar.ZHI[ke.leishenShen]:'—')+'）');
    L.push('神煞：驿马'+ke.shenSha.yima+' 桃花'+ke.shenSha.taohua+' 华盖'+ke.shenSha.huagai+' 太岁'+ke.shenSha.taiSui+' 月建'+ke.shenSha.yueJian);
    L.push('');
    L.push('# 规则化盘面摘要（供参考，需复核）');
    L.push('倾向：'+plain.tendency);
    if(plain.opps.length)L.push('机会：'+plain.opps.join('；'));
    if(plain.risks.length)L.push('风险：'+plain.risks.join('；'));
    L.push('环境/对方：'+plain.env);
    L.push('');
    L.push('# 输出要求（10 段）');
    L.push('1. 一句话参考（≤40字，不含绝对断言）');
    L.push('2. 总体倾向（宜主动/等待/谨慎/沟通/观察）');
    L.push('3. 主要机会（2-4条）');
    L.push('4. 主要风险（2-4条）');
    L.push('5. 对方/环境状态');
    L.push('6. 建议行动（可执行）');
    L.push('7. 不建议行动');
    L.push('8. 观察信号');
    L.push('9. 复盘时间建议');
    L.push('10. 免责声明');
    L.push('每条结论后附来源标注。');
    return L.join('\n');
  }

  // 离线规则化解读（10 段，标注来源）
  function generateAI(ke,plain,bg,settings){
    const segs=[];
    const S=(t,src,type)=>`<span class="source-tag ${type}">${src}</span>`;
    // 1 一句话
    segs.push({t:'一句话参考',c:plain.state,tag:S('大六壬·三传','rule')});
    // 2 倾向
    segs.push({t:'总体倾向',c:plain.tendency,tag:S('初末传天将','rule')});
    // 3 机会
    segs.push({t:'主要机会',c:plain.opps.length?plain.opps.map(o=>`· ${o}`).join('<br>'):'暂无明显机会信号',tag:S('天将+类神','rule')});
    // 4 风险
    segs.push({t:'主要风险',c:plain.risks.length?plain.risks.map(r=>`· ${r}`).join('<br>'):'暂无明显风险信号',tag:S('空亡+天将+格局','rule')});
    // 5 环境
    segs.push({t:'对方/环境状态',c:plain.env,tag:S('日支课','rule')});
    // 6 建议行动
    segs.push({t:'建议行动',c:plain.doAct.map(d=>`· ${d}`).join('<br>'),tag:S('盘面倾向','ai')});
    // 7 不建议
    segs.push({t:'不建议行动',c:plain.dontAct.map(d=>`· ${d}`).join('<br>'),tag:S('盘面风险','ai')});
    // 8 观察信号
    segs.push({t:'观察信号',c:plain.signals.map(s=>`· ${s}`).join('<br>'),tag:S('三传+神煞','rule')});
    // 9 复盘时间
    const rd=new Date(Date.now()+plain.reviewDays*86400000);
    segs.push({t:'复盘时间建议',c:`约 ${plain.reviewDays} 日后（${rd.getMonth()+1}月${rd.getDate()}日）复盘校准。`,tag:S('经验建议','ai')});
    // 10 免责
    segs.push({t:'免责声明',c:DISCLAIMER,tag:''});
    return segs;
  }

  global.AI={FORBIDDEN,SENSITIVE,DISCLAIMER,detectSensitive,hasForbidden,sanitize,buildPrompt,generateAI};
})(window);
