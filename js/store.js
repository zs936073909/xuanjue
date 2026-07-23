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
  function addReview(id,review){
    const c=getCase(id);if(!c)return null;
    c.review=Object.assign({time:Date.now()},review);
    c.reviewed=true;
    return saveCase(c);
  }

  // 统计
  function reviewStats(){
    const arr=listCases().filter(c=>c.reviewed);
    const total=arr.length;
    const byResult={应验:0,部分应验:0,未应验:0,无法判断:0};
    const byType={},byShu={},byMood={};
    arr.forEach(c=>{
      const r=c.review&&c.review.result||'无法判断';
      byResult[r]=(byResult[r]||0)+1;
      byType[c.questionType]=(byType[c.questionType]||0)+1;
      byShu[c.shushu]=(byShu[c.shushu]||0)+1;
      byMood[c.mood]=(byMood[c.mood]||0)+1;
    });
    const hit=byResult['应验']+byResult['部分应验'];
    const acc=total?Math.round(hit/total*100):0;
    return{total,byResult,byType,byShu,byMood,acc};
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
    return{
      app:'玄决',version:'0.1',
      exportedAt:new Date().toISOString(),
      cases:read(KEY_CASES,[]),
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
  function importBackup(obj){
    if(!obj||obj.app!=='玄决')throw new Error('备份文件格式不正确');
    if(obj.cases)write(KEY_CASES,obj.cases);
    if(obj.profile)write(KEY_PROFILE,obj.profile);
    if(obj.settings){
      const cur=getSettings();
      // 仅白名单字段导入；apiKey 字符串校验
      const merged=Object.assign({},cur);
      SETTINGS_WHITELIST.forEach(k=>{
        if(obj.settings[k]!==undefined){
          let v=obj.settings[k];
          // 字符串字段做基础字符过滤（防 HTML/JS 注入）
          if(typeof v==='string'){
            v=v.replace(/[<>]/g,'').slice(0,2000);
          }
          merged[k]=v;
        }
      });
      // 若备份不含 apiKey（默认导出），保留当前 apiKey
      if(!obj.settings.aiApiKey&&cur.aiApiKey)merged.aiApiKey=cur.aiApiKey;
      write(KEY_SETTINGS,merged);
    }
    return true;
  }
  function clearAll(){localStorage.removeItem(KEY_CASES);}
  function clearEverything(){localStorage.removeItem(KEY_CASES);localStorage.removeItem(KEY_SETTINGS);localStorage.removeItem(KEY_PROFILE);}

  // 同意声明
  function isAgreed(){return localStorage.getItem(KEY_AGREE)==='1';}
  function setAgreed(){localStorage.setItem(KEY_AGREE,'1');}

  global.Store={
    listCases,getCase,saveCase,deleteCase,genId,addReview,reviewStats,
    getSettings,setSettings,getProfile,setProfile,
    exportBackup,importBackup,clearAll,clearEverything,
    isAgreed,setAgreed
  };
})(window);
