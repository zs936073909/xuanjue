// store.js — 本地存储（localStorage）：案例、设置、备份
(function(global){
  const KEY_CASES='xuanjue_cases';
  const KEY_SETTINGS='xuanjue_settings';
  const KEY_AGREE='xuanjue_agreed';
  const KEY_PROFILE='xuanjue_profile';
  const KEY_IMPORTANT='xuanjue_important';
  const KEY_REMIND_STATE='xuanjue_remind_state';
  const KEY_LOCK='xuanjue_lock';
  const KEY_CHATS='xuanjue_chats'; // AI 多轮对话历史：{ threadId: [{role,content,ts}] }
  let _sessionPin=''; // 解锁后缓存 PIN，用于本地加密解密

  // localStorage 兜底：在 Node/jsdom 等无 localStorage 环境使用内存存储，保证测试与异常场景不崩溃
  const _memStore=new Map();
  const _ls=(function(){
    try{if(typeof localStorage!=='undefined' && localStorage.getItem)return localStorage;}catch(e){}
    return {
      getItem(k){return _memStore.has(k)?_memStore.get(k):null;},
      setItem(k,v){_memStore.set(String(k),String(v));},
      removeItem(k){_memStore.delete(k);},
      clear(){_memStore.clear();}
    };
  })();

  function read(k,dft){try{const v=_ls.getItem(k);return v?JSON.parse(v):dft;}catch(e){return dft;}}
  function write(k,v){try{_ls.setItem(k,JSON.stringify(v));return true;}catch(e){return false;}}

  // 案例
  function listCases(){
    const arr=read(KEY_CASES,[]);
    return arr.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  }
  function getCase(id){return read(KEY_CASES,[]).find(c=>c.id===id)||null;}
  function saveCase(c){
    const arr=read(KEY_CASES,[]);
    c.updatedAt=Date.now();
    const i=arr.findIndex(x=>x.id===c.id);
    if(i>=0)arr[i]=c;else arr.push(c);
    write(KEY_CASES,arr);
    return c;
  }
  function deleteCase(id){
    const arr=read(KEY_CASES,[]).filter(c=>c.id!==id);
    write(KEY_CASES,arr);
  }
  function genId(){return 'C'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);}

  // 复盘
  // review 字段：{time,actual,unhit,reflect,result,score(1-5),tags:[],reviewTime}
  // 向后兼容：旧案例无 score/tags/reviewTime 时不报错
  function addReview(id,review){
    const c=getCase(id);if(!c)return null;
    const r=Object.assign({time:Date.now()},review);
    // 评分 1-5；非法值规整为 null（旧案例无 score 不影响）
    if(r.score!=null){
      const s=Number(r.score);
      r.score=(!isNaN(s)&&s>=1&&s<=5)?Math.floor(s):null;
    }else{
      r.score=null;
    }
    // 标签数组：非数组时初始化为空，过滤非法值，限长 30
    if(!Array.isArray(r.tags))r.tags=[];
    r.tags=r.tags.filter(t=>typeof t==='string'&&t&&t.length<=20).slice(0,30);
    // 复盘日期字符串：限长防异常
    if(r.reviewTime!=null)r.reviewTime=String(r.reviewTime).slice(0,20);
    c.review=r;
    c.reviewed=true;
    return saveCase(c);
  }

  // 统计：返回扩展结构（向后兼容旧案例）
  function reviewStats(){
    const all=listCases();
    const total=all.length;
    const reviewed=all.filter(c=>c.reviewed);
    const reviewedCount=reviewed.length;
    const reviewRate=total?reviewedCount/total:0;
    const byResult={应验:0,部分应验:0,未应验:0,无法判断:0};
    const byType={},byShu={},byMood={},byTendency={},byScore={1:0,2:0,3:0,4:0,5:0};
    let scoreSum=0,scoreCnt=0;
    reviewed.forEach(c=>{
      const r=c.review||{};
      const res=r.result||'无法判断';
      if(byResult[res]!==undefined)byResult[res]++;
      else byResult['无法判断']++;
      if(c.questionType)byType[c.questionType]=(byType[c.questionType]||0)+1;
      // 术数按主术数（首个）归类，便于按术数统计
      if(c.shushu){
        const main=String(c.shushu).split('、')[0];
        if(main)byShu[main]=(byShu[main]||0)+1;
      }
      if(c.mood)byMood[c.mood]=(byMood[c.mood]||0)+1;
      // 倾向：优先 review.tendency，次 case.tendency，再次 case.plain.tendency
      const tend=(r.tendency||c.tendency||(c.plain&&c.plain.tendency)||'—');
      byTendency[tend]=(byTendency[tend]||0)+1;
      // 评分聚合（仅统计 1-5 有效评分）
      if(r.score!=null){
        const s=Number(r.score);
        if(!isNaN(s)&&s>=1&&s<=5){
          const si=Math.floor(s);
          byScore[si]=(byScore[si]||0)+1;
          scoreSum+=si;scoreCnt++;
        }
      }
    });
    // 严格应验率 = 应验数 / (已复盘数 - 无法判断数)
    const judgeable=reviewedCount-byResult['无法判断'];
    const strictAcc=judgeable>0?byResult['应验']/judgeable:0;
    // 宽松应验率 = (应验+部分应验) / (已复盘数 - 无法判断数)
    const looseAcc=judgeable>0?(byResult['应验']+byResult['部分应验'])/judgeable:0;
    const avgScore=scoreCnt>0?scoreSum/scoreCnt:0;

    // 时间趋势：按月统计案例数与应验率
    const trend={};
    all.forEach(c=>{
      const t=c.createdAt||Date.now();
      const d=new Date(t);
      const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      if(!trend[key])trend[key]={total:0,reviewed:0,hit:0,judgeable:0};
      trend[key].total++;
      if(c.reviewed){
        trend[key].reviewed++;
        const res=(c.review&&c.review.result)||'无法判断';
        if(res==='应验'||res==='部分应验')trend[key].hit++;
        if(res!=='无法判断')trend[key].judgeable++;
      }
    });
    const trendKeys=Object.keys(trend).sort();
    const trendArr=trendKeys.map(k=>({
      month:k,
      total:trend[k].total,
      reviewed:trend[k].reviewed,
      acc:trend[k].judgeable>0?Math.round(trend[k].hit/trend[k].judgeable*100):0
    }));

    // 决策画像聚合
    const topQuestionType=Object.keys(byType).sort((a,b)=>byType[b]-byType[a])[0]||'—';
    const topShu=Object.keys(byShu).sort((a,b)=>byShu[b]-byShu[a])[0]||'—';
    const dominantTendency=Object.keys(byTendency).sort((a,b)=>byTendency[b]-byTendency[a])[0]||'—';
    // 各术数应验率（至少 3 条可判断样本）
    const shuAcc={};
    all.forEach(c=>{
      if(!c.reviewed||!c.shushu)return;
      const shus=String(c.shushu).split('、').filter(Boolean);
      const res=(c.review&&c.review.result)||'无法判断';
      shus.forEach(s=>{
        if(!shuAcc[s])shuAcc[s]={count:0,hit:0,judgeable:0};
        shuAcc[s].count++;
        if(res==='应验'||res==='部分应验')shuAcc[s].hit++;
        if(res!=='无法判断')shuAcc[s].judgeable++;
      });
    });
    const shuAccArr=Object.keys(shuAcc).map(s=>{
      const a=shuAcc[s];
      return{name:s,acc:a.judgeable>0?Math.round(a.hit/a.judgeable*100):0,count:a.count,judgeable:a.judgeable};
    }).filter(x=>x.judgeable>=3).sort((a,b)=>b.acc-a.acc);
    const bestShu=shuAccArr[0]||null;
    const worstShu=shuAccArr[shuAccArr.length-1]||null;

    return{
      total,reviewedCount,reviewRate,byResult,byType,byShu,byMood,byTendency,byScore,
      strictAcc,looseAcc,avgScore,trend:trendArr,profile:{topQuestionType,topShu,dominantTendency,bestShu,worstShu}
    };
  }

  // 筛选案例：filter={shushu,questionType,result,reviewed,duePending,dateFrom,dateTo,tag,favor,keyword}
  // reviewed 为 true/false 时按已/未复盘过滤；result 为应验程度时按 review.result 过滤
  // duePending=true 时筛到期待复盘（!reviewed && reviewDue && Date.now()>reviewDue）
  // favor=true 时只显示收藏案例；keyword 在标题/描述/术数中搜索
  // 返回按 createdAt 降序的案例数组
  function listCasesByFilter(filter){
    filter=filter||{};
    let arr=listCases(); // 已按 createdAt 降序
    if(filter.shushu&&filter.shushu!=='全部'){
      arr=arr.filter(c=>c.shushu&&String(c.shushu).split('、').includes(filter.shushu));
    }
    if(filter.questionType&&filter.questionType!=='全部'){
      arr=arr.filter(c=>c.questionType===filter.questionType);
    }
    if(filter.reviewed===true)arr=arr.filter(c=>c.reviewed);
    else if(filter.reviewed===false)arr=arr.filter(c=>!c.reviewed);
    if(filter.duePending===true){
      const now=Date.now();
      arr=arr.filter(c=>!c.reviewed&&c.reviewDue&&now>c.reviewDue);
    }
    if(filter.result){
      arr=arr.filter(c=>c.reviewed&&c.review&&c.review.result===filter.result);
    }
    if(filter.dateFrom){
      const t=new Date(filter.dateFrom).getTime();
      if(!isNaN(t))arr=arr.filter(c=>(c.createdAt||0)>=t);
    }
    if(filter.dateTo){
      // 包含当天到 23:59:59.999
      const end=new Date(filter.dateTo);
      if(!isNaN(end.getTime())){end.setHours(23,59,59,999);arr=arr.filter(c=>(c.createdAt||0)<=end.getTime());}
    }
    if(filter.tag){
      arr=arr.filter(c=>c.reviewed&&Array.isArray(c.review.tags)&&c.review.tags.includes(filter.tag));
    }
    if(filter.favor===true){
      arr=arr.filter(c=>c.favor===true);
    }
    if(filter.keyword){
      const k=String(filter.keyword).toLowerCase();
      arr=arr.filter(c=>{
        const hay=(c.title||'')+' '+(c.desc||'')+' '+(c.questionType||'')+' '+(c.shushu||'')+' '+(c.mood||'');
        return hay.toLowerCase().includes(k);
      });
    }
    return arr;
  }

  // 设置
  const DEFAULT_SETTINGS={
    aiTone:'专业谨慎',aiLength:'标准',showTerm:true,autoAdvice:true,autoCopyPrompt:false,offlineMode:false,
    darkMode:'auto',appLock:false,bioLock:false,localEncrypt:false,
    remindDaily:false,dailyTime:'08:00',remindReview:true,remindImportant:false,notificationEnabled:false,
    dlGuiRen:'昼夜贵人',dlSheHai:'涉害取深',yueJiang:'中气定将',realSolarTime:false,
    zhenTaiyang:false,tarotReverse:'随机正逆位',
    // —— AI 模型配置（方案 A：用户自带 Key，支持 OpenAI 兼容协议 / Anthropic 协议 / 中转站） ——
    aiProvider:'deepseek',          // 提供商：见 ai.js 的 PROVIDERS
    aiProtocol:'openai',            // 协议：openai | anthropic
    aiBaseUrl:'https://api.deepseek.com/v1',
    aiApiKey:'',                    // 密钥（明文存 localStorage，备份导出可关）
    aiModel:'deepseek-chat',
    aiTemperature:0.6,
    aiMaxTokens:1800,
    aiStream:true,                  // 流式输出
    aiTimeout:60,                   // 超时秒
    aiExportKey:false               // 备份导出时是否包含 apiKey
  };
  // 简单混淆：用于本地加密开关。安全性依赖 PIN 不外泄，仅防 casual 读取。
  function xorObfuscate(text,key){
    if(!text||!key)return text;
    let out='';
    for(let i=0;i<text.length;i++){
      out+=String.fromCharCode(text.charCodeAt(i)^key.charCodeAt(i%key.length));
    }
    try{return 'enc:'+btoa(unescape(encodeURIComponent(out)));}catch(e){return text;}
  }
  function xorDeobfuscate(b64,key){
    if(!b64||!key||!String(b64).startsWith('enc:'))return b64;
    try{
      const s=decodeURIComponent(escape(atob(String(b64).slice(4))));
      let out='';
      for(let i=0;i<s.length;i++){
        out+=String.fromCharCode(s.charCodeAt(i)^key.charCodeAt(i%key.length));
      }
      return out;
    }catch(e){return '';}
  }
  function pinHash(pin){
    // 简单摘要，非密码学安全，仅用于本地校验
    let h=0;
    for(let i=0;i<pin.length;i++){h=((h<<5)-h)+pin.charCodeAt(i);h|=0;}
    return 'h'+Math.abs(h).toString(36);
  }
  function getLockState(){return read(KEY_LOCK,{locked:false,appLock:false,pinHash:'',bioLock:false,localEncrypt:false});}
  function setLockState(patch){write(KEY_LOCK,Object.assign({},getLockState(),patch));}
  function isLocked(){return getLockState().locked && getLockState().appLock;}
  function verifyPin(pin){return pinHash(pin)===getLockState().pinHash;}
  function unlock(pin){
    if(!verifyPin(pin))return false;
    _sessionPin=pin;
    setLockState({locked:false});
    return true;
  }
  function lockApp(){_sessionPin='';setLockState({locked:true});}
  function changePin(oldPin,newPin){
    if(!verifyPin(oldPin))return false;
    const lock=getLockState();
    // 若开启本地加密，先用旧 PIN 解密再重新加密
    if(lock.localEncrypt && lock.appLock){
      const curS=read(KEY_SETTINGS,{});
      const curP=read(KEY_PROFILE,{});
      const oldKey=pinHash(oldPin);
      const newKey=pinHash(newPin);
      if(curS.aiApiKey && String(curS.aiApiKey).startsWith('enc:')){
        curS.aiApiKey=xorObfuscate(xorDeobfuscate(curS.aiApiKey,oldKey),newKey);
      }
      write(KEY_SETTINGS,curS);
      const encP=read(KEY_PROFILE+'_enc','');
      if(encP){
        const decP=xorDeobfuscate(encP,oldKey);
        write(KEY_PROFILE+'_enc',xorObfuscate(decP,newKey));
      }else{
        write(KEY_PROFILE+'_enc',xorObfuscate(JSON.stringify(curP),newKey));
        _ls.removeItem(KEY_PROFILE);
      }
    }
    setLockState({pinHash:pinHash(newPin)});
    _sessionPin=newPin;
    return true;
  }
  function setAppLock(pin,enable){
    if(enable){
      setLockState({appLock:true,pinHash:pinHash(pin),locked:true});
      _sessionPin=pin;
    }else{
      // 关闭锁时同时关闭本地加密并解密数据
      const lock=getLockState();
      if(lock.localEncrypt){toggleLocalEncrypt(false);}
      setLockState({appLock:false,pinHash:'',bioLock:false,locked:false});
      _sessionPin='';
    }
  }
  function toggleLocalEncrypt(enable){
    const lock=getLockState();
    if(enable && (!lock.appLock || !lock.pinHash)){throw new Error('请先设置应用锁');}
    const key=lock.pinHash||'';
    const curS=read(KEY_SETTINGS,{});
    const curP=read(KEY_PROFILE,{});
    if(enable){
      if(curS.aiApiKey && !String(curS.aiApiKey).startsWith('enc:')){
        curS.aiApiKey=xorObfuscate(curS.aiApiKey,key);
      }
      write(KEY_PROFILE+'_enc',xorObfuscate(JSON.stringify(curP),key));
      // 清除明文 profile
      _ls.removeItem(KEY_PROFILE);
    }else{
      if(curS.aiApiKey && String(curS.aiApiKey).startsWith('enc:')){
        curS.aiApiKey=xorDeobfuscate(curS.aiApiKey,key);
      }
      const encP=read(KEY_PROFILE+'_enc','');
      if(encP){
        try{write(KEY_PROFILE,JSON.parse(xorDeobfuscate(encP,key)));}catch(e){write(KEY_PROFILE,{});}
        _ls.removeItem(KEY_PROFILE+'_enc');
      }
    }
    write(KEY_SETTINGS,curS);
    setLockState({localEncrypt:enable});
  }

  function getSettings(){
    const s=Object.assign({},DEFAULT_SETTINGS,read(KEY_SETTINGS,{}));
    // 旧版 tarotReverse 为布尔值，兼容转换为字符串选项
    if(s.tarotReverse===true)s.tarotReverse='随机正逆位';
    else if(s.tarotReverse===false)s.tarotReverse='仅正位';
    // 大六壬贵人数值异常值兜底
    const guiRenOpts=['昼夜贵人','夜贵人','甲戊庚牛羊'];
    if(!guiRenOpts.includes(s.dlGuiRen))s.dlGuiRen='昼夜贵人';
    // 本地加密：解密 API Key
    const lock=getLockState();
    if(lock.localEncrypt && lock.appLock && _sessionPin && s.aiApiKey && String(s.aiApiKey).startsWith('enc:')){
      s.aiApiKey=xorDeobfuscate(s.aiApiKey,pinHash(_sessionPin));
    }
    return s;
  }
  function setSettings(s){
    const lock=getLockState();
    const merged=Object.assign(getSettings(),s);
    // 只要开启本地加密，就确保落盘的 aiApiKey 是密文（修复修改非 key 字段导致明文回写）
    if(lock.localEncrypt && lock.appLock && _sessionPin){
      if(merged.aiApiKey && !String(merged.aiApiKey).startsWith('enc:')){
        merged.aiApiKey=xorObfuscate(merged.aiApiKey,pinHash(_sessionPin));
      }
    }
    write(KEY_SETTINGS,merged);
  }
  function getProfile(){
    const lock=getLockState();
    if(lock.localEncrypt && lock.appLock && _sessionPin){
      const encP=read(KEY_PROFILE+'_enc','');
      if(encP){
        try{return JSON.parse(xorDeobfuscate(encP,pinHash(_sessionPin)))||{};}catch(e){return {};}
      }
    }
    return read(KEY_PROFILE,{nick:'',birth:'',gender:'',place:'',nianming:''});
  }
  function setProfile(p){
    const lock=getLockState();
    const merged=Object.assign(getProfile(),p);
    if(lock.localEncrypt && lock.appLock && _sessionPin){
      write(KEY_PROFILE+'_enc',xorObfuscate(JSON.stringify(merged),pinHash(_sessionPin)));
      _ls.removeItem(KEY_PROFILE);
    }else{
      write(KEY_PROFILE,merged);
      _ls.removeItem(KEY_PROFILE+'_enc');
    }
  }

  // 备份
  function exportBackup(){
    const s=getSettings();
    // 默认不导出 apiKey，避免备份文件泄露密钥
    const settingsOut=Object.assign({},s,{aiApiKey:s.aiExportKey?s.aiApiKey:''});
    const cases=read(KEY_CASES,[]);
    return{
      app:'玄决',version:'1.0.1',
      exportedAt:new Date().toISOString(),
      caseCount:cases.length,
      cases,
      settings:settingsOut,
      profile:getProfile(),
      important:read(KEY_IMPORTANT,[])
    };
  }
  // 允许导入的 settings 字段白名单（防止恶意备份注入任意字段）
  const SETTINGS_WHITELIST=[
    'aiTone','aiLength','showTerm','autoAdvice','autoCopyPrompt','offlineMode',
    'darkMode','appLock','bioLock','localEncrypt',
    'remindDaily','dailyTime','remindReview','remindImportant',
    'dlGuiRen','dlSheHai','yueJiang','realSolarTime','zhenTaiyang','tarotReverse',
    'aiProvider','aiProtocol','aiBaseUrl','aiApiKey','aiModel',
    'aiTemperature','aiMaxTokens','aiStream','aiTimeout','aiExportKey'
  ];
  // 导入备份：按 case.id 去重，已存在则覆盖，不存在则新增
  // 返回 {added, updated, total}：added 新增数、updated 覆盖数、total 导入后总数
  function importBackup(obj){
    if(!obj||obj.app!=='玄决')throw new Error('备份文件格式不正确');
    if(!Array.isArray(obj.cases))throw new Error('备份文件 cases 字段缺失或非数组');
    // 案例 id 校验：防止原型污染与非法键
    function isValidCaseId(id){
      if(typeof id!=='string'||id.length===0||id.length>64)return false;
      return !['__proto__','constructor','prototype'].includes(id);
    }
    // 案例按 id 合并：保留现有 + 覆盖同 id + 追加新 id
    const cur=read(KEY_CASES,[]);
    let added=0,updated=0;
    obj.cases.forEach(c=>{
      if(!c||!isValidCaseId(c.id))return; // 跳过无效案例
      const idx=cur.findIndex(x=>x&&x.id===c.id);
      if(idx>=0){cur[idx]=c;updated++;}else{cur.push(c);added++;}
    });
    write(KEY_CASES,cur);
    if(obj.profile)setProfile(obj.profile);
    if(Array.isArray(obj.important))write(KEY_IMPORTANT,obj.important);
    if(obj.settings){
      const curS=getSettings();
      // 仅白名单字段导入；安全开关不通过备份恢复
      const mergedS=Object.assign({},curS);
      SETTINGS_WHITELIST.forEach(k=>{
        if(['appLock','bioLock','localEncrypt'].includes(k))return;
        if(obj.settings[k]!==undefined){
          let v=obj.settings[k];
          // 字符串字段做基础字符过滤（防 HTML/JS 注入）
          if(typeof v==='string'){
            v=v.replace(/[<>]/g,'').slice(0,2000);
          }
          mergedS[k]=v;
        }
      });
      // 若备份不含 apiKey（默认导出），保留当前 apiKey
      if(!obj.settings.aiApiKey&&curS.aiApiKey)mergedS.aiApiKey=curS.aiApiKey;
      // 统一走 setSettings，确保 localEncrypt 开启时 key 被加密
      setSettings(mergedS);
    }
    return{added,updated,total:cur.length};
  }
  // 存储占用估算：基于 JSON.stringify 字符数 × 2（UTF-16 编码近似字节数）
  // 返回 {caseCount, sizeBytes, sizeText}：sizeText 友好显示
  function storageSizeEstimate(){
    const cases=read(KEY_CASES,[]);
    const jsonStr=JSON.stringify(cases);
    const sizeBytes=jsonStr.length*2; // UTF-16 字符 × 2 近似字节数
    let sizeText;
    if(sizeBytes<1024){sizeText=sizeBytes+' B';}
    else if(sizeBytes<1048576){sizeText=(sizeBytes/1024).toFixed(1)+' KB';}
    else{sizeText=(sizeBytes/1048576).toFixed(1)+' MB';}
    return{caseCount:cases.length,sizeBytes,sizeText};
  }
  function clearAll(){_ls.removeItem(KEY_CASES);}
  function clearEverything(){_ls.removeItem(KEY_CASES);_ls.removeItem(KEY_SETTINGS);_ls.removeItem(KEY_PROFILE);}

  // 同意声明
  function isAgreed(){return _ls.getItem(KEY_AGREE)==='1';}
  function setAgreed(){_ls.setItem(KEY_AGREE,'1');}

  // 重要日期（生日、约定日、事务节点等）
  function listImportant(){return read(KEY_IMPORTANT,[]).sort((a,b)=>a.date.localeCompare(b.date));}
  function getImportant(id){return read(KEY_IMPORTANT,[]).find(x=>x.id===id)||null;}
  function saveImportant(item){
    const arr=read(KEY_IMPORTANT,[]);
    item.id=item.id||'I'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
    item.updatedAt=Date.now();
    const i=arr.findIndex(x=>x.id===item.id);
    if(i>=0)arr[i]=item;else arr.push(item);
    write(KEY_IMPORTANT,arr);
    return item;
  }
  function deleteImportant(id){write(KEY_IMPORTANT,read(KEY_IMPORTANT,[]).filter(x=>x.id!==id));}

  // 提醒状态（每日/重要日期今日是否已提示，避免重复弹窗）
  function getRemindState(){return read(KEY_REMIND_STATE,{});}
  function setRemindState(patch){write(KEY_REMIND_STATE,Object.assign({},getRemindState(),patch));}

  // ============ AI 多轮对话历史 ============
  // 结构：{ threadId: [{role:'user'|'assistant'|'system', content:string, ts:number}] }
  // threadId 规则：命理栏 'bazi_<caseId或日期>' / 'ziwei_<caseId>'，卜筮栏 'bushi_<caseId>'
  // 读取指定线程的对话历史，无则返回 []
  function getChat(threadId){
    if(!threadId)return [];
    const all=read(KEY_CHATS,{});
    const arr=all[threadId];
    return Array.isArray(arr)?arr:[];
  }
  // 保存对话历史（覆盖写）
  function saveChat(threadId,messages){
    if(!threadId)return false;
    if(!Array.isArray(messages))messages=[];
    const all=read(KEY_CHATS,{});
    all[threadId]=messages;
    return write(KEY_CHATS,all);
  }
  // 清空指定线程
  function clearChat(threadId){
    if(!threadId)return false;
    const all=read(KEY_CHATS,{});
    if(!(threadId in all))return true;
    delete all[threadId];
    return write(KEY_CHATS,all);
  }
  // 列出所有线程 id
  function listChats(){
    const all=read(KEY_CHATS,{});
    return Object.keys(all).filter(k=>Array.isArray(all[k])&&all[k].length>0);
  }

  global.Store={
    listCases,getCase,saveCase,deleteCase,genId,addReview,reviewStats,listCasesByFilter,
    getSettings,setSettings,getProfile,setProfile,
    listImportant,getImportant,saveImportant,deleteImportant,
    getRemindState,setRemindState,
    getChat,saveChat,clearChat,listChats,
    getLockState,setLockState,isLocked,verifyPin,unlock,lockApp,changePin,setAppLock,toggleLocalEncrypt,
    exportBackup,importBackup,storageSizeEstimate,clearAll,clearEverything,
    isAgreed,setAgreed
  };
})(window);
