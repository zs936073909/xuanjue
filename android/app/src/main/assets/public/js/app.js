// app.js — 玄决主应用：路由、页面渲染、问事向导、盘面、案例、设置
(function(global){
  const $=s=>document.querySelector(s);
  const ZHI=Lunar.ZHI,GAN=Lunar.GAN;
  const state={tab:'home',subPage:'',ask:null,currentKe:null,viewCaseId:null,boardMode:'pro',reviewing:null,currentRagPassages:null,classicsHighlight:null,clockInterval:null,birthBoard:null};
  let remindTimeout=null, remindInterval=null;

  // ---------- 返回键 / 导航栈 ----------
  // 用于支持 Android 硬件返回键与浏览器后退：进入子界面时压栈一个「返回动作」，
  // popstate 触发时弹栈执行；应用内返回按钮统一调用 history.back()，避免双导航。
  // tag 用于「同屏刷新」（如重新起课）时替换栈顶而非累加历史。
  state.navStack=[];
  function navEnter(backFn, tag){
    if(tag && state.navStack.length && state.navStack[state.navStack.length-1].tag===tag){
      state.navStack[state.navStack.length-1].fn=backFn; // 同类子屏刷新，原地替换
      return;
    }
    state.navStack.push({fn:backFn, tag});
    try{history.pushState({n:state.navStack.length,tag},'');}catch(e){}
  }
  function navReset(){state.navStack.length=0;}
  // 统一的「应用内返回」入口：优先消费一条历史记录（触发 popstate），
  // 若无历史可退则直接执行栈顶动作
  function navBack(){
    if(state.navStack.length>0){
      try{history.back();return;}catch(e){}
    }
    const item=state.navStack.pop();
    if(item&&item.fn)item.fn();
  }
  // popstate 监听：硬件返回键或 history.back() 触发
  try{
    window.addEventListener('popstate',()=>{
      const item=state.navStack.pop();
      if(item&&item.fn){item.fn();}
    });
  }catch(e){}

  // ---------- utils ----------
  function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),1800);}
  function el(tag,cls,html){const e=document.createElement(tag);if(cls)e.className=cls;if(html!==undefined)e.innerHTML=html;return e;}
  function pad(n){return n<10?'0'+n:''+n;}
  function fmtDateTime(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+' '+pad(d.getHours())+':'+pad(d.getMinutes());}
  function fmtDate(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
  function fmtDateShort(d){return pad(d.getMonth()+1)+'-'+pad(d.getDate());}
  function jdnVal(y,m,d){const a=Math.floor((14-m)/12);const y2=y+4800-a,m2=m+12*a-3;return d+Math.floor((153*m2+2)/5)+365*y2+Math.floor(y2/4)-Math.floor(y2/100)+Math.floor(y2/400)-32045;}

  // 提醒辅助：计算重要日期距今天数
  // item.lunar 为 true 时 date 为农历 YYYY-MM-DD；item.repeat='year' 时按每年重复计算
  function daysUntil(dateStr,item){
    const today=new Date();today.setHours(0,0,0,0);
    let target;
    if(item&&item.lunar){
      const parts=String(dateStr).split('-').map(x=>parseInt(x,10));
      if(parts.length===3&&!isNaN(parts[1])&&!isNaN(parts[2])){
        // 农历日期按当前公历年反查，若当年无此农历日则尝试次年
        let solar=lunarToSolar(today.getFullYear(),parts[1],parts[2],false);
        if(!solar)solar=lunarToSolar(today.getFullYear()+1,parts[1],parts[2],false);
        if(!solar)return null;
        target=new Date(solar.getFullYear(),solar.getMonth(),solar.getDate());
      }else{return null;}
    }else{
      target=new Date(dateStr+'T00:00:00');
    }
    if(item&&item.repeat==='year'){
      const y=today.getFullYear();
      target.setFullYear(y);
      target.setHours(0,0,0,0);
      if(target<today)target.setFullYear(y+1);
    }
    target.setHours(0,0,0,0);
    if(isNaN(target.getTime()))return null;
    return Math.round((target-today)/86400000);
  }
  function todayStr(){const d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
  function esc(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  // 公历转农历（修正版）：lunar.js 自带的 solarToLunar 存在 epoch bug——
  // 它用 `new Date(y,0,0)`（即上一年 12/31）作为 offset 起点，而 lunarInfo 历元是
  // 1900-01-31（农历 1900 正月初一），导致返回的 year 恒为 1900、月日也错位。
  // 这里基于 Lunar 已暴露的 lYearDays/leapMonth/leapDays/monthDays 重写一份正确版本，
  // 不改 lunar.js，仅供 lunarToSolar 反查使用，不影响首页等仍用 Lunar.solarToLunar 的位置。
  function correctSolarToLunar(date){
    const y0=date.getFullYear();
    if(y0<1900||y0>2100)return null;
    // 历元：1900-01-31 = 农历 1900-01-01
    let offset=Math.floor((date-new Date(1900,0,31))/86400000);
    let i,leap=0,temp=0;
    for(i=1900;i<2100&&offset>0;i++){temp=Lunar.lYearDays(i);offset-=temp;}
    if(offset<0){offset+=temp;i--;}
    const y=i;leap=Lunar.leapMonth(i);
    let isLeap=false;
    for(i=1;i<13&&offset>0;i++){
      if(leap>0&&i===leap+1&&isLeap===false){i--;isLeap=true;temp=Lunar.leapDays(y);}
      else{temp=Lunar.monthDays(y,i);}
      if(isLeap&&i===leap+1)isLeap=false;
      offset-=temp;
    }
    if(offset===0&&leap>0&&i===leap+1){if(isLeap)isLeap=false;else{isLeap=true;i--;}}
    if(offset<0){offset+=temp;i--;}
    const m=i;const day=offset+1;
    return{year:y,month:m,day,isLeap};
  }
  // 农历转公历：lunar.js 未提供 lunarToSolar，这里遍历该年公历日期用上面修正后的
  // correctSolarToLunar 反查（lunar.js 自带 solarToLunar 有 epoch bug，反查会全部落空）
  // 参数：lunarYear 农历年、lunarMonth 农历月(1-12)、lunarDay 农历日(1-30)、isLeap 是否闰月
  function lunarToSolar(lunarYear,lunarMonth,lunarDay,isLeap){
    isLeap=!!isLeap;
    if(!lunarYear||!lunarMonth||!lunarDay)return null;
    // 农历年通常跨公历当年 1 月下旬至次年 2 月中旬，搜索范围：当年 1 月 1 日 ~ 次年 3 月 5 日
    const start=new Date(lunarYear,0,1);
    const end=new Date(lunarYear+1,2,5);
    const cur=new Date(start.getFullYear(),start.getMonth(),start.getDate());
    let guard=0;
    while(cur<=end&&guard<800){
      const ln=correctSolarToLunar(cur);
      if(ln&&ln.year===lunarYear&&ln.month===lunarMonth&&ln.day===lunarDay&&!!ln.isLeap===isLeap){
        return new Date(cur.getFullYear(),cur.getMonth(),cur.getDate());
      }
      cur.setDate(cur.getDate()+1);
      guard++;
    }
    return null;
  }

  function modal(title,bodyHtml,onOk,onCancel,okText){
    const root=$('#modal-root');root.innerHTML='';
    const mask=el('div','modal-mask');
    const m=el('div','modal');
    m.innerHTML=`<h3>${title}</h3><div class="modal-body">${bodyHtml}</div>`;
    const btns=el('div','flex-between mt12');
    // 取消按钮（关闭弹窗）
    if(onCancel){const b=el('button','btn ghost','取消');b.onclick=()=>{root.innerHTML='';};btns.appendChild(b);}
    // 主按钮：onOk 提供则触发回调；onOk 为 null 但提供 okText 时作为「关闭/知道了」单按钮（仍可被外部覆盖）
    if(onOk){const b=el('button','btn primary',okText||'确定');b.onclick=()=>{onOk(m);};btns.appendChild(b);}
    else if(okText){const b=el('button','btn primary',okText);b.onclick=()=>{root.innerHTML='';};btns.appendChild(b);}
    m.appendChild(btns);mask.appendChild(m);root.appendChild(mask);
    // 点击遮罩关闭弹窗（与「取消」等价，提供额外退出通道）
    mask.onclick=ev=>{if(ev.target===mask){root.innerHTML='';}};
    return m;
  }
  function closeModal(){$('#modal-root').innerHTML='';}

  // ---------- 大六壬 计算 ----------
  function computeDaliuren(date,questionType){
    const s=Store.getSettings();
    const baZi=Lunar.getBaZi(date);
    const yj=Lunar.getYueJiang(date,s.yueJiang);
    const sc=Lunar.getShiChen(date);
    const ke=DaLiuRen.qiKe(date,baZi,yj.zhiIdx,sc.index,{
      questionType,
      guiRenMode:s.dlGuiRen,
      sheHaiMode:s.dlSheHai
    });
    ke.dateStr=fmtDateTime(date);
    ke.scStr=sc.name+'（'+sc.range+'）';
    const plain=DaLiuRen.plainLang(ke,questionType);
    // 依据来源：盘面规则
    const sources=[];
    const san=ke.sanChuan;
    const TJ_JI=DaLiuRen.TJ_JI;
    if(TJ_JI[san.chu.tj]>0)sources.push({type:'rule',text:'初传乘'+san.chu.tj+'，为吉将'});
    if(TJ_JI[san.mo.tj]>0)sources.push({type:'rule',text:'末传乘'+san.mo.tj+'，结局向好'});
    if(ke.kongWang.includes(san.chu.idx))sources.push({type:'rule',text:'初传落空亡，所谋恐虚'});
    if(ke.isFanYin)sources.push({type:'rule',text:'返吟课，事多反复动摇'});
    if(ke.isFuYin)sources.push({type:'rule',text:'伏吟课，事多伏匿不动'});
    if(san.chu.tj==='玄武')sources.push({type:'rule',text:'初传乘玄武，防欺瞒失窃'});
    if(san.chu.tj==='白虎')sources.push({type:'rule',text:'初传乘白虎，防病灾口舌'});
    if(san.chu.tj==='贵人')sources.push({type:'rule',text:'贵人临传，可得助力'});
    if(san.chu.tj==='青龙')sources.push({type:'rule',text:'青龙临传，有财喜文书之喜'});
    plain.sources=sources;
    return{ke,plain,baZi,yj,sc};
  }

  // ---------- 启动 ----------
  function init(){
    if(Store.isAgreed()){enterApp();}else{showDisclaimer();}
    $('#agreeCheck').onchange=e=>{$('#btnEnter').disabled=!e.target.checked;};
    $('#btnEnter').onclick=()=>{if($('#agreeCheck').checked){Store.setAgreed();enterApp();}};
    document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{
      // 点击「问事」Tab 视为发起新问事；之前未保存的草稿会被清空
      if(t.dataset.tab==='ask'){state.ask=null;}
      // 切换 Tab 时清空子页面状态（如复盘统计页），回到案例列表
      state.subPage='';
      // 切换顶级 Tab 时清空返回栈（子屏历史不再适用）
      navReset();
      state.tab=t.dataset.tab;renderTab();
    });
    // 应用切到后台后自动上锁；切回前台时刷新提醒调度
    document.addEventListener('visibilitychange',()=>{
      if(document.hidden && Store.getLockState().appLock){Store.lockApp();}
      else if(!document.hidden){startReminderLoop();}
    });
    window.addEventListener('pagehide',()=>{
      if(Store.getLockState().appLock){Store.lockApp();}
    });
  }
  function showDisclaimer(){
    $('#screen-disclaimer').classList.remove('hidden');
    $('#main').classList.add('hidden');
    $('#lock-screen').classList.add('hidden');
  }
  function enterApp(){
    $('#screen-disclaimer').classList.add('hidden');
    applyDarkMode();
    if(Store.isLocked()){
      showLockScreen();
    }else{
      $('#main').classList.remove('hidden');
      $('#lock-screen').classList.add('hidden');
      renderTab();
      startReminderLoop();
    }
  }

  // ---------- 应用锁 ----------
  function showLockScreen(){
    const root=$('#lock-screen');
    const lock=Store.getLockState();
    root.innerHTML=`<div class="lock-title">玄决</div><div class="lock-sub">应用已锁定</div><input type="password" class="lock-input" id="lockPin" placeholder="输入密码/PIN" maxlength="16"><div class="lock-hint" id="lockHint"></div><div class="lock-btns"><button class="btn primary block" id="btnUnlock">解锁</button></div>${lock.bioLock?'<div class="lock-bio" id="btnBioUnlock">使用生物识别解锁</div>':''}<div class="lock-forget">忘记密码请在设置中关闭应用锁后重新设置（需先解锁）</div>`;
    root.classList.remove('hidden');
    $('#main').classList.add('hidden');
    const doUnlock=()=>{
      const pin=$('#lockPin').value.trim();
      if(!pin){$('#lockHint').textContent='请输入密码';return;}
      if(Store.unlock(pin)){
        root.classList.add('hidden');
        $('#main').classList.remove('hidden');
        renderTab();
        startReminderLoop();
      }else{
        $('#lockHint').textContent='密码错误';
        $('#lockPin').value='';
      }
    };
    $('#btnUnlock').onclick=doUnlock;
    $('#lockPin').onkeydown=e=>{if(e.key==='Enter')doUnlock();};
    const bio=$('#btnBioUnlock');
    if(bio)bio.onclick=()=>tryBioUnlock();
  }
  function tryBioUnlock(){
    // 优先尝试 WebAuthn（在支持的安全上下文可用）；否则提示
    if(window.PublicKeyCredential){
      navigator.credentials.get({publicKey:{challenge:new Uint8Array(32),rpId:location.hostname,userVerification:'required',allowCredentials:[]}})
        .then(()=>{
          // WebAuthn 验证通过即视为解锁（不依赖 PIN 解密本地加密数据）
          Store.setLockState({locked:false});
          $('#lock-screen').classList.add('hidden');
          $('#main').classList.remove('hidden');
          renderTab();
          startReminderLoop();
        })
        .catch(err=>{toast('生物识别不可用：'+(err.message||err));});
    }else{
      toast('当前环境不支持生物识别');
    }
  }
  // 应用深色/浅色模式：auto 跟随系统，dark/light 强制切换
  function applyDarkMode(){
    const s=Store.getSettings();
    const html=document.documentElement;
    const prefersDark=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;
    if(s.darkMode==='light'){html.setAttribute('data-theme','light');}
    else if(s.darkMode==='dark'){html.removeAttribute('data-theme');}
    else{
      // auto：默认深色主题，仅系统明确浅色时切换
      if(!prefersDark){html.setAttribute('data-theme','light');}
      else{html.removeAttribute('data-theme');}
    }
  }
  // 提醒：按天去重，支持每日提醒时间、重要日期、复盘到期
  function showReminderNotification(title,body,tag){
    if(!('Notification' in window) || Notification.permission!=='granted')return;
    const icon='./icon-192.png';
    if('serviceWorker' in navigator){
      navigator.serviceWorker.ready.then(reg=>{
        reg.showNotification(title,{body,icon,tag,badge:icon,requireInteraction:false});
      }).catch(()=>{});
    }else{
      try{new Notification(title,{body,icon});}catch(e){}
    }
  }
  function requestNotificationPermission(){
    if(!('Notification' in window)){toast('当前环境不支持系统通知');return Promise.resolve('unsupported');}
    return Notification.requestPermission().then(status=>{
      if(status==='granted'){
        Store.setSettings({notificationEnabled:true});
        toast('已开启系统通知');
      }else{
        Store.setSettings({notificationEnabled:false});
        toast('通知权限被拒绝，可在浏览器设置中手动开启');
      }
      renderTab();
      return status;
    });
  }
  function runDailyReminders(){
    const s=Store.getSettings();
    const st=Store.getRemindState();
    const tday=todayStr();
    if(st.lastRun===tday)return;
    if(remindTimeout){clearTimeout(remindTimeout);remindTimeout=null;}
    const doRemind=()=>{
      if(st.lastRun===tday)return;
      Store.setRemindState({lastRun:tday});
      if(s.remindDaily){
        const now=new Date();
        const comp=computeDaliuren(now,'其他');
        const title='玄决 · 今日时课';
        const body=`${comp.plain.tendency} · ${comp.plain.state.slice(0,60)}`;
        setTimeout(()=>{toast('今日时课：'+comp.plain.tendency+' · '+comp.plain.state);showReminderNotification(title,body,'daily-ke');},600);
      }
      if(s.remindImportant){
        const todayItems=Store.listImportant().filter(it=>daysUntil(it.date,it)===0);
        if(todayItems.length){
          const names=todayItems.map(it=>it.name).join('、');
          setTimeout(()=>{toast('今日重要日期：'+names);showReminderNotification('玄决 · 今日重要日期',names,'important-today');},1200);
        }
      }
      if(s.remindReview){
        const due=Store.listCases().filter(c=>!c.reviewed && c.reviewDue && Date.now()>c.reviewDue);
        if(due.length){
          const names=due.slice(0,3).map(c=>c.title).join('、')+(due.length>3?' 等':'')+`（共 ${due.length} 条）`;
          setTimeout(()=>{toast('待复盘提醒：'+names);showReminderNotification('玄决 · 待复盘提醒',names,'review-due');},1800);
        }
      }
    };
    if(s.remindDaily && s.dailyTime){
      const now=new Date();
      const [dh,dm]=s.dailyTime.split(':').map(x=>parseInt(x,10));
      const target=new Date(now.getFullYear(),now.getMonth(),now.getDate(),dh,dm,0);
      const ms=target.getTime()-now.getTime();
      if(ms<=0){doRemind();}
      else{remindTimeout=setTimeout(()=>{if(Store.getRemindState().lastRun!==tday)doRemind();},ms);}
    }else{
      doRemind();
    }
  }
  function startReminderLoop(){
    runDailyReminders();
    if(remindInterval)clearInterval(remindInterval);
    remindInterval=setInterval(()=>{
      const s=Store.getSettings();
      if(s.remindDaily || s.remindImportant || s.remindReview)runDailyReminders();
    },30000);
  }

  function renderTab(){
    if(state.clockInterval){clearInterval(state.clockInterval);state.clockInterval=null;}
    document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===state.tab));
    const c=$('#page-container');
    if(state.tab==='home')c.innerHTML=pageHome();
    else if(state.tab==='ask'){state.ask=state.ask||newAsk();c.innerHTML=pageAsk();}
    else if(state.tab==='board')c.innerHTML=pageBoardCenter();
    else if(state.tab==='classics')c.innerHTML=pageClassics();
    else if(state.tab==='case')c.innerHTML=pageCaseList();
    else if(state.tab==='me')c.innerHTML=pageMe();
    bindTab();
  }
  function bindTab(){
    if(state.tab==='home')bindHome();
    else if(state.tab==='ask')bindAsk();
    else if(state.tab==='board')bindBoardCenter();
    else if(state.tab==='classics')bindClassics();
    else if(state.tab==='case')bindCaseList();
    else if(state.tab==='me')bindMe();
  }

  // ================= 首页 =================
  function pageHome(){
    const now=new Date();
    const bz=Lunar.getBaZi(now);
    const lunar=Lunar.solarToLunar(now);
    const jq=Lunar.currentNextJieQi(now);
    const sc=Lunar.getShiChen(now);
    const yj=Lunar.getYueJiang(now);
    const hl=Huangli.getDayYiJi(bz.month.zhiIdx,bz.day.zhiIdx);
    const zs=Huangli.getDayZhiShen(bz.month.zhiIdx,bz.day.zhiIdx);
    const cs=Huangli.getChongSha(bz.day.zhiIdx);
    // 实时大六壬
    const comp=computeDaliuren(now,'其他');
    state.currentKe=comp;
    const p=comp.plain;
    const tendCls=p.tendency==='宜主动'?'good':(p.tendency==='宜谨慎'?'warn':'calm');
    const cases=Store.listCases();
    const todo=cases.filter(c=>!c.reviewed&&c.reviewDue&&Date.now()>c.reviewDue);
    const recent=cases.slice(0,5);
    const lifetimeCases=cases.filter(c=>c.shushu&&(c.shushu.includes('八字')||c.shushu.includes('紫微斗数'))).slice(0,3);
    const qaTypes=[['感情关系','♥'],['事业合作','★'],['学习考试','✎'],['出行移动','→'],['签约交易','§'],['人际沟通','✉'],['财务决策','¥'],['健康倾向','+'],['失物寻找','?'],['二选一决策','⇄'],['其他','⋯']];
    const settings=Store.getSettings();
    const important=settings.remindImportant?Store.listImportant():[];
    const upcoming=important.map(it=>{const d=daysUntil(it.date,it);return d!==null?Object.assign({},it,{days:d}):null;}).filter(Boolean).filter(it=>it.days>=-1&&it.days<=7).sort((a,b)=>a.days-b.days);
    const profile=Store.getProfile();
    const profileReady=profile&&profile.birth;
    const SHU_P1_QUICK=['小六壬','梅花易数','六爻','塔罗'];

    let h='';
    h+=`<div class="phead"><div><div class="ptitle">玄决</div><div class="psub">终身命理 · 实时卜筮</div></div><div class="psub" id="homeDate">${now.getFullYear()}.${pad(now.getMonth()+1)}.${pad(now.getDate())} <span id="homeClock">${pad(now.getHours())}:${pad(now.getMinutes())}</span></div></div>`;
    // 顶部精简时间卡（共用：年月日 + 干支 + 时辰 + 农历）
    h+=`<div class="card">`;
    h+=`<div class="time-row"><span class="k">农历</span><span>${lunar?lunar.monthStr+lunar.dayStr:'—'}</span></div>`;
    h+=`<div class="time-row"><span class="k">干支</span><span><span class="stem">${bz.year.gz}</span>年 <span class="stem">${bz.month.gz}</span>月 <span class="stem">${bz.day.gz}</span>日 <span class="stem">${bz.hour.gz}</span>时</span></div>`;
    h+=`<div class="time-row"><span class="k">时辰</span><span>${sc.name} ${sc.range}</span></div>`;
    h+=`<div class="time-row"><span class="k">节气</span><span>${jq.cur?jq.cur.name:'—'} → ${jq.next?jq.next.name:'—'}</span></div>`;
    h+=`<div class="time-row"><span class="k">值神</span><span>${zs.n}（${zs.g?'吉':'凶'}） · 建除 ${hl.jianchu} · ${cs.chong}${cs.sha}</span></div>`;
    h+=`<div class="yiji"><div class="yiji-box yi"><div class="yj-title">宜</div><div class="yiji-tags">${hl.yi.map(y=>`<span>${y}</span>`).join('')}</div></div><div class="yiji-box ji"><div class="yj-title">忌</div><div class="yiji-tags">${hl.ji.map(j=>`<span>${j}</span>`).join('')}</div></div></div>`;
    h+=`</div>`;

    // ============ 双栏：终身命理 / 实时卜筮 ============
    h+=`<div class="home-columns">`;

    // ---------- 左栏：终身命理 ----------
    h+=`<div class="home-column col-lifetime">`;
    h+=`<div class="column-header"><h2>终身命理</h2><span class="col-sub">基于出生日期</span></div>`;
    // 命盘档案卡
    h+=`<div class="profile-card">`;
    if(profileReady){
      const bDate=String(profile.birth).split('T')[0];
      const bHour=String(profile.birth).split('T')[1]||'';
      h+=`<div class="pc-head"><div class="pc-name">${esc(profile.nick||'我的命盘')}</div><button class="btn sm ghost" id="btnEditProfile">编辑</button></div>`;
      h+=`<div class="pc-meta">${profile.gender||'—'} · ${bDate}${bHour?(' '+bHour):''}${profile.place?(' · '+esc(profile.place)):''}</div>`;
      h+=`<div class="pc-actions"><button class="btn sm" id="btnHomeBaZi">八字排盘</button><button class="btn sm" id="btnHomeZiWei">紫微斗数</button></div>`;
    }else{
      h+=`<div class="pc-head"><div class="pc-name">尚未建档</div></div>`;
      h+=`<div class="profile-empty">填写出生日期后，可排八字 / 紫微命盘，并由 AI 顾问为你趋吉避凶。</div>`;
      h+=`<div class="pc-actions"><button class="btn primary sm" id="btnEditProfile">填写出生信息</button></div>`;
    }
    h+=`</div>`;
    // 今日宜忌卡（终身栏核心延伸：命盘喜用神×当日干支 → AI 当日行动指南）
    if(profileReady){
      h+=`<div class="card daily-yiji-card">`;
      h+=`<h3>今日宜忌 <span class="h-sub">趋吉避凶</span></h3>`;
      h+=`<div class="dy-date">${now.getFullYear()}.${pad(now.getMonth()+1)}.${pad(now.getDate())} · ${bz.day.gz}日 · ${lunar?lunar.monthStr+lunar.dayStr:''}</div>`;
      h+=`<div class="dy-body" id="dailyYiJiBody"><div class="dy-empty">基于命盘喜用神与今日干支，AI 生成当日行动指南（方位/颜色/宜/忌/人际/起居）。</div></div>`;
      h+=`<div class="dy-actions"><button class="btn primary sm" id="btnGenDailyYiJi">生成今日宜忌</button><button class="btn sm ghost hidden" id="btnDailyYiJiAsk">继续追问 ›</button></div>`;
      h+=`</div>`;
    }
    // AI 趋吉避凶顾问入口（八字）
    h+=`<div class="advisor-card lifetime">`;
    h+=`<div class="adv-title">☉ 八字 · 趋吉避凶顾问</div>`;
    h+=`<div class="adv-desc">基于八字命盘与喜用神的多轮对话，分领域给出日常行动建议。</div>`;
    h+=`<div class="adv-quick">`;
    Object.keys(AI.getLifetimeDomains()).slice(0,6).forEach(k=>{
      h+=`<span class="qchip" data-domain="${k}">${k}</span>`;
    });
    h+=`</div>`;
    h+=`<button class="btn-advisor" id="btnLifetimeBaziAdvisor"><span class="ba-ico">✦</span><span class="ba-text">开启八字顾问对话<span class="ba-sub">命盘长期记忆 · 多轮趋吉避凶</span></span></button>`;
    h+=`</div>`;
    // AI 命运推演顾问入口（紫微）
    h+=`<div class="advisor-card lifetime">`;
    h+=`<div class="adv-title">☰ 紫微 · 命运推演顾问</div>`;
    h+=`<div class="adv-desc">基于十二宫星曜、大限流年与四化的多轮对话，解读人生各领域。</div>`;
    h+=`<div class="adv-quick">`;
    ['命宫格局','大限走势','流年提示','四化解读','感情婚姻','事业财运'].forEach(k=>{
      h+=`<span class="qchip" data-domain="${k==='命宫格局'||k==='大限走势'||k==='流年提示'||k==='四化解读'?'流年运势':k}">${k}</span>`;
    });
    h+=`</div>`;
    h+=`<button class="btn-advisor" id="btnLifetimeZiweiAdvisor"><span class="ba-ico">✦</span><span class="ba-text">开启紫微顾问对话<span class="ba-sub">十二宫长期记忆 · 多轮推演</span></span></button>`;
    h+=`</div>`;
    // 命盘历史案例
    if(lifetimeCases.length){
      h+=`<div class="section-mini">命盘历史</div>`;
      h+=`<div class="card"><h3>命盘案例</h3>`;
      lifetimeCases.forEach(c=>{h+=`<div class="recent-item" data-case="${c.id}"><div><div class="ri-t">${c.title}</div><div class="ri-m">${c.shushu} · ${fmtDate(new Date(c.createdAt))}</div></div><div class="ri-r">${c.reviewed?'已复盘':'待复盘'}</div></div>`;});
      h+=`</div>`;
    }
    h+=`</div>`; // end 左栏

    // ---------- 右栏：实时卜筮 ----------
    h+=`<div class="home-column col-realtime">`;
    h+=`<div class="column-header"><h2>实时卜筮</h2><span class="col-sub">当下时课</span></div>`;
    // 此刻大六壬（精简）
    h+=`<div class="card">`;
    h+=`<h3>此刻大六壬时课</h3>`;
    h+=`<div class="time-row"><span class="k">月将 ${yj.zhi}</span><span class="k">占时 ${comp.sc.zhi}（${comp.scStr}）</span></div>`;
    h+=`<div class="one-line">${p.state}</div>`;
    h+=`<div class="tendency"><span class="tend-tag ${tendCls}">${p.tendency}</span></div>`;
    if(p.risks.length)h+=`<div class="risk-tip">⚠ ${p.risks[0]}</div>`;
    h+=`<div class="suit-row"><span style="font-size:11px;color:var(--muted)">宜：</span>${p.doAct.map(d=>`<span class="lab do">${d}</span>`).join('')}</div>`;
    h+=`<div class="suit-row"><span style="font-size:11px;color:var(--muted)">忌：</span>${p.dontAct.map(d=>`<span class="lab dont">${d}</span>`).join('')}</div>`;
    h+=`<div class="shike-cmd"><button class="btn primary block" id="btnViewBoard">查看完整盘面</button></div>`;
    h+=`</div>`;
    // 快速问事
    h+=`<div class="card"><h3>快速问事</h3><div class="qa-grid">${qaTypes.map(t=>`<div class="qa-item" data-type="${t[0]}"><div class="qa-ico">${t[1]}</div>${t[0]}</div>`).join('')}</div></div>`;
    // 多术数起课
    h+=`<div class="card"><h3>多术数起课</h3><div class="board-list">`;
    SHU_P1_QUICK.forEach(s=>{
      h+=`<div class="recent-item" data-shu="${s}"><div><div class="ri-t">${s}</div><div class="ri-m">点击此刻起课</div></div><div class="ri-r">›</div></div>`;
    });
    h+=`</div></div>`;
    // 决策对比助手（实时栏核心延伸：A/B 选项结构化决策）
    h+=`<div class="card decision-compare-card">`;
    h+=`<h3>决策对比助手 <span class="h-sub">二选一</span></h3>`;
    h+=`<div class="dc-desc">填写两个选项，AI 基于当下卦象对比利弊，给出倾向建议与观察信号。</div>`;
    h+=`<button class="btn primary block" id="btnDecisionCompare">⚖ 开始对比分析</button>`;
    h+=`</div>`;
    // AI 决策顾问入口
    h+=`<div class="advisor-card realtime">`;
    h+=`<div class="adv-title">◈ 实时决策顾问</div>`;
    h+=`<div class="adv-desc">基于当下卦象的多轮对话，帮你做出选择、判断时机、预警风险。</div>`;
    h+=`<div class="adv-quick">`;
    Object.keys(AI.getRealtimeTopics()).slice(0,6).forEach(k=>{
      h+=`<span class="qchip" data-topic="${k}">${k}</span>`;
    });
    h+=`</div>`;
    h+=`<button class="btn-advisor realtime" id="btnRealtimeAdvisor"><span class="ba-ico">◈</span><span class="ba-text">开启决策顾问对话<span class="ba-sub">卦象上下文 · 多轮决策辅助</span></span></button>`;
    h+=`</div>`;
    h+=`</div>`; // end 右栏

    h+=`</div>`; // end 双栏

    // ============ 双栏下方：通用区 ============
    // 命理趣玩
    h+=`<div class="card"><h3>命理趣玩</h3><div class="qa-grid">`;
    h+=`<div class="game-item" data-game="stick"><div class="qa-ico">🎋</div>抽今日卦签</div>`;
    h+=`<div class="game-item" data-game="tarot"><div class="qa-ico">🃏</div>塔罗日运</div>`;
    h+=`<div class="game-item" data-game="wuxing"><div class="qa-ico">☯</div>五行速配</div>`;
    h+=`<div class="game-item" data-game="star"><div class="qa-ico">✦</div>星宿查询</div>`;
    h+=`</div></div>`;
    // 首次使用引导
    if(cases.length===0){
      h+=`<div class="card home-guide-card">`;
      h+=`<h3>欢迎使用玄决</h3>`;
      h+=`<div class="guide-step"><span class="guide-num">1</span>左栏「终身命理」：填写出生信息，开启 AI 趋吉避凶顾问</div>`;
      h+=`<div class="guide-step"><span class="guide-num">2</span>右栏「实时卜筮」：起当下时课，开启 AI 决策顾问</div>`;
      h+=`<div class="guide-step"><span class="guide-num">3</span>底部「问事」进入完整向导，多术数交叉印证</div>`;
      h+=`<div class="section-note">所有数据默认保存在本机，可在“我的”页一键导出备份。</div>`;
      h+=`</div>`;
    }
    // 待复盘（受 remindReview 开关控制）
    if(settings.remindReview){
      h+=`<div class="card home-due-card" id="homeDueCard">`;
      if(todo.length){
        h+=`<h3>待复盘提醒</h3>`;
        h+=`<div class="due-count">有 ${todo.length} 条案例已到复盘时间</div>`;
        todo.slice(0,3).forEach(c=>{h+=`<div class="recent-item" data-review="${c.id}"><div><div class="ri-t">${c.title}</div><div class="ri-m">${c.questionType} · ${fmtDate(new Date(c.createdAt))}</div></div><div class="ri-r">去复盘</div></div>`;});
        if(todo.length>3)h+=`<div class="due-more" id="dueMore">查看全部 ${todo.length} 条 →</div>`;
      }else{
        h+=`<h3>待复盘提醒</h3><div class="empty">暂无待复盘案例</div>`;
      }
      h+=`</div>`;
    }
    // 重要日期提醒
    if(settings.remindImportant&&upcoming.length){
      h+=`<div class="card home-important-card">`;
      h+=`<h3>重要日期提醒</h3>`;
      upcoming.forEach(it=>{
        const dayText=it.days===0?'今天':(it.days===1?'明天':(it.days===-1?'昨天':(it.days>0?it.days+'天后':'已过期 '+(-it.days)+' 天')));
        const dateLabel=it.lunar?('农历 '+it.date):(fmtDateShort(new Date(it.date+'T00:00:00')));
        const repeatTag=it.repeat==='year'?'<span class="tag-mini">每年</span>':'';
        h+=`<div class="important-item" data-important="${it.id}"><div><div class="ii-t">${esc(it.name)}${repeatTag}</div><div class="ii-m">${dateLabel} · ${it.note||''}</div></div><div class="ii-r ${it.days===0?'urgent':''}">${dayText}</div></div>`;
      });
      h+=`<div class="important-more" id="importantMore">管理重要日期 →</div>`;
      h+=`</div>`;
    }
    // 最近案例
    h+=`<div class="card"><h3>最近案例</h3>`;
    if(recent.length){recent.forEach(c=>{h+=`<div class="recent-item" data-case="${c.id}"><div><div class="ri-t">${c.title}</div><div class="ri-m">${c.questionType} · ${c.shushu} · ${fmtDate(new Date(c.createdAt))}</div></div><div class="ri-r">${c.reviewed?(c.review.result||'已复盘'):'待复盘'}</div></div>`;});}
    else h+=`<div class="empty">暂无案例，去“问事”起一课吧</div>`;
    h+=`</div>`;
    return h;
  }
  function bindHome(){
    // 首页实时时钟：每秒刷新大时间显示
    const homeClock=$('#homeClock');
    if(homeClock){
      const tick=()=>{
        const el=$('#homeClock');
        if(el){const n=new Date();el.textContent=pad(n.getHours())+':'+pad(n.getMinutes());}
      };
      tick();
      state.clockInterval=setInterval(tick,1000);
    }
    $('#btnViewBoard').onclick=()=>{state.tab='board';renderTab();};
    document.querySelectorAll('.qa-item').forEach(e=>e.onclick=()=>{
      state.ask=newAsk();state.ask.bg.questionType=e.dataset.type;state.ask.step=2;state.tab='ask';renderTab();
    });
    // 命理排盘快捷入口
    const btnHomeBaZi=$('#btnHomeBaZi'),btnHomeZiWei=$('#btnHomeZiWei');
    if(btnHomeBaZi)btnHomeBaZi.onclick=()=>{state.ask=newAsk();state.ask.shushu=['八字'];state.ask.step=4;state.tab='ask';renderTab();};
    if(btnHomeZiWei)btnHomeZiWei.onclick=()=>{state.ask=newAsk();state.ask.shushu=['紫微斗数'];state.ask.step=4;state.tab='ask';renderTab();};
    // 编辑个人信息
    const btnEditProfile=$('#btnEditProfile');
    if(btnEditProfile)btnEditProfile.onclick=()=>{state.tab='me';renderTab();setTimeout(()=>{const c=$('#profileCard');if(c)c.scrollIntoView({behavior:'smooth',block:'center'});},60);};
    // 多术数起课
    document.querySelectorAll('[data-shu]').forEach(e=>e.onclick=()=>{
      const name=e.dataset.shu;
      const res=ShuShu.compute(name,new Date());
      if(!res){toast(name+' 暂不可用');return;}
      showShuShuBoard(res);
    });
    // 今日宜忌（终身栏核心延伸）
    const btnGenDailyYiJi=$('#btnGenDailyYiJi');
    if(btnGenDailyYiJi)btnGenDailyYiJi.onclick=()=>genDailyYiJi();
    const btnDailyYiJiAsk=$('#btnDailyYiJiAsk');
    if(btnDailyYiJiAsk)btnDailyYiJiAsk.onclick=()=>openDailyYiJiChat();
    // 终身命理 AI 顾问
    const btnLifetimeBazi=$('#btnLifetimeBaziAdvisor');
    if(btnLifetimeBazi)btnLifetimeBazi.onclick=()=>openLifetimeAdvisor('bazi');
    const btnLifetimeZiwei=$('#btnLifetimeZiweiAdvisor');
    if(btnLifetimeZiwei)btnLifetimeZiwei.onclick=()=>openLifetimeAdvisor('ziwei');
    // 实时决策 AI 顾问
    const btnRealtimeAdvisor=$('#btnRealtimeAdvisor');
    if(btnRealtimeAdvisor)btnRealtimeAdvisor.onclick=()=>openRealtimeAdvisor();
    // 决策对比助手（实时栏核心延伸）
    const btnDecisionCompare=$('#btnDecisionCompare');
    if(btnDecisionCompare)btnDecisionCompare.onclick=()=>openDecisionCompare();
    // 顾问快捷问题（点击即开启对话并发送预设问题）
    document.querySelectorAll('.advisor-card .qchip[data-domain]').forEach(e=>e.onclick=()=>{
      const card=e.closest('.advisor-card.lifetime');
      const type=card&&card.querySelector('[id^="btnLifetime"]')&&card.querySelector('[id^="btnLifetime"]').id==='btnLifetimeZiweiAdvisor'?'ziwei':'bazi';
      openLifetimeAdvisor(type,e.dataset.domain);
    });
    document.querySelectorAll('.advisor-card .qchip[data-topic]').forEach(e=>e.onclick=()=>{
      openRealtimeAdvisor(e.dataset.topic);
    });
    // 命理趣玩
    document.querySelectorAll('.game-item').forEach(e=>e.onclick=()=>openFortuneGame(e.dataset.game));
    document.querySelectorAll('[data-case]').forEach(e=>e.onclick=()=>{state.viewCaseId=e.dataset.case;state.tab='case';renderTab();setTimeout(openCaseDetail,30);});
    document.querySelectorAll('[data-review]').forEach(e=>e.onclick=()=>{state.viewCaseId=e.dataset.review;state.tab='case';renderTab();setTimeout(()=>openReview(e.dataset.review),30);});
    // 待复盘"查看全部"：跳转案例列表并自动筛选未复盘
    const dueMore=$('#dueMore');
    if(dueMore)dueMore.onclick=()=>{
      state.tab='case';renderTab();
      setTimeout(()=>{
        const r=$('#fResult');if(r){r.value='未复盘';renderCaseListBody();}
      },30);
    };
    // 重要日期管理入口
    const importantMore=$('#importantMore');
    if(importantMore)importantMore.onclick=()=>{state.subPage='important';renderTab();};
    document.querySelectorAll('[data-important]').forEach(e=>e.onclick=()=>{
      const id=e.dataset.important;
      const it=Store.getImportant(id);
      if(it){
        const dateLabel=it.lunar?('农历 '+it.date):it.date;
        modal('重要日期',`<div class="detail-row"><span class="dk">名称</span><span>${esc(it.name)}</span></div><div class="detail-row"><span class="dk">日期</span><span>${dateLabel}${it.repeat==='year'?'（每年重复）':''}</span></div><div class="detail-row"><span class="dk">备注</span><span>${esc(it.note||'—')}</span></div>`,null,true,'关闭');
      }
    });
  }

  // ================= 问事向导 =================
  function newAsk(){return{step:1,bg:{questionType:'',title:'',desc:'',mood:'',urgent:'',hasOption:false,optA:'',optB:'',persons:'',other:'',adviceType:[]},method:'auto',methodTime:'',methodInput:'',shushu:['大六壬'],extra:{birth:{gender:'',calendar:'solar',date:'',hour:'',unknownHour:false,place:'',zhenTaiyang:false},liuyao:{mode:'manual',yaos:[],manualStr:''},meihua:{mode:'time',input:''},tarot:{spread:'three'},xiaoliuren:{topic:''}},computed:null};}
  const TYPES=['感情关系','事业合作','学习考试','出行移动','签约交易','人际沟通','财务决策','健康倾向','失物寻找','二选一决策','其他'];
  const QIKE_METHODS=[['auto','当前时间自动起课'],['manual','手动选择时间'],['random','随机起卦'],['number','数字起卦'],['hanzi','汉字起卦'],['coin','硬币起卦'],['baoshu','报数起卦']];
  const SHU_PRESET=['大六壬','六爻','梅花易数','小六壬','塔罗','八字','紫微斗数'];
  const INFO_SHU=['六爻','梅花易数','小六壬','塔罗','八字','紫微斗数'];
  const REALTIME_SHU=['大六壬','六爻','梅花易数','小六壬','塔罗'];
  const BIRTH_SHU=['八字','紫微斗数'];
  const LIUYAO_MODES=[['manual','手动六次摇卦'],['auto','一键摇六爻'],['time','时间起卦'],['input','手动输入爻象']];
  const MEIHUA_MODES=[['time','时间起卦'],['number','报数起卦'],['hanzi','汉字起卦'],['random','随机起卦']];
  const TAROT_SPREADS=[['single','单张'],['three','三张'],['relation','关系'],['choice','二选一']];
  const XLR_TOPICS=['求财','谋事','感情','出行','失物','等待消息','疾病倾向','人际沟通','其他'];
  const MOODS=['平静','焦虑','急切','犹豫','愤怒','期待','低落','迷茫'];
  const URGENT=['立即','今日','本周','不急'];

  function pageAsk(){
    const a=state.ask;const s=a.step;
    const isPlaceholder=a._placeholder;
    let steps='';
    if(!isPlaceholder && s!==5){
      for(let i=1;i<=5;i++){const cls=i<s?'done':(i===s?'cur':'');steps+=`<div class="step-wrap ${i===s?'cur':''}"><div class="step-dot ${cls}">${i<s?'✓':i}</div><div class="stt">${['类型','背景','术数','信息','结果'][i-1]}</div></div>`;}
    }
    let body='';
    if(s===1)body=askStep1(a);
    else if(s===2)body=askStep2(a);
    else if(s===3)body=askStep3(a);
    else if(s===4)body=askStep4(a);
    else if(s===5)body=askStep5(a);
    // 顶部退出/重试条（结果页或盘面入口）
    let topbar='';
    if(s===5||isPlaceholder){
      const backLabel=isPlaceholder?'返回盘面':'返回问事';
      const titleText=isPlaceholder?'大六壬盘面':'问事 · 结果';
      topbar=`<div class="dl-topbar">
        <button class="dl-back" id="btnDlBack">‹ ${backLabel}</button>
        <div class="dl-title">${titleText}</div>
        <button class="dl-retry" id="btnDlRetry">重新起课</button>
      </div>`;
    }
    const pageCls='page-ask'+(s===5?' step5':'')+(isPlaceholder?' placeholder':'');
    return `<div class="${pageCls}">${topbar}<div class="phead"><div class="ptitle">问事</div></div><div class="card"><div class="steps">${steps}</div>${body}</div></div>`;
  }
  function askStep1(a){
    let h='<div class="field"><label>选择问题类型</label><div class="chips">';
    h+=TYPES.map(t=>`<span class="chip ${a.bg.questionType===t?'on':''}" data-type="${t}">${t}</span>`).join('');
    h+='</div></div>';
    h+=`<button class="btn primary block" id="nextStep" ${a.bg.questionType?'':'disabled'}>下一步</button>`;
    return h;
  }
  function askStep2(a){
    const b=a.bg;
    let h='';
    h+=`<div class="field"><label>问题标题 <span class="req">*</span></label><input type="text" id="fTitle" value="${b.title}" placeholder="如：这段关系要不要继续"></div>`;
    h+=`<div class="field"><label>问题描述</label><textarea id="fDesc" placeholder="补充背景…">${b.desc}</textarea></div>`;
    h+=`<div class="field"><label>当前情绪</label><div class="chips">${MOODS.map(m=>`<span class="chip ${b.mood===m?'on':''}" data-mood="${m}">${m}</span>`).join('')}</div></div>`;
    h+=`<div class="field"><label>紧急程度</label><div class="chips">${URGENT.map(u=>`<span class="chip ${b.urgent===u?'on':''}" data-urgent="${u}">${u}</span>`).join('')}</div></div>`;
    h+=`<div class="switch"><span>是否有明确选项</span><input type="checkbox" id="fHasOpt" ${b.hasOption?'checked':''}></div>`;
    h+=`<div id="optBox" style="${b.hasOption?'':'display:none'}"><div class="field"><label>选项 A</label><input type="text" id="fOptA" value="${b.optA}"></div><div class="field"><label>选项 B</label><input type="text" id="fOptB" value="${b.optB}"></div></div>`;
    h+=`<div class="field"><label>涉及人物</label><input type="text" id="fPersons" value="${b.persons}" placeholder="如：伴侣/同事"></div>`;
    h+=`<div class="field"><label>对方信息（可选，用于合盘）</label><input type="text" id="fOther" value="${b.other}" placeholder="出生日期时间"></div>`;
    h+=`<div class="field"><label>希望得到的建议类型</label><div class="chips">${['行动建议','风险提示','关系建议','时机建议'].map(t=>`<span class="chip ${b.adviceType.includes(t)?'on':''}" data-adv="${t}">${t}</span>`).join('')}</div></div>`;
    h+=`<div class="shike-cmd"><button class="btn ghost" id="prevStep">上一步</button><button class="btn primary" id="nextStep">下一步</button></div>`;
    return h;
  }
  function askStep3(a){
    let h='';
    h+=`<div class="field"><label>实时起课（基于当前/选定时间）</label><div class="chips">`;
    h+=REALTIME_SHU.map(s=>`<span class="chip ${a.shushu.includes(s)?'on':''}" data-shu="${s}">${s}</span>`).join('');
    h+=`</div></div>`;
    h+=`<div class="field"><label>命理排盘（基于出生日期）</label><div class="chips">`;
    h+=BIRTH_SHU.map(s=>`<span class="chip ${a.shushu.includes(s)?'on':''}" data-shu="${s}">${s}</span>`).join('');
    h+=`</div></div>`;
    const isDl=a.shushu.includes('大六壬');
    if(isDl){
      h+=`<div class="field"><label>大六壬起课方式</label><div class="chips">`;
      h+=QIKE_METHODS.map(m=>`<span class="chip ${a.method===m[0]?'on':''}" data-qike-method="${m[0]}">${m[1]}</span>`).join('');
      h+=`</div></div>`;
      if(a.method==='manual')h+=`<div class="field"><label>起课时间</label><input type="datetime-local" id="fTime" value="${a.methodTime||fmtLocalDT(new Date())}"></div>`;
      if(['number','baoshu'].includes(a.method))h+=`<div class="field"><label>输入数字（多个用逗号）</label><input type="text" id="fNum" value="${a.methodInput}" placeholder="如 3,8"></div>`;
      if(a.method==='hanzi')h+=`<div class="field"><label>输入汉字</label><input type="text" id="fHan" value="${a.methodInput}" placeholder="如 玄"></div>`;
      h+=`<div class="section-note">说明：大六壬以时间起课，数字/汉字/硬币方式将折算为占时。</div>`;
    }
    h+=`<div class="shike-cmd"><button class="btn ghost" id="prevStep">上一步</button><button class="btn primary" id="nextStep">${a.shushu.some(s=>INFO_SHU.includes(s))?'下一步':'生成结果'}</button></div>`;
    return h;
  }
  function askStep4(a){
    const selected=a.shushu;
    let h='';
    if(selected.includes('八字')||selected.includes('紫微斗数'))h+=renderBirthForm(a.extra.birth,'八字、紫微斗数');
    if(selected.includes('六爻'))h+=renderLiuYaoForm(a.extra.liuyao);
    if(selected.includes('小六壬'))h+=renderXiaoLiuRenForm(a.extra.xiaoliuren);
    if(selected.includes('梅花易数'))h+=renderMeiHuaForm(a.extra.meihua);
    if(selected.includes('塔罗'))h+=renderTarotForm(a.extra.tarot);
    if(!h)h='<div class="section-note">所选术数无需补充信息，可直接生成结果。</div>';
    h+=`<div class="shike-cmd"><button class="btn ghost" id="prevStep">上一步</button><button class="btn primary" id="nextStep">生成结果</button></div>`;
    return h;
  }
  function askStep5(a){return renderResult(a);}
  // ---------- step4 各术数信息补充表单 ----------
  // 用个人信息预填八字出生信息
  function fillBirthFromProfile(b){
    if(!b||b.date)return b; // 已有日期不再覆盖
    const p=Store.getProfile();
    if(!p||(!p.birth&&!p.gender&&!p.place&&!p.nianming))return b;
    // 个人信息中的 birth 是 datetime-local 字符串，拆成 date + hour
    if(p.birth){
      const parts=String(p.birth).split('T');
      if(parts.length>=2){b.date=parts[0];b.hour=parts[1];}
      else{b.date=p.birth;}
    }
    if(p.gender)b.gender=p.gender;
    if(p.place)b.place=p.place;
    if(p.nianming&&!b.nianming)b.nianming=p.nianming;
    return b;
  }
  // 八字案例保存后，把 birth 信息回写到个人信息（若 profile 对应字段为空）
  function syncProfileFromBirth(b){
    if(!b||!b.date)return;
    const p=Store.getProfile();
    const updates={};
    if(b.date){
      const hourStr=b.hour||'00:00';
      const nextBirth=b.date+'T'+hourStr;
      if(!p.birth||p.birth!==nextBirth)updates.birth=nextBirth;
    }
    if(b.gender&&p.gender!==b.gender)updates.gender=b.gender;
    if(b.place&&p.place!==b.place)updates.place=b.place;
    if(b.nianming&&p.nianming!==b.nianming)updates.nianming=b.nianming;
    if(Object.keys(updates).length>0)Store.setProfile(updates);
  }
  function renderBirthForm(b,title){
    fillBirthFromProfile(b);
    let h=`<div class="card"><h3>${title||'八字 · 出生信息'}</h3>`;
    h+=`<div class="field"><label>性别</label><div class="chips">${['男','女'].map(g=>`<span class="chip ${b.gender===g?'on':''}" data-birth-gender="${g}">${g}</span>`).join('')}</div></div>`;
    h+=`<div class="field"><label>历法</label><div class="chips">${[['solar','公历'],['lunar','农历']].map(m=>`<span class="chip ${b.calendar===m[0]?'on':''}" data-birth-calendar="${m[0]}">${m[1]}</span>`).join('')}</div></div>`;
    h+=renderDateTimePicker('fBirthDate','fBirthHour',b.date,b.hour,b.unknownHour);
    h+=`<div class="switch"><span>时辰未知</span><input type="checkbox" id="fBirthUnknownHour" ${b.unknownHour?'checked':''}></div>`;
    h+=`<div class="field"><label>出生地点</label><input type="text" id="fBirthPlace" value="${b.place||''}" placeholder="如 北京市"></div>`;
    h+=`<div class="switch"><span>使用真太阳时</span><input type="checkbox" id="fBirthZhenTaiyang" ${b.zhenTaiyang?'checked':''}></div>`;
    h+=`<div class="section-note">提示：可在「我的-个人信息」中预填出生时间，问事时会自动带入。</div>`;
    h+=`</div>`;
    return h;
  }
  // ===== 滚轮式日期时间选择器（年/月/日/时 四列独立滚轮，支持触摸滑动+按钮微调）=====
  // 保留隐藏的真实 input（持有 .value 并触发 change），确保与现有 collectStep4/bindStep4 读取逻辑兼容
  const DTP_ITEM_H=36;            // 单项高度（px）
  const DTP_YEAR_MIN=1900, DTP_YEAR_MAX=new Date().getFullYear()+1;
  // 解析 YYYY-MM-DD 与 HH:MM
  function dtpParse(dateStr,hourStr){
    let y=1990,mo=1,d=1,h=12,mi=0;
    if(dateStr){
      const p=dateStr.split('-');
      if(p.length>=3){y=parseInt(p[0])||1990;mo=parseInt(p[1])||1;d=parseInt(p[2])||1;}
    }
    if(hourStr){
      const p=hourStr.split(':');
      if(p.length>=2){h=parseInt(p[0])||0;mi=parseInt(p[1])||0;}
    }
    return{y,mo,d,h,mi};
  }
  function dtpPad(n){return n<10?'0'+n:''+n;}
  function dtpDateStr(v){return dtpPad(v.y)+'-'+dtpPad(v.mo)+'-'+dtpPad(v.d);}
  function dtpHourStr(v){return dtpPad(v.h)+':'+dtpPad(v.mi);}
  function dtpDaysInMonth(y,mo){return new Date(y,mo,0).getDate();}
  function dtpClampDay(v){const max=dtpDaysInMonth(v.y,v.mo);if(v.d>max)v.d=max;return v;}
  function renderDateTimePicker(dateId,hourId,dateVal,hourVal,unknownHour){
    const v=dtpParse(dateVal,hourVal);
    // 隐藏的真实 input（持有 value，供 collectStep4 读取）
    let h=`<input type="hidden" id="${dateId}" value="${dateVal||''}">`;
    h+=`<input type="hidden" id="${hourId}" value="${hourVal||''}">`;
    h+=`<div class="dtp ${unknownHour?'dtp-hour-off':''}" data-dtp="${dateId}|${hourId}">`;
    h+=`<div class="dtp-row">`;
    // 年（含快速输入与长按加速）
    h+=`<div class="dtp-col dtp-col-year" data-dtp-col="y">
      <button class="dtp-btn dtp-btn-y" data-dtp-adj="y,-1" type="button" data-hold-fast="1">−</button>
      <div class="dtp-viewport" data-dtp-vp="y"><ul class="dtp-list"></ul></div>
      <button class="dtp-btn dtp-btn-y" data-dtp-adj="y,1" type="button" data-hold-fast="1">+</button>
      <div class="dtp-col-lbl"><span class="dtp-y-edit" data-dtp-y-edit>年</span></div>
    </div>`;
    // 月
    h+=`<div class="dtp-col" data-dtp-col="mo">
      <button class="dtp-btn" data-dtp-adj="mo,-1" type="button">−</button>
      <div class="dtp-viewport" data-dtp-vp="mo"><ul class="dtp-list"></ul></div>
      <button class="dtp-btn" data-dtp-adj="mo,1" type="button">+</button>
      <div class="dtp-col-lbl">月</div>
    </div>`;
    // 日
    h+=`<div class="dtp-col" data-dtp-col="d">
      <button class="dtp-btn" data-dtp-adj="d,-1" type="button">−</button>
      <div class="dtp-viewport" data-dtp-vp="d"><ul class="dtp-list"></ul></div>
      <button class="dtp-btn" data-dtp-adj="d,1" type="button">+</button>
      <div class="dtp-col-lbl">日</div>
    </div>`;
    // 时
    h+=`<div class="dtp-col dtp-col-hour" data-dtp-col="h">
      <button class="dtp-btn" data-dtp-adj="h,-1" type="button">−</button>
      <div class="dtp-viewport" data-dtp-vp="h"><ul class="dtp-list"></ul></div>
      <button class="dtp-btn" data-dtp-adj="h,1" type="button">+</button>
      <div class="dtp-col-lbl">时</div>
    </div>`;
    // 分
    h+=`<div class="dtp-col dtp-col-min" data-dtp-col="mi">
      <button class="dtp-btn" data-dtp-adj="mi,-1" type="button">−</button>
      <div class="dtp-viewport" data-dtp-vp="mi"><ul class="dtp-list"></ul></div>
      <button class="dtp-btn" data-dtp-adj="mi,1" type="button">+</button>
      <div class="dtp-col-lbl">分</div>
    </div>`;
    h+=`</div></div>`;
    // 把初始值存到 dataset，bind 时读取
    h+=`<script class="dtp-init" data-y="${v.y}" data-mo="${v.mo}" data-d="${v.d}" data-h="${v.h}" data-mi="${v.mi}"></script>`;
    return h;
  }
  // 生成某列的选项列表
  function dtpGenItems(col,v){
    const items=[];
    if(col==='y'){
      for(let i=DTP_YEAR_MIN;i<=DTP_YEAR_MAX;i++)items.push(i);
    }else if(col==='mo'){
      for(let i=1;i<=12;i++)items.push(i);
    }else if(col==='d'){
      const max=dtpDaysInMonth(v.y,v.mo);
      for(let i=1;i<=max;i++)items.push(i);
    }else if(col==='h'){
      for(let i=0;i<24;i++)items.push(i);
    }else if(col==='mi'){
      for(let i=0;i<60;i++)items.push(i);
    }
    return items;
  }
  // 渲染某列的 ul 内容
  function dtpRenderCol(vp,col,v){
    const ul=vp.querySelector('.dtp-list');
    if(!ul)return;
    const items=dtpGenItems(col,v);
    const cur=v[col];
    ul.innerHTML=items.map(n=>`<li class="dtp-item${n===cur?' sel':''}" data-v="${n}">${n}</li>`).join('');
    const idx=items.indexOf(cur);
    if(idx>=0){
      ul.style.transform=`translateY(${DTP_ITEM_H*2 - idx*DTP_ITEM_H}px)`;
    }
  }
  // 同步隐藏 input 的 value
  function dtpSyncInputs(root,v){
    const dateId=root.dataset.dtp.split('|')[0];
    const hourId=root.dataset.dtp.split('|')[1];
    const dateInp=document.getElementById(dateId);
    const hourInp=document.getElementById(hourId);
    if(dateInp){dateInp.value=dtpDateStr(v);dateInp.dispatchEvent(new Event('change',{bubbles:true}));}
    if(hourInp){hourInp.value=dtpHourStr(v);hourInp.dispatchEvent(new Event('change',{bubbles:true}));}
  }
  // 绑定单个滚轮列的触摸滑动 + 惯性
  function dtpBindCol(root,col,v,getV,setV){
    const vp=root.querySelector(`[data-dtp-vp="${col}"]`);
    if(!vp)return;
    dtpRenderCol(vp,col,v);
    let startY=0,startTrans=0,curTrans=0,dragging=false,lastY=0,lastT=0,vel=0,rafId=null;
    function getTrans(){const m=(ul().style.transform||'').match(/-?\d+\.?\d*/);return m?parseFloat(m[0]):0;}
    function ul(){return vp.querySelector('.dtp-list');}
    function setTrans(t){ul().style.transform=`translateY(${t}px)`;}
    function maxIdx(){return dtpGenItems(col,getV()).length-1;}
    function snap(trans,animate){
      // 计算最近的项索引
      const idx=Math.round((DTP_ITEM_H*2 - trans)/DTP_ITEM_H);
      const ci=Math.max(0,Math.min(maxIdx(),idx));
      const target=DTP_ITEM_H*2 - ci*DTP_ITEM_H;
      if(animate){
        ul().style.transition='transform .25s cubic-bezier(.2,.8,.2,1)';
      }else{
        ul().style.transition='';
      }
      setTrans(target);
      // 更新选中值
      const items=dtpGenItems(col,getV());
      const newVal=items[ci];
      if(getV()[col]!==newVal){
        const nv=Object.assign({},getV());
        nv[col]=newVal;
        if(col==='y'||col==='mo'){
          // 年/月变化需重算日的最大值并钳制
          dtpClampDay(nv);
          setV(nv);
          // 日列需重新渲染
          const dVp=root.querySelector('[data-dtp-vp="d"]');
          if(dVp)dtpRenderCol(dVp,'d',nv);
        }else{
          setV(nv);
        }
        dtpSyncInputs(root,getV());
        // 更新 sel 样式
        ul().querySelectorAll('.dtp-item').forEach(li=>{
          li.classList.toggle('sel',parseInt(li.dataset.v)===newVal);
        });
      }
      // 动画结束后清除 transition
      if(animate){
        clearTimeout(dtpBindCol._t);
        dtpBindCol._t=setTimeout(()=>{ul().style.transition='';},280);
      }
    }
    function onMove(e){
      if(!dragging)return;
      const cy=e.touches?e.touches[0].clientY:e.clientY;
      let dy=cy-startY;
      curTrans=startTrans+dy;
      // 边界阻尼
      const maxUp=DTP_ITEM_H*2; // 第一项
      const maxDown=DTP_ITEM_H*2 - maxIdx()*DTP_ITEM_H; // 最后一项
      if(curTrans>maxUp)curTrans=maxUp+(curTrans-maxUp)*0.3;
      if(curTrans<maxDown)curTrans=maxDown+(curTrans-maxDown)*0.3;
      setTrans(curTrans);
      // 速度计算
      const now=Date.now();
      if(now-lastT>0){vel=(cy-lastY)/((now-lastT)||1);lastY=cy;lastT=now;}
      if(e.cancelable)e.preventDefault();
    }
    function onEnd(){
      if(!dragging)return;
      dragging=false;
      // 惯性滑动
      if(Math.abs(vel)>0.3){
        const inertia=vel*120;
        const target=curTrans+inertia;
        // 清除惯性 raf
        cancelAnimationFrame(rafId);
        snap(target,true);
      }else{
        snap(curTrans,true);
      }
      vel=0;
      document.removeEventListener('touchmove',onMove);
      document.removeEventListener('touchend',onEnd);
      document.removeEventListener('mousemove',onMove);
      document.removeEventListener('mouseup',onEnd);
    }
    function onStart(e){
      dragging=true;
      startY=e.touches?e.touches[0].clientY:e.clientY;
      startTrans=getTrans();
      curTrans=startTrans;
      lastY=startY;lastT=Date.now();vel=0;
      ul().style.transition='';
      document.addEventListener('touchmove',onMove,{passive:false});
      document.addEventListener('touchend',onEnd);
      document.addEventListener('mousemove',onMove);
      document.addEventListener('mouseup',onEnd);
      if(e.cancelable)e.preventDefault();
    }
    vp.addEventListener('touchstart',onStart,{passive:false});
    vp.addEventListener('mousedown',onStart);
    // 点击单项直接选中
    vp.addEventListener('click',e=>{
      if(dragging)return;
      const li=e.target.closest?e.target.closest('.dtp-item'):null;
      if(!li)return;
      const n=parseInt(li.dataset.v);
      const nv=Object.assign({},getV());
      nv[col]=n;
      if(col==='y'||col==='mo'){
        dtpClampDay(nv);
        setV(nv);
        // 年/月变化需重新渲染日列（天数随年月变化）
        const dVp=root.querySelector('[data-dtp-vp="d"]');
        if(dVp)dtpRenderCol(dVp,'d',getV());
      }else{
        setV(nv);
      }
      dtpSyncInputs(root,getV());
      // 当前列只更新 sel 样式与位置，不重建 DOM（避免外部缓存的 li 引用失效）
      const ulEl=vp.querySelector('.dtp-list');
      const items=dtpGenItems(col,getV());
      const curVal=getV()[col];
      ulEl.querySelectorAll('.dtp-item').forEach(it=>{
        it.classList.toggle('sel',parseInt(it.dataset.v)===curVal);
      });
      const idx=items.indexOf(curVal);
      if(idx>=0)ulEl.style.transform=`translateY(${DTP_ITEM_H*2 - idx*DTP_ITEM_H}px)`;
    });
  }
  // 绑定整个 dtp 容器
  function bindDateTimePicker(){
    document.querySelectorAll('.dtp[data-dtp]').forEach(root=>{
      if(root._dtpBound)return;
      root._dtpBound=true;
      // 读取初始值
      const init=root.parentElement.querySelector('.dtp-init');
      let v={y:1990,mo:1,d:1,h:12,mi:0};
      if(init){v={y:+init.dataset.y,mo:+init.dataset.mo,d:+init.dataset.d,h:+init.dataset.h,mi:+init.dataset.mi};}
      const getV=()=>v;
      const setV=nv=>{v=nv;};
      // 绑定四列
      ['y','mo','d','h','mi'].forEach(col=>dtpBindCol(root,col,v,getV,setV));
      // 绑定 +/- 按钮（年份支持长按快速滚动）
      const adjOnce=(btn)=>{
        const [col,delta]=btn.dataset.dtpAdj.split(',');
        const d=parseInt(delta);
        const nv=Object.assign({},v);
        const items=dtpGenItems(col,v);
        const idx=items.indexOf(v[col]);
        let ni=idx+d;
        if(ni<0)ni=0;if(ni>=items.length)ni=items.length-1;
        if(ni===idx)return; // 无变化
        nv[col]=items[ni];
        if(col==='y'||col==='mo'){dtpClampDay(nv);v=nv;const dVp=root.querySelector('[data-dtp-vp="d"]');if(dVp)dtpRenderCol(dVp,'d',v);}
        else v=nv;
        dtpSyncInputs(root,v);
        const vp=root.querySelector(`[data-dtp-vp="${col}"]`);
        if(vp)dtpRenderCol(vp,col,v);
      };
      root.querySelectorAll('[data-dtp-adj]').forEach(btn=>{
        btn.onclick=()=>adjOnce(btn);
        // 长按加速：按住 450ms 后每 80ms 连续触发，年份列每次跳 5
        if(btn.dataset.holdFast==='1'){
          let holdT=null,fastT=null,stepCnt=0;
          const startFast=()=>{
            const delta=parseInt(btn.dataset.dtpAdj.split(',')[1]);
            stepCnt++;
            // 年份长按：第 3 步起每次跳 5（快速跨越几十年）
            const step=stepCnt>=3?(delta>0?5:-5):delta;
            const orig=btn.dataset.dtpAdj;
            btn.dataset.dtpAdj='y,'+step;
            adjOnce(btn);
            btn.dataset.dtpAdj=orig;
          };
          btn.addEventListener('touchstart',()=>{
            stepCnt=0;
            holdT=setTimeout(()=>{fastT=setInterval(startFast,80);},450);
          },{passive:true});
          btn.addEventListener('mousedown',()=>{
            stepCnt=0;
            holdT=setTimeout(()=>{fastT=setInterval(startFast,80);},450);
          });
          const stopFast=()=>{clearTimeout(holdT);clearInterval(fastT);fastT=null;};
          btn.addEventListener('touchend',stopFast);
          btn.addEventListener('touchcancel',stopFast);
          btn.addEventListener('mouseup',stopFast);
          btn.addEventListener('mouseleave',stopFast);
        }
      });
      // 年份直接输入：点击"年"标签弹出输入框
      const yEditBtn=root.querySelector('[data-dtp-y-edit]');
      if(yEditBtn){
        yEditBtn.style.cursor='pointer';
        yEditBtn.title='点击直接输入年份';
        yEditBtn.onclick=(e)=>{
          e.stopPropagation();
          const cur=v.y;
          const input=prompt('请输入年份（'+DTP_YEAR_MIN+'-'+DTP_YEAR_MAX+'）',cur);
          if(input===null)return;
          const n=parseInt(input);
          if(isNaN(n)||n<DTP_YEAR_MIN||n>DTP_YEAR_MAX){
            toast('年份请输入 '+DTP_YEAR_MIN+'-'+DTP_YEAR_MAX+' 之间的数字');
            return;
          }
          const nv=Object.assign({},v);
          nv.y=n;
          dtpClampDay(nv);
          v=nv;
          const dVp=root.querySelector('[data-dtp-vp="d"]');
          if(dVp)dtpRenderCol(dVp,'d',v);
          dtpSyncInputs(root,v);
          const yVp=root.querySelector('[data-dtp-vp="y"]');
          if(yVp)dtpRenderCol(yVp,'y',v);
        };
      }
      // 时辰未知时禁用时/分列
      const updateHourDisabled=()=>{
        const off=root.classList.contains('dtp-hour-off');
        root.querySelectorAll('.dtp-col-hour,.dtp-col-min').forEach(c=>{
          c.classList.toggle('dtp-disabled',off);
          c.querySelectorAll('.dtp-btn').forEach(b=>b.disabled=off);
        });
      };
      updateHourDisabled();
      // 监听时辰未知变化（外部 checkbox 改 class）
      const mo=new MutationObserver(()=>updateHourDisabled());
      mo.observe(root,{attributes:true,attributeFilter:['class']});
    });
  }
  function yaoSymStr(y){return y.yang?'▬▬▬':'▬ ▬';}
  function randomYao(){const v=Math.floor(Math.random()*4)+6;return {val:v,yang:v%2===1,dong:v===6||v===9};}
  function parseYaoInput(str){const nums=str.split(/[,，\s]/).filter(x=>x!=='').map(x=>parseInt(x)).filter(x=>!isNaN(x)&&x>=6&&x<=9);if(nums.length!==6)return null;return nums.map(v=>({val:v,yang:v%2===1,dong:v===6||v===9}));}
  function renderLiuYaoForm(l){
    let h=`<div class="card"><h3>六爻 · 摇卦</h3>`;
    h+=`<div class="field"><label>摇卦方式</label><div class="chips">${LIUYAO_MODES.map(m=>`<span class="chip ${l.mode===m[0]?'on':''}" data-liuyao-mode="${m[0]}">${m[1]}</span>`).join('')}</div></div>`;
    if(l.mode==='manual'){
      h+=`<div class="yao-roll">`;
      for(let i=0;i<6;i++){
        const y=l.yaos[i];
        if(y)h+=`<div class="yao-roll-item"><span class="yl-idx">第${i+1}摇</span><span class="yl-sym">${yaoSymStr(y)}</span><span class="yl-name ${y.dong?'dong':''}">${yaoName(y.val)}</span></div>`;
        else{h+=`<button class="btn primary sm" id="fYaoBtn_${i}">摇第${i+1}爻</button>`;break;}
      }
      if(l.yaos.length===6)h+=`<button class="btn primary block mt8" id="fLiuYaoDone">完成摇卦</button>`;
      h+=`</div>`;
    }else if(l.mode==='auto'){
      h+=`<div class="section-note">一键随机生成六个爻象。</div>`;
      h+=`<button class="btn primary block mt8" id="fLiuYaoAuto">一键摇六爻</button>`;
      if(l.yaos.length===6)h+=`<div class="yao-roll mt8">${l.yaos.map((y,i)=>`<div class="yao-roll-item"><span class="yl-idx">第${i+1}摇</span><span class="yl-sym">${yaoSymStr(y)}</span><span class="yl-name ${y.dong?'dong':''}">${yaoName(y.val)}</span></div>`).join('')}</div>`;
    }else if(l.mode==='time'){
      h+=`<div class="section-note">将使用当前/选定的起课时间生成六爻。</div>`;
      h+=`<button class="btn primary block mt8" id="fLiuYaoTime">按时间起卦</button>`;
      if(l.yaos.length===6)h+=`<div class="yao-roll mt8">${l.yaos.map((y,i)=>`<div class="yao-roll-item"><span class="yl-idx">第${i+1}摇</span><span class="yl-sym">${yaoSymStr(y)}</span><span class="yl-name ${y.dong?'dong':''}">${yaoName(y.val)}</span></div>`).join('')}</div>`;
    }else if(l.mode==='input'){
      h+=`<div class="field"><label>输入六个爻象（6-9，用逗号分隔）</label><input type="text" id="fLiuYaoInput" value="${l.manualStr||''}" placeholder="如 7,8,6,9,8,7"></div>`;
      if(l.yaos.length===6)h+=`<div class="yao-roll mt8">${l.yaos.map((y,i)=>`<div class="yao-roll-item"><span class="yl-idx">第${i+1}摇</span><span class="yl-sym">${yaoSymStr(y)}</span><span class="yl-name ${y.dong?'dong':''}">${yaoName(y.val)}</span></div>`).join('')}</div>`;
    }
    h+=`</div>`;
    return h;
  }
  function renderMeiHuaForm(m){
    let h=`<div class="card"><h3>梅花易数 · 起卦</h3>`;
    h+=`<div class="field"><label>起卦方式</label><div class="chips">${MEIHUA_MODES.map(x=>`<span class="chip ${m.mode===x[0]?'on':''}" data-meihua-mode="${x[0]}">${x[1]}</span>`).join('')}</div></div>`;
    if(m.mode==='number')h+=`<div class="field"><label>报数（多个用逗号）</label><input type="text" id="fMeiHuaInput" value="${m.input||''}" placeholder="如 3,8"></div>`;
    if(m.mode==='hanzi')h+=`<div class="field"><label>汉字</label><input type="text" id="fMeiHuaInput" value="${m.input||''}" placeholder="如 玄"></div>`;
    if(m.mode==='random')h+=`<div class="section-note">将由系统随机取数起卦。</div>`;
    if(m.mode==='time')h+=`<div class="section-note">以当前/选定时间起卦。</div>`;
    h+=`</div>`;
    return h;
  }
  function renderTarotForm(t){
    const s=Store.getSettings();
    const rev=t.reverse||s.tarotReverse||'随机正逆位';
    let h=`<div class="card"><h3>塔罗 · 牌阵</h3>`;
    h+=`<div class="field"><label>选择牌阵</label><div class="chips">${TAROT_SPREADS.map(x=>`<span class="chip ${t.spread===x[0]?'on':''}" data-tarot-spread="${x[0]}">${x[1]}</span>`).join('')}</div></div>`;
    h+=`<div class="field"><label>正逆位</label><select id="fTarotReverse">${['随机正逆位','仅正位','仅逆位'].map(o=>`<option ${o===rev?'selected':''}>${o}</option>`).join('')}</select></div>`;
    h+=`</div>`;
    return h;
  }
  function renderXiaoLiuRenForm(x){
    let h=`<div class="card"><h3>小六壬 · 问事主题</h3>`;
    h+=`<div class="field"><label>选择主题（可选，用于细化解读）</label><div class="chips">${XLR_TOPICS.map(t=>`<span class="chip ${x.topic===t?'on':''}" data-xlr-topic="${t}">${t}</span>`).join('')}</div></div>`;
    h+=`</div>`;
    return h;
  }
  function fmtLocalDT(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes());}

  function bindAsk(){
    const a=state.ask;
    // 顶部退出/重试按钮（结果页/盘面入口）
    const btnDlBack=$('#btnDlBack');
    if(btnDlBack)btnDlBack.onclick=()=>{
      if(_aiAbort){try{_aiAbort.abort();}catch(e){}_aiAbort=null;}
      if(a._placeholder||a._shushuOnly){
        // 从盘面中心入口来的：走导航栈，回到盘面 Tab（同步消费历史记录）
        navBack();
      }else{
        // 从问事向导来的：走导航栈回到上一有意义步骤（与硬件返回键一致）
        // 若导航栈为空（如直接从问事 Tab 进入结果），回退到步骤 3/4
        if(state.navStack.length>0){
          navBack();
        }else{
          const needInfo=a.shushu.some(s=>INFO_SHU.includes(s));
          a.step=needInfo?4:3;
          a.computed=null;
          renderTab();
        }
      }
    };
    const btnDlRetry=$('#btnDlRetry');
    if(btnDlRetry)btnDlRetry.onclick=()=>{
      if(_aiAbort){try{_aiAbort.abort();}catch(e){}_aiAbort=null;}
      if(a._placeholder||a._shushuOnly){
        // 盘面入口：直接重新计算此刻起课（同屏刷新，navEnter 原地替换返回动作）
        const comp=computeDaliuren(new Date(),a.bg?a.bg.questionType:'其他');
        state.currentKe=comp;
        showDaliurenBoard(comp);
        toast('已重新起课');
      }else{
        // 问事向导：回到术数选择步骤；同步消费结果页历史记录
        if(state.navStack.length>0){
          navBack();
        }else{
          a.step=3;a.computed=null;renderTab();
        }
      }
    };
    // step1
    if(a.step===1){
      document.querySelectorAll('[data-type]').forEach(e=>e.onclick=()=>{a.bg.questionType=e.dataset.type;renderTab();});
    }
    // step2 chips
    if(a.step===2){
      document.querySelectorAll('[data-mood]').forEach(e=>e.onclick=()=>{a.bg.mood=a.bg.mood===e.dataset.mood?'':e.dataset.mood;renderTab();});
      document.querySelectorAll('[data-urgent]').forEach(e=>e.onclick=()=>{a.bg.urgent=a.bg.urgent===e.dataset.urgent?'':e.dataset.urgent;renderTab();});
      document.querySelectorAll('[data-adv]').forEach(e=>e.onclick=()=>{const t=e.dataset.adv;const i=a.bg.adviceType.indexOf(t);if(i>=0)a.bg.adviceType.splice(i,1);else a.bg.adviceType.push(t);renderTab();});
      $('#fHasOpt').onchange=ev=>{a.bg.hasOption=ev.target.checked;renderTab();};
      $('#fTitle').oninput=ev=>a.bg.title=ev.target.value;
      $('#fDesc').oninput=ev=>a.bg.desc=ev.target.value;
      $('#fOptA').oninput=ev=>a.bg.optA=ev.target.value;
      $('#fOptB').oninput=ev=>a.bg.optB=ev.target.value;
      $('#fPersons').oninput=ev=>a.bg.persons=ev.target.value;
      $('#fOther').oninput=ev=>a.bg.other=ev.target.value;
    }
    // step3：术数选择 + 大六壬起课方式
    if(a.step===3){
      document.querySelectorAll('[data-shu]').forEach(e=>e.onclick=()=>{const s=e.dataset.shu;const i=a.shushu.indexOf(s);if(i>=0)a.shushu.splice(i,1);else a.shushu.push(s);renderTab();});
      document.querySelectorAll('[data-qike-method]').forEach(e=>e.onclick=()=>{a.method=e.dataset.qikeMethod;renderTab();});
      const fTime=$('#fTime');if(fTime)fTime.onchange=ev=>a.methodTime=ev.target.value;
      const fNum=$('#fNum');if(fNum)fNum.oninput=ev=>a.methodInput=ev.target.value;
      const fHan=$('#fHan');if(fHan)fHan.oninput=ev=>a.methodInput=ev.target.value;
    }
    // step4：按术数补充信息
    if(a.step===4){
      bindStep4(a);
    }
    // nav
    const next=$('#nextStep'),prev=$('#prevStep');
    if(next)next.onclick=()=>goNext();
    if(prev)prev.onclick=()=>{state.ask.step--;renderTab();};
  }
  function bindStep4(a){
    // 八字
    document.querySelectorAll('[data-birth-gender]').forEach(e=>e.onclick=()=>{a.extra.birth.gender=e.dataset.birthGender;renderTab();});
    document.querySelectorAll('[data-birth-calendar]').forEach(e=>e.onclick=()=>{a.extra.birth.calendar=e.dataset.birthCalendar;renderTab();});
    const fBirthDate=$('#fBirthDate');if(fBirthDate)fBirthDate.onchange=ev=>a.extra.birth.date=ev.target.value;
    const fBirthHour=$('#fBirthHour');if(fBirthHour)fBirthHour.onchange=ev=>a.extra.birth.hour=ev.target.value;
    const fBirthUnknown=$('#fBirthUnknownHour');if(fBirthUnknown)fBirthUnknown.onchange=ev=>{
      a.extra.birth.unknownHour=ev.target.checked;
      // 仅切换 dtp 的禁用状态，避免整页重渲染丢失滚轮位置
      document.querySelectorAll('.dtp[data-dtp]').forEach(r=>r.classList.toggle('dtp-hour-off',ev.target.checked));
    };
    const fBirthPlace=$('#fBirthPlace');if(fBirthPlace)fBirthPlace.oninput=ev=>a.extra.birth.place=ev.target.value;
    const fBirthZhen=$('#fBirthZhenTaiyang');if(fBirthZhen)fBirthZhen.onchange=ev=>a.extra.birth.zhenTaiyang=ev.target.checked;
    // 六爻
    document.querySelectorAll('[data-liuyao-mode]').forEach(e=>e.onclick=()=>{a.extra.liuyao.mode=e.dataset.liuyaoMode;a.extra.liuyao.yaos=[];a.extra.liuyao.manualStr='';renderTab();});
    for(let i=0;i<6;i++){
      const btn=$('#fYaoBtn_'+i);
      if(btn)btn.onclick=()=>{
        btn.classList.add('yao-shake');
        setTimeout(()=>{a.extra.liuyao.yaos.push(randomYao());renderTab();},280);
      };
    }
    const doneBtn=$('#fLiuYaoDone');if(doneBtn)doneBtn.onclick=()=>{/* 完成摇卦为视觉确认 */};
    const autoBtn=$('#fLiuYaoAuto');if(autoBtn)autoBtn.onclick=()=>{
      autoBtn.classList.add('yao-shake');
      setTimeout(()=>{a.extra.liuyao.yaos=Array.from({length:6},randomYao);renderTab();},280);
    };
    const timeBtn=$('#fLiuYaoTime');if(timeBtn)timeBtn.onclick=()=>{
      const date=resolveZhanTime(a);
      const r=ShuShu.compute('六爻',date);
      if(r&&r.result&&r.result.yaos){a.extra.liuyao.yaos=r.result.yaos;}
      else{a.extra.liuyao.yaos=Array.from({length:6},randomYao);}
      renderTab();
    };
    const lyInput=$('#fLiuYaoInput');if(lyInput)lyInput.oninput=ev=>{
      a.extra.liuyao.manualStr=ev.target.value;
      const yaos=parseYaoInput(ev.target.value);
      a.extra.liuyao.yaos=yaos||[];
    };
    // 梅花
    document.querySelectorAll('[data-meihua-mode]').forEach(e=>e.onclick=()=>{a.extra.meihua.mode=e.dataset.meihuaMode;a.extra.meihua.input='';renderTab();});
    const mhInput=$('#fMeiHuaInput');if(mhInput)mhInput.oninput=ev=>a.extra.meihua.input=ev.target.value;
    // 塔罗
    document.querySelectorAll('[data-tarot-spread]').forEach(e=>e.onclick=()=>{a.extra.tarot.spread=e.dataset.tarotSpread;renderTab();});
    const fTarotReverse=$('#fTarotReverse');if(fTarotReverse)fTarotReverse.onchange=ev=>a.extra.tarot.reverse=ev.target.value;
    // 小六壬
    document.querySelectorAll('[data-xlr-topic]').forEach(e=>e.onclick=()=>{a.extra.xiaoliuren.topic=e.dataset.xlrTopic;renderTab();});
    // 滚轮式日期时间选择器
    bindDateTimePicker();
  }
  function collectStep4(a){
    const b=a.extra.birth;
    const fDate=$('#fBirthDate');if(fDate)b.date=fDate.value;
    const fHour=$('#fBirthHour');if(fHour)b.hour=fHour.value;
    const fUnknown=$('#fBirthUnknownHour');if(fUnknown)b.unknownHour=fUnknown.checked;
    const fPlace=$('#fBirthPlace');if(fPlace)b.place=fPlace.value;
    const fZhen=$('#fBirthZhenTaiyang');if(fZhen)b.zhenTaiyang=fZhen.checked;
    const lyInput=$('#fLiuYaoInput');if(lyInput){
      a.extra.liuyao.manualStr=lyInput.value;
      const yaos=parseYaoInput(lyInput.value);
      if(yaos)a.extra.liuyao.yaos=yaos;
    }
    const mhInput=$('#fMeiHuaInput');if(mhInput)a.extra.meihua.input=mhInput.value;
    const fTarotReverse=$('#fTarotReverse');if(fTarotReverse)a.extra.tarot.reverse=fTarotReverse.value;
  }
  function goNext(){
    const a=state.ask;
    if(a.step===1){if(!a.bg.questionType){toast('请选择问题类型');return;}a.step=2;renderTab();return;}
    if(a.step===2){
      if(!a.bg.title.trim()){toast('请填写问题标题');return;}
      a.step=3;renderTab();return;
    }
    if(a.step===3){
      // 收集大六壬起课输入
      if(a.shushu.includes('大六壬')){
        if(a.method==='manual'&&$('#fTime'))a.methodTime=$('#fTime').value;
        if(['number','baoshu'].includes(a.method)&&$('#fNum'))a.methodInput=$('#fNum').value;
        if(a.method==='hanzi'&&$('#fHan'))a.methodInput=$('#fHan').value;
      }
      if(!a.shushu.length){toast('请至少选择一种术数');return;}
      const needInfo=a.shushu.some(s=>INFO_SHU.includes(s));
      if(needInfo){a.step=4;renderTab();return;}
      a.computed=computeAskResult(a);a.step=5;renderTab();enterAskResultNav(a);return;
    }
    if(a.step===4){
      collectStep4(a);
      if(a.shushu.includes('六爻')&&a.extra.liuyao.yaos.length!==6){toast('请完成六爻摇卦');return;}
      if((a.shushu.includes('八字')||a.shushu.includes('紫微斗数'))&&!a.extra.birth.date){toast('请填写出生日期');return;}
      a.computed=computeAskResult(a);a.step=5;renderTab();enterAskResultNav(a);return;
    }
  }
  // 问事向导进入结果页时注册返回动作（支持硬件返回键）
  function enterAskResultNav(a){
    navEnter(()=>{
      if(_aiAbort){try{_aiAbort.abort();}catch(e){}_aiAbort=null;}
      const needInfo=a.shushu.some(s=>INFO_SHU.includes(s));
      a.step=needInfo?4:3;
      a.computed=null;
      renderTab();
    },'askResult');
  }
  function resolveZhanTime(a){
    if(a.method==='manual'&&a.methodTime){return new Date(a.methodTime);}
    if(['number','baoshu'].includes(a.method)&&a.methodInput){
      const nums=a.methodInput.split(/[,，\s]/).filter(x=>x!=='').map(x=>parseInt(x)).filter(x=>!isNaN(x));
      if(nums.length){const sum=nums.reduce((s,x)=>s+x,0);const idx=sum%12;return makeTimeFromZhi(idx);}
    }
    if(a.method==='hanzi'&&a.methodInput){let code=0;for(let i=0;i<a.methodInput.length;i++)code+=a.methodInput.charCodeAt(i);return makeTimeFromZhi(code%12);}
    if(a.method==='random'){return makeTimeFromZhi(Math.floor(Math.random()*12));}
    return new Date();
  }
  function makeTimeFromZhi(zhiIdx){
    // 构造一个今天、时辰对应的时间，用于起课
    const now=new Date();let h;
    if(zhiIdx===0)h=23;else h=(zhiIdx-1)*2+1; // 子=23,丑=1,寅=3...
    const d=new Date(now.getFullYear(),now.getMonth(),now.getDate(),h,0,0);
    return d;
  }
  function resolveBirthDate(b){
    if(!b||!b.date)return null;
    let d;
    if(b.calendar==='lunar'){
      const parts=String(b.date).split('-').map(x=>parseInt(x,10));
      if(parts.length===3&&!isNaN(parts[0])&&!isNaN(parts[1])&&!isNaN(parts[2])){
        const solar=lunarToSolar(parts[0],parts[1],parts[2],false);
        if(solar){
          const hh=b.hour?b.hour.split(':').map(x=>parseInt(x,10)||0):[0,0];
          d=new Date(solar.getFullYear(),solar.getMonth(),solar.getDate(),hh[0],hh[1]);
        }else{
          d=new Date(b.date+(b.hour?'T'+b.hour:''));
        }
      }else{
        d=new Date(b.date+(b.hour?'T'+b.hour:''));
      }
    }else{
      d=new Date(b.date+(b.hour?'T'+b.hour:''));
    }
    return d;
  }
  function computeAskResult(a){
    const date=resolveZhanTime(a);
    // 大六壬
    const comp=a.shushu.includes('大六壬')?computeDaliuren(date,a.bg.questionType):null;
    if(comp)state.currentKe=comp;
    // 其它术数
    const shushuResults={};
    a.shushu.forEach(s=>{
      if(s==='大六壬')return;
      let r=null;
      if(s==='八字'){
        const d=resolveBirthDate(a.extra.birth);
        if(d){
          const b=a.extra.birth;
          r=ShuShu.baZiByBirth?ShuShu.baZiByBirth({date:d,gender:b.gender,place:b.place,zhenTaiyang:b.zhenTaiyang,unknownHour:b.unknownHour}):ShuShu.compute('八字',d);
        }
      }else if(s==='紫微斗数'){
        const b=a.extra.birth;
        const d=resolveBirthDate(b);
        if(d){
          // 农历路径：若用户选农历，直接把农历字符串传给 iztro.byLunar（避免公历反查误差）
          const lunarInfo={date:d,gender:b.gender,place:b.place,zhenTaiyang:b.zhenTaiyang};
          if(b.calendar==='lunar' && b.date){
            // b.date 形如 "1990-5-15"（农历），iztro byLunar 接受 "YYYY-M-D"
            lunarInfo.calendar='lunar';
            lunarInfo.lunarDateStr=b.date;
            lunarInfo.isLeapMonth=!!b.isLeapMonth;
          }
          r=ShuShu.ziWeiDouShu?ShuShu.ziWeiDouShu(lunarInfo):ShuShu.compute('紫微斗数',{askInfo:{birthInfo:lunarInfo}});
        }
      }else if(s==='六爻'){
        const ly=a.extra.liuyao;
        if(ly.yaos.length===6){
          r=ShuShu.liuYaoByYaos?ShuShu.liuYaoByYaos(ly.yaos,a.bg.questionType,a.extra):ShuShu.compute('六爻',date);
          if(r&&r.result){r.result.yaos=ly.yaos;}
        }else{r=ShuShu.compute('六爻',date);}
      }else if(s==='梅花易数'){
        const mh=a.extra.meihua;
        r=ShuShu.meiHuaByInput?ShuShu.meiHuaByInput(mh.mode,mh.input,a.bg.questionType,date):ShuShu.compute('梅花易数',date);
      }else if(s==='小六壬'){
        r=ShuShu.compute('小六壬',{date,questionType:a.extra.xiaoliuren.topic||a.bg.questionType});
        if(r&&r.plain&&a.extra.xiaoliuren.topic){r.plain.state+='（问事主题：'+a.extra.xiaoliuren.topic+'）';}
      }else if(s==='塔罗'){
        const rev=a.extra.tarot.reverse||Store.getSettings().tarotReverse||'随机正逆位';
        r=ShuShu.compute('塔罗',{date,spread:a.extra.tarot.spread||'three',tarotReverse:rev});
        if(r&&r.result){r.result.spread=a.extra.tarot.spread;}
      }else{
        r=ShuShu.compute(s,date);
      }
      if(r){shushuResults[s]=r;}
    });
    return{date,comp,shushu:a.shushu,shushuResults,extra:a.extra};
  }
  function renderResult(a){
    const c=a.computed;
    const sensitive=AI.detectSensitive(a.bg.title+' '+a.bg.desc);
    let h='';
    if(sensitive){
      h+=`<div class="card"><div class="warn-text">检测到敏感关键词「${sensitive.keyword}」。</div><div class="section-note">${sensitiveHint(sensitive.cat)}</div></div>`;
    }
    // 盘面中心入口：单一术数结果对象（兼容旧数据结构）
    if(c.shushu && typeof c.shushu==='object' && !Array.isArray(c.shushu) && c.shushu.name && !c.comp){
      h+=renderShuShuResult(c.shushu);
      h+=`<div class="card"><h3>操作</h3>`;
      h+=`<button class="btn primary block mt8" id="btnSaveCase">保存为案例</button>`;
      h+=`<button class="btn block mt8" id="btnExportBoard">导出盘面（文本）</button>`;
      h+=`</div>`;
      setTimeout(()=>bindResult(a),20);
      return h;
    }
    let mainPlain=null;
    if(c.comp){
      mainPlain=c.comp.plain;
      h+=renderDaliurenResult(c.comp);
      // 其它术数辅盘：按实时 / 命理分组
      const others=a.shushu.filter(s=>s!=='大六壬');
      if(others.length && c.shushuResults){
        h+=renderShuShuGroups(others, c.shushuResults, mainPlain);
      }
    }else if(c.shushuResults){
      // 无主盘，取第一个有结果的术数做主盘
      const mainName=a.shushu.find(s=>c.shushuResults[s]);
      if(mainName){
        mainPlain=c.shushuResults[mainName].plain;
        h+=renderShuShuResult(c.shushuResults[mainName]);
        const others=a.shushu.filter(s=>s!==mainName);
        if(others.length){
          h+=renderShuShuGroups(others, c.shushuResults, mainPlain, '其它术数');
        }
      }else{
        h+=`<div class="card"><div class="warn-text">未能生成术数结果</div></div>`;
      }
    }else{
      h+=`<div class="card"><div class="warn-text">暂无计算结果</div></div>`;
    }
    // 多盘交叉摘要（T3）：多术数结果展示后调用 CrossAnalyzer 生成交叉分析
    {
      const sr=c.shushuResults||{};
      if(Object.keys(sr).length>=2 || (c&&c.comp&&Object.keys(sr).length>=1)){
        const mainName = c&&c.comp?'大六壬':Object.keys(sr)[0];
        const allResults = {};
        if(c&&c.comp) allResults['大六壬']={name:'大六壬',result:c.comp.ke,plain:c.comp.plain};
        Object.keys(sr).forEach(k=>{allResults[k]=sr[k];});
        const cross = CrossAnalyzer.analyze(mainName, allResults);
        h += renderCrossSummary(cross);
      }
    }
    h+=`<div class="card"><h3>操作</h3>`;
    h+=`<button class="btn primary block mt8" id="btnSaveCase">保存为案例</button>`;
    if(c.comp||Object.keys(c.shushuResults||{}).length){
      h+=`<button class="btn gold block mt8" id="btnAIDeep">AI 深度解读</button>`;
    }
    if(c.comp||Object.keys(c.shushuResults||{}).length){
      h+=`<button class="btn primary block mt8" id="btnAIChat">AI 顾问对话（多轮）</button>`;
    }
    if(c.comp||Object.keys(c.shushuResults||{}).length){
      h+=`<button class="btn block mt8" id="btnCopyPrompt">复制 AI 提示词</button>`;
    }
    h+=`<button class="btn block mt8" id="btnExportBoard">导出盘面（文本）</button>`;
    if(mainPlain){
      h+=`<div class="section-note">复盘提醒：约 ${mainPlain.reviewDays} 日后（系统将出现在首页与案例库）</div>`;
    }
    h+=`</div>`;
    // AI 深度解读输出区（按需展开）
    h+=`<div class="card ai-output-card hidden" id="aiOutputCard"><h3>AI 深度解读 <span class="ai-badge" id="aiModelBadge">${a.computed&&a.computed.comp?'':'模型'}</span></h3><div id="aiOutput" class="ai-output"></div></div>`;
    setTimeout(()=>bindResult(a),20);
    return h;
  }
  // P1 术数结果渲染分发
  function renderShuShuResult(res){
    const r=res.result,p=res.plain;
    let h=`<div class="card"><div class="shu-result-title">${res.name}<span class="shu-badge">${tendencyBadge(p.tendency)}</span></div>`;
    if(res.name==='小六壬')h+=renderXiaoLiuRen(r);
    else if(res.name==='梅花易数')h+=renderMeiHua(r);
    else if(res.name==='六爻')h+=renderLiuYao(r);
    else if(res.name==='塔罗')h+=renderTarot(r);
    else if(res.name==='八字')h+=renderBaZi(r);
    else if(res.name==='紫微斗数')h+=renderZiWei(r);
    h+=`</div>`;
    // 白话
    h+=`<div class="card"><h3>${res.name} · 白话解读</h3>`;
    h+=`<div class="plain-card"><div class="pc-t">当前状态</div><div class="pc-c">${p.state}</div></div>`;
    h+=`<div class="plain-card"><div class="pc-t">总体倾向</div><div class="pc-c">${p.tendency}</div></div>`;
    if(p.opps&&p.opps.length)h+=`<div class="plain-card"><div class="pc-t">主要机会</div><div class="pc-c">${p.opps.filter(Boolean).join('；')}</div></div>`;
    if(p.risks&&p.risks.length)h+=`<div class="plain-card"><div class="pc-t">主要阻力</div><div class="pc-c">${p.risks.join('；')}</div></div>`;
    h+=`<div class="plain-card"><div class="pc-t">环境/对方</div><div class="pc-c">${p.env}</div></div>`;
    h+=`<div class="plain-card"><div class="pc-t">建议行动</div><div class="pc-c">${p.doAct.join('；')}</div></div>`;
    h+=`<div class="plain-card"><div class="pc-t">不建议行动</div><div class="pc-c">${p.dontAct.join('；')}</div></div>`;
    h+=`<div class="plain-card"><div class="pc-t">观察信号</div><div class="pc-c">${p.signals.join('；')}</div></div>`;
    h+=`</div>`;
    h+=renderSourcesPanel(p,state.currentRagPassages);
    return h;
  }
  function renderShuShuGroups(list, results, mainPlain, title){
    const realtime=list.filter(s=>REALTIME_SHU.includes(s));
    const birth=list.filter(s=>BIRTH_SHU.includes(s));
    let h='';
    if(realtime.length||birth.length){
      h+=`<div class="card"><h3>${title||'其它术数辅盘'}</h3>`;
      if(realtime.length){
        h+=`<div class="section-note">实时起课</div>`;
        realtime.forEach(s=>{
          const r=results[s];
          if(r)h+=renderShuShuResult(r);
          else h+=`<div class="plain-card"><div class="pc-t">${s}</div><div class="pc-c">${mainPlain?crossHint(s,mainPlain):'未生成结果'}</div></div>`;
        });
      }
      if(birth.length){
        h+=`<div class="section-note mt12">命理排盘（基于出生日期）</div>`;
        birth.forEach(s=>{
          const r=results[s];
          if(r)h+=renderShuShuResult(r);
          else h+=`<div class="plain-card"><div class="pc-t">${s}</div><div class="pc-c">请填写出生信息后重新生成。</div></div>`;
        });
      }
      h+=`</div>`;
    }
    return h;
  }
  function renderSourcesPanel(plain,ragPassages){
    const sources=(plain&&plain.sources)||[];
    const rules=sources.filter(s=>s.type==='rule');
    let h=`<div class="card"><h3>依据来源</h3>`;
    if(rules.length){
      h+=`<div class="source-sec"><div class="source-sec-title">盘面规则</div>`;
      rules.forEach(r=>{h+=`<div class="source-item"><span class="source-tag rule">规则</span><span>${r.text||r.content||r.name||''}</span></div>`;});
      h+=`</div>`;
    }
    h+=`<div class="source-sec"><div class="source-sec-title">AI 推断说明</div><div class="source-item"><span class="source-tag ai">AI</span>本解读由离线规则引擎结合问题背景生成，未调用远程模型时仅作参考，不构成确定性预测。</div></div>`;
    // 古籍引用：优先使用传入的 ragPassages，其次取全局 state.currentRagPassages
    const classics=(ragPassages||state.currentRagPassages||[]);
    if(classics.length){
      h+=`<div class="source-sec"><div class="source-sec-title">古籍引用</div>`;
      classics.forEach(p=>{
        h+=`<div class="source-item classic-cite" data-passage-id="${p.id}">
        <span class="source-tag classic">古籍</span>
        <div class="classic-cite-body">
          <div class="cc-book">${p.book||''} · ${p.chapter||''}</div>
          <div class="cc-text">${(p.text||'').slice(0,80)}${p.text&&p.text.length>80?'…':''}</div>
          <button class="cc-jump" data-jump-id="${p.id}">查看原文</button>
        </div>
      </div>`;
      });
      h+=`</div>`;
    }else{
      h+=`<div class="source-sec"><div class="source-sec-title">古籍引用</div><div class="source-item"><span class="source-tag classic">古籍</span>当前未检索到直接相关古籍依据，结果基于盘面规则生成。</div></div>`;
    }
    h+=`</div>`;
    return h;
  }
  function tendencyBadge(t){return t.replace('宜','');}
  function renderXiaoLiuRen(r){
    let h=`<div class="xlr-flow">`;
    h+=`<div class="xlr-node"><div class="xn-t">月</div><div class="xn-v">${r.month}</div></div>`;
    h+=`<span class="xlr-arrow">→</span>`;
    h+=`<div class="xlr-node"><div class="xn-t">日</div><div class="xn-v">${r.day}</div></div>`;
    h+=`<span class="xlr-arrow">→</span>`;
    h+=`<div class="xlr-node xlr-final"><div class="xn-t">时（结果）</div><div class="xn-v">${r.time}</div></div>`;
    h+=`</div>`;
    const d=r.detail;
    h+=`<div class="kv-grid">`;
    h+=`<div class="kv"><span class="k">属性</span><span class="v">${d.attr}（${d.wx}）</span></div>`;
    h+=`<div class="kv"><span class="k">吉凶</span><span class="v">${d.ji}</span></div>`;
    h+=`</div>`;
    h+=`<div class="section-note">${d.desc}</div>`;
    return h;
  }
  function renderMeiHua(r){
    let h=`<div class="bagua-box">`;
    h+=`<div class="bagua-stack">`;
    h+=`<div class="bs-up">上卦 ${r.up.sym} ${r.up.n}（${r.up.attr}·${r.up.wx}）</div>`;
    h+=`<div class="bs-dn">下卦 ${r.dn.sym} ${r.dn.n}（${r.dn.attr}·${r.dn.wx}）</div>`;
    h+=`<div class="bs-name">${r.guaName}</div>`;
    h+=`</div></div>`;
    h+=`<div class="kv-grid">`;
    h+=`<div class="kv"><span class="k">动爻</span><span class="v">第 ${r.dongLine} 爻</span></div>`;
    h+=`<div class="kv"><span class="k">体卦</span><span class="v">${r.tiGua.n}（${r.tiGua.wx}）</span></div>`;
    h+=`<div class="kv"><span class="k">用卦</span><span class="v">${r.yongGua.n}（${r.yongGua.wx}）</span></div>`;
    h+=`<div class="kv"><span class="k">体用关系</span><span class="v">${r.rel}</span></div>`;
    h+=`<div class="kv"><span class="k">互卦</span><span class="v">${r.huGua.name}</span></div>`;
    h+=`<div class="kv"><span class="k">变卦</span><span class="v">${r.bianGua.name}</span></div>`;
    h+=`</div>`;
    // 起卦数：时间起卦含年月日时；其余方式仅含 type，避免显示 undefined
    const _nums=r.numbers||{};
    const _numNote=_nums.year!==undefined?`起卦数：年${_nums.year} 月${_nums.month} 日${_nums.day} 时${_nums.time}`:(_nums.type?`起卦方式：${_nums.type}`:'');
    if(_numNote)h+=`<div class="section-note">${_numNote}</div>`;
    return h;
  }
  function renderLiuYao(r){
    let h=`<div class="shu-result-title" style="font-size:18px;margin:6px 0">${r.benGua}${r.bianGua!==r.benGua?' → '+r.bianGua:''}</div>`;
    // 卦器视觉：六爻图形化展示（米黄宣纸 + 古铜棕，传统书卷风）
    h+=`<div class="liuyao-visual">`;
    h+=`<div class="ly-hexagram">`;
    // Unicode 卦象符号（64卦 U+4DC0–U+4DFF）
    const guaSyms='䷀䷁䷂䷃䷄䷅䷆䷇䷈䷉䷊䷋䷌䷍䷎䷏䷐䷑䷒䷓䷔䷕䷖䷗䷘䷙䷚䷛䷜䷝䷞䷟䷠䷡䷢䷣䷤䷥䷦䷧䷨䷩䷪䷫䷬䷭䷮䷯䷰䷱䷲䷳䷴䷵䷶䷷䷸䷹䷺䷻䷼䷽䷾䷿';
    const benBits=r.yaos.map(y=>y.yang?1:0);
    const upIdx=7-parseInt(benBits.slice(3).join(''),2);
    const dnIdx=7-parseInt(benBits.slice(0,3).join(''),2);
    const guaSym=guaSyms[upIdx*8+dnIdx];
    h+=`<div class="ly-gua-unicode">${guaSym}</div>`;
    const yaoNames=['初爻','二爻','三爻','四爻','五爻','上爻'];
    const yongIdx=(r.yongShen&&r.yongShen.yao&&r.yongShen.yao.idx)?r.yongShen.yao.idx:null;
    const kwStr=r.kongWang||'';
    const kwZhis=kwStr?kwStr.split(''):[];
    const yuePoLines=(r.yuePo&&Array.isArray(r.yuePo.lines))?r.yuePo.lines:[];
    // 从上爻到初爻排列（传统排法，自下而上成卦，显示自上而下）
    for(let i=r.yaos.length-1;i>=0;i--){
      const y=r.yaos[i];
      const yangCls=y.yang?'yang':'yin';
      const dongCls=y.dong?'dong':'';
      let marks='';
      if(y.isShi)marks+='<span class="ly-yao-mark shi">世</span>';
      if(y.isYing)marks+='<span class="ly-yao-mark ying">应</span>';
      if(yongIdx&&y.idx===yongIdx)marks+='<span class="ly-yao-mark yong">用</span>';
      if(kwZhis.includes(y.zhi))marks+='<span class="ly-yao-mark kong">空</span>';
      if(yuePoLines.includes(y.idx))marks+='<span class="ly-yao-mark po">破</span>';
      h+=`<div class="ly-yao">`;
      h+=`<span class="ly-yao-label">${yaoNames[i]}</span>`;
      h+=`<div class="ly-yao-line ${yangCls} ${dongCls}">`;
      if(y.dong)h+=`<span class="ly-yao-dong-mark">${y.yang?'◯':'✕'}</span>`;
      h+=`</div>`;
      h+=`<span class="ly-yao-marks">${marks}</span>`;
      h+=`</div>`;
    }
    h+=`<div class="ly-gua-name">${r.benGua}</div>`;
    if(r.bianGua!==r.benGua)h+=`<div class="ly-gua-change">→ ${r.bianGua}</div>`;
    if(r.palace)h+=`<div class="ly-gua-palace">${r.palace}宫·${r.palaceWx||''}</div>`;
    h+=`</div></div>`;
    // 传统六爻排盘表：六神｜六亲｜爻象｜干支｜世应｜动变
    const liuShenArr=['青龙','朱雀','勾陈','螣蛇','白虎','玄武'];
    const liuShenIcons={青龙:'🐉',朱雀:'🐦',勾陈:'🐐',螣蛇:'🐍',白虎:'🐅',玄武:'🐢'};
    // 起六神：依日干，甲乙起青龙、丙丁起朱雀、戊起勾陈、己起螣蛇、庚辛起白虎、壬癸起玄武
    const dayGan=r.dayGan||'';
    let startShenIdx=0;
    if(/[甲乙]/.test(dayGan))startShenIdx=0;
    else if(/[丙丁]/.test(dayGan))startShenIdx=1;
    else if(dayGan==='戊')startShenIdx=2;
    else if(dayGan==='己')startShenIdx=3;
    else if(/[庚辛]/.test(dayGan))startShenIdx=4;
    else if(/[壬癸]/.test(dayGan))startShenIdx=5;
    h+=`<table class="ly-table"><thead><tr><th>六神</th><th>六亲</th><th>爻象</th><th>干支</th><th>世应</th><th>动变</th></tr></thead><tbody>`;
    // 自上爻到初爻显示
    for(let i=r.yaos.length-1;i>=0;i--){
      const y=r.yaos[i];
      const symStr=y.yang?'▅▅▅▅▅':'▅▅ ▅▅';
      const dongSym=y.dong?(y.yang?' ◯':' ✕'):'';
      const shenIdx=(startShenIdx+i)%6;
      const shenName=liuShenArr[shenIdx];
      let shiYing='';
      if(y.isShi)shiYing='<span class="shi-ying">世</span>';
      else if(y.isYing)shiYing='<span class="shi-ying ying">应</span>';
      let dongChange='';
      if(y.dong){
        // 变爻：阳变阴 / 阴变阳
        const changeGz=y.gz;
        dongChange=`<span class="dong-change">${y.yang?'阳→阴':'阴→阳'}</span>`;
      }
      const kongMark=kwZhis.includes(y.zhi)?'<span class="kong-mark">空</span>':'';
      const poMark=yuePoLines.includes(y.idx)?'<span class="kong-mark">破</span>':'';
      h+=`<tr class="${y.dong?'dong-row':''}">`;
      h+=`<td class="liu-shen">${liuShenIcons[shenName]||''}${shenName}</td>`;
      h+=`<td class="liu-qin">${y.liuQin||'—'}${yongIdx&&y.idx===yongIdx?'<span class="ly-yao-mark yong">用</span>':''}</td>`;
      h+=`<td class="yao-sym ${y.dong?'dong':''}">${symStr}${dongSym}</td>`;
      h+=`<td class="gan-zhi">${y.gz||'—'}${kongMark}${poMark}</td>`;
      h+=`<td>${shiYing}</td>`;
      h+=`<td>${dongChange||'—'}</td>`;
      h+=`</tr>`;
    }
    h+=`</tbody></table>`;
    // 基础信息
    h+=`<div class="kv-grid mt8">`;
    h+=`<div class="kv"><span class="k">本卦</span><span class="v">${r.benGua}</span></div>`;
    h+=`<div class="kv"><span class="k">变卦</span><span class="v">${r.bianGua}</span></div>`;
    h+=`<div class="kv"><span class="k">动爻数</span><span class="v">${r.dongCount}</span></div>`;
    h+=`<div class="kv"><span class="k">日干五行</span><span class="v">${r.dayGanWx}${r.dayZhiWx?' / 日支 '+r.dayZhiWx:''}</span></div>`;
    h+=`</div>`;
    // 专业汇总卡片
    h+=`<div class="kv-grid mt8">`;
    h+=`<div class="kv"><span class="k">卦宫</span><span class="v">${r.palace||'—'}（${r.palaceWx||'—'}）</span></div>`;
    h+=`<div class="kv"><span class="k">世爻</span><span class="v">第 ${r.shiLine} 爻</span></div>`;
    h+=`<div class="kv"><span class="k">应爻</span><span class="v">第 ${r.yingLine} 爻</span></div>`;
    const ys=r.yongShen;
    if(ys)h+=`<div class="kv"><span class="k">用神</span><span class="v">${ys.target}${ys.yao?' · '+ys.yao.gz:''}</span></div>`;
    h+=`<div class="kv"><span class="k">空亡</span><span class="v">${r.kongWang||'—'}</span></div>`;
    if(r.yuePo)h+=`<div class="kv"><span class="k">月破</span><span class="v">${r.yuePo.zhi}${r.yuePo.lines&&r.yuePo.lines.length?'（第'+r.yuePo.lines.join('、')+'爻）':''}</span></div>`;
    h+=`<div class="kv"><span class="k">日辰生克</span><span class="v">${r.dayRiRelation||'—'}</span></div>`;
    h+=`</div>`;
    if(ys&&ys.desc)h+=`<div class="section-note">用神说明：${ys.desc}</div>`;
    return h;
  }
  function renderTarot(r){
    // 卡牌视觉版：深紫蓝金神秘风 3D 翻转卡牌 + 详情面板（参考 Rider-Waite）
    // 每张大阿卡纳对应符号与元素
    const TAROT_ICONS={
      '愚者':'🌟','魔术师':'♾','女祭司':'🌙','皇后':'🌹','皇帝':'♈','教皇':'⛪','恋人':'💞','战车':'🏛',
      '力量':'🦁','隐士':'🏮','命运之轮':'☸','正义':'⚖','倒吊人':'🙃','死神':'💀','节制':'🏺','恶魔':'😈',
      '高塔':'🗼','星星':'⭐','月亮':'☾','太阳':'☀','审判':'📯','世界':'🌍'
    };
    let h=`<div class="tarot-visual-spread">`;
    r.cards.forEach((c,i)=>{
      const sym=TAROT_ICONS[c.name]||'✦';
      const cardData=`data-name="${esc(c.name)}" data-up="${c.up?1:0}" data-meaning="${esc(c.meaning||'')}" data-element="${esc(c.element||'')}" data-pos="${esc(c.pos||'')}"`;
      h+=`<div class="tarot-visual-card" data-idx="${i}" ${cardData}>`;
      h+=`<div class="tarot-vc-inner">`;
      // 卡背：深蓝紫 + 金色放射 + 日月星辰
      h+=`<div class="tarot-vc-back">`;
      h+=`<div class="tvc-back-rays"></div>`;
      h+=`<div class="tvc-back-emblem">✦</div>`;
      h+=`<div class="tvc-back-title">玄决 TAROT</div>`;
      h+=`</div>`;
      // 卡正面：暖米色 RWS 经典 + 双层金边
      h+=`<div class="tarot-vc-front ${c.up?'':'reversed'}">`;
      h+=`<div class="tarot-vc-num">${c.key||''}</div>`;
      h+=`<div class="tarot-vc-sym">${sym}</div>`;
      h+=`<div class="tarot-vc-name">${c.name}</div>`;
      h+=`<div class="tarot-vc-element">${c.element||''}</div>`;
      h+=`<div class="tarot-vc-status ${c.up?'up':'rev'}">${c.up?'正位':'逆位'}</div>`;
      h+=`<div class="tarot-vc-pos">${c.pos||''}</div>`;
      h+=`</div></div></div>`;
    });
    h+=`</div>`;
    h+=`<div class="section-note" style="text-align:center;color:var(--muted);font-size:11px">点击卡牌翻面查看详情</div>`;
    // 详情面板：默认显示第一张
    const c0=r.cards[0];
    h+=`<div class="tarot-detail-panel" id="tarotDetailPanel">`;
    h+=`<div class="tdp-name">${c0.name}<span class="${c0.up?'tdp-up':'tdp-rev'}">${c0.up?'正位':'逆位'}</span></div>`;
    if(c0.element)h+=`<div class="tdp-element">元素 / 对应：${c0.element}</div>`;
    if(c0.pos)h+=`<div class="tdp-element">位置：${c0.pos}</div>`;
    h+=`<div class="tdp-meaning">${c0.meaning||''}</div>`;
    h+=`</div>`;
    return h;
  }
  function renderBaZi(r){
    let h=`<div class="bazi-pillars">`;
    r.pillars.forEach(p=>{
      h+=`<div class="bazi-col ${p.name==='日柱'?'day':''}">`;
      h+=`<div class="bc-t">${p.name}</div>`;
      h+=`<div class="bc-gz">${p.gz}</div>`;
      h+=`<div class="bc-wx">${p.ganWx}/${p.zhiWx}</div>`;
      h+=`<div class="bc-shen">${p.ganShen}</div>`;
      // 地支藏干 + 十神
      if(p.cang&&p.cang.length){
        const cangStr=p.cang.map(c=>c.gan+'('+c.shen+')').join(' ');
        h+=`<div class="bc-cang">${cangStr}</div>`;
      }else if(p.unknown){
        h+=`<div class="bc-cang muted">—</div>`;
      }
      h+=`</div>`;
    });
    h+=`</div>`;
    // 五行力量图：四柱干支(wxCount) + 含藏干(wxCountAll)
    h+=`<div class="wx-bar"><div class="wx-bar-title">四柱干支五行</div>`;
    Object.keys(r.wxCount).forEach(k=>{
      h+=`<div class="wx-pill"><div class="wp-n">${k}</div><div class="wp-c">${r.wxCount[k]}</div></div>`;
    });
    h+=`</div>`;
    if(r.wxCountAll){
      h+=`<div class="wx-bar"><div class="wx-bar-title">含藏干五行</div>`;
      Object.keys(r.wxCountAll).forEach(k=>{
        h+=`<div class="wx-pill"><div class="wp-n">${k}</div><div class="wp-c">${r.wxCountAll[k]}</div></div>`;
      });
      h+=`</div>`;
    }
    // 基础信息 + 流年流月
    h+=`<div class="kv-grid mt8">`;
    h+=`<div class="kv"><span class="k">日主</span><span class="v">${r.dayGan}（${r.dayWx}）</span></div>`;
    h+=`<div class="kv"><span class="k">强弱</span><span class="v">${r.dayStrong?'偏强':'偏弱'}</span></div>`;
    h+=`<div class="kv"><span class="k">五行</span><span class="v">${r.wxStr}</span></div>`;
    h+=`<div class="kv"><span class="k">参考用神</span><span class="v">${r.yongShen}</span></div>`;
    if(r.liuNian&&r.liuNian.gz)h+=`<div class="kv"><span class="k">当前流年</span><span class="v">${r.liuNian.gz}</span></div>`;
    if(r.liuYue&&r.liuYue.gz)h+=`<div class="kv"><span class="k">当前流月</span><span class="v">${r.liuYue.gz}</span></div>`;
    h+=`</div>`;
    // 大运列表：标记当前大运
    if(r.daYun&&r.daYun.pillars&&r.daYun.pillars.length){
      let curIdx=-1;
      if(r.birthDate){
        const now=new Date();
        const age=(now-r.birthDate)/(365.25*86400000);
        const startAge=r.daYun.startAge||0;
        if(age>=startAge){
          curIdx=Math.floor((age-startAge)/10);
          if(curIdx>=r.daYun.pillars.length)curIdx=r.daYun.pillars.length-1;
          if(curIdx<0)curIdx=-1;
        }
      }
      h+=`<div class="dayun-row">`;
      h+=`<div class="dayun-title">大运（${r.daYun.forward?'顺排':'逆排'}，起运 ${r.daYun.startAge} 岁）</div>`;
      h+=`<div class="dayun-list">`;
      r.daYun.pillars.forEach((dy,i)=>{
        const isCur=i===curIdx;
        h+=`<div class="dayun-item${isCur?' cur':''}">`;
        h+=`<div class="dy-gz">${dy.gz}</div>`;
        h+=`<div class="dy-age">${dy.age}岁起</div>`;
        if(isCur)h+=`<div class="dy-mark">当前</div>`;
        h+=`</div>`;
      });
      h+=`</div></div>`;
    }
    return h;
  }
  function renderZiWei(r){
    if(!r||!r.astrolabe)return '<div class="section-note">紫微斗数排盘数据异常</div>';
    const a=r.astrolabe;
    let h=`<div class="zw-summary">`;
    h+=`<div class="kv-grid">`;
    h+=`<div class="kv"><span class="k">命宫</span><span class="v">${r.soulPalace||'未知'}</span></div>`;
    h+=`<div class="kv"><span class="k">身宫</span><span class="v">${r.bodyPalace||'未知'}</span></div>`;
    h+=`<div class="kv"><span class="k">命主</span><span class="v">${a.soul||'未知'}</span></div>`;
    h+=`<div class="kv"><span class="k">身主</span><span class="v">${a.body||'未知'}</span></div>`;
    h+=`<div class="kv"><span class="k">五行局</span><span class="v">${a.fiveElementsClass||'未知'}</span></div>`;
    h+=`<div class="kv"><span class="k">出生时间</span><span class="v">${r.solarDate||''} ${a.time||''}</span></div>`;
    h+=`</div>`;
    if(r.majorStars&&r.majorStars.length){
      h+=`<div class="section-note">命宫主星：${r.majorStars.join('、')}</div>`;
    }
    // 十二宫简表：宫名 + 宫干支 + 主星 + 辅星（参考 react-iztro 布局，分字号显示）
    if(a.palaces&&a.palaces.length===12){
      h+=`<div class="zw-palaces">`;
      a.palaces.forEach(pal=>{
        const stars=(pal.majorStars||[]).map(s=>s.name+(s.brightness?('('+s.brightness+')'):'')).filter(Boolean).join('、')||'无主星';
        const minor=(pal.minorStars||[]).map(s=>s.name).filter(Boolean).join('、');
        const adj=(pal.adjectiveStars||[]).map(s=>s.name).filter(Boolean).join('、');
        const gz=(pal.heavenlyStem||'')+(pal.earthlyBranch||'');
        const isSoul=pal.name===r.soulPalace;
        const isBody=pal.name===r.bodyPalace;
        h+=`<div class="zw-palace${isSoul?' soul':''}${isBody?' body':''}">`;
        h+=`<div class="zwp-head"><span class="zwp-name">${pal.name}</span><span class="zwp-gz">${gz}</span></div>`;
        h+=`<div class="zwp-stars">${stars}</div>`;
        if(minor)h+=`<div class="zwp-minor">${minor}</div>`;
        if(adj)h+=`<div class="zwp-adj">${adj}</div>`;
        if(isSoul)h+=`<div class="zwp-tag tag-soul">命</div>`;
        if(isBody)h+=`<div class="zwp-tag tag-body">身</div>`;
        h+=`</div>`;
      });
      h+=`</div>`;
    }
    h+=`<div class="section-note muted">紫微斗数提供命宫主星与十二宫星曜分布参考，用于自我觉察，不做确定性命运论断。</div>`;
    h+=`</div>`;
    return h;
  }
  function sensitiveHint(cat){
    const map={selfHarm:'请拨打心理援助热线 400-161-9995 或联系专业心理机构。本应用无法处理危机情况。',medical:'健康问题请咨询专业医生，术数仅供参考，不作诊断依据。',legal:'法律问题请咨询专业律师，术数不作判决预测。',invest:'投资有风险，术数不作收益承诺，请理性决策。'};
    return map[cat]||'该问题超出参考范围，建议咨询专业人士。';
  }
  function renderCross(a){
    const c=a.computed;const p=c.comp.plain;
    let h='';
    h+=`<div class="plain-card"><div class="pc-t">主盘 · 大六壬</div><div class="pc-c">倾向：${p.tendency}；${p.state}</div></div>`;
    const others=a.shushu.filter(s=>s!=='大六壬');
    // 收集各盘倾向
    const tends={大六壬:p.tendency};
    others.forEach(s=>{
      const r=c.shushuResults&&c.shushuResults[s];
      const tend=r?r.plain.tendency:crossHint(s,p);
      tends[s]=r?r.plain.tendency:'—';
      h+=`<div class="plain-card"><div class="pc-t">辅盘 · ${s}</div><div class="pc-c">${r?('倾向：'+r.plain.tendency+'；'+r.plain.state):crossHint(s,p)}</div></div>`;
    });
    h+=`<div class="section-title">综合建议</div>`;
    // 一致性分析
    const tendVals=Object.values(tends);
    const allSame=tendVals.every(t=>t===tendVals[0]);
    h+=`<div class="plain-card"><div class="pc-t">${allSame?'一致点':'综合点'}</div><div class="pc-c">${allSame?'各盘倾向一致「'+p.tendency+'」，信号较强，可较为参考。':'主盘倾向「'+p.tendency+'」为本次主要参考方向，辅盘存在差异时以主盘为主并结合现实判断。'}</div></div>`;
    h+=`<div class="plain-card"><div class="pc-t">提示</div><div class="pc-c">多术数交叉仅用于个人参考校准，不可作为唯一决策依据。</div></div>`;
    h+=`<div class="disclaimer-inline">${AI.DISCLAIMER}</div>`;
    return h;
  }
  function crossHint(s,p){
    const map={'六爻':'以大六壬三传为用神参考，倾向一致。','梅花易数':'体用关系参考，短期趋势与主盘相近。','小六壬':'快速吉凶参考，倾向 '+p.tendency+'。','塔罗':'心理投射工具，不作确定预测，用于觉察决策心理。','八字':'长期倾向参考，需结合流年。','紫微斗数':'基于出生日期的命盘排布参考，用于自我觉察。','黄历':'今日宜忌参考，见首页黄历卡。'};
    return map[s]||'多术数综合参考，请结合现实判断。';
  }
  // T3 多盘交叉摘要卡片渲染
  function renderCrossSummary(cross){
    if(!cross)cross={consistent:[],conflict:[],advice:[],signals:[],reviewDays:21,disclaimer:''};
    let h=`<div class="card"><h3>多盘交叉摘要</h3>`;
    // 一致点
    h+=`<div class="cross-sec"><div class="cross-sec-title">一致点</div>`;
    if(cross.consistent&&cross.consistent.length){
      cross.consistent.forEach(item=>{
        h+=`<div class="cross-item cross-consistent"><span class="cross-desc">${item.desc||''}</span>`;
        if(item.shushu&&item.shushu.length){
          h+=`<span class="cross-shushu-tags">${item.shushu.map(s=>`<span class="cross-shushu-tag">${s}</span>`).join('')}</span>`;
        }
        h+=`</div>`;
      });
    }else{
      h+=`<div class="cross-item">暂无明显一致信号</div>`;
    }
    h+=`</div>`;
    // 冲突点
    h+=`<div class="cross-sec"><div class="cross-sec-title">冲突点</div>`;
    if(cross.conflict&&cross.conflict.length){
      cross.conflict.forEach(item=>{
        h+=`<div class="cross-item cross-conflict"><span class="cross-desc">${item.desc||''}</span>`;
        if(item.shushu&&item.shushu.length){
          h+=`<span class="cross-shushu-tags">${item.shushu.map(s=>`<span class="cross-shushu-tag">${s}</span>`).join('')}</span>`;
        }
        h+=`</div>`;
      });
    }else{
      h+=`<div class="cross-item">暂无明显冲突信号</div>`;
    }
    h+=`</div>`;
    // 综合建议
    h+=`<div class="cross-sec"><div class="cross-sec-title">综合建议</div>`;
    if(cross.advice&&cross.advice.length){
      cross.advice.forEach(a=>{h+=`<div class="cross-item">${a}</div>`;});
    }else{
      h+=`<div class="cross-item">暂无综合建议</div>`;
    }
    h+=`</div>`;
    // 观察信号
    h+=`<div class="cross-sec"><div class="cross-sec-title">观察信号</div>`;
    if(cross.signals&&cross.signals.length){
      cross.signals.forEach(s=>{h+=`<div class="cross-item">${s}</div>`;});
    }else{
      h+=`<div class="cross-item">暂无观察信号</div>`;
    }
    h+=`</div>`;
    // 复盘建议
    h+=`<div class="cross-sec"><div class="cross-sec-title">复盘建议</div>`;
    h+=`<div class="cross-item">建议 ${cross.reviewDays||21} 天后复盘</div>`;
    h+=`</div>`;
    // 免责声明
    h+=`<div class="cross-disclaimer">${cross.disclaimer||''}</div>`;
    h+=`</div>`;
    return h;
  }
  // 跳转到典籍 Tab 并高亮指定古籍段落
  function jumpToClassic(passageId){
    if(!passageId)return;
    state.classicsHighlight=passageId;
    // 清除筛选条件，确保目标段落可见
    if(state.classics){
      state.classics.q='';
      state.classics.book='';
      state.classics.favOnly=false;
    }
    // 跳转到典籍 Tab（顶级 Tab），清空返回栈
    navReset();
    state.tab='classics';
    renderTab();
  }
  function bindResult(a){
    const c=a.computed;const comp=c.comp;
    // 模式切换
    const tg=document.querySelectorAll('.mode-toggle button');
    if(tg.length)tg.forEach(b=>b.onclick=()=>{state.boardMode=b.dataset.mode;renderTab();});
    const btnSave=$('#btnSaveCase');if(btnSave)btnSave.onclick=()=>saveCurrentAsCase(a);
    const btnCopy=$('#btnCopyPrompt');
    if(btnCopy)btnCopy.onclick=()=>{
      // 优先用大六壬主盘构建提示词；无主盘时用多术数融合提示词
      let txt='';
      if(comp){
        txt=AI.buildPrompt(comp.ke,comp.plain,a.bg,Store.getSettings());
      }else{
        const sys=AI.buildSystemPrompt(Store.getSettings());
        const usr=AI.buildMultiShuUserPrompt(c.comp,c.shushuResults,a.bg,Store.getSettings());
        txt=sys+'\n\n---\n\n'+usr;
      }
      copyText(txt);toast('AI 提示词已复制到剪贴板，可粘贴到外部 AI 工具解读');
    };
    const btnExp=$('#btnExportBoard');
    if(btnExp)btnExp.onclick=()=>{
      if(comp)exportBoardText(comp);
      else if(c.shushuResults){
        const firstName=a.shushu.find(s=>c.shushuResults[s]);
        if(firstName)exportShuShuText(c.shushuResults[firstName]);
      }
    };
    // AI 深度解读
    const btnAI=$('#btnAIDeep');
    if(btnAI)btnAI.onclick=()=>runAIDeepRead(a);
    // AI 顾问对话（多轮）：根据术数类型开启对应顾问
    const btnAIChat=$('#btnAIChat');
    if(btnAIChat)btnAIChat.onclick=()=>{
      const cfg=Store.getSettings();
      if(cfg.offlineMode){toast('当前为离线模式，已禁用 AI 调用');return;}
      if(!cfg.aiApiKey&&cfg.aiProvider!=='ollama'){
        modal('未配置 API Key','请在「我的 → AI 模型配置」中填写 API Key 后再使用 AI 顾问。',null,true,'知道了');
        return;
      }
      // 判断顾问类型：八字/紫微 → 终身顾问；其它 → 实时顾问
      const shushuList=a.shushu||[];
      const sr=c.shushuResults||{};
      if(shushuList.includes('八字')&&sr['八字']){
        const r=sr['八字'];
        const tid='lifetime_bazi_'+(r.birthDate?String(r.birthDate).replace(/[:T-]/g,'').slice(0,8):'cur');
        renderAIChat(tid,'八字 · 趋吉避凶顾问',r.result||r,'bazi',{
          advisorType:'lifetime',
          quickQuestions:Object.keys(AI.getLifetimeDomains()).map(k=>({key:k,label:k})),
          quickResolver:(k)=>{const d=AI.getLifetimeDomains()[k];return d?d.prompt:null;}
        });
      }else if(shushuList.includes('紫微斗数')&&sr['紫微斗数']){
        const r=sr['紫微斗数'];
        const tid='lifetime_ziwei_'+(r.solarDate?String(r.solarDate).replace(/[:T-]/g,'').slice(0,8):'cur');
        renderAIChat(tid,'紫微 · 命运推演顾问',r.result||r,'ziwei',{
          advisorType:'lifetime',
          quickQuestions:Object.keys(AI.getLifetimeDomains()).map(k=>({key:k,label:k})),
          quickResolver:(k)=>{const d=AI.getLifetimeDomains()[k];return d?d.prompt:null;}
        });
      }else{
        // 实时卜筮顾问：用当前 comp 或第一个术数结果
        const ctx=c.comp||((sr[shushuList[0]])||null);
        if(!ctx){toast('暂无可用的盘面上下文');return;}
        const tid='realtime_'+fmtDate(new Date()).replace(/[- :]/g,'').slice(0,8);
        renderAIChat(tid,'实时决策顾问',ctx,'bushi',{
          advisorType:'realtime',
          quickQuestions:Object.keys(AI.getRealtimeTopics()).map(k=>({key:k,label:k})),
          quickResolver:(k)=>{const t=AI.getRealtimeTopics()[k];return t?t.prompt:null;}
        });
      }
    };
    // 底部操作按钮（重试 / 返回）
    const btnRetry2=$('#btnDlRetry2');
    if(btnRetry2)btnRetry2.onclick=()=>{
      if(_aiAbort){try{_aiAbort.abort();}catch(e){}_aiAbort=null;}
      if(a._placeholder||a._shushuOnly){
        const nc=computeDaliuren(new Date(),a.bg?a.bg.questionType:'其他');
        state.currentKe=nc;
        showDaliurenBoard(nc);
        toast('已重新起课');
      }else{
        // 问事向导：回到术数选择步骤；同步消费结果页历史记录
        if(state.navStack.length>0){
          navBack();
        }else{
          a.step=3;a.computed=null;renderTab();
        }
      }
    };
    const btnHome=$('#btnDlHome');
    if(btnHome)btnHome.onclick=()=>{
      if(_aiAbort){try{_aiAbort.abort();}catch(e){}_aiAbort=null;}
      if(a._placeholder||a._shushuOnly){
        // 盘面入口：走导航栈返回盘面 Tab
        navBack();
      }else{
        // 问事向导：返回首页；清空返回栈
        navReset();
        state.ask=null;state.tab='home';renderTab();
      }
    };
    // 大六壬盘面交互详情（点击四课/三传/宫位）
    if(comp)bindDaliurenDetails(comp.ke);
    // 古籍引用「查看原文」跳转
    document.querySelectorAll('.cc-jump[data-jump-id]').forEach(btn=>{
      btn.onclick=()=>jumpToClassic(btn.dataset.jumpId);
    });
    // 塔罗卡牌点击翻面 + 详情面板更新
    document.querySelectorAll('.tarot-visual-card').forEach(card=>{
      card.onclick=()=>{
        // 翻转动画
        card.classList.toggle('flipped');
        // 更新详情面板
        const name=card.dataset.name||'';
        const up=card.dataset.up==='1';
        const meaning=card.dataset.meaning||'';
        const element=card.dataset.element||'';
        const pos=card.dataset.pos||'';
        const panel=$('#tarotDetailPanel');
        if(panel&&name){
          let html=`<div class="tdp-name">${esc(name)}<span class="${up?'tdp-up':'tdp-rev'}">${up?'正位':'逆位'}</span></div>`;
          if(element)html+=`<div class="tdp-element">元素 / 对应：${esc(element)}</div>`;
          if(pos)html+=`<div class="tdp-element">位置：${esc(pos)}</div>`;
          html+=`<div class="tdp-meaning">${esc(meaning)}</div>`;
          panel.innerHTML=html;
        }
      };
    });
  }
  // 调用 LLM 生成 AI 深度解读（流式 / 非流式统一处理）
  // 切页/重复触发时取消上一次请求，避免内存泄漏与离屏 DOM 写入
  let _aiAbort=null;
  async function runAIDeepRead(a){
    const c=a.computed;
    const cfg=Store.getSettings();
    const card=$('#aiOutputCard');
    const out=$('#aiOutput');
    const badge=$('#aiModelBadge');
    if(!card||!out)return;
    if(cfg.offlineMode){toast('当前为离线模式，已禁用 AI 调用');return;}
    if(!cfg.aiApiKey&&cfg.aiProvider!=='ollama'){
      modal('未配置 API Key','请在「我的 → AI 模型配置」中填写 API Key 后再使用 AI 深度解读。',null,true,'知道了');
      return;
    }
    // 取消上一次请求
    if(_aiAbort){try{_aiAbort.abort();}catch(e){}}
    _aiAbort=new AbortController();
    card.classList.remove('hidden');
    if(badge)badge.textContent=cfg.aiModel||'模型';
    out.innerHTML='<div class="ai-pending">正在调用 AI（'+cfg.aiProvider+' · '+cfg.aiModel+'）…</div>';
    try{
      // RAG：从古籍知识库检索相关段落并注入用户 prompt
      let userPrompt=AI.buildMultiShuUserPrompt(c.comp,c.shushuResults,a.bg,cfg);
      try{
        ClassicLibrary.loadIndex();
        // 提取主盘与辅盘的盘面特征，用于 RAG 加权检索
        const mainShu=(a.shushu&&a.shushu.length)?a.shushu[0]:'大六壬';
        const mainResult=(c.comp&&c.comp.ke)?c.comp.ke:((c.shushuResults&&c.shushuResults[mainShu])?c.shushuResults[mainShu].result:null);
        const features=ClassicLibrary.extractBoardFeatures(mainShu,mainResult);
        // 合并辅盘特征
        Object.keys(c.shushuResults||{}).forEach(k=>{features.push(...ClassicLibrary.extractBoardFeatures(k,c.shushuResults[k].result));});
        const shuNames=Object.keys(c.shushuResults||{});
        if(a.shushu&&a.shushu.length){
          a.shushu.forEach(s=>{if(!shuNames.includes(s))shuNames.push(s);});
        }
        const q=[a.bg.questionType,a.bg.title,a.bg.desc].filter(Boolean).join(' ');
        const ragPassages=ClassicLibrary.search({shushu:shuNames,query:q,board_features:features,limit:5});
        // 保存到全局状态，供依据来源面板渲染
        state.currentRagPassages=ragPassages;
        userPrompt=AI.appendClassicsToPrompt(userPrompt,ragPassages);
      }catch(e){/* 古籍检索失败不阻塞主流程 */}
      const messages=[
        {role:'system',content:AI.buildSystemPrompt(cfg)},
        {role:'user',content:userPrompt}
      ];
      const opts={stream:cfg.aiStream!==false,signal:_aiAbort.signal};
      if(opts.stream){
        let first=true,lastTime=0;
        opts.onDelta=(delta,full)=>{
          if(first){out.innerHTML='';first=false;}
          // 节流：每 80ms 至多重渲染一次（避免长输出 O(n²) 卡顿）
          const now=Date.now();
          if(now-lastTime<80)return;
          lastTime=now;
          out.innerHTML=AI.renderMarkdown(full);
          out.scrollTop=out.scrollHeight;
        };
      }
      const txt=await AI.callLLM(messages,opts);
      // 流式结束时最终渲染一次（保证完整文本）
      out.innerHTML=AI.renderMarkdown(txt);
      // 二次检测禁止词（仅提示用户，不删改原文）
      const forbidden=AI.hasForbidden(txt);
      if(forbidden.length){
        const note=document.createElement('div');
        note.className='ai-warn';
        note.textContent='系统检测到 '+forbidden.length+' 处绝对化措辞，已标注。请理性参考。';
        out.appendChild(note);
      }
      // 保存到案例（若已存则更新）
      if(a.savedCaseId){
        const cs=Store.getCase(a.savedCaseId);
        if(cs){cs.aiReading=txt;Store.saveCase(cs);}
      }else{
        a.aiReading=txt;
      }
    }catch(e){
      if(e.name==='AbortError'||(e.message&&e.message.includes('中止'))){
        // 被取消不显示错误
        return;
      }
      // 错误信息用 textContent 渲染（避免响应体 XSS）
      out.innerHTML='';
      const errBox=document.createElement('div');
      errBox.className='ai-error';
      errBox.textContent='✗ 调用失败：'+e.message;
      out.appendChild(errBox);
      const tip=document.createElement('div');
      tip.className='section-note';
      tip.style.marginTop='8px';
      tip.textContent='建议：1. 检查「我的 → AI 模型配置」中 BaseUrl / API Key / 模型名是否正确；2. 若用 Anthropic 协议，请通过支持 CORS 的中转站；3. 网络不通可改用「复制 AI 提示词」按钮，外部 AI 工具粘贴解读。';
      out.appendChild(tip);
      // 内联重试按钮：错误时无需滚回顶部即可重试
      const retryBox=document.createElement('div');
      retryBox.style.marginTop='10px';
      retryBox.style.display='flex';
      retryBox.style.gap='8px';
      const btnRetry=document.createElement('button');
      btnRetry.className='btn gold sm';
      btnRetry.textContent='重新调用 AI';
      btnRetry.onclick=()=>runAIDeepRead(a);
      const btnTest=document.createElement('button');
      btnTest.className='btn sm';
      btnTest.textContent='去测试连接';
      btnTest.onclick=()=>{
        state.tab='me';
        renderTab();
        setTimeout(()=>{
          const card=$('#aiConfigCard');
          if(card){card.scrollIntoView({behavior:'smooth',block:'center'});}
        },60);
      };
      retryBox.appendChild(btnRetry);
      retryBox.appendChild(btnTest);
      out.appendChild(retryBox);
    }finally{
      _aiAbort=null;
    }
  }
  // ---------- AI 多轮对话界面（命盘长期记忆 + 顾问角色 + 快捷问题）----------
  // 取消该线程可能正在进行的流式请求
  let _aiChatAbort=null;
  // ---------- 今日宜忌（终身栏核心延伸）----------
  // 保存今日宜忌的线程上下文，供"继续追问"复用
  let _dailyYiJiCtx=null;
  // 生成今日宜忌：命盘喜用神 × 当日干支 → AI 当日行动指南（流式渲染到卡片内）
  async function genDailyYiJi(){
    const cfg=Store.getSettings();
    if(cfg.offlineMode){toast('当前为离线模式，已禁用 AI 调用');return;}
    if(!cfg.aiApiKey&&cfg.aiProvider!=='ollama'){
      modal('未配置 API Key','请在「我的 → AI 模型配置」中填写 API Key 后再使用今日宜忌。',null,true,'知道了');
      return;
    }
    const profile=Store.getProfile();
    if(!profile||!profile.birth){toast('请先在「我的」页填写出生信息');return;}
    const b={calendar:'solar',date:String(profile.birth).split('T')[0],hour:String(profile.birth).split('T')[1]||'',gender:profile.gender,place:profile.place,zhenTaiyang:false,unknownHour:false};
    const d=resolveBirthDate(b);
    if(!d){toast('出生日期解析失败，请在「我的」页检查出生信息');return;}
    const result=ShuShu.baZiByBirth?ShuShu.baZiByBirth({date:d,gender:b.gender,place:b.place,zhenTaiyang:b.zhenTaiyang,unknownHour:b.unknownHour}):null;
    if(!result){toast('八字排盘失败，请检查出生信息');return;}
    const now=new Date();
    const bz=Lunar.getBaZi(now);
    const lunar=Lunar.solarToLunar(now);
    const jq=Lunar.currentNextJieQi(now);
    const dayInfo={date:now,gz:{year:bz.year.gz,month:bz.month.gz,day:bz.day.gz,hour:bz.hour.gz},lunar:lunar,jieQi:jq};
    const pm=AI.buildDailyYiJiPrompt(cfg,dayInfo);
    const contextSummary=AI.buildBaziContext(result);
    const ymd=now.getFullYear()+pad(now.getMonth()+1)+pad(now.getDate());
    const threadId='daily_yiji_'+ymd;
    // 每日新线程：若同日已生成过则清空重来，避免历史污染当日指南
    AI.clearChat(threadId);
    AI.startChat(threadId,pm.system,contextSummary);
    _dailyYiJiCtx={result,threadId,sysPrompt:pm.system,contextSummary};
    const body=$('#dailyYiJiBody');
    const btn=$('#btnGenDailyYiJi');
    if(!body)return;
    body.innerHTML='<div class="ai-pending">正在生成今日宜忌…</div>';
    if(btn){btn.disabled=true;btn.textContent='生成中…';}
    if(_aiChatAbort){try{_aiChatAbort.abort();}catch(e){}}
    _aiChatAbort=new AbortController();
    try{
      let first=true,lastTime=0;
      const reply=await AI.chat(threadId,pm.user,{
        stream:cfg.aiStream!==false,
        signal:_aiChatAbort.signal,
        onDelta:(delta,full)=>{
          if(first){body.innerHTML='';first=false;}
          const t=Date.now();
          if(t-lastTime<80)return;
          lastTime=t;
          body.innerHTML=AI.renderMarkdown(full);
        }
      });
      body.innerHTML=AI.renderMarkdown(reply);
      const forb=AI.hasForbidden(reply);
      if(forb.length){
        const note=el('div','ai-warn');
        note.textContent='检测到 '+forb.length+' 处绝对化措辞，请理性参考。';
        body.appendChild(note);
      }
      const askBtn=$('#btnDailyYiJiAsk');
      if(askBtn)askBtn.classList.remove('hidden');
    }catch(e){
      if(e.name==='AbortError'||(e.message&&e.message.includes('中止'))){
        body.innerHTML='<div class="dy-empty">已取消</div>';
      }else{
        body.innerHTML='<div class="ai-error">✗ 生成失败：'+esc(e.message)+'</div><div class="section-note">建议：1) 检查「我的 → AI 模型配置」；2) 点击「测试连接」排查。</div>';
      }
    }finally{
      if(btn){btn.disabled=false;btn.textContent='重新生成';}
      _aiChatAbort=null;
    }
  }
  // 打开今日宜忌追问对话（复用今日线程）
  function openDailyYiJiChat(){
    if(!_dailyYiJiCtx){toast('请先生成今日宜忌');return;}
    const result=_dailyYiJiCtx.result;
    const threadId=_dailyYiJiCtx.threadId;
    renderAIChat(threadId,'今日宜忌 · 追问',result,'bazi',{
      advisorType:'lifetime',
      quickQuestions:Object.keys(AI.getLifetimeDomains()).map(k=>({key:k,label:k})),
      quickResolver:(k)=>{const dd=AI.getLifetimeDomains()[k];return dd?dd.prompt:null;}
    });
  }
  // 开启终身命理顾问对话（八字/紫微）
  // type: 'bazi' | 'ziwei'；domainKey: 可选，预设领域问题（见 AI.getLifetimeDomains）
  function openLifetimeAdvisor(type,domainKey){
    const cfg=Store.getSettings();
    if(cfg.offlineMode){toast('当前为离线模式，已禁用 AI 调用');return;}
    if(!cfg.aiApiKey&&cfg.aiProvider!=='ollama'){
      modal('未配置 API Key','请在「我的 → AI 模型配置」中填写 API Key 后再使用 AI 顾问。',null,true,'知道了');
      return;
    }
    const profile=Store.getProfile();
    if(!profile||!profile.birth){
      modal('尚未建档','终身命理顾问需要先填写出生信息。是否前往「我的」页填写？',m=>{
        state.tab='me';renderTab();
        setTimeout(()=>{const c=$('#profileCard');if(c)c.scrollIntoView({behavior:'smooth',block:'center'});},60);
      },()=>{}, '去填写');
      return;
    }
    // 解析出生日期
    const b={calendar:'solar',date:String(profile.birth).split('T')[0],hour:String(profile.birth).split('T')[1]||'',gender:profile.gender,place:profile.place,zhenTaiyang:false,unknownHour:false};
    const d=resolveBirthDate(b);
    if(!d){toast('出生日期解析失败，请在「我的」页检查出生信息');return;}
    let result=null,title='',threadId='';
    if(type==='bazi'){
      result=ShuShu.baZiByBirth?ShuShu.baZiByBirth({date:d,gender:b.gender,place:b.place,zhenTaiyang:b.zhenTaiyang,unknownHour:b.unknownHour}):null;
      title='八字 · 趋吉避凶顾问';
      threadId='lifetime_bazi_'+String(profile.birth).replace(/[:T-]/g,'').slice(0,8);
    }else{
      result=ShuShu.ziWeiDouShu?ShuShu.ziWeiDouShu({date:d,gender:b.gender,place:b.place,zhenTaiyang:b.zhenTaiyang}):null;
      title='紫微 · 命运推演顾问';
      threadId='lifetime_ziwei_'+String(profile.birth).replace(/[:T-]/g,'').slice(0,8);
    }
    if(!result){toast(type==='bazi'?'八字排盘失败':'紫微排盘失败，请检查出生信息');return;}
    const domains=AI.getLifetimeDomains();
    const quickList=Object.keys(domains).map(k=>({key:k,label:k}));
    let initialQ=null;
    if(domainKey&&domains[domainKey])initialQ=domains[domainKey].prompt;
    renderAIChat(threadId,title,result,type,{
      advisorType:'lifetime',
      quickQuestions:quickList,
      initialQuestion:initialQ,
      quickResolver:(k)=>domains[k]?domains[k].prompt:null
    });
  }
  // 开启实时决策顾问对话（基于当前卦象）
  // topicKey: 可选，预设事项问题（见 AI.getRealtimeTopics）
  function openRealtimeAdvisor(topicKey){
    const cfg=Store.getSettings();
    if(cfg.offlineMode){toast('当前为离线模式，已禁用 AI 调用');return;}
    if(!cfg.aiApiKey&&cfg.aiProvider!=='ollama'){
      modal('未配置 API Key','请在「我的 → AI 模型配置」中填写 API Key 后再使用 AI 顾问。',null,true,'知道了');
      return;
    }
    const comp=state.currentKe||computeDaliuren(new Date(),'其他');
    state.currentKe=comp;
    const threadId='realtime_'+fmtDate(new Date()).replace(/[- :]/g,'').slice(0,8);
    const topics=AI.getRealtimeTopics();
    const quickList=Object.keys(topics).map(k=>({key:k,label:k}));
    let initialQ=null;
    if(topicKey&&topics[topicKey])initialQ=topics[topicKey].prompt;
    renderAIChat(threadId,'实时决策顾问',comp,'bushi',{
      advisorType:'realtime',
      quickQuestions:quickList,
      initialQuestion:initialQ,
      quickResolver:(k)=>topics[k]?topics[k].prompt:null
    });
  }
  // ---------- 决策对比助手（实时栏核心延伸）----------
  // 保存决策上下文，供"继续追问"复用
  let _decisionCtx=null;
  // 弹出 A/B 选项表单，提交后起当下卦象并调用 AI 对比分析
  function openDecisionCompare(){
    const cfg=Store.getSettings();
    if(cfg.offlineMode){toast('当前为离线模式，已禁用 AI 调用');return;}
    if(!cfg.aiApiKey&&cfg.aiProvider!=='ollama'){
      modal('未配置 API Key','请在「我的 → AI 模型配置」中填写 API Key 后再使用决策对比助手。',null,true,'知道了');
      return;
    }
    const body=`<div class="field"><label>事项标题</label><input type="text" id="dcTitle" placeholder="如：是否接受这份 offer"></div>`
      +`<div class="dc-opt-row"><div class="field"><label>选项 A</label><input type="text" id="dcOptA" placeholder="如：接受"></div><div class="field"><label>选项 B</label><input type="text" id="dcOptB" placeholder="如：拒绝"></div></div>`
      +`<div class="field"><label>背景说明（可选）</label><textarea id="dcDesc" rows="2" placeholder="补充背景，帮助 AI 更准确分析"></textarea></div>`
      +`<div class="field"><label>当前情绪（可选）</label><select id="dcMood"><option value="">—</option>${['平静','焦虑','期待','犹豫','急切'].map(m=>'<option>'+m+'</option>').join('')}</select></div>`;
    modal('决策对比助手',body,m=>{
      const tEl=$('#dcTitle'),aEl=$('#dcOptA'),bEl=$('#dcOptB');
      if(!tEl||!aEl||!bEl)return;
      const title=tEl.value.trim(),optA=aEl.value.trim(),optB=bEl.value.trim();
      if(!title||!optA||!optB){toast('请填写事项标题与两个选项');return;}
      const desc=$('#dcDesc').value.trim();
      const mood=$('#dcMood').value;
      closeModal();
      const comp=computeDaliuren(new Date(),'二选一决策');
      state.currentKe=comp;
      const bg={questionType:'二选一决策',title,desc,optA,optB,mood,urgent:mood==='急切'?'紧急':'一般',hasOption:true};
      runDecisionCompare(comp,bg);
    },()=>{},'开始分析');
  }
  // 执行决策对比分析（流式渲染到 modal），完成后提供"保存案例""继续追问"
  async function runDecisionCompare(comp,bg){
    const cfg=Store.getSettings();
    const pm=AI.buildDecisionComparePrompt(cfg,bg);
    // 构建卦象上下文摘要
    let contextSummary='';
    try{
      const wrap={result:comp.ke,plain:comp.plain};
      contextSummary=AI.buildMultiShuUserPrompt(null,{'大六壬':wrap},bg,cfg);
    }catch(_){contextSummary='';}
    const threadId='decision_'+Date.now().toString(36);
    AI.startChat(threadId,pm.system,contextSummary);
    _decisionCtx={comp,bg,threadId};
    const bgLine='事项：'+esc(bg.title)+' ｜ A：'+esc(bg.optA)+' ｜ B：'+esc(bg.optB);
    const body='<div class="dc-result"><div class="dc-bg">'+bgLine+'</div>'
      +'<div class="dc-output" id="dcOutput"><div class="ai-pending">正在基于当下卦象分析…</div></div>'
      +'<div class="dc-actions hidden" id="dcActions">'
      +'<button class="btn primary sm" id="btnDcSave">保存为案例</button>'
      +'<button class="btn sm" id="btnDcAsk">继续追问</button>'
      +'<button class="btn sm ghost" id="btnDcCopy">复制结果</button>'
      +'</div></div>';
    modal('决策对比分析',body,null,true,'关闭');
    if(_aiChatAbort){try{_aiChatAbort.abort();}catch(e){}}
    _aiChatAbort=new AbortController();
    const out=$('#dcOutput');
    let replyText='';
    try{
      let first=true,lastTime=0;
      replyText=await AI.chat(threadId,pm.user,{
        stream:cfg.aiStream!==false,
        signal:_aiChatAbort.signal,
        onDelta:(delta,full)=>{
          if(first){out.innerHTML='';first=false;}
          const t=Date.now();
          if(t-lastTime<80)return;
          lastTime=t;
          out.innerHTML=AI.renderMarkdown(full);
        }
      });
      out.innerHTML=AI.renderMarkdown(replyText);
      const forb=AI.hasForbidden(replyText);
      if(forb.length){
        const note=el('div','ai-warn');
        note.textContent='检测到 '+forb.length+' 处绝对化措辞，请理性参考。';
        out.appendChild(note);
      }
      _decisionCtx.reply=replyText;
      const actions=$('#dcActions');
      if(actions)actions.classList.remove('hidden');
    }catch(e){
      if(e.name==='AbortError'||(e.message&&e.message.includes('中止'))){
        out.innerHTML='<span style="color:var(--muted);">已取消</span>';
      }else{
        out.innerHTML='<div class="ai-error">✗ 分析失败：'+esc(e.message)+'</div><div class="section-note">建议：1) 检查「我的 → AI 模型配置」；2) 点击「测试连接」排查。</div>';
      }
    }finally{
      _aiChatAbort=null;
    }
    // 绑定操作按钮
    const btnSave=$('#btnDcSave');
    if(btnSave)btnSave.onclick=()=>{
      const c={
        id:Store.genId(),
        title:bg.title,
        desc:bg.desc,
        questionType:'二选一决策',
        shushu:'大六壬',
        mood:bg.mood,
        createdAt:Date.now(),
        reviewed:false,
        reviewDue:Date.now()+3*86400000,
        plain:{tendency:comp.plain.tendency,opps:comp.plain.opps,risks:comp.plain.risks},
        decision:{optA:bg.optA,optB:bg.optB,aiReading:replyText},
        aiReading:replyText
      };
      Store.saveCase(c);
      toast('已保存为案例，3 天后提醒复盘');
      closeModal();
    };
    const btnAsk=$('#btnDcAsk');
    if(btnAsk)btnAsk.onclick=()=>{
      closeModal();
      if(!_decisionCtx)return;
      renderAIChat(_decisionCtx.threadId,'决策对比 · 追问',_decisionCtx.comp,'bushi',{
        advisorType:'realtime',
        quickQuestions:Object.keys(AI.getRealtimeTopics()).map(k=>({key:k,label:k})),
        quickResolver:(k)=>{const t=AI.getRealtimeTopics()[k];return t?t.prompt:null;}
      });
    };
    const btnCopy=$('#btnDcCopy');
    if(btnCopy)btnCopy.onclick=()=>{copyText(replyText);toast('已复制分析结果');};
  }
  // 渲染一个 AI 对话界面（底部抽屉式遮罩），支持多轮对话与命盘/卦象上下文长期记忆。
  // threadId: 对话线程 id
  // title: 顶部标题
  // contextResult: 排盘结果对象（八字 result / 紫微 result / 卜筮盘面），用于初始化上下文
  // contextType: 'bazi' | 'ziwei' | 'bushi' | 'custom'
  // opts: { advisorType:'lifetime'|'realtime', quickQuestions:[{key,label}], initialQuestion:string, quickResolver:(key)=>promptText }
  function renderAIChat(threadId, title, contextResult, contextType, opts){
    opts=opts||{};
    const cfg=Store.getSettings();
    // 1. 构建命盘/卦象上下文摘要（作为首条 user 消息注入对话历史）
    let contextSummary='';
    if(contextType==='bazi'&&contextResult){
      contextSummary=AI.buildBaziContext(contextResult);
    }else if(contextType==='ziwei'&&contextResult){
      contextSummary=AI.buildZiweiContext(contextResult);
    }else if(contextType==='bushi'&&contextResult){
      // 卜筮栏：复用多术数融合 prompt 构建器产出卦象摘要
      try{
        const wrap=(contextResult&&contextResult.plain)?contextResult:{result:contextResult,plain:contextResult&&contextResult.plain};
        contextSummary=AI.buildMultiShuUserPrompt(null,{[title||'卜筮']:wrap},{questionType:'其他'},{});
      }catch(_){ contextSummary=''; }
    }else if(typeof contextResult==='string'){
      contextSummary=contextResult;
    }
    // 2. 初始化/加载对话线程（按顾问类型选择系统提示词）
    const sysPrompt=opts.advisorType==='lifetime'?AI.buildLifetimeAdvisorPrompt(cfg)
                   :(opts.advisorType==='realtime'?AI.buildRealtimeAdvisorPrompt(cfg):AI.buildSystemPrompt(cfg));
    AI.startChat(threadId, sysPrompt, contextSummary);

    // 取消上一次该线程的请求
    if(_aiChatAbort){try{_aiChatAbort.abort();}catch(e){}}
    _aiChatAbort=new AbortController();

    // 3. 构建底部抽屉式遮罩界面（使用 style.css 中的 .ai-chat-* 类，适配深色主题）
    const mask=el('div','ai-chat-mask');
    const panel=el('div','ai-chat-panel');
    const quickBarHtml=(opts.quickQuestions&&opts.quickQuestions.length)
      ? '<div class="ai-chat-quickbar" id="aiChatQuickbar">'+opts.quickQuestions.map(q=>'<span class="qchip" data-qkey="'+esc(q.key)+'">'+esc(q.label)+'</span>').join('')+'</div>'
      : '';
    panel.innerHTML=[
      '<div class="ai-chat-header">',
        '<div class="ai-chat-title">'+esc(title||'AI 对话')+'</div>',
        '<div class="ai-chat-actions">',
          '<button class="btn sm ghost" id="aiChatTest">测试连接</button>',
          '<button class="btn sm ghost" id="aiChatClear">清空</button>',
          '<button class="btn sm ghost" id="aiChatClose">关闭</button>',
        '</div>',
      '</div>',
      quickBarHtml,
      '<div class="ai-chat-messages" id="aiChatMessages"></div>',
      '<div class="ai-chat-input">',
        '<textarea id="aiChatInput" rows="2" placeholder="输入问题，回车发送（Shift+回车换行）…"></textarea>',
        '<button class="btn primary" id="aiChatSend">发送</button>',
      '</div>'
    ].join('');
    mask.appendChild(panel);
    document.body.appendChild(mask);

    const msgBox=panel.querySelector('#aiChatMessages');
    const input=panel.querySelector('#aiChatInput');
    const btnSend=panel.querySelector('#aiChatSend');

    // 渲染单条消息气泡（用户右侧、AI 左侧）；system 消息折叠不显示
    function renderBubble(m){
      if(m.role==='system')return null;
      const isUser=m.role==='user';
      const b=el('div','ai-chat-bubble '+(isUser?'user':'ai'));
      const roleEl=el('div','ai-chat-role',isUser?'我':'AI');
      const body=el('div','ai-chat-body');
      body.innerHTML=isUser?esc(m.content):AI.renderMarkdown(m.content);
      b.appendChild(roleEl);b.appendChild(body);
      return b;
    }
    // 重新渲染消息列表
    function renderMessages(){
      msgBox.innerHTML='';
      const hist=AI.getChatHistory(threadId);
      hist.forEach(m=>{const b=renderBubble(m);if(b)msgBox.appendChild(b);});
      msgBox.scrollTop=msgBox.scrollHeight;
    }
    renderMessages();

    let sending=false;
    async function send(msgText){
      const txt=(msgText!==undefined?msgText:input.value).trim();
      if(!txt)return;
      if(cfg.offlineMode){toast('当前为离线模式，已禁用 AI 调用');return;}
      if(!cfg.aiApiKey&&cfg.aiProvider!=='ollama'){
        modal('未配置 API Key','请在「我的 → AI 模型配置」中填写 API Key 后再使用 AI 对话。',null,true,'知道了');
        return;
      }
      sending=true;btnSend.disabled=true;
      if(msgText===undefined)input.value='';
      // 立即渲染用户气泡
      const userBubble=renderBubble({role:'user',content:txt});
      if(userBubble)msgBox.appendChild(userBubble);
      msgBox.scrollTop=msgBox.scrollHeight;
      // AI 气泡占位（流式更新）
      const aiBubble=el('div','ai-chat-bubble ai');
      aiBubble.innerHTML='<div class="ai-chat-role">AI</div><div class="ai-chat-body ai-pending">思考中…</div>';
      msgBox.appendChild(aiBubble);
      const aiBody=aiBubble.querySelector('.ai-chat-body');
      try{
        let first=true,lastTime=0;
        const reply=await AI.chat(threadId,txt,{
          stream:cfg.aiStream!==false,
          signal:_aiChatAbort.signal,
          onDelta:(delta,full)=>{
            if(first){aiBody.innerHTML='';first=false;}
            const now=Date.now();
            if(now-lastTime<80)return; // 节流，避免长输出 O(n²) 卡顿
            lastTime=now;
            aiBody.innerHTML=AI.renderMarkdown(full);
            msgBox.scrollTop=msgBox.scrollHeight;
          }
        });
        aiBody.innerHTML=AI.renderMarkdown(reply);
        // 二次禁止词检测（仅提示，不删改原文）
        const forb=AI.hasForbidden(reply);
        if(forb.length){
          const note=el('div','ai-warn');
          note.textContent='检测到 '+forb.length+' 处绝对化措辞，已标注，请理性参考。';
          aiBody.appendChild(note);
        }
      }catch(e){
        if(e.name==='AbortError'||(e.message&&e.message.includes('中止'))){
          aiBody.innerHTML='<span style="color:var(--muted);">已取消</span>';
        }else{
          aiBody.innerHTML='<span style="color:var(--red);">✗ 调用失败：'+esc(e.message)+'</span>'
            +'<div style="margin-top:8px;font-size:12px;color:var(--ink2);">建议：1) 点击右上「测试连接」排查；2) 检查 BaseUrl/Key/模型名；3) Anthropic 协议需通过支持 CORS 的中转站。</div>';
        }
      }finally{
        sending=false;btnSend.disabled=false;
        msgBox.scrollTop=msgBox.scrollHeight;
      }
    }
    btnSend.onclick=()=>send();
    input.addEventListener('keydown',e=>{
      if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}
    });
    // 快捷问题条
    const quickbar=panel.querySelector('#aiChatQuickbar');
    if(quickbar){
      quickbar.querySelectorAll('.qchip').forEach(chip=>{
        chip.onclick=()=>{
          const k=chip.dataset.qkey;
          const q=opts.quickResolver?opts.quickResolver(k):null;
          if(q)send(q);
        };
      });
    }
    // 测试连接
    panel.querySelector('#aiChatTest').onclick=async()=>{
      toast('正在测试连接…');
      try{
        const r=await AI.testConnection();
        if(r.ok)modal('连接成功',r.msg+(r.detail?'\n\n'+r.detail:''),null,true,'好的');
        else modal('连接失败',r.msg+(r.detail?'\n\n'+r.detail:''),null,true,'知道了');
      }catch(e){modal('连接失败',e.message||String(e),null,true,'知道了');}
    };
    // 清空对话：确认后清空线程并重新初始化上下文
    panel.querySelector('#aiChatClear').onclick=()=>{
      modal('清空对话','确定清空当前线程的全部对话历史？此操作不可撤销。',m=>{
        AI.clearChat(threadId);
        AI.startChat(threadId,sysPrompt,contextSummary);
        renderMessages();
        closeModal();
        toast('已清空对话');
      },()=>{}, '确定清空');
    };
    // 关闭：取消进行中的请求并移除遮罩
    const close=()=>{
      if(_aiChatAbort){try{_aiChatAbort.abort();}catch(e){}_aiChatAbort=null;}
      if(mask.parentNode)mask.parentNode.removeChild(mask);
    };
    panel.querySelector('#aiChatClose').onclick=close;
    mask.onclick=ev=>{if(ev.target===mask)close();};
    // 若有预设问题，自动发送
    if(opts.initialQuestion){
      setTimeout(()=>send(opts.initialQuestion),120);
    }
    return panel;
  }
  function copyText(txt){
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(txt).catch(()=>fallbackCopy(txt));}
    else fallbackCopy(txt);
  }
  function fallbackCopy(txt){const ta=document.createElement('textarea');ta.value=txt;document.body.appendChild(ta);ta.select();try{document.execCommand('copy');}catch(e){}document.body.removeChild(ta);}

  // ---------- 大六壬结果渲染（专业/白话 + AI）----------
  // 五行 → CSS 类名映射
  const WX_CLASS={'水':'wx-shui','木':'wx-mu','火':'wx-huo','土':'wx-tu','金':'wx-jin'};
  function wxClass(wx){return WX_CLASS[wx]||'';}
  function wxSpan(zhi,wx){return `<span class="${wxClass(wx)}">${zhi}</span>`;}
  // 五行关系 → 中文标签
  function relLabel(rel){
    return {生:'上生下',克:'上克下',同:'比和',被生:'下生上',被克:'下贼上',无:'无克'}[rel]||'无克';
  }
  function relClass(rel){
    return {生:'sheng',克:'ke',同:'tong',被生:'beisheng',被克:'beike',无:''}[rel]||'';
  }
  // 旺相休囚死 → 样式类与色标
  const WX_STATE_CLS={'旺':'wang','相':'xiang','休':'xiu','囚':'qiu','死':'si','平':''};
  function wxStateBadge(state){
    if(!state||state==='平')return '';
    const cls=WX_STATE_CLS[state]||'';
    return `<span class="wx-state ${cls}">${state}</span>`;
  }
  function renderDaliurenResult(comp){
    const ke=comp.ke,p=comp.plain;const mode=state.boardMode;
    let h='';
    h+=`<div class="mode-toggle"><button data-mode="pro" class="${mode==='pro'?'on':''}">专业盘面</button><button data-mode="plain" class="${mode==='plain'?'on':''}">白话解读</button></div>`;
    // 课体概览卡（替代原 kv-grid，更紧凑可视化）
    h+=`<div class="card"><h3>大六壬盘面</h3>`;
    h+=`<div class="dl-overview">`;
    h+=`<div class="ov-row">`;
    h+=`<span class="ov-tag accent">日干 ${ke.dayGan}</span>`;
    h+=`<span class="ov-tag">日支 ${ZHI[ke.dayZhiIdx]}</span>`;
    h+=`<span class="ov-tag">月将 ${wxSpan(ke.yueJiang.zhi,ke.yueJiang.wx)}</span>`;
    h+=`<span class="ov-tag">占时 ${wxSpan(ke.zhanShi.zhi,ke.zhanShi.wx)}</span>`;
    h+=`</div>`;
    h+=`<div class="ov-row">`;
    h+=`<span class="ov-tag">${ke.guiRen.label}·${ke.guiRen.zhi}（乘${ke.guiRen.chengShen}）</span>`;
    h+=`<span class="ov-tag warn">空亡 ${ZHI[ke.kongWang[0]]}${ZHI[ke.kongWang[1]]}</span>`;
    if(ke.isFuYin)h+=`<span class="ov-tag warn">伏吟</span>`;
    if(ke.isFanYin)h+=`<span class="ov-tag warn">返吟</span>`;
    h+=`</div>`;
    h+=`<div class="ov-row">`;
    ke.geju.forEach(g=>{
      const cls=g.includes('伏吟')||g.includes('返吟')?'warn':(g.includes('元首')||g.includes('重审')?'accent':'good');
      h+=`<span class="ov-tag ${cls}">${g}</span>`;
    });
    h+=`</div>`;
    h+=`<div class="ov-row"><span class="ov-tag">起课 ${ke.dateStr}</span><span class="ov-tag">${comp.sc.name}（${comp.sc.range}）</span></div>`;
    h+=`</div>`;
    h+=`</div>`;
    if(mode==='pro'){
      h+=renderProBoard(ke);
    }else{
      h+=renderPlainBoard(p);
    }
    h+=renderAIBlock(comp,a_state_bg());
    h+=renderSourcesPanel(p,state.currentRagPassages);
    // 底部退出/重试/返回操作区
    const isPlaceholder=state.ask&&(state.ask._placeholder||state.ask._shushuOnly);
    h+=`<div class="card"><h3>操作</h3>`;
    h+=`<div class="dl-actions">`;
    h+=`<button class="btn primary" id="btnDlRetry2">重新起课</button>`;
    h+=`<button class="btn" id="btnDlHome">${isPlaceholder?'返回盘面':'返回首页'}</button>`;
    h+=`</div>`;
    h+=`</div>`;
    return h;
  }
  function a_state_bg(){return state.ask?state.ask.bg:{questionType:'其他'};}
  function renderProBoard(ke){
    let h='';
    // ===== 四课（传统自右向左：四 三 二 一）=====
    h+=`<div class="card"><h3>四课 <span style="font-size:11px;color:var(--muted);font-weight:400">（自右向左）</span></h3>`;
    h+=`<div class="dl-lessons">`;
    // 渲染顺序：四 三 二 一（因 direction:rtl，第一个 DOM 元素显示在最右）
    const lessonNames=['一课·日干','二课·干阴','三课·日支','四课·支阴'];
    // 反向遍历，让 一课 显示在最右
    for(let i=3;i>=0;i--){
      const l=ke.lessons[i];
      const upZ=wxSpan(ZHI[l.up],l.upWX);
      const downZ=wxSpan(l.downLabel,l.downWX);
      const relCls=relClass(l.relation);
      const relTxt=relLabel(l.relation);
      h+=`<div class="dl-lesson" data-lesson-idx="${i}">
        <div class="lesson-name">${lessonNames[i]}</div>
        <div class="up-block">
          <div class="zhi">${upZ}${wxStateBadge(l.upWXState)}</div>
          <div class="tj">${l.upTJ}</div>
          <div class="sx">${l.upSX}·${l.upWX}·${l.upFW}</div>
        </div>
        <div class="sep">─</div>
        <div class="down-block">
          <div class="zhi">${downZ}${wxStateBadge(l.downWXState)}</div>
          <div class="tj">${l.downTJ||'—'}</div>
          <div class="sx">${l.downSX||'—'}·${l.downWX||'—'}</div>
        </div>
        <div class="rel ${relCls}">${relTxt}</div>
      </div>`;
    }
    h+=`</div>`;
    h+=`<div class="section-note">点击课位查看上下神生克详情</div>`;
    h+=`</div>`;
    // ===== 三传（初/中/末 + 生克链）=====
    const sc=ke.sanChuan;
    h+=`<div class="card"><h3>三传 · ${sc.method}</h3>`;
    h+=`<div class="dl-sanchuan">`;
    // 初传
    h+=`<div class="sc-cell first" data-sc-idx="0">
      <div class="sc-lbl">初传</div>
      <div class="sc-zhi">${wxSpan(sc.chu.zhi,sc.chu.wx)} ${wxStateBadge(sc.chu.wxState)}</div>
      <div class="sc-tj">${sc.chu.tj}<span class="${sc.chu.tjJi==='吉'?'wx-mu':(sc.chu.tjJi==='凶'?'wx-huo':'')}"> · ${sc.chu.tjJi}</span></div>
      <div class="sc-meta">${sc.chu.sx}·${sc.chu.wx}·${sc.chu.fw}<br>${sc.chu.bg}宫·天将${sc.chu.tjWX}</div>
      ${sc.chu.isKong?'<div class="sc-kong">落空亡</div>':''}
    </div>`;
    // 初→中 箭头
    h+=`<div class="sc-arrow"><div class="ar">→</div><div class="ar-lbl ${relClass(sc.chuToZhong)}">${relLabel(sc.chuToZhong)}</div></div>`;
    // 中传
    h+=`<div class="sc-cell" data-sc-idx="1">
      <div class="sc-lbl">中传</div>
      <div class="sc-zhi">${wxSpan(sc.zhong.zhi,sc.zhong.wx)} ${wxStateBadge(sc.zhong.wxState)}</div>
      <div class="sc-tj">${sc.zhong.tj}<span class="${sc.zhong.tjJi==='吉'?'wx-mu':(sc.zhong.tjJi==='凶'?'wx-huo':'')}"> · ${sc.zhong.tjJi}</span></div>
      <div class="sc-meta">${sc.zhong.sx}·${sc.zhong.wx}·${sc.zhong.fw}<br>${sc.zhong.bg}宫·天将${sc.zhong.tjWX}</div>
      ${sc.zhong.isKong?'<div class="sc-kong">落空亡</div>':''}
    </div>`;
    // 中→末 箭头
    h+=`<div class="sc-arrow"><div class="ar">→</div><div class="ar-lbl ${relClass(sc.zhongToMo)}">${relLabel(sc.zhongToMo)}</div></div>`;
    // 末传
    h+=`<div class="sc-cell" data-sc-idx="2">
      <div class="sc-lbl">末传</div>
      <div class="sc-zhi">${wxSpan(sc.mo.zhi,sc.mo.wx)} ${wxStateBadge(sc.mo.wxState)}</div>
      <div class="sc-tj">${sc.mo.tj}<span class="${sc.mo.tjJi==='吉'?'wx-mu':(sc.mo.tjJi==='凶'?'wx-huo':'')}"> · ${sc.mo.tjJi}</span></div>
      <div class="sc-meta">${sc.mo.sx}·${sc.mo.wx}·${sc.mo.fw}<br>${sc.mo.bg}宫·天将${sc.mo.tjWX}</div>
      ${sc.mo.isKong?'<div class="sc-kong">落空亡</div>':''}
    </div>`;
    h+=`</div>`;
    h+=`<div class="section-note">取法：${sc.method}${sc.fromLesson>=0?'（取自'+lessonNames[sc.fromLesson].split('·')[0]+'）':''}</div>`;
    h+=`</div>`;
    // ===== 天地盘（圆盘式：12地支环绕，中心月将占时）=====
    h+=`<div class="card"><h3>天地盘 / 十二天将 <span style="font-size:11px;color:var(--muted);font-weight:400">（圆盘式）</span></h3>`;
    h+=`<div class="dl-tp-round">`;
    // 12 地支按圆周排列：子(0)在正北(顶), 顺时针: 丑(1)→艮(NE)→寅(2)→甲(NE)→卯(3)→震(E)...
    // 简化用 30° 等分，子=顶部(0°/360°), 顺时针递增
    for(let i=0;i<12;i++){
      const p=i; // 地盘位 = i
      const tp=ke.tianPan[p];
      const tj=ke.tjByShen[tp];
      const isKW=ke.kongWang.includes(p);
      const isPosKW=ke.kongWang.includes(tp);
      const angle=i*30; // 0°=子(顶), 30°=丑, 60°=寅, 90°=卯(右), ...
      // 极坐标 → 屏幕坐标：top=12点为0°, 顺时针. CSS rotate 顺时针.
      h+=`<div class="tp-node${isKW?' kw':''}" data-tp-pos="${p}" style="transform:rotate(${angle}deg) translateY(-130px) rotate(${-angle}deg)">
        ${isKW?'<div class="tp-kw-mark">空</div>':''}
        <div class="tp-fw">${DaLiuRen.ZHI_FANGWEI[p]}</div>
        <div class="tp-tian ${wxClass(DaLiuRen.WX[tp])}">${ZHI[tp]}</div>
        <div class="tp-di">${ZHI[p]}</div>
        <div class="tp-tj">${tj}${isPosKW?' ·空':''}</div>
      </div>`;
    }
    // 中心：月将、占时、贵人
    h+=`<div class="tp-center-info">
      <div class="ci-row"><span class="ci-lbl">月将</span><span class="ci-val">${wxSpan(ke.yueJiang.zhi,ke.yueJiang.wx)}</span></div>
      <div class="ci-row"><span class="ci-lbl">占时</span><span class="ci-val">${wxSpan(ke.zhanShi.zhi,ke.zhanShi.wx)}</span></div>
      <div class="ci-row"><span class="ci-lbl">${ke.guiRen.label}</span><span class="ci-val">${ke.guiRen.zhi}<span style="font-size:10px;color:var(--ink2)">·乘${ke.guiRen.chengShen}</span></span></div>
    </div>`;
    h+=`</div>`;
    h+=`<div class="section-note">外圈天盘神、内圈地盘位、下方天将；空=空亡位。点击宫位查看详情</div>`;
    h+=`</div>`;
    // ===== 十二天将列表 =====
    h+=`<div class="card"><h3>十二天将落宫</h3>`;
    h+=`<div class="dl-tj-list">`;
    ke.tjList.forEach(tj=>{
      const jiCls=tj.ji==='吉'?'ji':(tj.ji==='凶'?'xiong':'');
      h+=`<div class="tj-item ${jiCls}">
        <div class="tj-name">${tj.name}</div>
        <div class="tj-zhi">${tj.zhi>=0?wxSpan(tj.chengShen,tj.wx):'—'}</div>
        <div class="tj-wx">${tj.wx}·${tj.ji}</div>
        ${tj.isKong?'<div class="tj-kong">落空亡</div>':''}
      </div>`;
    });
    h+=`</div></div>`;
    // ===== 神煞 / 类神 =====
    h+=`<div class="card"><h3>神煞 / 类神</h3><div class="dl-info-grid">`;
    h+=`<div class="info-cell"><div class="ic-lbl">驿马</div><div class="ic-val">${ke.shenSha.yima}</div></div>`;
    h+=`<div class="info-cell"><div class="ic-lbl">桃花</div><div class="ic-val">${ke.shenSha.taohua}</div></div>`;
    h+=`<div class="info-cell"><div class="ic-lbl">华盖</div><div class="ic-val">${ke.shenSha.huagai}</div></div>`;
    h+=`<div class="info-cell"><div class="ic-lbl">太岁</div><div class="ic-val">${ke.shenSha.taiSui}</div></div>`;
    h+=`<div class="info-cell"><div class="ic-lbl">月建</div><div class="ic-val">${ke.shenSha.yueJian}</div></div>`;
    h+=`<div class="info-cell"><div class="ic-lbl">类神</div><div class="ic-val">${ke.leishenName}<br><span style="font-size:11px;color:var(--ink2);font-weight:400">乘${ke.leishenShen!==null?ZHI[ke.leishenShen]:'—'}${ke.leishenShen!==null&&ke.kongWang.includes(ke.leishenShen)?' ·空':''}</span></div></div>`;
    h+=`</div></div>`;
    // ===== 课体格局详解（取自《大六壬大全》《大六壬指南》）=====
    const gejuExp=DaLiuRen.explainGeju(ke);
    if(gejuExp&&gejuExp.length){
      h+=`<div class="card"><h3>课体格局详解 <span style="font-size:11px;color:var(--muted);font-weight:400">（典籍依据）</span></h3>`;
      h+=`<div class="dl-geju-list">`;
      gejuExp.forEach(it=>{
        const isZongping=it.k==='总评';
        const isWarn=it.k==='空亡';
        h+=`<div class="geju-row${isZongping?' zongping':''}${isWarn?' warn':''}">
          <div class="gj-lbl">${it.k}</div>
          <div class="gj-val">${it.v}</div>
        </div>`;
      });
      h+=`</div></div>`;
    }
    return h;
  }
  function renderPlainBoard(p){
    let h='<div class="card"><h3>白话解读</h3>';
    h+=`<div class="plain-card"><div class="pc-t">当前状态</div><div class="pc-c">${p.state}</div></div>`;
    h+=`<div class="plain-card"><div class="pc-t">总体倾向</div><div class="pc-c">${p.tendency}</div></div>`;
    h+=`<div class="plain-card"><div class="pc-t">主要机会</div><div class="pc-c">${p.opps.length?p.opps.join('；'):'暂无明显机会信号'}</div></div>`;
    h+=`<div class="plain-card"><div class="pc-t">主要阻力</div><div class="pc-c">${p.risks.length?p.risks.join('；'):'暂无明显阻力'}</div></div>`;
    h+=`<div class="plain-card"><div class="pc-t">对方/环境倾向</div><div class="pc-c">${p.env}</div></div>`;
    h+=`<div class="plain-card"><div class="pc-t">建议行动</div><div class="pc-c">${p.doAct.join('；')}</div></div>`;
    h+=`<div class="plain-card"><div class="pc-t">不建议行动</div><div class="pc-c">${p.dontAct.join('；')}</div></div>`;
    h+=`<div class="plain-card"><div class="pc-t">观察信号</div><div class="pc-c">${p.signals.join('；')}</div></div>`;
    h+=`</div>`;
    return h;
  }
  // 大六壬盘面详情浮层（点击四课/三传/天地盘宫位时弹出）
  function showDaliurenDetail(title,rows){
    const root=$('#modal-root');root.innerHTML='';
    const mask=el('div','dl-detail-pop');
    const html=`<div class="dp-mask"></div><div class="dp-inner">
      <button class="dp-close">×</button>
      <div class="dp-title">${title}</div>
      ${rows.map(r=>`<div class="dp-row"><span style="color:var(--gold)">${r.k}：</span>${r.v}</div>`).join('')}
    </div>`;
    mask.innerHTML=html;
    root.appendChild(mask);
    const closeFn=()=>{root.innerHTML='';};
    mask.querySelector('.dp-close').onclick=closeFn;
    mask.querySelector('.dp-mask').onclick=closeFn;
  }
  function bindDaliurenDetails(ke){
    // 四课点击
    document.querySelectorAll('[data-lesson-idx]').forEach(e=>{
      e.onclick=()=>{
        const i=parseInt(e.dataset.lessonIdx);
        const l=ke.lessons[i];
        const rows=[
          {k:'课位',v:['一课·日干','二课·干阴','三课·日支','四课·支阴'][i]},
          {k:'上神',v:`${ZHI[l.up]}（${l.upSX}·${l.upWX}·${l.upFW}）`},
          {k:'下神',v:`${l.downLabel}（${l.downSX||'—'}·${l.downWX||'—'}·${l.downFW||'—'}）`},
          {k:'上神乘天将',v:`${l.upTJ}（${DaLiuRen.TJ_WX[l.upTJ]||'—'}·${DaLiuRen.TJ_GAN[l.upTJ]||'—'}）`},
          {k:'生克关系',v:relLabel(l.relation)},
          {k:'说明',v:{生:'上神五行生下神，主事顺而进',克:'上神五行克下神，主事有阻力',同:'上下五行比和，主事平稳',被生:'下神生上神，主事暗助',被克:'下神克上神（贼），主事逆',无:'上下无生克，取他法'}[l.relation]||'—'}
        ];
        showDaliurenDetail('第'+['一','二','三','四'][i]+'课 详情',rows);
      };
    });
    // 三传点击
    document.querySelectorAll('[data-sc-idx]').forEach(e=>{
      e.onclick=()=>{
        const i=parseInt(e.dataset.scIdx);
        const t=[ke.sanChuan.chu,ke.sanChuan.zhong,ke.sanChuan.mo][i];
        const rows=[
          {k:'传位',v:['初传','中传','末传'][i]},
          {k:'地支',v:`${t.zhi}（${t.sx}·${t.wx}·${t.fw}）`},
          {k:'八卦宫',v:t.bg+'宫'},
          {k:'乘天将',v:`${t.tj}（${t.tjWX}·${t.tjJi}）`},
          {k:'空亡',v:t.isKong?'是（落空亡，力量减弱）':'否'},
          {k:'取法',v:ke.sanChuan.method}
        ];
        showDaliurenDetail(['初传','中传','末传'][i]+' 详情',rows);
      };
    });
    // 天地盘宫位点击
    document.querySelectorAll('[data-tp-pos]').forEach(e=>{
      e.onclick=()=>{
        const p=parseInt(e.dataset.tpPos);
        const tp=ke.tianPan[p];
        const tj=ke.tjByShen[tp];
        const isKW=ke.kongWang.includes(p);
        const isPosKW=ke.kongWang.includes(tp);
        const rel=DaLiuRen.wxRelation(tp,p);
        const rows=[
          {k:'地盘位',v:`${ZHI[p]}（${DaLiuRen.SHENGXIAO[p]}·${DaLiuRen.WX[p]}·${DaLiuRen.ZHI_FANGWEI[p]}·${DaLiuRen.ZHI_BAGUA[p]}宫）`},
          {k:'天盘神',v:`${ZHI[tp]}（${DaLiuRen.SHENGXIAO[tp]}·${DaLiuRen.WX[tp]}·${DaLiuRen.ZHI_FANGWEI[tp]}）`},
          {k:'天盘乘天将',v:`${tj}（${DaLiuRen.TJ_WX[tj]||'—'}·${DaLiuRen.TJ_GAN[tj]||'—'}）`},
          {k:'天地盘生克',v:relLabel(rel)},
          {k:'地盘空亡',v:isKW?'是':'否'},
          {k:'天盘空亡',v:isPosKW?'是':'否'}
        ];
        showDaliurenDetail(`宫位 ${ZHI[p]} 详情`,rows);
      };
    });
  }
  function renderAIBlock(comp,bg){
    const segs=AI.generateAI(comp.ke,comp.plain,bg,Store.getSettings());
    let h='<div class="card"><div class="ai-h"><h3 style="margin:0;border:0;padding:0">AI 白话解读</h3><span class="src">基于盘面·离线规则</span></div>';
    segs.forEach((s,i)=>{
      h+=`<div class="ai-seg"><div class="as-t">${i+1}. ${s.t} ${s.tag||''}</div><div class="as-c">${s.c}</div></div>`;
    });
    h+=`<div class="disclaimer-inline">${AI.DISCLAIMER}</div></div>`;
    return h;
  }

  // ---------- 保存案例 ----------
  function saveCurrentAsCase(a){
    const c=a.computed;
    // 兼容盘面中心旧数据结构：computed.shushu 为单一术数结果对象
    const isLegacyShu=c.shushu && typeof c.shushu==='object' && !Array.isArray(c.shushu) && c.shushu.name;
    const hasResults=c.shushuResults && Object.keys(c.shushuResults).length>0;
    const isShuOnly=isLegacyShu || (!c.comp && hasResults);
    let plain=null,mainName=null;
    if(c.comp){plain=c.comp.plain;}
    else if(isLegacyShu){plain=c.shushu.plain;mainName=c.shushu.name;}
    else if(hasResults){mainName=a.shushu.find(s=>c.shushuResults[s]);plain=mainName?c.shushuResults[mainName].plain:null;}
    if(!plain)plain={state:'',tendency:'—',doAct:[],dontAct:[],risks:[],signals:[],env:'',reviewDays:7};
    const title=(a.bg.title&&a.bg.title.trim())||((isShuOnly?(mainName||c.shushu.name||'术数'):'大六壬')+'盘 · '+fmtDateTime(c.date||new Date()));
    const obj={
      id:Store.genId(),createdAt:Date.now(),
      title,questionType:a.bg.questionType||'其他',desc:a.bg.desc||'',mood:a.bg.mood||'',urgent:a.bg.urgent||'',
      hasOption:a.bg.hasOption||false,optA:a.bg.optA||'',optB:a.bg.optB||'',persons:a.bg.persons||'',other:a.bg.other||'',adviceType:a.bg.adviceType||[],
      shushu:a.shushu.join('、'),method:a.method||'auto',
      qikeTime:(c.date||new Date()).toISOString(),qikePlace:'',
      extra:a.extra||null,
      board:c.comp?serializeKe(c.comp):null,
      shushuBoard:isLegacyShu?serializeShu(c.shushu):(c.shushuResults?serializeShuResults(c.shushuResults):null),
      plain,
      myJudge:'',actions:[],signals:plain.signals,
      reviewDue:Date.now()+plain.reviewDays*86400000,
      result:'',verified:'',unhit:'',reflect:'',tags:[],favor:false,
      aiReading:a.aiReading||''
    };
    Store.saveCase(obj);
    a.savedCaseId=obj.id;
    // 若含八字，将出生信息回写到个人信息（便于下次自动带入）
    if(a.shushu&&a.shushu.includes('八字')&&a.extra&&a.extra.birth){syncProfileFromBirth(a.extra.birth);}
    toast('案例已保存');
    state.viewCaseId=obj.id;state.tab='case';renderTab();setTimeout(openCaseDetail,30);
  }
  function serializeShu(res){return{name:res.name,result:res.result};}
  function serializeShuResults(rs){const o={};Object.keys(rs).forEach(k=>{o[k]={name:rs[k].name,result:rs[k].result,plain:rs[k].plain};});return o;}
  function shuBoardSummary(sb){
    // sb = {name, result}
    const r=sb.result,n=sb.name;
    if(n==='小六壬')return `月落${r.month}、日落${r.day}、时落${r.time}（${r.detail.attr}·${r.detail.ji}）`;
    if(n==='梅花易数')return `${r.guaName}，上${r.up.n}下${r.dn.n}，第${r.dongLine}爻动，${r.rel}`;
    if(n==='六爻')return `本卦${r.benGua}${r.bianGua!==r.benGua?'变'+r.bianGua:''}，动爻${r.dongCount}个`;
    if(n==='塔罗')return r.cards.map(c=>`${c.pos}：${c.name}(${c.up?'正':'逆'})`).join('；');
    if(n==='八字')return `日主${r.dayGan}(${r.dayWx})${r.dayStrong?'偏强':'偏弱'}，五行${r.wxStr}`;
    return n+'盘面';
  }
  function exportShuShuText(res){
    const L=[];
    L.push('=== 玄决 · '+res.name+' ===');
    L.push('时间：'+fmtDateTime(new Date()));
    L.push('');
    L.push('盘面：');
    L.push('  '+res.plain.state);
    L.push('  倾向：'+res.plain.tendency);
    if(res.plain.opps&&res.plain.opps.length)L.push('  机会：'+res.plain.opps.filter(Boolean).join('；'));
    if(res.plain.risks&&res.plain.risks.length)L.push('  风险：'+res.plain.risks.join('；'));
    L.push('  建议：'+res.plain.doAct.join('；'));
    L.push('  不建议：'+res.plain.dontAct.join('；'));
    L.push('');
    L.push(AI.DISCLAIMER);
    const txt=L.join('\n');
    const blob=new Blob([txt],{type:'text/plain;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const aTag=document.createElement('a');aTag.href=url;aTag.download='xuanjue-'+res.name+'-'+fmtDate(new Date())+'.txt';document.body.appendChild(aTag);aTag.click();document.body.removeChild(aTag);URL.revokeObjectURL(url);
    toast('盘面已导出');
  }
  function serializeKe(comp){return{dateStr:comp.ke.dateStr,sc:comp.sc,baZi:comp.baZi,yueJiang:comp.ke.yueJiang,zhanShi:comp.ke.zhanShi,guiRen:comp.ke.guiRen,kongWang:comp.ke.kongWang,geju:comp.ke.geju,lessons:comp.ke.lessons,sanChuan:comp.ke.sanChuan,shenSha:comp.ke.shenSha,leishenName:comp.ke.leishenName,leishenShen:comp.ke.leishenShen};}

  function exportBoardText(comp){
    const ke=comp.ke,p=comp.plain;
    const L=[];
    L.push('=== 玄决 · 大六壬盘面 ===');
    L.push('起课时间：'+ke.dateStr+'  '+comp.sc.name);
    L.push('日干支：'+ke.baZi.day.gz+'  时干支：'+ke.baZi.hour.gz);
    L.push('月将：'+ke.yueJiang.zhi+'（'+ke.yueJiang.wx+'）  占时：'+ke.zhanShi.zhi+'（'+ke.zhanShi.wx+'）');
    L.push('贵人：'+ke.guiRen.label+'·'+ke.guiRen.zhi+'（乘'+ke.guiRen.chengShen+'）  空亡：'+ZHI[ke.kongWang[0]]+ZHI[ke.kongWang[1]]);
    if(ke.isFuYin)L.push('课体：伏吟课');
    if(ke.isFanYin)L.push('课体：返吟课');
    L.push('格局：'+ke.geju.join('、'));
    L.push('');
    L.push('四课（自右向左：一 二 三 四）：');
    ke.lessons.forEach((l,i)=>{
      const relTxt={生:'上生下',克:'上克下',同:'比和',被生:'下生上',被克:'下贼上',无:'无克'}[l.relation]||'无克';
      L.push('  '+['一','二','三','四'][i]+'课：上 '+ZHI[l.up]+'（'+l.upSX+'·'+l.upWX+'·'+l.upTJ+'） 下 '+l.downLabel+'（'+(l.downSX||'—')+'·'+(l.downWX||'—')+'·'+(l.downTJ||'—')+'） '+relTxt);
    });
    L.push('');
    L.push('三传（'+ke.sanChuan.method+'）：');
    const sc=ke.sanChuan;
    L.push('  初传 '+sc.chu.zhi+'（'+sc.chu.sx+'·'+sc.chu.wx+'·'+sc.chu.fw+'·'+sc.chu.tj+'·'+sc.chu.tjJi+'）'+(sc.chu.isKong?' [落空亡]':''));
    L.push('  中传 '+sc.zhong.zhi+'（'+sc.zhong.sx+'·'+sc.zhong.wx+'·'+sc.zhong.fw+'·'+sc.zhong.tj+'·'+sc.zhong.tjJi+'）'+(sc.zhong.isKong?' [落空亡]':''));
    L.push('  末传 '+sc.mo.zhi+'（'+sc.mo.sx+'·'+sc.mo.wx+'·'+sc.mo.fw+'·'+sc.mo.tj+'·'+sc.mo.tjJi+'）'+(sc.mo.isKong?' [落空亡]':''));
    L.push('  传变：初→中 '+({生:'生',克:'克',同:'比和',被生:'被生',被克:'被克',无:'无克'}[sc.chuToZhong]||'无克')+'，中→末 '+({生:'生',克:'克',同:'比和',被生:'被生',被克:'被克',无:'无克'}[sc.zhongToMo]||'无克'));
    L.push('');
    L.push('十二天将落宫：');
    ke.tjList.forEach(tj=>{
      L.push('  '+tj.name+'：乘'+tj.chengShen+'（'+tj.wx+'·'+tj.ji+'）'+(tj.isKong?' [落空亡]':''));
    });
    L.push('');
    L.push('神煞：驿马'+ke.shenSha.yima+' 桃花'+ke.shenSha.taohua+' 华盖'+ke.shenSha.huagai+' 太岁'+ke.shenSha.taiSui+' 月建'+ke.shenSha.yueJian);
    L.push('类神：'+ke.leishenName+'（乘'+(ke.leishenShen!==null?ZHI[ke.leishenShen]:'—')+(ke.leishenShen!==null&&ke.kongWang.includes(ke.leishenShen)?' ·落空亡':'')+'）');
    L.push('');
    L.push('白话：');
    L.push('  状态：'+p.state);
    L.push('  倾向：'+p.tendency);
    if(p.opps.length)L.push('  机会：'+p.opps.join('；'));
    if(p.risks.length)L.push('  风险：'+p.risks.join('；'));
    L.push('  建议：'+p.doAct.join('；'));
    L.push('  不建议：'+p.dontAct.join('；'));
    L.push('');
    L.push(AI.DISCLAIMER);
    const txt=L.join('\n');
    const blob=new Blob([txt],{type:'text/plain;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const aTag=document.createElement('a');aTag.href=url;aTag.download='xuanjue-board-'+fmtDate(new Date())+'.txt';document.body.appendChild(aTag);aTag.click();document.body.removeChild(aTag);URL.revokeObjectURL(url);
    toast('盘面已导出');
  }

  // ================= 盘面中心 =================
  // P1 实时术数：小六壬/梅花易数/六爻/塔罗（八字已从实时移除，归入命理排盘）
  const SHU_P1=['小六壬','梅花易数','六爻','塔罗'];
  function pageBoardCenter(){
    let h=`<div class="phead"><div class="ptitle">盘面</div><div class="psub">实时起课 · 命理排盘 · AI 分析</div></div>`;
    // 实时起课
    h+=`<div class="card"><h3>实时起课</h3><div class="section-note">基于当前或选定时间起课，结果页可查看 AI 分析</div>`;
    h+=`<div class="board-shortcuts"><button class="btn primary block" id="btnDlNow">大六壬 · 此刻起课</button><button class="btn block" id="btnDlManual">大六壬 · 手动时间</button></div>`;
    h+=`<div class="board-list">`;
    SHU_P1.forEach(s=>{
      h+=`<div class="recent-item" data-shu="${s}"><div class="ri-t">${s}</div><div class="ri-m">点击此刻起课</div><div class="ri-r">›</div></div>`;
    });
    h+=`</div></div>`;
    // 命理排盘
    state.birthBoard=state.birthBoard||{gender:'',calendar:'solar',date:'',hour:'',unknownHour:false,place:'',zhenTaiyang:false};
    h+=renderBirthForm(state.birthBoard,'命理排盘 · 出生信息');
    h+=`<div class="card"><div class="board-shortcuts"><button class="btn primary block" id="btnBoardBaZi">八字排盘 · AI 解读</button><button class="btn block" id="btnBoardZiWei">紫微斗数 · AI 解读</button></div></div>`;
    // 命理趣玩
    h+=`<div class="card"><h3>命理趣玩</h3><div class="qa-grid">`;
    h+=`<div class="game-item" data-game="stick"><div class="qa-ico">🎋</div>抽今日卦签</div>`;
    h+=`<div class="game-item" data-game="tarot"><div class="qa-ico">🃏</div>塔罗日运</div>`;
    h+=`<div class="game-item" data-game="wuxing"><div class="qa-ico">☯</div>五行速配</div>`;
    h+=`<div class="game-item" data-game="star"><div class="qa-ico">✦</div>星宿查询</div>`;
    h+=`</div></div>`;
    if(state.currentKe){
      h+=`<div class="card"><h3>最近盘面</h3><div class="recent-item" id="lastBoard"><div><div class="ri-t">大六壬 · ${state.currentKe.ke.dateStr}</div><div class="ri-m">${state.currentKe.ke.geju.join('、')}</div></div><div class="ri-r">查看</div></div></div>`;
    }
    return h;
  }
  function bindBoardCenter(){
    $('#btnDlNow').onclick=()=>{const comp=computeDaliuren(new Date(),state.ask&&state.ask.bg.questionType||'其他');state.currentKe=comp;showDaliurenBoard(comp);};
    $('#btnDlManual').onclick=()=>{
      modal('手动时间起课','<div class="field"><label>起课时间</label><input type="datetime-local" id="mTime" value="'+fmtLocalDT(new Date())+'"></div><div class="field"><label>问题类型（可选）</label><select id="mType">'+TYPES.map(t=>'<option>'+t+'</option>').join('')+'</select></div>',(m)=>{
        const d=new Date($('#mTime').value);const t=$('#mType').value;
        const comp=computeDaliuren(d,t);state.currentKe=comp;closeModal();showDaliurenBoard(comp);
      });
    };
    document.querySelectorAll('[data-shu]').forEach(e=>e.onclick=()=>{
      const name=e.dataset.shu;
      const res=ShuShu.compute(name,new Date());
      if(!res){toast(name+' 暂不可用');return;}
      showShuShuBoard(res);
    });
    const lb=$('#lastBoard');if(lb)lb.onclick=()=>showDaliurenBoard(state.currentKe);
    // 命理排盘（bindStep4 内已绑定 birth 表单与滚轮选择器）
    bindStep4({extra:{birth:state.birthBoard}});
    $('#btnBoardBaZi').onclick=()=>runBoardBirth('八字');
    $('#btnBoardZiWei').onclick=()=>runBoardBirth('紫微斗数');
    // 命理趣玩
    document.querySelectorAll('.game-item').forEach(e=>e.onclick=()=>openFortuneGame(e.dataset.game));
  }
  function runBoardBirth(name){
    const b=state.birthBoard;
    if(!b||!b.date){toast('请填写出生日期');return;}
    const d=resolveBirthDate(b);
    if(!d){toast('出生日期解析失败');return;}
    let r=null;
    if(name==='八字')r=ShuShu.baZiByBirth?ShuShu.baZiByBirth({date:d,gender:b.gender,place:b.place,zhenTaiyang:b.zhenTaiyang,unknownHour:b.unknownHour}):null;
    else r=ShuShu.ziWeiDouShu?ShuShu.ziWeiDouShu({date:d,gender:b.gender,place:b.place,zhenTaiyang:b.zhenTaiyang}):null;
    if(!r){toast(name+' 排盘失败，请检查出生信息');return;}
    showShuShuBoard(r);
  }
  // ================= 命理趣玩 =================
  function openFortuneGame(game){
    if(game==='stick')runDailyStick();
    else if(game==='tarot')runTarotDaily();
    else if(game==='wuxing')runWuxingMatch();
    else if(game==='star')runStarMansion();
  }
  function runDailyStick(){
    const r=ShuShu.compute('小六壬',new Date());
    const d=r&&r.result?r.result.detail:{};
    const body=`<div class="game-result"><div class="game-title">今日卦签：${d.attr||'—'}</div><div class="game-sub">${d.ji||'—'} · ${d.wx||'—'}</div><div class="game-text">${d.desc||'暂无签文'}</div><div class="section-note">${(r&&r.plain&&r.plain.doAct?r.plain.doAct.join('、'):'')||''}</div></div>`;
    modal('🎋 今日卦签',body,null,true,'再抽一支');
    // 覆盖「再抽一支」按钮行为：重新生成随机签
    const okBtn=$('#modal-root .btn.primary');
    if(okBtn)okBtn.onclick=()=>{
      const rr=ShuShu.compute('小六壬',{date:new Date(),questionType:'其他'});
      // 随机换一个宫：以当前秒数扰动
      const pos=ShuShu.XLR_POS||['大安','留连','速喜','赤口','小吉','空亡'];
      const idx=(Math.floor(Math.random()*pos.length))%pos.length;
      const fake={detail:{attr:['青龙','玄武','朱雀','白虎','六合','勾陈'][idx],ji:['吉','平','吉','凶','吉','凶'][idx],wx:['木','水','火','金','木','土'][idx],desc:['事事安和，谋为等候','事未决，纠缠拖延','喜事将至，速有佳音','口舌争讼，惊恐伤财','小有所得，和合生财','事多落空，徒劳无功'][idx]}};
      const dd=rr&&rr.result?rr.result.detail:fake.detail;
      const body2=`<div class="game-result"><div class="game-title">今日卦签：${dd.attr||'—'}</div><div class="game-sub">${dd.ji||'—'} · ${dd.wx||'—'}</div><div class="game-text">${dd.desc||'暂无签文'}</div></div>`;
      const mb=$('#modal-root .modal-body');if(mb)mb.innerHTML=body2;
    };
  }
  function runTarotDaily(){
    const r=ShuShu.compute('塔罗',{date:new Date(),spread:'single',tarotReverse:'随机正逆位'});
    let body='<div class="game-result"><div class="game-title">今日塔罗</div>';
    if(r&&r.result&&r.result.cards&&r.result.cards.length){
      const c=r.result.cards[0];
      body+=`<div class="tarot-daily"><div class="tc-name">${c.name} <span class="${c.up?'tc-up':'tc-rev'}">${c.up?'正位':'逆位'}</span></div><div class="tc-mean">${c.meaning}</div><div class="section-note">${c.advice||''}</div></div>`;
    }else{body+=`<div class="empty">塔罗牌阵生成失败</div>`;}
    body+='</div>';
    modal('🃏 塔罗日运',body,null,true,'关闭');
  }
  function runWuxingMatch(){
    const Sheng={'金':'水','水':'木','木':'火','火':'土','土':'金'};
    const Ke={'金':'木','木':'土','土':'水','水':'火','火':'金'};
    const Wx=['金','木','水','火','土'];
    const RELS=[{label:'生我',key:'shengMe'},{label:'我生',key:'sheng'},{label:'克我',key:'keMe'},{label:'我克',key:'ke'}];
    let score=0,round=0,current=null,currentRel=null;
    function build(){
      const src=Wx[Math.floor(Math.random()*Wx.length)];
      const rel=RELS[Math.floor(Math.random()*RELS.length)];
      let answer='';
      if(rel.key==='sheng')answer=Sheng[src];
      else if(rel.key==='ke')answer=Ke[src];
      else if(rel.key==='shengMe'){for(const k in Sheng)if(Sheng[k]===src){answer=k;break;}}
      else if(rel.key==='keMe'){for(const k in Ke)if(Ke[k]===src){answer=k;break;}}
      current={src,rel,answer};
      const opts=shuffle([...Wx]).slice(0,4);
      if(!opts.includes(answer)){opts[Math.floor(Math.random()*4)]=answer;}
      const body=`<div class="game-result"><div class="game-title">第 ${round+1}/10 题</div><div class="game-sub">五行「${src}」的「${rel.label}」是？</div><div class="wx-options">${opts.map(o=>`<button class="btn block mt8 wx-opt" data-v="${o}">${o}</button>`).join('')}</div><div class="game-score">得分：${score}</div></div>`;
      const mb=$('#modal-root .modal-body');
      if(mb){
        mb.innerHTML=body;
        mb.querySelectorAll('.wx-opt').forEach(b=>b.onclick=()=>check(b.dataset.v));
      }
    }
    function check(v){
      if(v===current.answer)score+=10;
      round++;
      if(round>=10){
        const rank=score>=90?'五行大师':(score>=70?'渐入佳境':(score>=50?'还需努力':'多练练吧'));
        const body=`<div class="game-result"><div class="game-title">游戏结束</div><div class="game-sub">最终得分：${score} / 100</div><div class="game-text">${rank}</div><button class="btn primary block mt8" id="wxReplay">再来一局</button></div>`;
        const mb=$('#modal-root .modal-body');if(mb){mb.innerHTML=body;$('#wxReplay').onclick=()=>{score=0;round=0;build();};}
        return;
      }
      build();
    }
    function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
    modal('☯ 五行速配','<div class="game-result"><div class="game-title">规则</div><div class="game-text">根据五行生克关系，选择正确答案，共 10 题。</div><button class="btn primary block mt8" id="wxStart">开始</button></div>',null,true,'关闭');
    const start=$('#wxStart');if(start)start.onclick=()=>build();
  }
  function runStarMansion(){
    const XIU=['角','亢','氐','房','心','尾','箕','斗','牛','女','虚','危','室','壁','奎','娄','胃','昴','毕','觜','参','井','鬼','柳','星','张','翼','轸'];
    const XIU_TEXT={
      '角':'角宿：主聪明机敏，宜谋划开端。','亢':'亢宿：主刚强好胜，谨防过刚。','氐':'氐宿：主稳健守成，宜积累。','房':'房宿：主正直光明，贵人暗藏。','心':'心宿：主心思细腻，宜沟通。','尾':'尾宿：主善变灵活，随机应变。','箕':'箕宿：主机谋口舌，慎言。','斗':'斗宿：主福禄寿全，宜进取。','牛':'牛宿：主勤劳踏实，厚积薄发。','女':'女宿：主柔顺多艺，宜内省。','虚':'虚宿：主虚无变动，宜守不宜攻。','危':'危宿：主危机转机，谨慎行事。','室':'室宿：主安居乐业，宜稳定。','壁':'壁宿：主守护收藏，暗中积蓄。','奎':'奎宿：主文章才学，宜学习。','娄':'娄宿：主收纳归置，宜整理。','胃':'胃宿：主食禄仓廪，忌浪费。','昴':'昴宿：主明朗公正，宜公开。','毕':'毕宿：主完成收获，善终。','觜':'觜宿：主口舌是非，低调。','参':'参宿：主参商离别，聚散无常。','井':'井宿：主水源滋养，广结善缘。','鬼':'鬼宿：主幽微隐秘，宜洞察。','柳':'柳宿：主柔顺依附，借势而为。','星':'星宿：主声名远播，宜表现。','张':'张宿：主开张拓展，把握时机。','翼':'翼宿：主辅佐助力，合作共赢。','轸':'轸宿：主车辆迁移，宜出行。'
    };
    function calc(){
      const m=parseInt($('#starMonth').value,10);
      const d=parseInt($('#starDay').value,10);
      if(!m||!d){toast('请输入有效的农历月日');return;}
      const idx=((m-1)*2+d)%28;
      const name=XIU[idx];
      const out=$('#starResult');if(out)out.innerHTML=`<div class="game-title">二十八宿：${name}宿</div><div class="game-text">${XIU_TEXT[name]}</div>`;
    }
    const body=`<div class="game-result"><div class="game-title">星宿查询</div><div class="section-note">按农历月日快速查询对应二十八宿（趣味参考）</div><div class="field"><label>农历月</label><input type="number" id="starMonth" min="1" max="12" value="1"></div><div class="field"><label>农历日</label><input type="number" id="starDay" min="1" max="30" value="1"></div><button class="btn primary block mt8" id="btnStarCalc">查询</button><div id="starResult" class="mt12"></div></div>`;
    modal('✦ 星宿查询',body,(m)=>calc(),true,'查询');
    const calcBtn=$('#btnStarCalc');if(calcBtn)calcBtn.onclick=calc;
  }
  // P1 术数盘面展示（复用 ask 渠道）
  function showShuShuBoard(res){
    state.ask={bg:{questionType:'其他'},computed:{shushuResults:{[res.name]:res},shushu:[res.name]},step:5,shushu:[res.name],_placeholder:true,_shushuOnly:true};
    state.tab='ask';renderTab();
    setTimeout(()=>bindResult(state.ask),30);
    navEnter(()=>{state.ask=null;state.tab='board';renderTab();},'shushuBoard');
  }
  function showDaliurenBoard(comp){
    // 用一个临时 ask bg（标记 _placeholder 以便用户主动点「问事」Tab 时重置）
    state.ask={bg:{questionType:'其他'},computed:{comp},step:5,shushu:['大六壬'],_placeholder:true};
    state.tab='ask';renderTab();
    // 保持 boardMode
    setTimeout(()=>bindResult(state.ask),30);
    // 注册返回动作：硬件返回键 / 应用内返回按钮均回到盘面 Tab（重新起课时原地替换，不累加历史）
    navEnter(()=>{state.ask=null;state.tab='board';renderTab();},'boardResult');
  }

  // ================= 案例 =================
  // 复盘标签：预定义 + 自定义（localStorage key: xuanjue_review_tags）
  const REVIEW_TAGS_KEY='xuanjue_review_tags';
  const PREDEF_REVIEW_TAGS=['时机准确','方向偏差','情绪干扰','信息不足','外力干预','盘面清晰','AI解释有用','其他'];
  const REVIEW_SHU_OPTS=['大六壬','八字','六爻','小六壬','梅花易数','塔罗'];
  function getCustomReviewTags(){try{return JSON.parse(localStorage.getItem(REVIEW_TAGS_KEY)||'[]');}catch(e){return [];}}
  function saveCustomReviewTags(arr){try{localStorage.setItem(REVIEW_TAGS_KEY,JSON.stringify(arr||[]));}catch(e){}}
  function getAllReviewTags(){return Array.from(new Set([...PREDEF_REVIEW_TAGS,...getCustomReviewTags()]));}

  function pageCaseList(){
    // 子页面：复盘统计独立页
    if(state.subPage==='stats')return pageStats();
    const cases=Store.listCases();
    // 问题类型下拉项：基于已有案例
    const typeOpts=Array.from(new Set(cases.map(c=>c.questionType).filter(Boolean)));
    // 标签下拉项：预定义 + 自定义
    const tagOpts=getAllReviewTags();
    let h=`<div class="phead"><div class="ptitle">案例</div><div class="psub">共 ${cases.length} 条</div></div>`;
    // 统计入口
    h+=`<div class="card"><div class="review-stat" id="miniStat"></div><button class="btn block" id="btnStat">复盘统计</button></div>`;
    // 筛选栏
    h+=`<div class="card filter-bar">`;
    h+=`<div class="filter-row"><label>关键词</label><input type="text" class="filter-select" id="fKeyword" placeholder="搜索标题 / 描述 / 术数…"></div>`;
    h+=`<div class="filter-row"><label>术数</label><select class="filter-select" id="fShu"><option value="全部">全部</option>${REVIEW_SHU_OPTS.map(s=>`<option value="${s}">${s}</option>`).join('')}</select></div>`;
    h+=`<div class="filter-row"><label>问题类型</label><select class="filter-select" id="fType"><option value="全部">全部</option>${typeOpts.map(t=>`<option value="${t}">${t}</option>`).join('')}</select></div>`;
    h+=`<div class="filter-row"><label>应验程度</label><select class="filter-select" id="fResult"><option value="全部">全部</option><option value="已复盘">已复盘</option><option value="未复盘">未复盘</option><option value="到期待复盘">到期待复盘</option><option value="应验">应验</option><option value="部分应验">部分应验</option><option value="未应验">未应验</option><option value="无法判断">无法判断</option></select></div>`;
    h+=`<div class="filter-row"><label>起讫时间</label><div class="filter-date-row"><input type="date" class="filter-select" id="fDateFrom"><input type="date" class="filter-select" id="fDateTo"></div></div>`;
    h+=`<div class="filter-row"><label>标签</label><select class="filter-select" id="fTag"><option value="">全部</option>${tagOpts.map(t=>`<option value="${t}">${t}</option>`).join('')}</select></div>`;
    h+=`<div class="filter-row"><label>收藏</label><select class="filter-select" id="fFavor"><option value="全部">全部</option><option value="已收藏">已收藏</option><option value="未收藏">未收藏</option></select></div>`;
    h+=`<div class="filter-actions"><button class="btn primary sm" id="btnApplyFilter" type="button">应用筛选</button><button class="btn ghost sm" id="btnClearFilter" type="button">清空</button></div>`;
    h+=`</div>`;
    h+=`<div id="caseListBody"></div>`;
    setTimeout(()=>renderCaseListBody(),10);
    return h;
  }
  function collectFilter(){
    const f={};
    const kw=$('#fKeyword');if(kw&&kw.value.trim())f.keyword=kw.value.trim();
    const s=$('#fShu');if(s)f.shushu=s.value||'全部';
    const t=$('#fType');if(t)f.questionType=t.value||'全部';
    const r=$('#fResult');if(r){
      const v=r.value;
      if(v==='已复盘')f.reviewed=true;
      else if(v==='未复盘')f.reviewed=false;
      else if(v==='到期待复盘')f.duePending=true;
      else if(v&&v!=='全部')f.result=v;
    }
    const df=$('#fDateFrom');if(df&&df.value)f.dateFrom=df.value;
    const dt=$('#fDateTo');if(dt&&dt.value)f.dateTo=dt.value;
    const tg=$('#fTag');if(tg&&tg.value)f.tag=tg.value;
    const fav=$('#fFavor');if(fav){
      const v=fav.value;
      if(v==='已收藏')f.favor=true;
      else if(v==='未收藏')f.favor=false;
    }
    return f;
  }
  function renderCaseListBody(){
    const body=$('#caseListBody');if(!body)return;
    const filter=collectFilter();
    const cases=Store.listCasesByFilter(filter);
    const now=Date.now();
    if(!cases.length){body.innerHTML='<div class="empty">暂无案例</div>';}
    else{
      body.innerHTML=cases.map(c=>{
        const due=!c.reviewed&&c.reviewDue&&now>c.reviewDue;
        const dueTag=due?'<span class="due-dot"></span><span class="due-badge">到期</span>':'';
        const favorTag=c.favor?'<span class="favor-star on">★</span>':'';
        const right=c.reviewed?(c.review.result||'已复盘'):'待复盘';
        return `<div class="recent-item" data-case="${c.id}"><div><div class="ri-t">${favorTag}${dueTag}${c.title}</div><div class="ri-m">${c.questionType} · ${c.shushu} · ${fmtDate(new Date(c.createdAt))}</div></div><div class="ri-r">${right}</div></div>`;
      }).join('');
      body.querySelectorAll('[data-case]').forEach(e=>e.onclick=()=>openCaseDetail(e.dataset.case));
    }
    // mini stat：基于全局统计
    const ms=$('#miniStat');
    if(ms){const st=Store.reviewStats();ms.innerHTML=`<div class="stat-box"><div class="sb-n">${st.total}</div><div class="sb-l">总案例</div></div><div class="stat-box"><div class="sb-n">${st.reviewedCount}</div><div class="sb-l">已复盘</div></div><div class="stat-box"><div class="sb-n">${Math.round(st.reviewRate*100)}%</div><div class="sb-l">复盘率</div></div>`;}
  }
  function bindCaseList(){
    // 子页面：复盘统计独立页绑定
    if(state.subPage==='stats'){bindStats();return;}
    const apply=$('#btnApplyFilter');if(apply)apply.onclick=()=>renderCaseListBody();
    const clear=$('#btnClearFilter');
    if(clear)clear.onclick=()=>{
      const ids=['fShu','fType','fResult','fTag','fFavor'];
      ids.forEach(id=>{const e=$('#'+id);if(e)e.value='全部';});
      const kw=$('#fKeyword');if(kw)kw.value='';
      const dfrom=$('#fDateFrom');if(dfrom)dfrom.value='';
      const dto=$('#fDateTo');if(dto)dto.value='';
      renderCaseListBody();
    };
    const bs=$('#btnStat');if(bs)bs.onclick=()=>openStats();
  }
  function openCaseDetail(id){
    if(id===undefined)id=state.viewCaseId;
    const c=Store.getCase(id);if(!c){toast('案例不存在');return;}
    state.viewCaseId=id;
    // 注册返回动作：硬件返回键 / 应用内返回均回到案例列表
    navEnter(()=>{state.viewCaseId=null;state.tab='case';renderTab();},'caseDetail');
    const container=$('#page-container');
    // 到期未复盘提示条
    const dueNow=!c.reviewed&&c.reviewDue&&Date.now()>c.reviewDue;
    let h=`<div class="phead"><div><div class="ptitle">案例详情</div><div class="psub">${fmtDate(new Date(c.createdAt))}</div></div><button class="btn ghost sm" id="backList">返回</button></div>`;
    if(dueNow){h+=`<div class="due-banner">本案例已到复盘时间，建议尽快复盘</div>`;}
    h+=`<div class="card detail-sec"><h3>${c.title}</h3>`;
    h+=`<div class="detail-row"><span class="dk">类型</span><span>${c.questionType}</span></div>`;
    if(c.desc)h+=`<div class="detail-row"><span class="dk">描述</span><span style="text-align:right;max-width:70%">${c.desc}</span></div>`;
    h+=`<div class="detail-row"><span class="dk">情绪</span><span>${c.mood||'—'}</span></div>`;
    h+=`<div class="detail-row"><span class="dk">紧急</span><span>${c.urgent||'—'}</span></div>`;
    if(c.hasOption){h+=`<div class="detail-row"><span class="dk">选项A</span><span>${c.optA||'—'}</span></div><div class="detail-row"><span class="dk">选项B</span><span>${c.optB||'—'}</span></div>`;}
    if(c.persons)h+=`<div class="detail-row"><span class="dk">人物</span><span>${c.persons}</span></div>`;
    h+=`<div class="detail-row"><span class="dk">术数</span><span>${c.shushu}</span></div>`;
    h+=`<div class="detail-row"><span class="dk">起课</span><span>${fmtDateTime(new Date(c.qikeTime))}</span></div>`;
    h+=`</div>`;
    // 盘面
    if(c.board){
      h+=`<div class="card detail-sec"><h4>盘面 · 大六壬（${c.board.geju.join('、')}）</h4>`;
      h+=`<div class="kv-grid"><div class="kv"><span class="k">月将</span><span class="v">${c.board.yueJiang.zhi}</span></div><div class="kv"><span class="k">占时</span><span class="v">${c.board.zhanShi.zhi}</span></div><div class="kv"><span class="k">三传</span><span class="v">${c.board.sanChuan.chu.zhi}→${c.board.sanChuan.zhong.zhi}→${c.board.sanChuan.mo.zhi}</span></div><div class="kv"><span class="k">空亡</span><span class="v">${ZHI[c.board.kongWang[0]]}${ZHI[c.board.kongWang[1]]}</span></div></div>`;
      h+=`</div>`;
    }
    // 术数盘面
    if(c.shushuBoard){
      const sb=c.shushuBoard;
      if(sb.name){
        h+=`<div class="card detail-sec"><h4>盘面 · ${sb.name}</h4><div class="plain-card"><div class="pc-t">盘面摘要</div><div class="pc-c">${shuBoardSummary(sb)}</div></div></div>`;
      }else{
        Object.keys(sb).forEach(k=>{
          h+=`<div class="card detail-sec"><h4>盘面 · ${sb[k].name}</h4><div class="plain-card"><div class="pc-t">盘面摘要</div><div class="pc-c">${shuBoardSummary(sb[k])}</div></div></div>`;
        });
      }
    }
    // 白话
    if(c.plain){
      const p=c.plain;
      h+=`<div class="card detail-sec"><h4>白话解读</h4>`;
      h+=`<div class="plain-card"><div class="pc-t">状态/倾向</div><div class="pc-c">${p.state}（${p.tendency}）</div></div>`;
      if(p.risks.length)h+=`<div class="plain-card"><div class="pc-t">风险</div><div class="pc-c">${p.risks.join('；')}</div></div>`;
      h+=`</div>`;
    }
    // 我的判断
    h+=`<div class="card detail-sec"><h4>我的判断与行动</h4>`;
    h+=`<div class="field"><label>我的判断</label><textarea id="myJudge">${c.myJudge||''}</textarea></div>`;
    h+=`</div>`;
    // 复盘
    h+=`<div class="card detail-sec"><h4>复盘</h4>`;
    if(c.reviewed){
      const r=c.review||{};
      h+=`<div class="detail-row"><span class="dk">实际结果</span><span style="text-align:right;max-width:70%">${r.actual||'—'}</span></div>`;
      h+=`<div class="detail-row"><span class="dk">应验程度</span><span>${r.result||'—'}</span></div>`;
      // 准确度评分（星显示）
      if(r.score!=null&&Number(r.score)>=1&&Number(r.score)<=5){
        h+=`<div class="detail-row"><span class="dk">评分</span><span>${renderStars(Number(r.score))}</span></div>`;
      }
      if(r.reviewTime)h+=`<div class="detail-row"><span class="dk">复盘日期</span><span>${r.reviewTime}</span></div>`;
      if(r.unhit)h+=`<div class="detail-row"><span class="dk">未应验点</span><span>${r.unhit}</span></div>`;
      if(r.reflect)h+=`<div class="detail-row"><span class="dk">反思</span><span>${r.reflect}</span></div>`;
      // 复盘标签 chips
      if(Array.isArray(r.tags)&&r.tags.length){
        h+=`<div class="review-tags">${r.tags.map(t=>`<span class="review-tag on">${t}</span>`).join('')}</div>`;
      }
      h+=`<button class="btn block mt8" id="btnReviewAgain">重新复盘</button>`;
    }else{
      h+=`<div class="section-note">复盘提醒：${c.reviewDue?fmtDate(new Date(c.reviewDue)):'未设置'}</div>`;
      h+=`<button class="btn primary block mt8" id="btnReview">立即复盘</button>`;
    }
    h+=`</div>`;
    h+=`<div class="card"><button class="btn block" id="btnToggleFavor">${c.favor?'取消收藏':'收藏案例'}</button><button class="btn block mt8" id="btnExportCase">导出本案例</button><button class="btn danger block mt8" id="btnDelCase">删除案例</button></div>`;
    container.innerHTML=h;
    $('#backList').onclick=()=>{navBack();};
    $('#myJudge').oninput=ev=>{c.myJudge=ev.target.value;Store.saveCase(c);};
    if($('#btnReview'))$('#btnReview').onclick=()=>openReview(id);
    if($('#btnReviewAgain'))$('#btnReviewAgain').onclick=()=>openReview(id);
    $('#btnToggleFavor').onclick=()=>{c.favor=!c.favor;Store.saveCase(c);openCaseDetail(id);toast(c.favor?'已收藏':'已取消收藏');};
    $('#btnExportCase').onclick=()=>exportCase(c);
    $('#btnDelCase').onclick=()=>{modal('删除案例','确定删除该案例？此操作不可恢复。',(m)=>{Store.deleteCase(id);closeModal();toast('已删除');renderTab();});};
  }
  function openReview(id){
    const c=Store.getCase(id);if(!c)return;
    const results=['应验','部分应验','未应验','无法判断'];
    const initScore=(c.review&&Number(c.review.score))||0;
    const initTags=Array.isArray(c.review&&c.review.tags)?c.review.tags.slice():[];
    let body=`<div class="field"><label>实际结果</label><textarea id="rActual">${c.review&&c.review.actual||''}</textarea></div>`;
    body+=`<div class="field"><label>应验程度</label><div class="chips" id="rResChips">${results.map(r=>`<span class="chip ${(c.review&&c.review.result===r)?'on':''}" data-res="${r}">${r}</span>`).join('')}</div></div>`;
    body+=`<div class="field"><label>未应验点</label><textarea id="rUnhit">${c.review&&c.review.unhit||''}</textarea></div>`;
    body+=`<div class="field"><label>我的反思</label><textarea id="rReflect">${c.review&&c.review.reflect||''}</textarea></div>`;
    // 准确度评分（1-5 星）
    body+=`<div class="field"><label>准确度评分</label><div class="star-rating" id="rStars">${[1,2,3,4,5].map(i=>`<span class="star ${i<=initScore?'active':''}" data-star="${i}">★</span>`).join('')}</div></div>`;
    // 复盘标签：预定义 + 自定义输入
    const allTags=getAllReviewTags();
    body+=`<div class="field"><label>复盘标签</label><div class="review-tags" id="rTags">${allTags.map(t=>`<span class="review-tag ${initTags.includes(t)?'on':''}" data-tag="${t}">${t}</span>`).join('')}</div>`;
    body+=`<div class="review-tag-input"><input type="text" id="rTagInput" placeholder="自定义标签（最多 20 字）" maxlength="20"><button class="btn mini" id="rTagAdd" type="button">添加</button></div></div>`;
    let chosen=c.review&&c.review.result||'';
    let chosenScore=initScore;
    let chosenTags=initTags.slice();
    modal('复盘',body,(m)=>{
      const actual=$('#rActual').value,unhit=$('#rUnhit').value,reflect=$('#rReflect').value;
      if(!chosen){toast('请选择应验程度');return;}
      Store.addReview(id,{
        actual,unhit,reflect,result:chosen,
        score:chosenScore||null,
        tags:chosenTags,
        reviewTime:fmtDate(new Date())
      });
      closeModal();toast('复盘已保存');openCaseDetail(id);
    },true,'保存复盘');
    setTimeout(()=>{
      // 应验程度 chips
      document.querySelectorAll('#rResChips .chip').forEach(e=>e.onclick=()=>{chosen=e.dataset.res;document.querySelectorAll('#rResChips .chip').forEach(x=>x.classList.remove('on'));e.classList.add('on');});
      // 星评分：点击第 n 颗星即设为 n 分；再次点击当前分清零
      document.querySelectorAll('#rStars .star').forEach(e=>e.onclick=()=>{
        const n=parseInt(e.dataset.star,10);
        chosenScore=(n===chosenScore)?0:n;
        document.querySelectorAll('#rStars .star').forEach((x,i)=>{
          x.classList.toggle('active',(i+1)<=chosenScore);
        });
      });
      // 标签 chips：预定义 + 自定义均可切换
      document.querySelectorAll('#rTags .review-tag').forEach(e=>e.onclick=()=>{
        const t=e.dataset.tag;
        const i=chosenTags.indexOf(t);
        if(i>=0){chosenTags.splice(i,1);e.classList.remove('on');}
        else{chosenTags.push(t);e.classList.add('on');}
      });
      // 添加自定义标签：写入 localStorage
      const input=$('#rTagInput');
      const addBtn=$('#rTagAdd');
      if(addBtn)addBtn.onclick=()=>{
        const v=(input&&input.value||'').trim();
        if(!v){toast('请输入标签');return;}
        if(v.length>20){toast('标签过长');return;}
        const custom=getCustomReviewTags();
        if(!custom.includes(v)){custom.push(v);saveCustomReviewTags(custom);}
        // 重新渲染标签 chips（仅追加新增项）
        const tagsEl=$('#rTags');
        if(tagsEl){
          const existing=Array.from(tagsEl.querySelectorAll('.review-tag')).map(x=>x.dataset.tag);
          if(!existing.includes(v)){
            const span=document.createElement('span');
            span.className='review-tag'+(chosenTags.includes(v)?' on':'');
            span.dataset.tag=v;
            span.textContent=v;
            span.onclick=()=>{
              const i2=chosenTags.indexOf(v);
              if(i2>=0){chosenTags.splice(i2,1);span.classList.remove('on');}
              else{chosenTags.push(v);span.classList.add('on');}
            };
            tagsEl.appendChild(span);
          }
        }
        if(chosenTags.indexOf(v)<0)chosenTags.push(v);
        if(input)input.value='';
      };
    },30);
  }
  // 渲染只读星评分（详情/统计页用）
  function renderStars(score){
    const s=Math.max(0,Math.min(5,Math.round(Number(score)||0)));
    let h='<span class="star-rating">';
    for(let i=1;i<=5;i++){h+=`<span class="star ${i<=s?'active':''}">★</span>`;}
    h+='</span>';
    return h;
  }
  // openStats 改为独立页面：设置 subPage='stats'，由 pageStats 渲染
  function openStats(){
    state.subPage='stats';
    renderTab();
    navEnter(()=>{state.subPage='';state.tab='case';renderTab();},'stats');
  }
  function pageStats(){
    const st=Store.reviewStats();
    let h=`<div class="phead"><div class="ptitle">复盘统计</div><button class="btn ghost sm" id="btnStatsBack" type="button">返回</button></div>`;
    h+=`<div class="stats-page">`;
    // 顶部 4 个大数字卡片
    h+=`<div class="stat-big-cards">`;
    h+=`<div class="stat-big-card"><div class="sbc-n">${st.total}</div><div class="sbc-l">总案例</div></div>`;
    h+=`<div class="stat-big-card"><div class="sbc-n">${st.reviewedCount}</div><div class="sbc-l">已复盘</div></div>`;
    h+=`<div class="stat-big-card"><div class="sbc-n">${Math.round(st.strictAcc*100)}%</div><div class="sbc-l">严格应验率</div></div>`;
    h+=`<div class="stat-big-card"><div class="sbc-n">${Math.round(st.looseAcc*100)}%</div><div class="sbc-l">宽松应验率</div></div>`;
    h+=`</div>`;
    // 复盘率进度条
    const ratePct=Math.round(st.reviewRate*100);
    h+=`<div class="card"><div class="flex-between"><span>复盘率</span><span class="num-val">${ratePct}%</span></div>`;
    h+=`<div class="stat-bar"><div class="stat-bar-fill" style="width:${ratePct}%"></div></div></div>`;
    // 平均评分
    const avgStr=st.avgScore>0?st.avgScore.toFixed(1):'—';
    h+=`<div class="card"><div class="flex-between"><span>平均评分</span><span>${renderStars(st.avgScore||0)}<span class="num-val">${avgStr}</span></span></div></div>`;
    // 分组卡片
    // 1. 按应验程度
    h+=renderStatGroup('按应验程度',['应验','部分应验','未应验','无法判断'].map(k=>({
      name:k,count:st.byResult[k]||0,pct:st.reviewedCount?Math.round((st.byResult[k]||0)/st.reviewedCount*100):0
    })));
    // 2. 按术数（数量+应验率）：从案例原始数据聚合
    const cases=Store.listCases();
    const shuStats={};
    cases.forEach(c=>{
      if(!c.reviewed)return;
      if(!c.shushu)return;
      const shus=String(c.shushu).split('、').filter(Boolean);
      const r=(c.review&&c.review.result)||'无法判断';
      shus.forEach(s=>{
        if(!shuStats[s])shuStats[s]={count:0,hit:0,na:0};
        shuStats[s].count++;
        if(r==='应验'||r==='部分应验')shuStats[s].hit++;
        if(r==='无法判断')shuStats[s].na++;
      });
    });
    h+=renderStatGroup('按术数',Object.keys(shuStats).map(k=>{
      const s=shuStats[k];
      const judgeable=s.count-s.na;
      const acc=judgeable>0?Math.round(s.hit/judgeable*100):0;
      return {name:k,count:s.count,pct:acc,accLabel:'应验率'};
    }));
    // 3. 按问题类型
    h+=renderStatGroup('按问题类型',Object.keys(st.byType).map(k=>({
      name:k,count:st.byType[k],pct:st.reviewedCount?Math.round(st.byType[k]/st.reviewedCount*100):0
    })));
    // 4. 按倾向标签
    const tendKeys=Object.keys(st.byTendency);
    h+=renderStatGroup('按倾向标签',tendKeys.length?tendKeys.map(k=>({
      name:k,count:st.byTendency[k],pct:st.reviewedCount?Math.round(st.byTendency[k]/st.reviewedCount*100):0
    })):[]);
    // 5. 按准确度评分分布（5→1）
    h+=renderStatGroup('按准确度评分',[5,4,3,2,1].map(s=>({
      name:'★'.repeat(s),count:st.byScore[s]||0,pct:st.reviewedCount?Math.round((st.byScore[s]||0)/st.reviewedCount*100):0
    })));
    h+=`<div class="section-note">统计仅用于个人校准，不对外展示。</div>`;
    h+=`</div>`;
    return h;
  }
  function bindStats(){
    const back=$('#btnStatsBack');
    if(back)back.onclick=()=>{navBack();};
  }
  // 渲染单个分组卡片：items=[{name,count,pct,accLabel?}]
  function renderStatGroup(title,items){
    let h=`<div class="stat-group"><div class="sg-t">${title}</div>`;
    if(!items||!items.length){h+=`<div class="empty">暂无数据</div></div>`;return h;}
    items.forEach(it=>{
      h+=`<div class="sg-item">`;
      h+=`<span class="sg-name">${it.name}</span>`;
      h+=`<div class="sg-bar-wrap"><div class="sg-bar" style="width:${Math.min(100,Math.max(0,it.pct||0))}%"></div></div>`;
      h+=`<span class="sg-stats">${it.count}${it.accLabel?' · '+it.accLabel+it.pct+'%':''}</span>`;
      h+=`<span class="sg-pct">${it.pct||0}%</span>`;
      h+=`</div>`;
    });
    h+=`</div>`;
    return h;
  }
  function exportCase(c){
    const data=JSON.stringify(c,null,2);
    const blob=new Blob([data],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download='xuanjue-case-'+c.id+'.json';document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
    toast('案例已导出');
  }

  // ================= 我的 =================
  function pageMe(){
    if(state.subPage==='important')return pageImportant();
    const s=Store.getSettings(),p=Store.getProfile();
    let h=`<div class="phead"><div class="ptitle">我的</div></div>`;
    h+=`<div class="card"><div class="detail-row"><span class="dk">昵称</span><span>${p.nick||'未设置'}</span></div><div class="detail-row"><span class="dk">出生</span><span>${p.birth||'—'}</span></div></div>`;
    h+=`<div class="card set-group"><div class="sg-t">个人信息</div><button class="btn block" id="btnProfile">编辑个人信息</button></div>`;
    h+=`<div class="card set-group"><div class="sg-t">术数设置</div>`;
    h+=selectRow('大六壬贵人','dlGuiRen',['昼夜贵人','夜贵人','甲戊庚牛羊']);
    h+=selectRow('涉害取法','dlSheHai',['涉害取深','涉害取孟仲季']);
    h+=selectRow('月将设置','yueJiang',['中气定将','节气定将']);
    h+=switchRow('八字真太阳时','zhenTaiyang',s.zhenTaiyang);
    h+=selectRow('塔罗正逆位','tarotReverse',['随机正逆位','仅正位','仅逆位']);
    h+=`</div>`;
    h+=`<div class="card set-group"><div class="sg-t">AI 设置</div>`;
    h+=selectRow('AI 语气','aiTone',['专业谨慎','温和陪伴','直接简洁','传统术数','心理探索']);
    h+=selectRow('解读长度','aiLength',['简短','标准','详细']);
    h+=switchRow('显示专业术语','showTerm',s.showTerm);
    h+=switchRow('自动生成行动建议','autoAdvice',s.autoAdvice);
    h+=switchRow('自动复制提示词','autoCopyPrompt',s.autoCopyPrompt);
    h+=switchRow('离线模式','offlineMode',s.offlineMode);
    h+=`</div>`;
    h+=`<div class="card set-group"><div class="sg-t">外观</div>`;
    h+=selectRow('深色模式','darkMode',['自动','深色','浅色']);
    h+=`</div>`;
    h+=pageAIConfig(s);
    h+=`<div class="card set-group"><div class="sg-t">备份与恢复</div>`;
    const sz=Store.storageSizeEstimate();
    h+=`<div class="storage-info">当前案例 <span class="num-val">${sz.caseCount}</span> 条 · 占用 <span class="num-val">${sz.sizeText}</span></div>`;
    h+=`<button class="btn block" id="btnExport">导出备份</button><button class="btn block mt8" id="btnImport">导入备份</button><button class="btn danger block mt8" id="btnClear">一键清除全部案例</button>`;
    h+=`</div>`;
    h+=`<div class="card set-group"><div class="sg-t">提醒</div>`;
    const notifyStatus=('Notification' in window)?(Notification.permission==='granted'?'已授权':(Notification.permission==='denied'?'已拒绝':'未授权')):'不支持';
    h+=`<div class="detail-row"><span class="dk">系统通知</span><span>${notifyStatus}</span></div>`;
    h+=switchRow('允许系统通知','notificationEnabled',s.notificationEnabled && notifyStatus==='已授权');
    h+=`<button class="btn block mt8" id="btnReqNotify">${notifyStatus==='已授权'?'重新请求通知权限':'请求通知权限'}</button>`;
    h+=switchRow('每日时课提醒','remindDaily',s.remindDaily);
    h+=`<div class="field" style="margin:8px 0"><label>每日提醒时间</label><input type="time" data-set="dailyTime" value="${escAttr(s.dailyTime)}"></div>`;
    h+=switchRow('复盘提醒','remindReview',s.remindReview);
    h+=switchRow('重要日期提醒','remindImportant',s.remindImportant);
    h+=`<button class="btn block mt8" id="btnImportant">管理重要日期</button>`;
    h+=`</div>`;
    const lock=Store.getLockState();
    h+=`<div class="card set-group"><div class="sg-t">隐私与安全</div>`;
    h+=`<div class="detail-row"><span class="dk">应用锁</span><span>${lock.appLock?'已开启':'未开启'}</span></div>`;
    h+=`<button class="btn block" id="btnLockSetting">${lock.appLock?'管理应用锁':'设置应用锁'}</button>`;
    h+=`<div class="section-note">开启后进入应用、从后台返回需输入密码；可额外启用本地加密保护 API Key 与个人信息。</div>`;
    h+=`</div>`;
    h+=`<div class="card"><button class="btn block" id="btnAbout">关于与免责声明</button></div>`;
    h+=`<div class="card"><div class="detail-row"><span class="dk">版本</span><span>玄决 V1.0.4</span></div><div class="detail-row"><span class="dk">术数模块</span><span>大六壬 · 六爻 · 八字 · 梅花易数 · 小六壬 · 塔罗 · 紫微斗数</span></div><div class="detail-row"><span class="dk">古籍库</span><span>10 本 / 150 段</span></div><div class="detail-row"><span class="dk">数据</span><span>本地存储 · 离线可用 · 不上传</span></div></div>`;
    return h;
  }
  // 重要日期管理子页
  function pageImportant(){
    const list=Store.listImportant();
    let h=`<div class="phead"><div class="ptitle">重要日期</div><div class="psub">生日、约定日、事务节点</div></div>`;
    h+=`<div class="card"><button class="btn primary block" id="btnAddImportant">添加重要日期</button></div>`;
    if(list.length){
      h+=`<div class="card">`;
      list.forEach(it=>{
        const d=daysUntil(it.date,it);
        const dayText=d===0?'今天':(d===1?'明天':(d===-1?'昨天':(d!==null?(d>0?d+'天后':'已过期 '+(-d)+' 天'):'')));
        const lunarTag=it.lunar?'<span class="tag-mini">农历</span>':'';
        const repeatTag=it.repeat==='year'?'<span class="tag-mini">每年</span>':'';
        h+=`<div class="important-manage-item" data-id="${it.id}"><div><div class="ii-t">${esc(it.name)}${lunarTag}${repeatTag}</div><div class="ii-m">${it.date}${it.note?' · '+esc(it.note):''}</div></div><div class="ii-r ${d===0?'urgent':''}">${dayText}<button class="btn danger mini" data-del="${it.id}">删除</button></div></div>`;
      });
      h+=`</div>`;
    }else{
      h+=`<div class="card"><div class="empty">暂无重要日期，点击上方按钮添加</div></div>`;
    }
    h+=`<div class="card"><div class="section-note">重要日期将在首页“重要日期提醒”区域显示（需开启提醒开关），默认展示未来 7 天与昨天。</div></div>`;
    return h;
  }
  function bindImportant(){
    $('#btnAddImportant').onclick=()=>openImportantEdit();
    document.querySelectorAll('[data-del]').forEach(b=>b.onclick=ev=>{
      ev.stopPropagation();
      const id=b.dataset.del;
      Store.deleteImportant(id);
      renderTab();
      toast('已删除');
    });
    document.querySelectorAll('[data-id]').forEach(e=>e.onclick=()=>{
      const it=Store.getImportant(e.dataset.id);
      if(it)openImportantEdit(it);
    });
  }
  function openImportantEdit(item){
    item=item||{};
    const dateInputType=item.lunar?'text':'date';
    const datePlaceholder=item.lunar?'如 1990-05-20（农历）':'';
    const body=`<div class="field"><label>名称</label><input type="text" id="iName" value="${escAttr(item.name||'')}" placeholder="如：母亲生日"></div><div class="field"><label>日期</label><input type="${dateInputType}" id="iDate" value="${item.date||''}" placeholder="${datePlaceholder}"></div><div class="field"><label>备注（可选）</label><input type="text" id="iNote" value="${escAttr(item.note||'')}" placeholder="如：准备礼物"></div><div class="check-line"><input type="checkbox" id="iLunar" ${item.lunar?'checked':''}><label for="iLunar">这是农历日期</label></div><div class="check-line"><input type="checkbox" id="iRepeat" ${item.repeat==='year'?'checked':''}><label for="iRepeat">每年重复</label></div>`;
    modal(item.id?'编辑重要日期':'添加重要日期',body,m=>{
      const name=$('#iName').value.trim(),date=$('#iDate').value,note=$('#iNote').value.trim();
      const lunar=$('#iLunar').checked,repeat=$('#iRepeat').checked?'year':'';
      if(!name){toast('请输入名称');return;}
      if(!date){toast('请选择日期');return;}
      // 农历日期格式校验：YYYY-MM-DD
      if(lunar && !/^\d{4}-\d{2}-\d{2}$/.test(date)){toast('农历日期请按 1990-05-20 格式填写');return;}
      Store.saveImportant({id:item.id,name,date,note,lunar,repeat});
      closeModal();toast('已保存');renderTab();
    },true,'保存');
  }

  function selectRow(label,key,opts){
    const s=Store.getSettings();const cur=s[key];
    return `<div class="field" style="margin:8px 0"><label>${label}</label><select data-set="${key}">${opts.map(o=>`<option ${o===cur?'selected':''}>${o}</option>`).join('')}</select></div>`;
  }
  function switchRow(label,key,val){
    return `<div class="switch"><span>${label}</span><input type="checkbox" data-set="${key}" ${val?'checked':''}></div>`;
  }
  // AI 模型配置卡片
  function escAttr(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  function pageAIConfig(s){
    const P=AI.PROVIDERS;
    const provOpts=Object.keys(P).map(k=>`<option value="${k}" ${s.aiProvider===k?'selected':''}>${P[k].label}</option>`).join('');
    const protoOpts=['openai','anthropic'].map(p=>`<option value="${p}" ${s.aiProtocol===p?'selected':''}>${p==='openai'?'OpenAI 兼容（推荐）':'Anthropic 协议'}</option>`).join('');
    const curModels=P[s.aiProvider]&&P[s.aiProvider].models&&P[s.aiProvider].models.length
      ?P[s.aiProvider].models:['(请直接输入模型名)'];
    // 密钥不直接落 DOM（防截图/审查泄露）；只显示掩码提示
    const keyMasked=s.aiApiKey?(s.aiApiKey.slice(0,4)+'****'+s.aiApiKey.slice(-4)):'';
    let h=`<div class="card set-group" id="aiConfigCard"><div class="sg-t">AI 模型配置</div>`;
    h+=`<div class="section-note">用户自带 Key，应用不内置密钥。兼容 OpenAI/DeepSeek/通义/Kimi/智谱/Ollama/中转站等。请求仅在用户主动调用 AI 解读时发起。</div>`;
    h+=`<div class="field"><label>提供商</label><select id="aiProvider" data-set="aiProvider">${provOpts}</select></div>`;
    h+=`<div class="field"><label>API 协议</label><select id="aiProtocol" data-set="aiProtocol">${protoOpts}</select></div>`;
    h+=`<div class="field"><label>接口地址 BaseUrl</label><input type="text" id="aiBaseUrl" data-set="aiBaseUrl" value="${escAttr(s.aiBaseUrl)}" placeholder="如 https://api.deepseek.com/v1"></div>`;
    h+=`<div class="field"><label>API Key ${keyMasked?'<span class="num-val">当前：'+keyMasked+'</span>':''}</label><div class="key-row"><input type="password" id="aiApiKey" data-set="aiApiKey" value="" placeholder="${keyMasked?'已设置（重新输入可覆盖）':'输入密钥'}"><button class="btn ghost mini" id="btnToggleKey" type="button">显示</button></div></div>`;
    h+=`<div class="field"><label>模型名</label><input type="text" id="aiModel" data-set="aiModel" value="${escAttr(s.aiModel)}" list="aiModelList" placeholder="如 deepseek-chat"><datalist id="aiModelList">${curModels.map(m=>`<option value="${escAttr(m)}">`).join('')}</datalist></div>`;
    h+=`<div class="field"><label>温度 Temperature（0-2，越高越随机）</label><input type="range" min="0" max="2" step="0.1" id="aiTemp" data-set="aiTemperature" value="${s.aiTemperature}"><span id="aiTempVal" class="num-val">${s.aiTemperature}</span></div>`;
    h+=`<div class="field"><label>最大输出长度 max_tokens</label><input type="number" min="100" max="8192" step="100" id="aiMaxTokens" data-set="aiMaxTokens" value="${s.aiMaxTokens}"></div>`;
    h+=`<div class="field"><label>请求超时（秒）</label><input type="number" min="5" max="300" step="5" id="aiTimeout" data-set="aiTimeout" value="${s.aiTimeout}"></div>`;
    h+=switchRow('流式输出（打字机效果）','aiStream',s.aiStream);
    h+=switchRow('备份导出含 API Key（默认不导出）','aiExportKey',s.aiExportKey);
    h+=`<div class="ai-btns"><button class="btn primary block" id="btnTestAI" type="button">测试连接</button></div>`;
    h+=`<div id="aiTestResult" class="ai-test-result"></div>`;
    h+=`<div class="section-note">⚠ 密钥明文存于本机 localStorage，请勿在共享设备上保存。直接调用 Anthropic 官方接口可能因 CORS 失败，建议通过支持 Anthropic 协议的中转站。</div>`;
    h+=`</div>`;
    return h;
  }
  // 把 AI 配置表单当前输入框的值同步到 Store
  // 解决"输入了 BaseUrl/Key 但未失焦，测试连接或调用 AI 时读到旧值"的体验问题
  function flushAIFormToStore(){
    const fields=['aiProvider','aiProtocol','aiBaseUrl','aiApiKey','aiModel','aiMaxTokens','aiTimeout'];
    const patch={};
    fields.forEach(k=>{
      const el=$('#'+k);
      if(!el)return;
      let v=el.type==='checkbox'?el.checked:el.value;
      if(['aiMaxTokens','aiTimeout'].includes(k))v=Number(v);
      // apiKey 留空时不覆盖原值
      if(k==='aiApiKey'&&!v)return;
      patch[k]=v;
    });
    if(Object.keys(patch).length)Store.setSettings(patch);
  }
  function bindAIConfig(){
    const prov=$('#aiProvider');
    if(prov){
      prov.onchange=ev=>{
        const k=ev.target.value;
        const patch=AI.applyProvider(k);
        Store.setSettings(patch);
        toast('已应用预设：'+(AI.PROVIDERS[k]?AI.PROVIDERS[k].label:'自定义'));
        renderTab();
      };
    }
    const temp=$('#aiTemp');
    if(temp){
      temp.oninput=ev=>{
        $('#aiTempVal').textContent=ev.target.value;
      };
      temp.onchange=ev=>{
        Store.setSettings({aiTemperature:Number(ev.target.value)});
        toast('已保存');
      };
    }
    const toggle=$('#btnToggleKey');
    if(toggle)toggle.onclick=()=>{
      const inp=$('#aiApiKey');
      if(inp.type==='password'){inp.type='text';toggle.textContent='隐藏';}
      else{inp.type='password';toggle.textContent='显示';}
    };
    const testBtn=$('#btnTestAI');
    if(testBtn)testBtn.onclick=async()=>{
      const r=$('#aiTestResult');
      r.innerHTML='<span class="pending">测试中…（发送极简请求验证配置）</span>';
      testBtn.disabled=true;
      testBtn.textContent='测试中…';
      // 关键：先把当前输入框的值同步到 Store，避免"输入了但未失焦"导致测试旧值
      flushAIFormToStore();
      const ret=await AI.testConnection();
      testBtn.disabled=false;
      testBtn.textContent='测试连接';
      const elapsedTxt=ret.elapsed!=null?'<span class="elapsed">'+ret.elapsed+'ms</span>':'';
      if(ret.ok){
        r.innerHTML='<span class="ok">✓ '+ret.msg+'</span>'+elapsedTxt;
      }else{
        let html='<span class="fail">✗ '+ret.msg+'</span>'+elapsedTxt;
        if(ret.detail){
          html+='<div class="diag"><span class="diag-label">诊断详情</span>'+esc(ret.detail)+'</div>';
        }
        r.innerHTML=html;
      }
    };
  }
  function bindMe(){
    if(state.subPage==='important'){bindImportant();return;}
    $('#btnProfile').onclick=()=>openProfile();
    document.querySelectorAll('[data-set]').forEach(e=>e.onchange=ev=>{
      const k=ev.target.dataset.set;
      // aiProvider / aiTemperature / notificationEnabled 由专用 handler 处理
      if(k==='aiProvider'||k==='aiTemperature'||k==='notificationEnabled')return;
      let v=ev.target.type==='checkbox'?ev.target.checked:ev.target.value;
      if(['aiMaxTokens','aiTimeout'].includes(k))v=Number(v);
      // apiKey 留空时不清空原值
      if(k==='aiApiKey'&&!v)return;
      Store.setSettings({[k]:v});toast('已保存');
      if(k==='darkMode'){applyDarkMode();}
      if(k==='dailyTime'){
        // 修改提醒时间后，清除今日已提醒状态，重新调度
        Store.setRemindState({lastRun:''});
        startReminderLoop();
      }
    });
    bindAIConfig();
    $('#btnExport').onclick=()=>doExport();
    $('#btnImport').onclick=()=>doImport();
    $('#btnClear').onclick=()=>{modal('清除全部案例','将删除所有案例数据（设置保留），不可恢复。',m=>{Store.clearAll();closeModal();toast('已清除全部案例');renderTab();});};
    $('#btnImportant').onclick=()=>{state.subPage='important';renderTab();};
    $('#btnReqNotify').onclick=()=>requestNotificationPermission();
    const notifySw=$('[data-set="notificationEnabled"]');
    if(notifySw){
      notifySw.onchange=ev=>{
        if(ev.target.checked){
          requestNotificationPermission();
        }else{
          Store.setSettings({notificationEnabled:false});toast('已关闭系统通知');renderTab();
        }
      };
    }
    $('#btnLockSetting').onclick=()=>openLockSetting();
    $('#btnAbout').onclick=()=>modal('关于玄决',aboutHtml(),null,true,'关闭');
  }
  function aboutHtml(){
    return `<p>玄决 · 大六壬决策台 <span class="num-val">V1.0.4</span></p>
    <p>个人术数决策辅助工具。核心理念：辅助决策而非预测命运；规则排盘 + AI 白话解释 + 个人复盘。</p>
    <p style="margin-top:12px"><span style="color:var(--gold)">术数模块</span>：大六壬（九法三传）、六爻（纳甲六亲世应用神）、八字（大运流年流月藏干）、梅花易数、小六壬、塔罗（四牌阵）、紫微斗数</p>
    <p><span style="color:var(--gold)">古籍库</span>：10 本 / 150 段（RAG 盘面特征加权检索）</p>
    <p style="color:var(--gold);margin-top:12px">免责声明</p>
    <p>${AI.DISCLAIMER}</p>
    <p>本应用不做必然性预测、不做恐吓式结论、不做改命消灾化解类营销、不诱导消费。所有数据本地保存。</p>`;
  }
  function openProfile(){
    const p=Store.getProfile();
    const body=`<div class="field"><label>昵称</label><input type="text" id="pNick" value="${p.nick}"></div><div class="field"><label>出生日期时间</label><input type="datetime-local" id="pBirth" value="${p.birth||''}"></div><div class="field"><label>性别</label><select id="pGender"><option ${p.gender==='男'?'selected':''}>男</option><option ${p.gender==='女'?'selected':''}>女</option></select></div><div class="field"><label>常用地点</label><input type="text" id="pPlace" value="${p.place}"></div><div class="field"><label>年命（干支，可选）</label><input type="text" id="pNian" value="${p.nianming}"></div>`;
    modal('个人信息',body,m=>{
      Store.setProfile({nick:$('#pNick').value,birth:$('#pBirth').value,gender:$('#pGender').value,place:$('#pPlace').value,nianming:$('#pNian').value});
      closeModal();toast('已保存');renderTab();
    },true,'保存');
  }
  function openLockSetting(){
    const lock=Store.getLockState();
    if(lock.appLock){
      // 已开启：管理界面（改密码、改选项、关闭）
      const body=`<div class="field"><label>当前密码</label><input type="password" id="oldPin" placeholder="输入当前密码"></div><div class="field"><label>新密码（留空则不修改）</label><input type="password" id="newPin" placeholder="至少 4 位"></div><div class="field"><label>确认新密码</label><input type="password" id="newPin2" placeholder="再次输入"></div><div class="check-line"><input type="checkbox" id="setBio" ${lock.bioLock?'checked':''}><label for="setBio">允许生物识别/WebAuthn 解锁</label></div><div class="check-line"><input type="checkbox" id="setEnc" ${lock.localEncrypt?'checked':''}><label for="setEnc">本地加密 API Key 与个人信息</label></div><div class="section-note">本地加密依赖密码，关闭应用锁时会自动解密。</div><button class="btn danger block mt12" id="btnDisableLock" type="button">关闭应用锁</button>`;
      const m=modal('管理应用锁',body,btn=>{
        const oldPin=$('#oldPin').value.trim();
        const newPin=$('#newPin').value.trim();
        const newPin2=$('#newPin2').value.trim();
        const bio=$('#setBio').checked;
        const enc=$('#setEnc').checked;
        if(!Store.verifyPin(oldPin)){toast('当前密码错误');return;}
        if(newPin && newPin.length<4){toast('新密码至少 4 位');return;}
        if(newPin && newPin!==newPin2){toast('两次输入的新密码不一致');return;}
        try{
          if(newPin)Store.changePin(oldPin,newPin);
          Store.setLockState({bioLock:bio});
          if(enc!==lock.localEncrypt)Store.toggleLocalEncrypt(enc);
          closeModal();toast('已保存');renderTab();
        }catch(e){toast(e.message||'保存失败');}
      },true,'保存');
      setTimeout(()=>{
        const disableBtn=$('#btnDisableLock');
        if(disableBtn)disableBtn.onclick=()=>{
          const oldPin=$('#oldPin').value.trim();
          if(!Store.verifyPin(oldPin)){toast('当前密码错误');return;}
          Store.setAppLock('',false);
          closeModal();toast('应用锁已关闭');renderTab();
        };
      },0);
      return;
    }else{
      // 未开启：设置密码并启用
      const body=`<div class="field"><label>设置密码</label><input type="password" id="setPin" placeholder="至少 4 位"></div><div class="field"><label>确认密码</label><input type="password" id="setPin2" placeholder="再次输入"></div><div class="check-line"><input type="checkbox" id="setBio"><label for="setBio">允许生物识别/WebAuthn 解锁</label></div><div class="check-line"><input type="checkbox" id="setEnc"><label for="setEnc">本地加密 API Key 与个人信息</label></div><div class="section-note">密码仅用于本地校验，不会上传。忘记密码需在设置中关闭应用锁（需当前密码）。</div>`;
      modal('设置应用锁',body,m=>{
        const pin=$('#setPin').value.trim();
        const pin2=$('#setPin2').value.trim();
        const bio=$('#setBio').checked;
        const enc=$('#setEnc').checked;
        if(pin.length<4){toast('密码至少 4 位');return;}
        if(pin!==pin2){toast('两次输入的密码不一致');return;}
        try{
          Store.setAppLock(pin,true);
          Store.setLockState({bioLock:bio});
          if(enc)Store.toggleLocalEncrypt(true);
          closeModal();toast('应用锁已开启');renderTab();
        }catch(e){toast(e.message||'开启失败');}
      },true,'开启');
    }
  }
  function doExport(){
    const data=Store.exportBackup();
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    // 文件名格式：xuanjue_backup_YYYYMMDD_HHmmss.json
    const d=new Date();
    const ts=pad(d.getFullYear())+pad(d.getMonth()+1)+pad(d.getDate())+'_'+pad(d.getHours())+pad(d.getMinutes())+pad(d.getSeconds());
    const a=document.createElement('a');a.href=url;a.download='xuanjue_backup_'+ts+'.json';document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
    toast('备份已导出（'+data.caseCount+' 条案例）');
  }
  function doImport(){
    const inp=document.createElement('input');inp.type='file';inp.accept='.json';
    inp.onchange=ev=>{
      const f=ev.target.files[0];if(!f)return;
      const r=new FileReader();
      r.onload=()=>{
        try{
          const obj=JSON.parse(r.result);
          modal('导入备份','备份文件将按案例 id 去重合并：已存在的同 id 案例会被覆盖，新案例会追加。确认导入？',m=>{
            try{
              const ret=Store.importBackup(obj);
              closeModal();
              toast('已导入 '+(ret.added+ret.updated)+' 条案例（新增 '+ret.added+'，覆盖 '+ret.updated+'）');
              renderTab();
            }catch(e){
              closeModal();
              toast('导入失败：'+(e&&e.message?e.message:'未知错误'));
            }
          });
        }catch(e){toast('文件解析失败：'+(e&&e.message?e.message:'JSON 格式错误'));}
      };
      r.readAsText(f);
    };
    inp.click();
  }

  // ================= 典籍 / 古籍知识库 =================
  const CLASSIC_FAV_KEY='xuanjue_classics_fav';
  function getClassicFavs(){try{return JSON.parse(localStorage.getItem(CLASSIC_FAV_KEY)||'[]');}catch(e){return [];}}
  function saveClassicFavs(arr){localStorage.setItem(CLASSIC_FAV_KEY,JSON.stringify(arr||[]));}
  function _passageMatches(p,q){
    if(!q)return true;
    const s=((p.text||'')+' '+(p.comment||'')+' '+(p.scenario||'')+' '+(p.tags||[]).join(' ')).toLowerCase();
    return q.toLowerCase().split(/\s+/).filter(Boolean).every(t=>s.includes(t));
  }

  function pageClassics(){
    if(!state.classics) state.classics={cat:'',book:'',q:'',favOnly:false,mode:'list',readBook:'',readCh:0};
    const f=state.classics;
    const idx=ClassicLibrary.loadIndex();
    if(idx&&typeof idx.then==='function'){idx.then(()=>{if(state.tab==='classics')renderTab();});}
    const books=(idx&&idx.books)||[];
    const cats=['六爻','八字','梅花','大六壬','小六壬','塔罗','紫微斗数'];
    const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const favs=getClassicFavs();

    // 书籍阅读模式
    if(f.mode==='read'&&f.readBook){
      const ft=ClassicLibrary.loadFullText(f.readBook);
      if(ft&&typeof ft.then==='function'){ft.then(()=>{if(state.tab==='classics')renderTab();});}
      const bookData=(ft&&!ft.then)?ft:null;
      let h=`<div class="book-reader">`;
      h+=`<div class="book-reader-header"><span class="br-back" id="brBack">‹ 返回</span><span class="br-title">${bookData?esc(bookData.title):'加载中...'}</span>`;
      if(bookData)h+=`<span class="br-meta">${bookData.dynasty||''}·${bookData.author||''} · ${bookData.total_chars||0}字</span>`;
      h+=`</div>`;
      if(bookData&&bookData.chapters&&bookData.chapters.length){
        const maxCh=bookData.chapters.length;
        if(f.readCh>=maxCh)f.readCh=0;
        // 章节导航
        h+=`<div class="br-chapters">`;
        bookData.chapters.forEach((ch,i)=>{
          h+=`<span class="br-ch-item ${i===f.readCh?'on':''}" data-ch="${i}">${esc(ch.title||('第'+(i+1)+'章'))}</span>`;
        });
        h+=`</div>`;
        // 章节内容
        const ch=bookData.chapters[f.readCh];
        h+=`<div class="br-content">${esc(ch.text||'（无内容）')}</div>`;
        // 翻页
        h+=`<div class="br-nav">`;
        h+=`<button class="btn ghost sm" id="brPrev" ${f.readCh===0?'disabled':''}>上一章</button>`;
        h+=`<span style="font-size:11px;color:var(--muted);line-height:32px">${f.readCh+1} / ${maxCh}</span>`;
        h+=`<button class="btn ghost sm" id="brNext" ${f.readCh>=maxCh-1?'disabled':''}>下一章</button>`;
        h+=`</div>`;
      }
      h+=`</div>`;
      return h;
    }

    // 书籍列表模式
    if(f.mode==='list'||!f.mode){
      let h=`<div class="phead"><div><div class="ptitle">典籍</div><div class="psub">古籍知识库 · 完整全文 · RAG 检索</div></div><div class="psub">已收录 ${books.length} 本</div></div>`;
      // 搜索栏
      h+=`<div class="card classic-search"><input type="text" id="classicQuery" placeholder="搜索关键词，如「求财」「青龙」「用神」..." value="${esc(f.q)}"></div>`;
      // 术数分类
      h+=`<div class="card"><h3>按术数分类</h3><div class="classic-cats">${cats.map(c=>`<span class="chip ${f.cat===c?'on':''}" data-cat="${c}">${c}</span>`).join('')}</div></div>`;
      // 书籍卡片网格
      const showBooks=f.cat?books.filter(b=>b.shushu===f.cat):books;
      h+=`<div class="card"><h3>典籍书库 <span style="font-size:11px;color:var(--muted)">点击阅读完整全文</span></h3>`;
      h+=`<div class="book-grid">`;
      showBooks.forEach(b=>{
        const pc=b.passage_count||0;
        const tc=b.total_chars||0;
        const chCount=(b.chapters&&b.chapters.length)||0;
        h+=`<div class="book-card" data-read="${b.id}">`;
        h+=`<div class="bc-badge">${b.shushu}</div>`;
        h+=`<div class="bc-title">${esc(b.title)}</div>`;
        h+=`<div class="bc-meta">${b.dynasty||''} · ${b.author||''}</div>`;
        h+=`<div class="bc-chapters">${chCount}章 · ${(tc/10000).toFixed(1)}万字</div>`;
        h+=`<span class="br-passage-count">RAG ${pc}段</span>`;
        h+=`</div>`;
      });
      h+=`</div></div>`;
      // RAG检索结果
      let passages=[];
      if(f.q){
        passages=ClassicLibrary.search({shushu:f.cat||undefined,query:f.q,limit:40});
      }else if(f.book){
        const bd=ClassicLibrary.loadBook(f.book);
        passages=(bd&&bd.passages)||[];
        passages=passages.slice(0,40);
      }
      if(f.favOnly)passages=passages.filter(p=>favs.includes(p.id));
      if(f.q||f.book||f.favOnly){
        h+=`<div class="card"><h3>检索结果 <span style="font-size:11px;color:var(--muted)">(${passages.length})</span></h3>`;
        if(!passages.length){
          h+=`<div class="empty">未找到相关段落，请尝试其他关键词或分类</div>`;
        }else{
          passages.forEach(p=>{
            const isFav=favs.includes(p.id);
            const isHl=state.classicsHighlight===p.id;
            h+=`<div class="classic-card ${isHl?'highlight':''}" data-pid="${esc(p.id)}">`;
            h+=`<div class="citation-box">${esc(ClassicLibrary.formatCitation(p))}</div>`;
            h+=`<div class="classic-text">${esc(p.text)}</div>`;
            if(p.comment)h+=`<div class="classic-comment"><span class="pc-t">白话注解</span>${esc(p.comment)}</div>`;
            h+=`<div class="classic-tags">${(p.tags||[]).map(t=>`<span class="tag-pill">${esc(t)}</span>`).join('')}</div>`;
            h+=`<div class="classic-actions"><button class="btn sm btn-fav ${isFav?'on':''}" data-fav="${esc(p.id)}">${isFav?'已收藏':'收藏'}</button></div>`;
            h+=`</div>`;
          });
        }
        h+=`</div>`;
      }
      return h;
    }
    return '';
  }

  function bindClassics(){
    const f=state.classics;
    // 书籍阅读模式绑定
    if(f&&f.mode==='read'&&f.readBook){
      const brBack=$('#brBack');if(brBack)brBack.onclick=()=>{f.mode='list';f.readBook='';f.readCh=0;renderTab();};
      document.querySelectorAll('.br-ch-item[data-ch]').forEach(el=>el.onclick=()=>{f.readCh=parseInt(el.dataset.ch);renderTab();});
      const brPrev=$('#brPrev');if(brPrev)brPrev.onclick=()=>{if(f.readCh>0){f.readCh--;renderTab();}};
      const brNext=$('#brNext');if(brNext)brNext.onclick=()=>{f.readCh++;renderTab();};
      return;
    }
    // 列表模式绑定
    const q=$('#classicQuery');
    if(q){
      let timer=null;
      q.oninput=()=>{clearTimeout(timer);timer=setTimeout(()=>{state.classics.q=q.value.trim();renderTab();},250);};
      q.onkeydown=e=>{if(e.key==='Enter'){clearTimeout(timer);state.classics.q=q.value.trim();renderTab();}};
    }
    document.querySelectorAll('.classic-cats .chip[data-cat]').forEach(el=>el.onclick=()=>{state.classics.cat=el.dataset.cat;state.classics.book='';renderTab();});
    // 书籍卡片点击 → 进入阅读模式
    document.querySelectorAll('.book-card[data-read]').forEach(el=>el.onclick=()=>{
      state.classics.mode='read';
      state.classics.readBook=el.dataset.read;
      state.classics.readCh=0;
      renderTab();
    });
    document.querySelectorAll('.btn-fav[data-fav]').forEach(el=>el.onclick=()=>{
      const id=el.dataset.fav;
      const favs=getClassicFavs();
      const i=favs.indexOf(id);
      if(i>=0)favs.splice(i,1);else favs.push(id);
      saveClassicFavs(favs);
      renderTab();
    });
    // 跳转高亮：滚动到目标段落
    if(state.classicsHighlight){
      const hlEl=document.querySelector('.classic-card.highlight[data-pid="'+state.classicsHighlight+'"]');
      if(hlEl&&typeof hlEl.scrollIntoView==='function'){
        hlEl.scrollIntoView({behavior:'smooth',block:'center'});
      }
    }
  }

  // boot
  document.addEventListener('DOMContentLoaded',init);
  global.App={toast,computeDaliuren};
})(window);
