// ai.js — AI 提示词生成 / 离线规则化解读 / 禁止词与敏感问题拦截 / LLM 调用（OpenAI 兼容协议 + Anthropic 协议）
// 设计原则：
//   1. 用户自带 Key，应用不内置任何密钥。
//   2. 兼容主流开源/商用 LLM 提供商与中转站（OpenAI 协议为事实标准）。
//   3. 系统提示词遵循开源提示词工程最佳实践（角色-规则-示例-格式-约束），无可用开源占卜提示词则自主优化。
//   4. 仅在用户主动调用 LLM 时发起网络请求，应用本身保持离线可用。
(function(global){

  // ============ 1. 禁止词与敏感问题 ============
  const FORBIDDEN=['必然','一定','必定','百分之百','必死','必发','必复合','必分手','必发财','必破财','必失败','必成功','改命','消灾','化解','破财消灾','求符','法事','诅咒','还阴债'];
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
    '专业谨慎':'请以专业、审慎的语气解读，多用限定词（可能、或、倾向于、提示），强调不确定性，避免绝对化措辞。',
    '温和陪伴':'请以温和、共情、陪伴的语气解读，给予鼓励与情感支持，但仍需遵守不确定性原则。',
    '直接简洁':'请用简短要点直接解读，不要铺垫与渲染，每条结论不超过 30 字。',
    '传统术数':'请用传统术数古风用词解读（如"主"、"象"、"取"、"青龙受制"等），但保留来源标注。',
    '心理探索':'请以心理探索、引导自我觉察的语气解读，多提开放性问题引导用户思考。'
  };

  // ============ 2. 提供商预设（baseUrl 仅作默认值，用户可改） ============
  // 兼容性覆盖：开源（Ollama）/ 国内主流 / OpenAI / Anthropic 协议
  const PROVIDERS={
    deepseek :{label:'DeepSeek',           protocol:'openai',    baseUrl:'https://api.deepseek.com/v1',                       model:'deepseek-chat',           models:['deepseek-chat','deepseek-reasoner']},
    qwen     :{label:'通义千问 (DashScope)',protocol:'openai',    baseUrl:'https://dashscope.aliyuncs.com/compatible-mode/v1',model:'qwen-plus',               models:['qwen-turbo','qwen-plus','qwen-max','qwen-long']},
    moonshot :{label:'Kimi (Moonshot)',    protocol:'openai',    baseUrl:'https://api.moonshot.cn/v1',                        model:'moonshot-v1-8k',          models:['moonshot-v1-8k','moonshot-v1-32k','moonshot-v1-128k']},
    zhipu    :{label:'智谱 GLM',           protocol:'openai',    baseUrl:'https://open.bigmodel.cn/api/paas/v4',              model:'glm-4-flash',             models:['glm-4-flash','glm-4','glm-4-air','glm-4-long']},
    lingyi   :{label:'零一万物 (Yi)',      protocol:'openai',    baseUrl:'https://api.lingyiwanwu.com/v1',                    model:'yi-large',                models:['yi-large','yi-medium','yi-spark']},
    baichuan :{label:'百川 (Baichuan)',    protocol:'openai',    baseUrl:'https://api.baichuan-ai.com/v1',                    model:'Baichuan4',               models:['Baichuan4','Baichuan3-Turbo']},
    minimax  :{label:'MiniMax',            protocol:'openai',    baseUrl:'https://api.minimax.chat/v1',                       model:'abab6.5-chat',            models:['abab6.5-chat','abab6-chat']},
    stepfun  :{label:'阶跃星辰 (Step)',    protocol:'openai',    baseUrl:'https://api.stepfun.com/v1',                        model:'step-1-8k',               models:['step-1-8k','step-1-32k','step-1-128k','step-2-16k']},
    ollama   :{label:'Ollama (本地开源)',  protocol:'openai',    baseUrl:'http://localhost:11434/v1',                         model:'qwen2.5:7b',              models:['qwen2.5:7b','llama3.1:8b','deepseek-r1:7b','glm4:9b']},
    openai   :{label:'OpenAI',             protocol:'openai',    baseUrl:'https://api.openai.com/v1',                         model:'gpt-4o-mini',             models:['gpt-4o-mini','gpt-4o','gpt-4-turbo','gpt-3.5-turbo']},
    claude   :{label:'Anthropic Claude',   protocol:'anthropic', baseUrl:'https://api.anthropic.com/v1',                      model:'claude-3-5-haiku-20241022',models:['claude-3-5-haiku-20241022','claude-3-5-sonnet-20241022','claude-3-opus-20240229']},
    custom   :{label:'自定义 / 中转站',    protocol:'openai',    baseUrl:'',                                                  model:'',                        models:[]}
  };

  // ============ 3. 系统提示词（开源最佳实践 + 自主优化） ============
  // 参考：Anthropic/LangChain 提示词工程规范，无可用开源占卜专用提示词，自主优化至详细级别。
  function buildSystemPrompt(settings){
    const s=settings||{};
    const tone=TONES[s.aiTone||'专业谨慎'];
    const len=s.aiLength||'标准';
    const lenHint=len==='简短'?'输出精简，每个段落不超过 60 字。':(len==='详细'?'可适度展开，每个段落可至 150 字，但保持结构清晰。':'保持适中长度，每个段落不超过 100 字。');
    return [
      '# 角色',
      '你是「玄决」术数决策辅助系统的解读引擎。你基于中国传统术数（大六壬、梅花易数、六爻、塔罗、八字等）的排盘结构化数据进行白话解读，帮助用户将抽象盘面转化为可参考的决策线索。',
      '',
      '# 核心原则（必须严格遵守）',
      '1. **仅基于盘面数据解读**：只使用下方提供的结构化盘面数据（天盘地支、四课、三传、神煞、卦象、五行等）。严禁凭空编造未给出的盘面信息或命运断言。',
      '2. **来源标注**：每条结论后须标注来源，格式：`[来源术数|盘面信息|传统规则/AI推断|参考/确定]`。',
      '   - 示例：`初传寅木乘青龙，主进财之象 [大六壬|初传+天将|传统规则|参考]`',
      '3. **禁止必然性预测**：禁用"必然、一定、必定、百分之百、必死、必发、必复合"等绝对化措辞，改用"可能、或、倾向于、提示、有…之象"等限定词。',
      '4. **禁止恐吓与营销**：不做"必有血光之灾""破财消灾""需做法事化解""需购符咒"等恐吓式或营销式结论。',
      '5. **敏感问题转介专业人士**：涉及自杀自残、医疗诊断、法律判决、投资收益等问题时，明确建议用户咨询医生、律师、心理咨询师或专业财务顾问，并附关怀语句。',
      '6. **多术数融合**：若用户使用多门术数，需指出各术数信号的共性与分歧，给出综合判断（如"大六壬示谨慎、梅花易数示比和、综合建议…"），不可仅罗列。',
      '7. **不确定性强调**：术数为概率性参考工具，非确定性预测。需在结尾免责声明中重申。',
      '',
      '# 解读风格',
      '- 语气：'+tone,
      '- 长度：'+lenHint,
      '- 用词：' + (s.showTerm===false ? '避免专业术语，用日常语言' : '可使用专业术语但需附白话解释'),
      '',
      '# 输出格式（10 段，Markdown）',
      '1. **一句话参考**（≤40 字，不含绝对断言）',
      '2. **总体倾向**（从：宜主动 / 宜等待 / 宜谨慎 / 宜沟通 / 宜观察 中选 1-2 个，并简述理由）',
      '3. **主要机会**（2-4 条，每条附来源标注）',
      '4. **主要风险**（2-4 条，每条附来源标注）',
      '5. **对方/环境状态**（基于日支课或体用关系推断）',
      '6. **建议行动**（具体可执行，2-4 条）',
      '7. **不建议行动**（2-3 条）',
      '8. **观察信号**（用户可观察的现实信号，3-5 条，便于后续复盘校准）',
      '9. **复盘时间建议**（给出建议天数与理由）',
      '10. **免责声明**（必须包含：术数为参考工具、非确定性预测、不构成医疗/法律/投资/婚姻决策依据、敏感问题应咨询专业人士）',
      '',
      '# 反幻觉规则',
      '- 若盘面数据不足以支持某结论，明示"盘面信息不足，难以判断"，不要编造。',
      '- 若多门术数信号矛盾，如实指出矛盾，不可强行调和。',
      '- 不引用盘面未出现的神煞、卦爻、五行生克关系。',
      '',
      '# 最终约束',
      '你的输出将直接展示给用户，请保持专业、克制、有据可循。任何违反上述原则的输出都会误导用户决策。'
    ].join('\n');
  }

  // 构建用户消息（盘面数据 + 用户问题）
  function buildUserPrompt(ke,plain,bg,settings){
    const L=[];
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
    if(plain.opps&&plain.opps.length)L.push('机会：'+plain.opps.join('；'));
    if(plain.risks&&plain.risks.length)L.push('风险：'+plain.risks.join('；'));
    L.push('环境/对方：'+plain.env);
    return L.join('\n');
  }

  // 兼容旧接口：buildPrompt 返回完整提示词（系统+用户合一），供"复制提示词"按钮使用
  function buildPrompt(ke,plain,bg,settings){
    return buildSystemPrompt(settings)+'\n\n---\n\n'+buildUserPrompt(ke,plain,bg,settings);
  }

  // 构建多术数融合的用户消息（用于结果页 AI 深度解读）
  function buildMultiShuUserPrompt(comp,shushuResults,bg,settings){
    const L=[];
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
    L.push('');
    L.push('# 大六壬盘面（主盘）');
    const ke=comp.ke,p=comp.plain,sc=ke.sanChuan;
    L.push('起课时间：'+(ke.dateStr||'')+'　占时：'+(ke.scStr||''));
    L.push('日干支：'+ke.baZi.day.gz+'　月将：'+ke.yueJiang.zhi+'　占时：'+ke.zhanShi.zhi);
    L.push('贵人：'+ke.guiRen.label+ke.guiRen.zhi+'（乘'+ke.guiRen.chengShen+'）　空亡：'+Lunar.ZHI[ke.kongWang[0]]+Lunar.ZHI[ke.kongWang[1]]);
    L.push('格局：'+ke.geju.join('、'));
    L.push('三传：'+sc.chu.zhi+'('+sc.chu.tj+') → '+sc.zhong.zhi+'('+sc.zhong.tj+') → '+sc.mo.zhi+'('+sc.mo.tj+')　取法：'+sc.method);
    L.push('类神：'+ke.leishenName+'（乘'+(ke.leishenShen!==null?Lunar.ZHI[ke.leishenShen]:'—')+'）');
    L.push('神煞：驿马'+ke.shenSha.yima+' 桃花'+ke.shenSha.taohua+' 华盖'+ke.shenSha.huagai+' 太岁'+ke.shenSha.taiSui+' 月建'+ke.shenSha.yueJian);
    L.push('盘面摘要：倾向='+p.tendency+'；机会='+(p.opps||[]).join('，')+'；风险='+(p.risks||[]).join('，')+'；环境='+p.env);
    L.push('');
    if(shushuResults&&Object.keys(shushuResults).length){
      L.push('# 辅盘术数数据（注意：以下为规则化摘要，非原始盘面事实，仅供交叉参考）');
      Object.keys(shushuResults).forEach(name=>{
        const r=shushuResults[name];
        L.push('## '+name+' · 摘要');
        // 仅取 plain 中确定字段，避免推断字段被当盘面事实引用
        const safe={};
        if(r.plain){
          if(r.plain.tendency)safe.tendency=r.plain.tendency;
          if(r.plain.state)safe.state=r.plain.state;
          if(r.plain.signals)safe.signals=r.plain.signals;
        }
        if(r.result&&r.result.guaName)safe.guaName=r.result.guaName;
        if(r.result&&r.result.benGua)safe.benGua=r.result.benGua;
        L.push(JSON.stringify(safe,null,0));
      });
      L.push('');
      L.push('# 多术数融合要求');
      L.push('请综合主盘（大六壬）与辅盘的信号，指出各术数的共性与分歧，给出综合判断。辅盘数据为规则化摘要，不得作为原始盘面事实引用。');
    }
    L.push('');
    L.push('# 输出要求');
    L.push('按系统提示词的 10 段格式输出，所有结论附来源标注。');
    return L.join('\n');
  }

  // ============ 4. 离线规则化解读（兜底，不调用 LLM） ============
  function generateAI(ke,plain,bg,settings){
    const segs=[];
    const S=(t,src,type)=>`<span class="source-tag ${type}">${src}</span>`;
    segs.push({t:'一句话参考',c:plain.state,tag:S('大六壬·三传','rule')});
    segs.push({t:'总体倾向',c:plain.tendency,tag:S('初末传天将','rule')});
    segs.push({t:'主要机会',c:plain.opps.length?plain.opps.map(o=>`· ${o}`).join('<br>'):'暂无明显机会信号',tag:S('天将+类神','rule')});
    segs.push({t:'主要风险',c:plain.risks.length?plain.risks.map(r=>`· ${r}`).join('<br>'):'暂无明显风险信号',tag:S('空亡+天将+格局','rule')});
    segs.push({t:'对方/环境状态',c:plain.env,tag:S('日支课','rule')});
    segs.push({t:'建议行动',c:plain.doAct.map(d=>`· ${d}`).join('<br>'),tag:S('盘面倾向','ai')});
    segs.push({t:'不建议行动',c:plain.dontAct.map(d=>`· ${d}`).join('<br>'),tag:S('盘面风险','ai')});
    segs.push({t:'观察信号',c:plain.signals.map(s=>`· ${s}`).join('<br>'),tag:S('三传+神煞','rule')});
    const rd=new Date(Date.now()+plain.reviewDays*86400000);
    segs.push({t:'复盘时间建议',c:`约 ${plain.reviewDays} 日后（${rd.getMonth()+1}月${rd.getDate()}日）复盘校准。`,tag:S('经验建议','ai')});
    segs.push({t:'免责声明',c:DISCLAIMER,tag:''});
    return segs;
  }

  // ============ 5. LLM 网络调用 ============

  // 规范化 baseUrl（去尾部斜杠）
  function normBaseUrl(u){return (u||'').trim().replace(/\/+$/,'');}

  // 构建请求 URL（OpenAI 协议 /chat/completions；Anthropic 协议 /messages）
  function buildRequestUrl(baseUrl,protocol){
    const b=normBaseUrl(baseUrl);
    if(protocol==='anthropic')return b+'/messages';
    return b+'/chat/completions';
  }

  // 构建请求头
  function buildHeaders(cfg){
    if(cfg.aiProtocol==='anthropic'){
      return {
        'Content-Type':'application/json',
        'anthropic-version':'2023-06-01',
        // 允许浏览器直接调用（Anthropic 默认禁用浏览器 CORS）；中转站可忽略
        'anthropic-dangerous-direct-browser-access':'true',
        'x-api-key':cfg.aiApiKey||''
      };
    }
    return {
      'Content-Type':'application/json',
      'Authorization':'Bearer '+(cfg.aiApiKey||'')
    };
  }

  // 构建请求体（OpenAI 与 Anthropic 协议消息结构不同）
  function buildBody(cfg,messages,opts){
    opts=opts||{};
    const t=Number(cfg.aiTemperature)||0.6;
    const m=Number(cfg.aiMaxTokens)||1800;
    const stream=!!(opts.stream!==undefined?opts.stream:cfg.aiStream);
    if(cfg.aiProtocol==='anthropic'){
      // Anthropic: { model, messages:[{role,user|assistant,content}], system, max_tokens, temperature }
      const sys=messages.find(x=>x.role==='system');
      const usr=messages.filter(x=>x.role!=='system').map(x=>({role:x.role==='assistant'?'assistant':'user',content:x.content}));
      return JSON.stringify({
        model:cfg.aiModel,
        system:sys?sys.content:'',
        messages:usr,
        max_tokens:m,
        temperature:t,
        stream
      });
    }
    // OpenAI 兼容
    return JSON.stringify({
      model:cfg.aiModel,
      messages,
      temperature:t,
      max_tokens:m,
      stream
    });
  }

  // 友好错误信息（截断响应体，避免泄露密钥/触发 XSS）
  function friendlyError(status,text){
    if(status===401||status===403)return 'API Key 无效或无权限（'+status+'）。请检查密钥与权限。';
    if(status===404)return '接口地址错误或模型名不存在（404）。请检查 BaseUrl 与模型名。';
    if(status===429)return '请求频率超限或余额不足（429）。请稍后重试或检查账户余额。';
    if(status>=500)return '服务端错误（'+status+'）。请稍后重试。';
    if(status===0)return '网络错误：可能因 CORS 跨域被拦截、BaseUrl 不可达或 HTTPS 证书问题。';
    let detail='';
    try{
      const j=JSON.parse(text);
      detail=j.error&&j.error.message||j.message||'';
    }catch(e){detail='';}
    // 仅取 message 字段，截断 120 字
    detail=(detail||'').replace(/[<>"']/g,'').slice(0,120);
    return 'HTTP '+status+(detail?'：'+detail:'');
  }

  /**
   * 调用 LLM（非流式或流式统一入口）
   * @param {Array<{role,content}>} messages 消息数组
   * @param {Object} opts {stream:false, onDelta:function(text)=>void, signal:AbortSignal}
   * @returns {Promise<string>} 完整响应文本（流式时通过 onDelta 增量回调，最终返回完整文本）
   */
  async function callLLM(messages,opts){
    opts=opts||{};
    const cfg=Store.getSettings();
    if(!cfg.aiApiKey&&cfg.aiProvider!=='ollama'){
      throw new Error('未配置 API Key。请在「我的 → AI 模型配置」中填写密钥。');
    }
    if(!cfg.aiBaseUrl)throw new Error('未配置 BaseUrl。');
    if(!cfg.aiModel)throw new Error('未配置模型名。');

    const url=buildRequestUrl(cfg.aiBaseUrl,cfg.aiProtocol);
    const headers=buildHeaders(cfg);
    const body=buildBody(cfg,messages,{stream:opts.stream});

    // 超时控制（opts.signal 优先；否则内部 AbortController）
    let controller=null,timer=null;
    const signal=opts.signal||(controller=new AbortController(),timer=setTimeout(()=>controller.abort(),(Number(cfg.aiTimeout)||60)*1000),controller.signal);

    let res;
    try{
      res=await fetch(url,{method:'POST',headers,body,signal});
    }catch(e){
      if(e.name==='AbortError')throw new Error('请求超时或被中止。');
      throw new Error('网络请求失败：'+e.message+'（常见原因：CORS 跨域、BaseUrl 不可达、HTTPS 证书问题）');
    }finally{
      if(timer)clearTimeout(timer);
    }

    if(!res.ok){
      const txt=await res.text().catch(()=> '');
      throw new Error(friendlyError(res.status,txt));
    }

    if(opts.stream&&res.body&&res.body.getReader){
      // 流式 SSE 解析
      const reader=res.body.getReader();
      const dec=new TextDecoder('utf-8');
      let buf='',full='';
      const parseLine=(line)=>{
        const s=line.trim();
        if(!s||!s.startsWith('data:'))return;
        const data=s.slice(5).trim();
        if(data==='[DONE]')return;
        try{
          const j=JSON.parse(data);
          let delta='';
          if(cfg.aiProtocol==='anthropic'){
            if(j.type==='content_block_delta'&&j.delta&&j.delta.text)delta=j.delta.text;
          }else{
            if(j.choices&&j.choices[0]&&j.choices[0].delta&&j.choices[0].delta.content)delta=j.choices[0].delta.content;
          }
          if(delta){
            full+=delta;
            if(opts.onDelta)opts.onDelta(delta,full);
          }
        }catch(e){/* 忽略非 JSON 心跳行 */}
      };
      try{
        while(true){
          const {done,value}=await reader.read();
          if(done)break;
          buf+=dec.decode(value,{stream:true});
          const lines=buf.split('\n');
          buf=lines.pop()||'';
          lines.forEach(parseLine);
        }
        // 处理残留 buf（无尾换行的最后一帧）
        if(buf.trim())parseLine(buf);
      }finally{
        // 异常时也释放 reader
        try{reader.cancel();}catch(e){}
      }
      return full;
    }

    // 非流式 JSON
    const data=await res.json();
    if(cfg.aiProtocol==='anthropic'){
      if(data.content&&data.content[0]&&data.content[0].text)return data.content[0].text;
      throw new Error('Anthropic 响应格式异常（无 content 字段）');
    }
    if(data.choices&&data.choices[0]&&data.choices[0].message&&data.choices[0].message.content){
      return data.choices[0].message.content;
    }
    throw new Error('OpenAI 响应格式异常（无 choices.message.content）');
  }

  /**
   * 测试连接：发送极简请求验证配置可用
   * @returns {Promise<{ok:boolean,msg:string}>}
   */
  async function testConnection(){
    const cfg=Store.getSettings();
    if(!cfg.aiApiKey&&cfg.aiProvider!=='ollama')return{ok:false,msg:'未填写 API Key'};
    if(!cfg.aiBaseUrl)return{ok:false,msg:'未填写 BaseUrl'};
    if(!cfg.aiModel)return{ok:false,msg:'未填写模型名'};
    try{
      const txt=await callLLM([
        {role:'system',content:'你是测试机器人，只回复"OK"两个字。'},
        {role:'user',content:'ping'}
      ],{stream:false});
      return{ok:true,msg:'连接成功。模型回复：'+(txt||'').slice(0,30)};
    }catch(e){
      return{ok:false,msg:e.message};
    }
  }

  /**
   * 应用预设提供商：根据 provider 设置 protocol/baseUrl/model 默认值
   * @param {string} providerKey
   * @returns {Object} 需要写入 settings 的字段
   */
  function applyProvider(providerKey){
    const p=PROVIDERS[providerKey]||PROVIDERS.custom;
    return{
      aiProvider:providerKey,
      aiProtocol:p.protocol,
      aiBaseUrl:p.baseUrl,
      aiModel:p.model
    };
  }

  /**
   * 将检索到的古籍段落追加到用户 prompt 末尾（RAG 注入）
   * @param {string} prompt 原 prompt
   * @param {Array<Object>} passages ClassicLibrary.search 返回的段落数组
   * @returns {string} 追加后的 prompt
   */
  function appendClassicsToPrompt(prompt,passages){
    if(!passages||!passages.length)return prompt||'';
    const L=['\n\n# 参考古籍段落（RAG 检索结果，供解读时参考，非盘面事实）'];
    passages.forEach((p,idx)=>{
      L.push(`## 参考 ${idx+1}`);
      L.push(`[${p.book||''}·${p.chapter||''}] ${(p.text||'').replace(/\s+/g,' ')}`);
      if(p.comment)L.push(`白话注解：${p.comment.replace(/\s+/g,' ')}`);
      if(p.scenario)L.push(`适用场景：${p.scenario}`);
      if(Array.isArray(p.tags)&&p.tags.length)L.push(`标签：${p.tags.join('、')}`);
      L.push('');
    });
    L.push('要求：若古籍段落与盘面数据相关，可引用并标注古籍来源；若不相关则忽略，不得虚构。');
    return (prompt||'')+L.join('\n');
  }

  // 简易 Markdown 渲染（粗体、列表、段落），用于展示 LLM 返回
  function renderMarkdown(md){
    if(!md)return'';
    let h=String(md)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    // 标题
    h=h.replace(/^###\s+(.+)$/gm,'<h4>$1</h4>');
    h=h.replace(/^##\s+(.+)$/gm,'<h3>$1</h3>');
    h=h.replace(/^#\s+(.+)$/gm,'<h3>$1</h3>');
    // 粗体
    h=h.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
    // 数字编号列表
    h=h.replace(/^\s*(\d+)\.\s+(.+)$/gm,'<li class="ord">$2</li>');
    // 无序列表
    h=h.replace(/^\s*[-•]\s+(.+)$/gm,'<li>$1</li>');
    // 段落
    h=h.split(/\n{2,}/).map(seg=>{
      if(/^<(h3|h4|li)/.test(seg))return seg.replace(/\n/g,'');
      return '<p>'+seg.replace(/\n/g,'<br>')+'</p>';
    }).join('');
    return h;
  }

  global.AI={
    FORBIDDEN,SENSITIVE,DISCLAIMER,TONES,PROVIDERS,
    detectSensitive,hasForbidden,sanitize,
    buildSystemPrompt,buildUserPrompt,buildPrompt,buildMultiShuUserPrompt,appendClassicsToPrompt,
    generateAI,
    callLLM,testConnection,applyProvider,
    normBaseUrl,buildRequestUrl,buildHeaders,buildBody,friendlyError,
    renderMarkdown
  };
})(window);
