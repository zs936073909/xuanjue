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
    zhenTaiyang:false,tarotReverse:true
  };
  function getSettings(){return Object.assign({},DEFAULT_SETTINGS,read(KEY_SETTINGS,{}));}
  function setSettings(s){write(KEY_SETTINGS,Object.assign(getSettings(),s));}
  function getProfile(){return read(KEY_PROFILE,{nick:'',birth:'',gender:'',place:'',nianming:''});}
  function setProfile(p){write(KEY_PROFILE,Object.assign(getProfile(),p));}

  // 备份
  function exportBackup(){
    return{
      app:'玄决',version:'0.1',
      exportedAt:new Date().toISOString(),
      cases:read(KEY_CASES,[]),
      settings:getSettings(),
      profile:getProfile()
    };
  }
  function importBackup(obj){
    if(!obj||obj.app!=='玄决')throw new Error('备份文件格式不正确');
    if(obj.cases)write(KEY_CASES,obj.cases);
    if(obj.settings)write(KEY_SETTINGS,obj.settings);
    if(obj.profile)write(KEY_PROFILE,obj.profile);
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
