// store.js — 本地存储（localStorage）：案例、设置、备份
(function(global){
  const KEY_CASES='xuanjue_cases';
  const KEY_SETTINGS='xuanjue_settings';
  const KEY_AGREE='xuanjue_agreed';
  const KEY_PROFILE='xuanjue_profile';

  function read(k,dft){try{const v=localStorage.getItem(k);return v?JSON.parse(v):dft;}catch(e){return dft;}}
  function write(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true;}catch(e){return false;}}

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
    return{
      total,reviewedCount,reviewRate,byResult,byType,byShu,byMood,byTendency,byScore,
      strictAcc,looseAcc,avgScore
    };
  }

  // 筛选案例：filter={shushu,questionType,result,reviewed,duePending,dateFrom,dateTo,tag}
  // reviewed 为 true/false 时按已/未复盘过滤；result 为应验程度时按 review.result 过滤
  // duePending=true 时筛到期待复盘（!reviewed && reviewDue && Date.now()>reviewDue）
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
    return arr;
  }

  // 设置
  const DEFAULT_SETTINGS={
    aiTone:'专业谨慎',aiLength:'标准',showTerm:true,autoAdvice:true,autoCopyPrompt:false,offlineMode:false,
    darkMode:'auto',appLock:false,bioLock:false,localEncrypt:true,
    remindDaily:false,dailyTime:'08:00',remindReview:true,remindImportant:false,
    dlGuiRen:'昼夜贵人',dlSheHai:'涉害取深',yueJiang:'中气定将',realSolarTime:false,
    zhenTaiyang:false,tarotReverse:true,
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
  function getSettings(){return Object.assign({},DEFAULT_SETTINGS,read(KEY_SETTINGS,{}));}
  function setSettings(s){write(KEY_SETTINGS,Object.assign(getSettings(),s));}
  function getProfile(){return read(KEY_PROFILE,{nick:'',birth:'',gender:'',place:'',nianming:''});}
  function setProfile(p){write(KEY_PROFILE,Object.assign(getProfile(),p));}

  // 备份
  function exportBackup(){
    const s=getSettings();
    // 默认不导出 apiKey，避免备份文件泄露密钥
    const settingsOut=Object.assign({},s,{aiApiKey:s.aiExportKey?s.aiApiKey:''});
    const cases=read(KEY_CASES,[]);
    return{
      app:'玄决',version:'0.3',
      exportedAt:new Date().toISOString(),
      caseCount:cases.length,
      cases,
      settings:settingsOut,
      profile:getProfile()
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
    // 案例按 id 合并：保留现有 + 覆盖同 id + 追加新 id
    const cur=read(KEY_CASES,[]);
    const curMap={};
    cur.forEach(c=>{if(c&&c.id)curMap[c.id]=c;});
    let added=0,updated=0;
    obj.cases.forEach(c=>{
      if(!c||!c.id)return; // 跳过无效案例
      if(curMap[c.id]){updated++;}else{added++;}
      curMap[c.id]=c; // 覆盖或新增
    });
    const merged=Object.keys(curMap).map(k=>curMap[k]);
    write(KEY_CASES,merged);
    if(obj.profile)write(KEY_PROFILE,obj.profile);
    if(obj.settings){
      const curS=getSettings();
      // 仅白名单字段导入；apiKey 字符串校验
      const mergedS=Object.assign({},curS);
      SETTINGS_WHITELIST.forEach(k=>{
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
      write(KEY_SETTINGS,mergedS);
    }
    return{added,updated,total:merged.length};
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
  function clearAll(){localStorage.removeItem(KEY_CASES);}
  function clearEverything(){localStorage.removeItem(KEY_CASES);localStorage.removeItem(KEY_SETTINGS);localStorage.removeItem(KEY_PROFILE);}

  // 同意声明
  function isAgreed(){return localStorage.getItem(KEY_AGREE)==='1';}
  function setAgreed(){localStorage.setItem(KEY_AGREE,'1');}

  global.Store={
    listCases,getCase,saveCase,deleteCase,genId,addReview,reviewStats,listCasesByFilter,
    getSettings,setSettings,getProfile,setProfile,
    exportBackup,importBackup,storageSizeEstimate,clearAll,clearEverything,
    isAgreed,setAgreed
  };
})(window);
