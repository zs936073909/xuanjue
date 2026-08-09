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
    if(comp&&comp.ke){
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
    }else if(shushuResults&&Object.keys(shushuResults).length){
      // 无主盘时，取第一个术数作为主盘（支持八字/紫微等独立排盘）
      const mainName=Object.keys(shushuResults)[0];
      const r=shushuResults[mainName];
      L.push('# '+mainName+'盘面（主盘）');
      L.push('术数：'+mainName);
      if(r.plain)L.push('盘面摘要：倾向='+(r.plain.tendency||'—')+'；状态='+(r.plain.state||'—'));
      L.push('');
    }
    if(shushuResults&&Object.keys(shushuResults).length){
      L.push('# 辅盘/单盘术数数据（注意：以下为规则化摘要，非原始盘面事实，仅供交叉参考）');
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
      if(comp&&comp.ke)L.push('请综合主盘（大六壬）与辅盘的信号，指出各术数的共性与分歧，给出综合判断。辅盘数据为规则化摘要，不得作为原始盘面事实引用。');
      else L.push('请基于上述术数盘面给出解读，指出关键信号与建议。盘面数据为规则化摘要，不得作为原始命理事实引用。');
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
  // 兼容多种错误结构：OpenAI{error.message}、{msg}、{detail}、Anthropic{error.message}、纯文本
  function friendlyError(status,text){
    if(status===401||status===403)return 'API Key 无效或无权限（'+status+'）。请检查密钥与权限。';
    if(status===404)return '接口地址错误或模型名不存在（404）。请检查 BaseUrl 与模型名。';
    if(status===429)return '请求频率超限或余额不足（429）。请稍后重试或检查账户余额。';
    if(status>=500)return '服务端错误（'+status+'）。请稍后重试。';
    if(status===0)return '网络错误：可能因 CORS 跨域被拦截、BaseUrl 不可达或 HTTPS 证书问题。';
    let detail='';
    try{
      const j=JSON.parse(text);
      // 兼容多种错误字段结构
      detail = (j.error&&(j.error.message||j.error.code))
            || j.message || j.msg || j.detail
            || (Array.isArray(j.errors)&&j.errors[0]&&j.errors[0].message)
            || (typeof j.error==='string'&&j.error)
            || '';
    }catch(e){
      // 非 JSON 响应，取纯文本前 120 字
      detail=(text||'').replace(/[<>"']/g,'').slice(0,120);
    }
    detail=(detail||'').replace(/[<>"']/g,'').slice(0,160);
    return 'HTTP '+status+(detail?'：'+detail:'');
  }

  /**
   * 调用 LLM（非流式或流式统一入口）
   * - 429/5xx 自动重试（最多 2 次，指数退避 1s/2s）
   * - 流式空响应抛错（避免把空串当成功）
   * - 超时与主动取消可区分
   * @param {Array<{role,content}>} messages 消息数组
   * @param {Object} opts {stream:false, onDelta:function(text)=>void, signal:AbortSignal, retries:2}
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

    const maxRetries=opts.retries!==undefined?opts.retries:2;
    let lastErr=null;
    for(let attempt=0;attempt<=maxRetries;attempt++){
      try{
        return await _doFetch(messages,opts,cfg);
      }catch(e){
        lastErr=e;
        // 主动取消不重试
        if(e.name==='AbortError'&&opts.signal&&opts.signal.aborted)throw e;
        // 流式空响应：自动降级为非流式重试（部分中转站/模型流式返回空但非流式正常）
        if(/为空/.test(e.message||'')&&opts.stream&&opts._fallback!==true){
          try{return await _doFetch(messages,Object.assign({},opts,{stream:false,_fallback:true}),cfg);}
          catch(e2){
            // 降级也失败则抛降级错误
            throw e2;
          }
        }
        // 仅对 429/5xx 重试，其他错误直接抛出
        const retryable = /429|服务端错误|HTTP 5\d\d/.test(e.message||'');
        if(!retryable||attempt>=maxRetries)throw e;
        // 指数退避：1s, 2s
        const delay=Math.pow(2,attempt)*1000;
        await new Promise(r=>setTimeout(r,delay));
      }
    }
    throw lastErr||new Error('调用失败');
  }

  // 实际发起单次请求（含超时、流式解析、空响应检测）
  async function _doFetch(messages,opts,cfg){
    const url=buildRequestUrl(cfg.aiBaseUrl,cfg.aiProtocol);
    const headers=buildHeaders(cfg);
    const body=buildBody(cfg,messages,{stream:opts.stream});

    // 超时控制（opts.signal 优先；否则内部 AbortController）
    // 区分"用户主动取消"与"内部超时"：内部超时用独立标记
    let controller=null,timer=null,internalTimeout=false;
    let signal;
    if(opts.signal){
      signal=opts.signal;
    }else{
      controller=new AbortController();
      timer=setTimeout(()=>{internalTimeout=true;controller.abort();},(Number(cfg.aiTimeout)||60)*1000);
      signal=controller.signal;
    }

    let res;
    try{
      res=await fetch(url,{method:'POST',headers,body,signal});
    }catch(e){
      if(e.name==='AbortError'){
        if(internalTimeout)throw new Error('请求超时（'+(Number(cfg.aiTimeout)||60)+'秒），请检查网络或在配置中调大超时时间。');
        throw new Error('请求被中止。');
      }
      throw new Error('网络请求失败：'+e.message+'（常见原因：CORS 跨域、BaseUrl 不可达、HTTPS 证书问题）');
    }finally{
      if(timer)clearTimeout(timer);
    }

    if(!res.ok){
      const txt=await res.text().catch(()=> '');
      const err=new Error(friendlyError(res.status,txt));
      err.status=res.status;       // 挂状态码供重试判断
      err.responseText=txt;        // 挂原始响应供测试连接展示
      throw err;
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
      // 流式空响应：服务端 200 但未返回任何内容，视为异常
      if(!full||!full.trim()){
        throw new Error('AI 返回内容为空（服务端未输出有效内容，可能模型异常或被内容过滤）。');
      }
      return full;
    }

    // 非流式 JSON
    const data=await res.json();
    if(cfg.aiProtocol==='anthropic'){
      // 结构存在但内容为空时，给出更精准的"空响应"提示而非"格式异常"
      if(Array.isArray(data.content)&&data.content[0]&&typeof data.content[0].text==='string'){
        const t=data.content[0].text;
        if(!t.trim())throw new Error('AI 返回内容为空（content[0].text 为空）。');
        return t;
      }
      throw new Error('Anthropic 响应格式异常（无 content 字段）。原始：'+JSON.stringify(data).slice(0,100));
    }
    // OpenAI：先校验结构，再校验内容；避免空串被误判为"格式异常"
    if(data.choices&&data.choices[0]&&data.choices[0].message&&data.choices[0].message.content!==undefined&&data.choices[0].message.content!==null){
      const content=data.choices[0].message.content;
      if(typeof content!=='string'){
        // 某些模型返回数组型 content（如视觉模型），尝试拼接文本段
        if(Array.isArray(content)){
          const joined=content.map(c=>(c&&typeof c.text==='string')?c.text:'').join('');
          if(!joined.trim())throw new Error('AI 返回内容为空（choices.message.content 数组无文本）。');
          return joined;
        }
        throw new Error('OpenAI 响应格式异常（content 类型异常：'+typeof content+'）。');
      }
      if(!content.trim())throw new Error('AI 返回内容为空（choices.message.content 为空）。');
      return content;
    }
    // 兼容部分中转站直接返回 {content: "..."} 或 {text: "..."} 的非标准结构
    if(typeof data.content==='string'&&data.content.trim())return data.content;
    if(typeof data.text==='string'&&data.text.trim())return data.text;
    throw new Error('OpenAI 响应格式异常（无 choices.message.content）。原始：'+JSON.stringify(data).slice(0,100));
  }

  /**
   * 测试连接：发送极简请求验证配置可用
   * @returns {Promise<{ok:boolean,msg:string,detail?:string,elapsed?:number}>}
   *   detail: 失败时附原始响应或诊断建议；elapsed: 耗时(ms)
   */
  async function testConnection(){
    const cfg=Store.getSettings();
    if(!cfg.aiApiKey&&cfg.aiProvider!=='ollama')return{ok:false,msg:'未填写 API Key',detail:'请在配置中填写 API Key 后再测试。'};
    if(!cfg.aiBaseUrl)return{ok:false,msg:'未填写 BaseUrl',detail:'请在配置中填写接口地址（如 https://api.deepseek.com/v1）。'};
    if(!cfg.aiModel)return{ok:false,msg:'未填写模型名',detail:'请在配置中填写模型名（如 deepseek-chat）。'};
    // baseUrl 格式校验
    const b=normBaseUrl(cfg.aiBaseUrl);
    if(!/^https?:\/\//i.test(b)){
      return{ok:false,msg:'BaseUrl 格式错误',detail:'地址应以 http:// 或 https:// 开头。当前：'+b};
    }
    // 混合内容检测：HTTPS 页面调用 HTTP 接口会被浏览器拦截
    if(location.protocol==='https:'&&/^http:\/\//i.test(b)){
      return{ok:false,msg:'混合内容被拦截',detail:'当前页面是 HTTPS，但 BaseUrl 是 HTTP，浏览器会阻止此请求。请改用 HTTPS 的 BaseUrl，或通过本地 Ollama (http://localhost:11434/v1)。'};
    }
    // 空格/中文等常见输入错误检测
    if(/\s/.test(cfg.aiApiKey)){
      return{ok:false,msg:'API Key 含空格',detail:'密钥中包含空格或换行，请重新粘贴（注意去除首尾空格）。'};
    }
    const t0=Date.now();
    try{
      const txt=await callLLM([
        {role:'system',content:'你是测试机器人，只回复"OK"两个字。'},
        {role:'user',content:'ping'}
      ],{stream:false,retries:1});
      const elapsed=Date.now()-t0;
      return{ok:true,msg:'连接成功（耗时 '+elapsed+'ms）。模型回复：'+(txt||'').slice(0,40),elapsed};
    }catch(e){
      const elapsed=Date.now()-t0;
      // 构造诊断建议
      let detail=e.responseText?('原始响应：'+e.responseText.replace(/[<>"']/g,'').slice(0,200)):'';
      const m=e.message||'';
      if(/CORS|跨域/.test(m)){
        detail=(detail?detail+'\n':'')+'诊断：浏览器跨域被拦截。建议：1) 改用支持 CORS 的中转站；2) Anthropic 官方接口需通过中转；3) 本地 Ollama 默认允许跨域。';
      }else if(/混合内容/.test(m)){
        detail=(detail?detail+'\n':'')+'诊断：HTTPS 页面调用 HTTP 接口被拦截。请改用 HTTPS 接口地址。';
      }else if(/401|403|Key 无效/.test(m)){
        detail=(detail?detail+'\n':'')+'诊断：密钥无效或无权限。请检查 API Key 是否正确、是否过期、是否有该模型调用权限。';
      }else if(/404|地址错误|模型名不存在/.test(m)){
        detail=(detail?detail+'\n':'')+'诊断：地址或模型名错误。请检查 BaseUrl 末尾是否含 /v1（OpenAI 协议）或 /v1（Anthropic 协议），模型名是否拼写正确。';
      }else if(/429|频率|余额/.test(m)){
        detail=(detail?detail+'\n':'')+'诊断：请求频率超限或账户余额不足。请稍后重试或登录服务商控制台查看额度。';
      }else if(/超时/.test(m)){
        detail=(detail?detail+'\n':'')+'诊断：请求超时。请检查网络连接，或在配置中调大「请求超时」秒数。';
      }else if(/为空/.test(m)){
        detail=(detail?detail+'\n':'')+'诊断：服务端返回 200 但内容为空，可能模型异常或触发了内容过滤。';
      }else if(/Failed to fetch|NetworkError|网络请求失败/.test(m)){
        detail=(detail?detail+'\n':'')+'诊断：网络层失败。常见原因：1) BaseUrl 不可达/拼写错误；2) CORS 跨域被拦截；3) HTTPS 证书问题；4) 手机端未联网。建议先用浏览器访问 BaseUrl 确认可达。';
      }
      return{ok:false,msg:m,detail,elapsed};
    }
  }

  /**
   * 应用预设提供商：根据 provider 设置 protocol/baseUrl/model 默认值
   * @param {string} providerKey
   * @returns {Object} 需要写入 settings 的字段
   */
  function applyProvider(providerKey, current){
    const p=PROVIDERS[providerKey]||PROVIDERS.custom;
    const cur=current||{};
    // 自定义：保留用户当前值，避免清空
    if(providerKey==='custom'){
      return{
        aiProvider:'custom',
        aiProtocol:cur.aiProtocol||'openai',
        aiBaseUrl:cur.aiBaseUrl||'',
        aiModel:cur.aiModel||''
      };
    }
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
    if(!passages||!passages.length){
      // 空命中时追加通用提示，禁止 LLM 伪造古籍引用
      return (prompt||'')+'\n\n【古籍参考】当前未检索到直接相关古籍依据，以下为通用解释，请谨慎参考，不得伪造古籍引用。';
    }
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

  // ============ 6. 命盘序列化（八字 / 紫微）→ AI 上下文摘要 ============
  // 将排盘引擎的完整 result 结构化序列化为文本，作为多轮对话的"命盘长期记忆"。
  // 所有字段访问均做存在性判断，缺字段时降级为占位符，保证不抛错。

  // 八字 result → 上下文摘要（含四柱/十神/藏干/强弱/用神/喜忌/五行/大运/流年流月/神煞/纳音/胎元命宫/格局/刑冲合害）
  function buildBaziContext(result){
    if(!result||typeof result!=='object')return '';
    const L=[];
    L.push('# 八字命盘上下文（结构化摘要，供多轮对话长期记忆）');
    try{
      // 四柱干支、十神、藏干
      if(Array.isArray(result.pillars)&&result.pillars.length){
        L.push('## 四柱（干支·十神·藏干）');
        result.pillars.forEach(p=>{
          if(!p)return;
          const cangStr=(Array.isArray(p.cangGan)&&p.cangGan.length)
            ? p.cangGan.map(c=>(c.gan||'')+(c.shiShen?('('+c.shiShen+')'):'')).join('、')
            : '无';
          L.push(`${p.name||''}：${p.gz||'—'}（天干${p.gan||'—'}${p.ganWx?('('+p.ganWx+')'):''} ${p.ganShen||''}；地支${p.zhi||'—'}${p.zhiWx?('('+p.zhiWx+')'):''}；藏干：${cangStr}）`);
        });
      }
      // 日主强弱、用神、喜忌神
      L.push('## 日主与用神');
      if(result.dayGan)L.push(`日主：${result.dayGan}${result.dayWx?('（'+result.dayWx+'）'):''}`);
      if(typeof result.dayStrong==='boolean')L.push(`日主强弱：${result.dayStrong?'偏强':'偏弱'}`);
      if(result.yongShen)L.push(`用神参考：${result.yongShen}`);
      if(result.xiJi){
        L.push(`喜神：${(result.xiJi.xi||[]).join('、')||'—'}`);
        L.push(`忌神：${(result.xiJi.ji||[]).join('、')||'—'}`);
        if(result.xiJi.tiaoHou)L.push(`调候：${result.xiJi.tiaoHou}`);
        if(result.xiJi.reason)L.push(`喜忌依据：${result.xiJi.reason}`);
      }
      // 五行统计
      if(result.wxStr){
        L.push('## 五行统计');
        L.push(`五行（含藏干）：${result.wxStr}`);
        if(result.wxCountAll){
          const keys=Object.keys(result.wxCountAll);
          if(keys.length){
            const maxWx=keys.reduce((a,b)=>result.wxCountAll[a]>=result.wxCountAll[b]?a:b);
            const minWx=keys.reduce((a,b)=>result.wxCountAll[a]<=result.wxCountAll[b]?a:b);
            L.push(`最旺：${maxWx}（${result.wxCountAll[maxWx]}）；最弱：${minWx}（${result.wxCountAll[minWx]}）`);
          }
        }
      }
      // 大运（含当前所在大运）
      if(Array.isArray(result.daYun)&&result.daYun.length){
        L.push('## 大运');
        // 定位当前所在大运：按出生年计算虚岁
        let cur=null,curIdx=-1;
        try{
          const now=new Date();
          const bd=result.birthDate?new Date(result.birthDate):null;
          if(bd&&!isNaN(bd.getTime())){
            const age=now.getFullYear()-bd.getFullYear()+1;
            result.daYun.forEach((d,i)=>{
              if(age>=(d.startAge||0)&&(d.endAge?age<d.endAge:true)){cur=d;curIdx=i;}
            });
          }
        }catch(_){}
        if(!cur){cur=result.daYun[0];curIdx=0;}
        L.push(`起运：${result.daYunStartAge!=null?result.daYunStartAge+'岁':'—'}，${result.daYunForward?'顺排':'逆排'}`);
        if(cur){
          L.push(`当前大运：${cur.gz}（${cur.ageRange||''}，${cur.yearRange||''}） 天干${cur.gan||''}${cur.ganWx?('('+cur.ganWx+')'):''} ${cur.ganShen||''}；地支${cur.zhi||''}${cur.zhiWx?('('+cur.zhiWx+')'):''}`);
        }
        L.push('大运序列：');
        result.daYun.forEach((d,i)=>{
          const mark=(i===curIdx)?' ← 当前':'';
          L.push(`  ${d.gz} ${d.ageRange||''} ${d.yearRange||''}${mark}`);
        });
      }
      // 流年流月
      if(result.liuNian||result.liuYue){
        L.push('## 流年流月');
        if(result.liuNian)L.push(`当前流年：${result.liuNian.gz||''}（天干${result.liuNian.gan||''} 地支${result.liuNian.zhi||''}）`);
        if(result.liuYue)L.push(`当前流月：${result.liuYue.gz||''}（天干${result.liuYue.gan||''} 地支${result.liuYue.zhi||''}）`);
      }
      // 神煞
      if(result.shenSha){
        L.push('## 神煞');
        const ss=result.shenSha;
        const parts=[];
        if(ss['天乙贵人']&&ss['天乙贵人'].length)parts.push('天乙贵人 '+ss['天乙贵人'].join('/'));
        if(ss['文昌'])parts.push('文昌 '+ss['文昌']);
        if(ss['驿马'])parts.push('驿马 '+ss['驿马']);
        if(ss['桃花'])parts.push('桃花 '+ss['桃花']);
        if(ss['华盖'])parts.push('华盖 '+ss['华盖']);
        if(ss['将星'])parts.push('将星 '+ss['将星']);
        if(ss['羊刃'])parts.push('羊刃 '+ss['羊刃']);
        if(ss['空亡']&&ss['空亡'].length)parts.push('空亡 '+ss['空亡'].join('/'));
        L.push(parts.join('；')||'无明显神煞');
        if(Array.isArray(result.shenShaInPillars)&&result.shenShaInPillars.length){
          L.push('四柱神煞落位：');
          result.shenShaInPillars.forEach(p=>{
            if(p&&p.shenSha&&p.shenSha.length)L.push(`  ${p.pillar}：${p.shenSha.join('、')}`);
          });
        }
      }
      // 纳音、胎元命宫
      L.push('## 纳音·胎元·命宫');
      if(result.naYin){
        L.push(`纳音：年${result.naYin['年柱']||'—'}、月${result.naYin['月柱']||'—'}、日${result.naYin['日柱']||'—'}、时${result.naYin['时柱']||'—'}`);
      }
      if(result.taiYuan)L.push(`胎元：${result.taiYuan.gz||''}`);
      if(result.mingGong)L.push(`命宫：${result.mingGong.gz||''}`);
      if(result.shenGong)L.push(`身宫：${result.shenGong.gz||''}`);
      // 格局
      if(result.geJu){
        L.push('## 格局');
        L.push(`格局：${result.geJu.name||'—'}`);
        if(result.geJu.method)L.push(`取格方法：${result.geJu.method}`);
        if(result.geJu.yongShen)L.push(`格局用神：${result.geJu.yongShen}`);
      }
      // 刑冲合害
      if(result.xingChong){
        L.push('## 刑冲合害');
        const xc=result.xingChong;
        if(xc.summary)L.push(`综合：${xc.summary}`);
        if(xc['三合']&&xc['三合'].length)L.push(`三合：${xc['三合'].join('、')}`);
        if(xc['六合']&&xc['六合'].length)L.push('六合：'+xc['六合'].map(h=>h.a+'+'+h.b).join('、'));
        if(xc['三刑']&&xc['三刑'].length)L.push(`三刑：${xc['三刑'].join('、')}`);
        if(xc['六冲']&&xc['六冲'].length)L.push('六冲：'+xc['六冲'].map(h=>h.a+'+'+h.b).join('、'));
        if(xc['六害']&&xc['六害'].length)L.push('六害：'+xc['六害'].map(h=>h.a+'+'+h.b).join('、'));
      }
      if(result.note)L.push(`备注：${result.note}`);
    }catch(e){
      L.push('（命盘序列化异常：'+(e.message||e)+'）');
    }
    return L.join('\n');
  }

  // 紫微 result → 上下文摘要（含命宫身宫/命主身主/五行局/十二宫星曜/大限/流年/四化）
  function buildZiweiContext(result){
    if(!result||typeof result!=='object')return '';
    const L=[];
    L.push('# 紫微斗数命盘上下文（结构化摘要，供多轮对话长期记忆）');
    try{
      const ast=result.astrolabe;
      L.push('## 命宫身宫');
      L.push(`命宫：${result.soulPalace||'—'}`);
      L.push(`身宫：${result.bodyPalace||'—'}`);
      if(ast){
        if(ast.soul)L.push(`命主：${ast.soul}`);
        if(ast.body)L.push(`身主：${ast.body}`);
        if(ast.fiveElementsClass)L.push(`五行局：${ast.fiveElementsClass}`);
      }
      if(Array.isArray(result.majorStars)&&result.majorStars.length){
        L.push(`命宫主星：${result.majorStars.join('、')}`);
      }
      if(result.solarDate)L.push(`出生：${result.solarDate}`);
      // 十二宫星曜（主星+亮度+辅星+杂曜+宫干支）
      if(ast&&Array.isArray(ast.palaces)&&ast.palaces.length){
        L.push('## 十二宫星曜');
        ast.palaces.forEach(p=>{
          if(!p)return;
          const majorFull=(p.majorStars||[]).filter(Boolean).map(s=>s.name+(s.brightness?('('+s.brightness+')'):''));
          const minor=(p.minorStars||[]).filter(Boolean).map(s=>s.name).filter(Boolean);
          const adj=(p.adjectiveStars||[]).filter(Boolean).map(s=>s.name).filter(Boolean);
          const gz=(p.heavenlyStem||'')+(p.earthlyBranch||'');
          L.push(`${p.name||'—'}${gz?('('+gz+')'):''}：主星[${majorFull.join('、')||'空'}]${minor.length?(' 辅星['+minor.join('、')+']'):''}${adj.length?(' 杂曜['+adj.join('、')+']'):''}`);
        });
      }
      // 当前大限
      if(result.decadal){
        L.push('## 当前大限');
        const d=result.decadal;
        L.push(`大限宫位：${d.palaceName||'—'}${(d.heavenlyStem||d.earthlyBranch)?('（'+(d.heavenlyStem||'')+(d.earthlyBranch||'')+'）'):''}`);
        if(d.startAge!=null&&d.endAge!=null)L.push(`年龄区间：${d.startAge}-${d.endAge}岁`);
        if(Array.isArray(d.stars)&&d.stars.length)L.push(`大限宫主星：${d.stars.join('、')}`);
        if(d.juStartAge)L.push(`起运：${d.juStartAge}岁`);
      }
      // 当前流年
      if(result.yearly){
        L.push('## 当前流年');
        const y=result.yearly;
        L.push(`流年：${y.yearlyGanZhi||''} 宫位${y.palaceName||'—'}${(y.heavenlyStem||y.earthlyBranch)?('（'+(y.heavenlyStem||'')+(y.earthlyBranch||'')+'）'):''}`);
        if(Array.isArray(y.stars)&&y.stars.length)L.push(`流年宫主星：${y.stars.join('、')}`);
      }
      if(result.monthly){
        L.push(`当前流月宫位：${result.monthly.palaceName||'—'}`);
      }
      // 四化（化禄权科忌及所在宫）
      if(result.siHua){
        L.push('## 四化');
        const s=result.siHua;
        L.push(`生年天干：${s.生年||'—'}`);
        L.push(`化禄：${s.化禄||'—'}；化权：${s.化权||'—'}；化科：${s.化科||'—'}；化忌：${s.化忌||'—'}`);
        if(Array.isArray(s.byPalace)&&s.byPalace.length){
          L.push('四化落宫：');
          s.byPalace.forEach(b=>{
            if(!b)return;
            L.push(`  ${b.type||''}：${b.star||'—'}（${b.palace||'宫位未知'}）`);
          });
        }
      }
    }catch(e){
      L.push('（命盘序列化异常：'+(e.message||e)+'）');
    }
    return L.join('\n');
  }

  // ============ 6.5 终身/实时顾问：分场景系统提示词 + 快捷问题模板 ============
  // 终身命理顾问：基于八字/紫微命盘的多轮对话，引导用户趋吉避凶
  // 系统提示词在通用解读基础上叠加"长期顾问"角色与领域咨询规范
  const LIFETIME_DOMAINS={
    '事业财运':{focus:'事业方向、职业选择、财运起伏、投资时机',prompt:'请基于我的命盘分析事业与财运走向：1) 适合的行业与发展方向；2) 当前大运/流年对事业财运的影响；3) 近期宜把握的机会与宜规避的风险；4) 趋吉避凶的具体行动建议。'},
    '感情婚姻':{focus:'姻缘时机、伴侣特质、婚姻质量、关系经营',prompt:'请基于我的命盘分析感情与婚姻：1) 姻缘出现的时机与对象特质；2) 夫妻宫/桃花星等感情信息；3) 当前感情阶段的提示；4) 经营感情、化解矛盾的趋吉建议。'},
    '健康养生':{focus:'体质倾向、养生重点、流年健康提示',prompt:'请基于我的命盘分析健康与养生（仅作文化参考，非医疗诊断）：1) 五行偏枯对应的体质倾向；2) 需重点养护的脏腑与季节；3) 当前流年健康提示；4) 日常养生与起居建议。'},
    '学业考运':{focus:'学业方向、考试时机、文昌运势',prompt:'请基于我的命盘分析学业与考运：1) 文昌/印星等学业信息；2) 适合的学习方向与专业；3) 当前流年考运提示；4) 提升学习效率、把握考试时机的建议。'},
    '流年运势':{focus:'当年整体运势、关键节点、趋吉避凶',prompt:'请基于我的命盘分析今年流年运势：1) 流年干支与日主的关系；2) 流年对事业/财运/感情/健康各方面的影响；3) 全年关键节点与宜忌；4) 趋吉避凶的年度行动建议。'},
    '趋吉避凶':{focus:'基于喜用神的日常行动指南',prompt:'请基于我的命盘喜用神给出趋吉避凶的日常行动指南：1) 有利方位、颜色、数字；2) 适合的行业、合作伙伴特质；3) 宜多做的事与宜避免的事；4) 化解不利因素的简易方法（不涉及法事/符咒）。'}
  };
  // 实时卜筮顾问：基于当下卦象的多轮对话，引导用户做出选择
  const REALTIME_TOPICS={
    '二选一':{focus:'两个选项的对比与决策',prompt:'我现在面临两个选择，请基于卦象帮我分析：1) 两个选项各自的利弊；2) 卦象对每个选项的提示；3) 综合建议选哪个或如何决策；4) 决策后需观察的信号。'},
    '时机判断':{focus:'何时行动最合适',prompt:'请基于卦象帮我判断行动时机：1) 现在是否适合推进此事；2) 若适合，最佳时机窗口；3) 若不适合，建议等待多久；4) 等待期间宜做哪些准备。'},
    '风险预警':{focus:'潜在风险与规避',prompt:'请基于卦象帮我预警潜在风险：1) 此事主要风险点；2) 卦象中克/害/刑的提示；3) 需重点防范的人或事；4) 规避风险的具体建议。'},
    '观察信号':{focus:'可观察的现实信号',prompt:'请基于卦象告诉我应观察哪些现实信号来验证判断：1) 短期内可观察的吉兆与凶兆；2) 关键人/事的态度变化信号；3) 决定推进或放弃的临界信号；4) 建议复盘的时间节点。'},
    '事项详析':{focus:'针对具体事项的深入分析',prompt:'请基于卦象深入分析我所问之事：1) 事情的本质与起因；2) 各方立场与关系；3) 发展趋势与可能结果；4) 我应采取的行动与心态。'},
    '心态调整':{focus:'心境与应对智慧',prompt:'请基于卦象帮我调整心态与应对智慧：1) 卦象对心境的提示；2) 顺境/逆境下的应对之道；3) 如何借势而为、顺势而止；4) 给我一句话的提醒。'}
  };

  function buildLifetimeAdvisorPrompt(settings){
    const base=buildSystemPrompt(settings);
    return base+'\n\n# 顾问角色（终身命理）\n你现在是用户的「终身命理顾问」。基于用户的八字/紫微命盘结构化数据，通过多轮对话引导用户趋吉避凶。\n- 结合大运、流年、流月等时间维度给出阶段性建议，避免一次性"断终身"。\n- 喜用神是日常趋吉避凶的核心依据，多用日常可执行的语言（方位、颜色、行业、人际）。\n- 涉及婚姻/感情/事业等重大选择时，给出"宜观察 X 信号""宜等待 X 时机"等可操作建议。\n- 用户每次提问都结合命盘上下文回答，不脱离命盘空谈。';
  }
  function buildRealtimeAdvisorPrompt(settings){
    const base=buildSystemPrompt(settings);
    return base+'\n\n# 顾问角色（实时卜筮）\n你现在是用户的「实时决策顾问」。基于当下时间起的卦象/盘面结构化数据，通过多轮对话帮用户做出更明智的选择。\n- 重点回答"现在该不该做""选哪个""何时做""有什么风险"等即事决策问题。\n- 卦象为短期参考（数日至数周），不可断长期命运。\n- 给出可观察的现实信号，便于用户事后复盘校准。\n- 用户补充的背景信息（情绪、紧急程度、选项）会影响判断，需结合分析。';
  }
  function getLifetimeDomains(){return LIFETIME_DOMAINS;}
  function getRealtimeTopics(){return REALTIME_TOPICS;}

  // ============ 6.6 今日宜忌（终身栏核心延伸）============
  // 基于命盘喜用神 × 当日干支，生成当日趋吉避凶行动指南。
  // 返回 { system, user } 两条消息：system 设定"每日趋吉避凶顾问"角色，user 注入命盘+当日干支。
  // dayInfo: { date:Date, gz:{year,month,day,hour}, lunar:{monthStr,dayStr}, jieQi:{cur,cur,cur.name, next.name} }
  function buildDailyYiJiPrompt(settings, dayInfo){
    const sys=buildLifetimeAdvisorPrompt(settings)
      +'\n\n# 今日宜忌顾问（专项）\n你现在是用户的「今日趋吉避凶顾问」。请基于用户命盘的喜用神、日主强弱、当前大运流年，结合今日干支与节气，生成一份**当日行动指南**。\n'
      +'- 输出必须为结构化 Markdown，包含以下小节：**今日概览**（≤40字）、**有利方位/颜色/数字**、**宜**（3-5条可执行行动）、**忌**（3-5条）、**人际提示**、**健康/起居提示**、**一句话提醒**。\n'
      +'- 所有结论必须紧扣命盘喜用神与当日干支生克关系，标注来源 `[命盘喜用神|当日干支|传统规则|参考]`。\n'
      +'- 禁止绝对化措辞，禁止法事/符咒/消灾等营销内容。\n'
      +'- 健康提示仅作文化参考，非医疗诊断，涉及病症建议就医。\n'
      +'- 输出后引导用户："如需针对某件具体事项深入分析，可直接提问。"';
    const L=[];
    L.push('# 今日趋吉避凶请求');
    if(dayInfo){
      if(dayInfo.date)L.push('日期：'+fmtYMD(dayInfo.date));
      if(dayInfo.gz)L.push('今日干支：'+dayInfo.gz.year+'年 '+dayInfo.gz.month+'月 '+dayInfo.gz.day+'日 '+dayInfo.gz.hour+'时');
      if(dayInfo.lunar)L.push('农历：'+dayInfo.lunar.monthStr+dayInfo.lunar.dayStr);
      if(dayInfo.jieQi)L.push('节气：'+(dayInfo.jieQi.cur?dayInfo.jieQi.cur.name:'—')+' → '+(dayInfo.jieQi.next?dayInfo.jieQi.next.name:'—'));
    }
    L.push('');
    L.push('请基于上方命盘上下文（喜用神、日主、大运、流年）与今日干支，生成今日趋吉避凶行动指南。');
    return {system:sys, user:L.join('\n')};
  }
  function fmtYMD(d){if(!d)return '';const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());}

  // ============ 6.7 决策对比助手（实时栏核心延伸）============
  // 结构化引导用户填写选项A/B，AI 对比利弊后给出建议。
  // bg: { questionType, title, desc, optA, optB, mood, urgent, persons }
  // 返回 { system, user }
  function buildDecisionComparePrompt(settings, bg){
    const sys=buildRealtimeAdvisorPrompt(settings)
      +'\n\n# 决策对比顾问（专项）\n你现在是用户的「决策对比顾问」。用户面临两个选项（A/B），请基于当下卦象/盘面，对两个选项进行结构化对比，帮用户做出更明智的选择。\n'
      +'- 输出必须为结构化 Markdown，包含：**选项A分析**（利/弊/卦象提示）、**选项B分析**（利/弊/卦象提示）、**综合对比表**（用 Markdown 表格列出关键维度）、**倾向建议**（选A/选B/暂缓/需更多信息）、**决策后观察信号**（3-5条）、**复盘建议**（建议天数与理由）。\n'
      +'- 若两个选项信息不足，明示需补充哪些信息再决策。\n'
      +'- 禁止绝对化措辞，卦象为短期参考。\n'
      +'- 结尾提醒：决策需结合现实理性判断。';
    const L=[];
    L.push('# 决策对比请求');
    L.push('问题类型：'+(bg.questionType||'二选一决策'));
    if(bg.title)L.push('事项：'+bg.title);
    if(bg.desc)L.push('背景：'+bg.desc);
    L.push('选项A：'+(bg.optA||'（未填写）'));
    L.push('选项B：'+(bg.optB||'（未填写）'));
    if(bg.mood)L.push('当前情绪：'+bg.mood);
    if(bg.urgent)L.push('紧急程度：'+bg.urgent);
    if(bg.persons)L.push('涉及人物：'+bg.persons);
    L.push('');
    L.push('请基于上方卦象上下文，对选项A与选项B进行结构化对比分析，给出倾向建议与观察信号。');
    return {system:sys, user:L.join('\n')};
  }

  // ============ 7. 多轮对话管理（命盘长期记忆）============
  // 设计：每个 threadId 对应一段持久化对话历史（Store.getChat/saveChat）。
  // 首次 startChat 以 systemPrompt + contextSummary（命盘/卦象结构化摘要）初始化；
  // 后续 chat 复用历史，实现"两栏都长期记忆"（命理栏记命盘、卜筮栏记卦象）。

  // 初始化/加载一个对话线程
  // - 若 Store 已有该 threadId 的历史，直接加载返回
  // - 否则用 systemPrompt（system 角色）+ contextSummary（user 角色，作为命盘上下文）初始化并存盘
  //   并追加一条 assistant 占位回复确认已加载上下文，避免 LLM 把首条命盘摘要当作待回答问题
  // 返回当前历史消息数组 [{role,content,ts}]
  function startChat(threadId, systemPrompt, contextSummary){
    if(!threadId)return [];
    const existing=Store.getChat(threadId);
    if(existing&&existing.length)return existing;
    const messages=[];
    if(systemPrompt){
      messages.push({role:'system',content:systemPrompt,ts:Date.now()});
    }
    if(contextSummary){
      messages.push({role:'user',content:contextSummary,ts:Date.now()});
      messages.push({role:'assistant',content:'已收到命盘/卦象上下文，将基于此结构化数据回答后续问题。请提问。',ts:Date.now()});
    }
    Store.saveChat(threadId,messages);
    return messages;
  }

  // 发送消息并获取回复（流式）
  // - 从 Store 读取历史 messages，追加 user 消息
  // - 调用 callLLM(messages,{stream:true}) 流式返回（opts.onDelta 增量回调）
  // - 回复完成后追加 assistant 消息并存回 Store
  // - 返回完整回复文本 txt；opts.onDelta 用于流式渲染
  async function chat(threadId, userMessage, opts){
    opts=opts||{};
    if(!threadId)throw new Error('chat 需要 threadId');
    if(typeof userMessage!=='string'||!userMessage.trim())throw new Error('chat 需要非空 userMessage');
    let messages=Store.getChat(threadId);
    if(!messages.length){
      // 未初始化时容错：以裸 user 消息起话（无命盘上下文），避免阻塞调用方
      messages=[];
    }
    messages=messages.slice();
    messages.push({role:'user',content:userMessage,ts:Date.now()});
    const cfg=Store.getSettings();
    const llmOpts={
      stream:opts.stream!==undefined?opts.stream:(cfg.aiStream!==false),
      retries:opts.retries!==undefined?opts.retries:2
    };
    if(opts.signal)llmOpts.signal=opts.signal;
    if(llmOpts.stream&&typeof opts.onDelta==='function'){
      llmOpts.onDelta=opts.onDelta;
    }
    const txt=await callLLM(messages,llmOpts);
    // 回复成功后追加 assistant 消息并存回 Store（实现长期记忆）
    messages.push({role:'assistant',content:txt,ts:Date.now()});
    Store.saveChat(threadId,messages);
    return txt;
  }

  // 返回历史消息数组
  function getChatHistory(threadId){
    return Store.getChat(threadId);
  }

  // 清空指定线程
  function clearChat(threadId){
    return Store.clearChat(threadId);
  }
  // 将一条 assistant 消息注入线程历史（用于把"深度解读"结果作为对话上下文，
  // 使后续追问能基于解读内容继续）。会移除 startChat 自动追加的占位 assistant。
  function injectAssistant(threadId, content){
    if(!threadId||!content)return;
    let messages=Store.getChat(threadId);
    if(!messages.length)messages=[];
    messages=messages.slice();
    if(messages.length&&messages[messages.length-1].role==='assistant'&&/已收到命盘|已收到.*上下文/.test(messages[messages.length-1].content)){
      messages.pop();
    }
    messages.push({role:'assistant',content:content,ts:Date.now()});
    Store.saveChat(threadId,messages);
  }

  global.AI={
    FORBIDDEN,SENSITIVE,DISCLAIMER,TONES,PROVIDERS,
    detectSensitive,hasForbidden,sanitize,
    buildSystemPrompt,buildUserPrompt,buildPrompt,buildMultiShuUserPrompt,appendClassicsToPrompt,
    generateAI,
    callLLM,testConnection,applyProvider,
    normBaseUrl,buildRequestUrl,buildHeaders,buildBody,friendlyError,
    renderMarkdown,
    buildBaziContext,buildZiweiContext,
    buildLifetimeAdvisorPrompt,buildRealtimeAdvisorPrompt,getLifetimeDomains,getRealtimeTopics,
    buildDailyYiJiPrompt,buildDecisionComparePrompt,
    startChat,chat,getChatHistory,clearChat,injectAssistant
  };
})(window);
