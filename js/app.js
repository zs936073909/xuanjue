// app.js — 玄决主应用：路由、页面渲染、问事向导、盘面、案例、设置
(function(global){
  const $=s=>document.querySelector(s);
  const ZHI=Lunar.ZHI,GAN=Lunar.GAN;
  const state={tab:'home',subPage:'',ask:null,currentKe:null,viewCaseId:null,boardMode:'pro',reviewing:null,currentRagPassages:null,classicsHighlight:null};

  // ---------- utils ----------
  function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),1800);}
  function el(tag,cls,html){const e=document.createElement(tag);if(cls)e.className=cls;if(html!==undefined)e.innerHTML=html;return e;}
  function pad(n){return n<10?'0'+n:''+n;}
  function fmtDateTime(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+' '+pad(d.getHours())+':'+pad(d.getMinutes());}
  function fmtDate(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
  function jdnVal(y,m,d){const a=Math.floor((14-m)/12);const y2=y+4800-a,m2=m+12*a-3;return d+Math.floor((153*m2+2)/5)+365*y2+Math.floor(y2/4)-Math.floor(y2/100)+Math.floor(y2/400)-32045;}
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
    if(onCancel){const b=el('button','btn ghost','取消');b.onclick=()=>{root.innerHTML='';};btns.appendChild(b);}
    if(onOk){const b=el('button','btn primary',okText||'确定');b.onclick=()=>{onOk(m);};btns.appendChild(b);}
    m.appendChild(btns);mask.appendChild(m);root.appendChild(mask);
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
      state.tab=t.dataset.tab;renderTab();
    });
  }
  function showDisclaimer(){
    $('#screen-disclaimer').classList.remove('hidden');
    $('#main').classList.add('hidden');
  }
  function enterApp(){
    $('#screen-disclaimer').classList.add('hidden');
    $('#main').classList.remove('hidden');
    renderTab();
  }

  function renderTab(){
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
    const qaTypes=[['感情关系','♥'],['事业合作','★'],['学习考试','✎'],['出行移动','→'],['签约交易','§'],['人际沟通','✉'],['财务决策','¥'],['健康倾向','+'],['失物寻找','?'],['二选一决策','⇄'],['其他','⋯']];

    let h='';
    h+=`<div class="phead"><div><div class="ptitle">玄决</div><div class="psub">实时决策台</div></div><div class="psub">${now.getFullYear()}.${pad(now.getMonth()+1)}.${pad(now.getDate())}</div></div>`;
    // 时间卡
    h+=`<div class="card"><div class="time-big">${pad(now.getHours())}:${pad(now.getMinutes())}</div>`;
    h+=`<div class="time-row"><span class="k">农历</span><span>${lunar?lunar.monthStr+lunar.dayStr:'—'}</span></div>`;
    h+=`<div class="time-row"><span class="k">干支</span><span><span class="stem">${bz.year.gz}</span>年 <span class="stem">${bz.month.gz}</span>月 <span class="stem">${bz.day.gz}</span>日 <span class="stem">${bz.hour.gz}</span>时</span></div>`;
    h+=`<div class="time-row"><span class="k">时辰</span><span>${sc.name} ${sc.range}</span></div>`;
    h+=`<div class="time-row"><span class="k">节气</span><span>${jq.cur?jq.cur.name:'—'} → ${jq.next?jq.next.name:'—'}</span></div>`;
    h+=`<div class="time-row"><span class="k">值神</span><span>${zs.n}（${zs.g?'吉':'凶'}）</span></div>`;
    h+=`<div class="time-row"><span class="k">建除</span><span>${hl.jianchu}</span></div>`;
    h+=`<div class="time-row"><span class="k">冲煞</span><span>${cs.chong} ${cs.sha}</span></div>`;
    h+=`<div class="yiji"><div class="yiji-box yi"><div class="yj-title">宜</div><div class="yiji-tags">${hl.yi.map(y=>`<span>${y}</span>`).join('')}</div></div><div class="yiji-box ji"><div class="yj-title">忌</div><div class="yiji-tags">${hl.ji.map(j=>`<span>${j}</span>`).join('')}</div></div></div>`;
    h+=`</div>`;
    // 时课卡
    h+=`<div class="card"><h3>此刻大六壬时课</h3>`;
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
    // 首次使用引导
    if(cases.length===0){
      h+=`<div class="card home-guide-card">`;
      h+=`<h3>欢迎使用玄决</h3>`;
      h+=`<div class="guide-step"><span class="guide-num">1</span>点击上方“快速问事”或底部“问事”进入向导</div>`;
      h+=`<div class="guide-step"><span class="guide-num">2</span>选择术数并补充所需信息（如出生时间）</div>`;
      h+=`<div class="guide-step"><span class="guide-num">3</span>查看盘面与白话解读，保存案例后定期复盘</div>`;
      h+=`<div class="section-note">所有数据默认保存在本机，可在“我的”页一键导出备份。</div>`;
      h+=`</div>`;
    }
    // 待复盘
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
    // 最近案例
    h+=`<div class="card"><h3>最近案例</h3>`;
    if(recent.length){recent.forEach(c=>{h+=`<div class="recent-item" data-case="${c.id}"><div><div class="ri-t">${c.title}</div><div class="ri-m">${c.questionType} · ${c.shushu} · ${fmtDate(new Date(c.createdAt))}</div></div><div class="ri-r">${c.reviewed?(c.review.result||'已复盘'):'待复盘'}</div></div>`;});}
    else h+=`<div class="empty">暂无案例，去“问事”起一课吧</div>`;
    h+=`</div>`;
    return h;
  }
  function bindHome(){
    $('#btnViewBoard').onclick=()=>{state.tab='board';renderTab();setTimeout(()=>showDaliurenBoard(state.currentKe),30);};
    document.querySelectorAll('.qa-item').forEach(e=>e.onclick=()=>{
      state.ask=newAsk();state.ask.bg.questionType=e.dataset.type;state.ask.step=2;state.tab='ask';renderTab();
    });
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
  }

  // ================= 问事向导 =================
  function newAsk(){return{step:1,bg:{questionType:'',title:'',desc:'',mood:'',urgent:'',hasOption:false,optA:'',optB:'',persons:'',other:'',adviceType:[]},method:'auto',methodTime:'',methodInput:'',shushu:['大六壬'],extra:{birth:{gender:'',calendar:'solar',date:'',hour:'',unknownHour:false,place:'',zhenTaiyang:false},liuyao:{mode:'manual',yaos:[],manualStr:''},meihua:{mode:'time',input:''},tarot:{spread:'three'},xiaoliuren:{topic:''}},computed:null};}
  const TYPES=['感情关系','事业合作','学习考试','出行移动','签约交易','人际沟通','财务决策','健康倾向','失物寻找','二选一决策','其他'];
  const QIKE_METHODS=[['auto','当前时间自动起课'],['manual','手动选择时间'],['random','随机起卦'],['number','数字起卦'],['hanzi','汉字起卦'],['coin','硬币起卦'],['baoshu','报数起卦']];
  const SHU_PRESET=['大六壬','六爻','梅花易数','小六壬','塔罗','八字','紫微斗数（实验）'];
  const INFO_SHU=['六爻','梅花易数','小六壬','塔罗','八字','紫微斗数（实验）'];
  const LIUYAO_MODES=[['manual','手动六次摇卦'],['auto','一键摇六爻'],['time','时间起卦'],['input','手动输入爻象']];
  const MEIHUA_MODES=[['time','时间起卦'],['number','报数起卦'],['hanzi','汉字起卦'],['random','随机起卦']];
  const TAROT_SPREADS=[['single','单张'],['three','三张'],['relation','关系'],['choice','二选一']];
  const XLR_TOPICS=['求财','谋事','感情','出行','失物','等待消息','疾病倾向','人际沟通','其他'];
  const MOODS=['平静','焦虑','急切','犹豫','愤怒','期待','低落','迷茫'];
  const URGENT=['立即','今日','本周','不急'];

  function pageAsk(){
    const a=state.ask;const s=a.step;
    let steps='';
    for(let i=1;i<=5;i++){const cls=i<s?'done':(i===s?'cur':'');steps+=`<div class="step-wrap ${i===s?'cur':''}"><div class="step-dot ${cls}">${i<s?'✓':i}</div><div class="stt">${['类型','背景','术数','信息','结果'][i-1]}</div></div>`;}
    let body='';
    if(s===1)body=askStep1(a);
    else if(s===2)body=askStep2(a);
    else if(s===3)body=askStep3(a);
    else if(s===4)body=askStep4(a);
    else if(s===5)body=askStep5(a);
    return `<div class="phead"><div class="ptitle">问事</div></div><div class="card"><div class="steps">${steps}</div>${body}</div>`;
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
    let h='<div class="field"><label>选择术数（可多选）</label><div class="chips">';
    h+=SHU_PRESET.map(s=>`<span class="chip ${a.shushu.includes(s)?'on':''}" data-shu="${s}">${s}</span>`).join('');
    h+='</div></div>';
    const isDl=a.shushu.includes('大六壬');
    if(isDl){
      h+=`<div class="field"><label>大六壬起课方式</label><div class="chips">`;
      h+=QIKE_METHODS.map(m=>`<span class="chip ${a.method===m[0]?'on':''}" data-qike-method="${m[0]}">${m[1]}</span>`).join('');
      h+=`</div></div>`;
      if(a.method==='manual')h+=`<div class="field"><label>起课时间</label><input type="datetime-local" id="fTime" value="${a.methodTime||fmtLocalDT(new Date())}"></div>`;
      if(['number','baoshu'].includes(a.method))h+=`<div class="field"><label>输入数字（多个用逗号）</label><input type="text" id="fNum" value="${a.methodInput}" placeholder="如 3,8"></div>`;
      if(a.method==='hanzi')h+=`<div class="field"><label>输入汉字</label><input type="text" id="fHan" value="${a.methodInput}" placeholder="如 玄"></div>`;
      h+=`<div class="section-note">说明：大六壬以时间起课，数字/汉字/硬币方式将折算为占时。</div>`;
    }else{
      h+=`<div class="section-note">提示：选择大六壬时可额外选择起课方式；其他术数将在下一步补充所需信息。</div>`;
    }
    h+=`<div class="shike-cmd"><button class="btn ghost" id="prevStep">上一步</button><button class="btn primary" id="nextStep">${a.shushu.some(s=>INFO_SHU.includes(s))?'下一步':'生成结果'}</button></div>`;
    return h;
  }
  function askStep4(a){
    const selected=a.shushu;
    let h='';
    if(selected.includes('八字')||selected.includes('紫微斗数（实验）'))h+=renderBirthForm(a.extra.birth,'八字、紫微斗数（实验）');
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
    h+=`<div class="field"><label>出生日期</label><input type="date" id="fBirthDate" value="${b.date||''}"></div>`;
    h+=`<div class="field"><label>出生时辰</label><input type="time" id="fBirthHour" value="${b.hour||''}" ${b.unknownHour?'disabled':''}></div>`;
    h+=`<div class="switch"><span>时辰未知</span><input type="checkbox" id="fBirthUnknownHour" ${b.unknownHour?'checked':''}></div>`;
    h+=`<div class="field"><label>出生地点</label><input type="text" id="fBirthPlace" value="${b.place||''}" placeholder="如 北京市"></div>`;
    h+=`<div class="switch"><span>使用真太阳时</span><input type="checkbox" id="fBirthZhenTaiyang" ${b.zhenTaiyang?'checked':''}></div>`;
    h+=`<div class="section-note">提示：可在「我的-个人信息」中预填出生时间，问事时会自动带入。</div>`;
    h+=`</div>`;
    return h;
  }
  function yaoName(v){return {6:'老阴',7:'少阳',8:'少阴',9:'老阳'}[v]||'?';}
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
    const fBirthUnknown=$('#fBirthUnknownHour');if(fBirthUnknown)fBirthUnknown.onchange=ev=>{a.extra.birth.unknownHour=ev.target.checked;renderTab();};
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
      a.computed=computeAskResult(a);a.step=5;renderTab();return;
    }
    if(a.step===4){
      collectStep4(a);
      if(a.shushu.includes('六爻')&&a.extra.liuyao.yaos.length!==6){toast('请完成六爻摇卦');return;}
      if((a.shushu.includes('八字')||a.shushu.includes('紫微斗数（实验）'))&&!a.extra.birth.date){toast('请填写出生日期');return;}
      a.computed=computeAskResult(a);a.step=5;renderTab();return;
    }
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
      }else if(s==='紫微斗数（实验）'){
        const d=resolveBirthDate(a.extra.birth);
        if(d){
          const b=a.extra.birth;
          r=ShuShu.ziWeiDouShu?ShuShu.ziWeiDouShu({date:d,gender:b.gender,place:b.place,zhenTaiyang:b.zhenTaiyang}):ShuShu.compute('紫微斗数',{askInfo:{birthInfo:{date:d,gender:b.gender,place:b.place,zhenTaiyang:b.zhenTaiyang}}});
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
      // 其它术数辅盘
      const others=a.shushu.filter(s=>s!=='大六壬');
      if(others.length && c.shushuResults){
        h+=`<div class="card"><h3>其它术数辅盘</h3>`;
        others.forEach(s=>{
          const r=c.shushuResults[s];
          if(r){h+=renderShuShuResult(r);}
          else{h+=`<div class="plain-card"><div class="pc-t">${s}</div><div class="pc-c">${crossHint(s,mainPlain)}</div></div>`;}
        });
        h+=`</div>`;
      }
    }else if(c.shushuResults){
      // 无主盘，取第一个有结果的术数做主盘
      const mainName=a.shushu.find(s=>c.shushuResults[s]);
      if(mainName){
        mainPlain=c.shushuResults[mainName].plain;
        h+=renderShuShuResult(c.shushuResults[mainName]);
        const others=a.shushu.filter(s=>s!==mainName);
        if(others.length){
          h+=`<div class="card"><h3>其它术数辅盘</h3>`;
          others.forEach(s=>{
            const r=c.shushuResults[s];
            if(r)h+=renderShuShuResult(r);
            else h+=`<div class="plain-card"><div class="pc-t">${s}</div><div class="pc-c">未生成该术数结果，请检查输入或单独起课。</div></div>`;
          });
          h+=`</div>`;
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
    if(c.comp){
      h+=`<button class="btn gold block mt8" id="btnAIDeep">AI 深度解读</button>`;
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
    h+=`<div class="yao-list">`;
    const yaoNames=['初爻','二爻','三爻','四爻','五爻','上爻'];
    // 用神爻位置（idx 1-6）
    const yongIdx=(r.yongShen&&r.yongShen.yao&&r.yongShen.yao.idx)?r.yongShen.yao.idx:null;
    // 空亡地支拆分（kongWang 形如 "戌亥"）
    const kwStr=r.kongWang||'';
    const kwZhis=kwStr?kwStr.split(''):[];
    // 月破爻位置数组
    const yuePoLines=(r.yuePo&&Array.isArray(r.yuePo.lines))?r.yuePo.lines:[];
    r.yaos.forEach((y,i)=>{
      const cls=y.dong?'yao-line dong':'yao-line';
      // 简化符号：阳爻 ▬▬▬，阴爻 ▬ ▬
      const symStr=y.yang?'▬▬▬':'▬ ▬';
      // 世/应/用 标记
      let marks='';
      if(y.isShi)marks+='<span class="yao-mark shi">世</span>';
      if(y.isYing)marks+='<span class="yao-mark ying">应</span>';
      if(yongIdx&&y.idx===yongIdx)marks+='<span class="yao-mark yong">用</span>';
      // 空亡/月破 标记
      if(kwZhis.includes(y.zhi))marks+='<span class="yao-mark kong">空</span>';
      if(yuePoLines.includes(y.idx))marks+='<span class="yao-mark po">破</span>';
      h+=`<div class="${cls}">`;
      h+=`<span class="yl-idx">${yaoNames[i]}</span>`;
      h+=`<span class="yl-sym">${symStr}</span>`;
      if(y.gz)h+=`<span class="yao-gz">${y.gz}</span>`;
      if(y.liuQin)h+=`<span class="yao-lq">${y.liuQin}</span>`;
      if(marks)h+=`<span class="yao-marks">${marks}</span>`;
      h+=`<span class="yao-val" style="color:${y.dong?'var(--red)':'var(--muted)'}">${y.dong?'动':'　'} ${y.val}</span>`;
      h+=`</div>`;
    });
    h+=`</div>`;
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
    let h=`<div class="tarot-spread">`;
    r.cards.forEach(c=>{
      h+=`<div class="tarot-card">`;
      h+=`<div class="tc-num">${c.key}</div>`;
      h+=`<div class="tc-body">`;
      h+=`<div class="tc-pos">${c.pos} · ${c.element}</div>`;
      h+=`<div class="tc-name">${c.name} <span class="${c.up?'tc-up':'tc-rev'}">${c.up?'正位':'逆位'}</span></div>`;
      h+=`<div class="tc-mean">${c.meaning}</div>`;
      h+=`</div></div>`;
    });
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
    // 十二宫简表：宫名 + 主星
    if(a.palaces&&a.palaces.length===12){
      h+=`<div class="zw-palaces">`;
      a.palaces.forEach(pal=>{
        const stars=(pal.majorStars||[]).map(s=>s.name).filter(Boolean).join('、')||'无主星';
        h+=`<div class="zw-palace"><div class="zwp-name">${pal.name}</div><div class="zwp-stars">${stars}</div></div>`;
      });
      h+=`</div>`;
    }
    h+=`<div class="section-note muted">实验版仅展示排盘与基础关键词，深度断盘不在本版范围。</div>`;
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
    const map={'六爻':'以大六壬三传为用神参考，倾向一致。','梅花易数':'体用关系参考，短期趋势与主盘相近。','小六壬':'快速吉凶参考，倾向 '+p.tendency+'。','塔罗':'心理投射工具，不作确定预测，用于觉察决策心理。','八字':'长期倾向参考，需结合流年。','紫微斗数（实验）':'紫微斗数实验版，仅作排盘与基础关键词参考，不做深度断盘。','黄历':'今日宜忌参考，见首页黄历卡。'};
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
    if(btnCopy&&comp)btnCopy.onclick=()=>{const txt=AI.buildPrompt(comp.ke,comp.plain,a.bg,Store.getSettings());copyText(txt);toast('AI 提示词已复制到剪贴板');};
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
    // 古籍引用「查看原文」跳转
    document.querySelectorAll('.cc-jump[data-jump-id]').forEach(btn=>{
      btn.onclick=()=>jumpToClassic(btn.dataset.jumpId);
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
      const errBox=document.createElement('div');
      errBox.className='ai-error';
      errBox.textContent='✗ 调用失败：'+e.message;
      out.innerHTML='';
      out.appendChild(errBox);
      const tip=document.createElement('div');
      tip.className='section-note';
      tip.style.marginTop='8px';
      tip.textContent='建议：1. 检查「我的 → AI 模型配置」中 BaseUrl / API Key / 模型名是否正确；2. 若用 Anthropic 协议，请通过支持 CORS 的中转站；3. 网络不通可改用「复制 AI 提示词」按钮，外部 AI 工具粘贴解读。';
      out.appendChild(tip);
    }finally{
      _aiAbort=null;
    }
  }
  function copyText(txt){
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(txt).catch(()=>fallbackCopy(txt));}
    else fallbackCopy(txt);
  }
  function fallbackCopy(txt){const ta=document.createElement('textarea');ta.value=txt;document.body.appendChild(ta);ta.select();try{document.execCommand('copy');}catch(e){}document.body.removeChild(ta);}

  // ---------- 大六壬结果渲染（专业/白话 + AI）----------
  function renderDaliurenResult(comp){
    const ke=comp.ke,p=comp.plain;const mode=state.boardMode;
    let h='';
    h+=`<div class="mode-toggle"><button data-mode="pro" class="${mode==='pro'?'on':''}">专业盘面</button><button data-mode="plain" class="${mode==='plain'?'on':''}">白话解读</button></div>`;
    h+=`<div class="card"><h3>大六壬盘面</h3>`;
    h+=`<div class="kv-grid"><div class="kv"><span class="k">起课</span><span class="v">${ke.dateStr}</span></div><div class="kv"><span class="k">时辰</span><span class="v">${comp.sc.name}</span></div><div class="kv"><span class="k">月将</span><span class="v">${ke.yueJiang.zhi}</span></div><div class="kv"><span class="k">占时</span><span class="v">${ke.zhanShi.zhi}</span></div><div class="kv"><span class="k">日干支</span><span class="v">${ke.baZi.day.gz}</span></div><div class="kv"><span class="k">时干支</span><span class="v">${ke.baZi.hour.gz}</span></div><div class="kv"><span class="k">贵人</span><span class="v">${ke.guiRen.label}·${ke.guiRen.zhi}</span></div><div class="kv"><span class="k">空亡</span><span class="v">${ZHI[ke.kongWang[0]]}${ZHI[ke.kongWang[1]]}</span></div></div>`;
    h+=`<div class="section-title">格局</div><div class="chips">${ke.geju.map(g=>`<span class="chip on">${g}</span>`).join('')}</div>`;
    h+=`</div>`;
    if(mode==='pro'){
      h+=renderProBoard(ke);
    }else{
      h+=renderPlainBoard(p);
    }
    h+=renderAIBlock(comp,a_state_bg());
    h+=renderSourcesPanel(p,state.currentRagPassages);
    return h;
  }
  function a_state_bg(){return state.ask?state.ask.bg:{questionType:'其他'};}
  function renderProBoard(ke){
    let h='';
    h+=`<div class="card"><h3>四课</h3><div class="lessons-grid">`;
    ke.lessons.forEach((l,i)=>{
      h+=`<div class="plate"><div class="lesson"><div class="ld"><div class="lv">${ZHI[l.up]}</div><div style="font-size:10px;color:var(--ink2)">${l.upTJ}</div></div></div><div class="lesson"><div class="bar">—</div></div><div class="lesson"><div class="ld"><div class="lv bot">${l.downLabel}</div></div></div><div style="font-size:10px;color:var(--muted);text-align:center">${['一课','二课','三课','四课'][i]}</div></div>`;
    });
    h+=`</div></div>`;
    // 三传
    const sc=ke.sanChuan;
    h+=`<div class="card"><h3>三传 · ${sc.method}</h3><div class="trans-row">`;
    [['初传',sc.chu],['中传',sc.zhong],['末传',sc.mo]].forEach(t=>{
      h+=`<div class="tr-cell"><div class="lbl">${t[0]}</div><div class="val">${t[1].zhi}</div><div class="wj">${t[1].tj} · ${t[1].wx}</div></div>`;
    });
    h+=`</div></div>`;
    // 天地盘
    h+=`<div class="card"><h3>天地盘 / 天将</h3><div class="hv-grid">`;
    for(let p=0;p<12;p++){
      const tp=ke.tianPan[p];
      h+=`<div class="hv-cell"><div class="top">${ZHI[tp]}</div><div class="bot">${ZHI[p]}</div><div style="font-size:9px;color:var(--ink2)">${ke.tjByShen[tp]}</div></div>`;
    }
    h+=`</div><div class="section-note">上为天盘神，中为地盘位，下为天将</div></div>`;
    // 神煞类神
    h+=`<div class="card"><h3>神煞 / 类神</h3><div class="kv-grid">`;
    h+=`<div class="kv"><span class="k">驿马</span><span class="v">${ke.shenSha.yima}</span></div><div class="kv"><span class="k">桃花</span><span class="v">${ke.shenSha.taohua}</span></div><div class="kv"><span class="k">华盖</span><span class="v">${ke.shenSha.huagai}</span></div><div class="kv"><span class="k">太岁</span><span class="v">${ke.shenSha.taiSui}</span></div><div class="kv"><span class="k">月建</span><span class="v">${ke.shenSha.yueJian}</span></div><div class="kv"><span class="k">类神</span><span class="v">${ke.leishenName}（乘${ke.leishenShen!==null?ZHI[ke.leishenShen]:'—'}）</span></div>`;
    h+=`</div></div>`;
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
    L.push('月将：'+ke.yueJiang.zhi+'  占时：'+ke.zhanShi.zhi);
    L.push('贵人：'+ke.guiRen.label+'·'+ke.guiRen.zhi+'（乘'+ke.guiRen.chengShen+'）  空亡：'+ZHI[ke.kongWang[0]]+ZHI[ke.kongWang[1]]);
    L.push('格局：'+ke.geju.join('、'));
    L.push('');
    L.push('四课：');
    ke.lessons.forEach((l,i)=>L.push('  '+['一','二','三','四'][i]+'课：上 '+ZHI[l.up]+'（'+l.upTJ+'） 下 '+l.downLabel));
    L.push('三传（'+ke.sanChuan.method+'）：');
    L.push('  初传 '+ke.sanChuan.chu.zhi+'（'+ke.sanChuan.chu.tj+'·'+ke.sanChuan.chu.wx+'）');
    L.push('  中传 '+ke.sanChuan.zhong.zhi+'（'+ke.sanChuan.zhong.tj+'·'+ke.sanChuan.zhong.wx+'）');
    L.push('  末传 '+ke.sanChuan.mo.zhi+'（'+ke.sanChuan.mo.tj+'·'+ke.sanChuan.mo.wx+'）');
    L.push('神煞：驿马'+ke.shenSha.yima+' 桃花'+ke.shenSha.taohua+' 华盖'+ke.shenSha.huagai+' 太岁'+ke.shenSha.taiSui+' 月建'+ke.shenSha.yueJian);
    L.push('类神：'+ke.leishenName+'（乘'+(ke.leishenShen!==null?ZHI[ke.leishenShen]:'—')+'）');
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
  // P1 术数已实现：小六壬/梅花易数/六爻/塔罗/八字
  const SHU_P1=['小六壬','梅花易数','六爻','塔罗','八字'];
  function pageBoardCenter(){
    let h=`<div class="phead"><div class="ptitle">盘面</div><div class="psub">专业盘面研究</div></div>`;
    h+=`<div class="card"><h3>大六壬<span class="shu-badge">主盘</span></h3><button class="btn primary block" id="btnDlNow">此刻起课</button><button class="btn block mt8" id="btnDlManual">手动时间起课</button></div>`;
    h+=`<div class="card"><h3>其它术数</h3>`;
    SHU_P1.forEach(s=>{
      h+=`<div class="recent-item" data-shu="${s}"><div class="ri-t">${s}</div><div class="ri-m">点击此刻起课</div><div class="ri-r">›</div></div>`;
    });
    h+=`</div>`;
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
  }
  // P1 术数盘面展示（复用 ask 渠道）
  function showShuShuBoard(res){
    state.ask={bg:{questionType:'其他'},computed:{shushuResults:{[res.name]:res},shushu:[res.name]},step:5,shushu:[res.name],_placeholder:true,_shushuOnly:true};
    state.tab='ask';renderTab();
    setTimeout(()=>bindResult(state.ask),30);
  }
  function showDaliurenBoard(comp){
    // 用一个临时 ask bg（标记 _placeholder 以便用户主动点「问事」Tab 时重置）
    state.ask={bg:{questionType:'其他'},computed:{comp},step:5,shushu:['大六壬'],_placeholder:true};
    state.tab='ask';renderTab();
    // 保持 boardMode
    setTimeout(()=>bindResult(state.ask),30);
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
    h+=`<div class="filter-row"><label>术数</label><select class="filter-select" id="fShu"><option value="全部">全部</option>${REVIEW_SHU_OPTS.map(s=>`<option value="${s}">${s}</option>`).join('')}</select></div>`;
    h+=`<div class="filter-row"><label>问题类型</label><select class="filter-select" id="fType"><option value="全部">全部</option>${typeOpts.map(t=>`<option value="${t}">${t}</option>`).join('')}</select></div>`;
    h+=`<div class="filter-row"><label>应验程度</label><select class="filter-select" id="fResult"><option value="全部">全部</option><option value="已复盘">已复盘</option><option value="未复盘">未复盘</option><option value="到期待复盘">到期待复盘</option><option value="应验">应验</option><option value="部分应验">部分应验</option><option value="未应验">未应验</option><option value="无法判断">无法判断</option></select></div>`;
    h+=`<div class="filter-row"><label>起讫时间</label><div class="filter-date-row"><input type="date" class="filter-select" id="fDateFrom"><input type="date" class="filter-select" id="fDateTo"></div></div>`;
    h+=`<div class="filter-row"><label>标签</label><select class="filter-select" id="fTag"><option value="">全部</option>${tagOpts.map(t=>`<option value="${t}">${t}</option>`).join('')}</select></div>`;
    h+=`<div class="filter-actions"><button class="btn primary sm" id="btnApplyFilter" type="button">应用筛选</button><button class="btn ghost sm" id="btnClearFilter" type="button">清空</button></div>`;
    h+=`</div>`;
    h+=`<div id="caseListBody"></div>`;
    setTimeout(()=>renderCaseListBody(),10);
    return h;
  }
  function collectFilter(){
    const f={};
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
        const right=c.reviewed?(c.review.result||'已复盘'):'待复盘';
        return `<div class="recent-item" data-case="${c.id}"><div><div class="ri-t">${dueTag}${c.title}</div><div class="ri-m">${c.questionType} · ${c.shushu} · ${fmtDate(new Date(c.createdAt))}</div></div><div class="ri-r">${right}</div></div>`;
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
      const ids=['fShu','fType','fResult','fTag'];
      ids.forEach(id=>{const e=$('#'+id);if(e)e.value='全部';});
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
    h+=`<div class="card"><button class="btn block" id="btnExportCase">导出本案例</button><button class="btn danger block mt8" id="btnDelCase">删除案例</button></div>`;
    container.innerHTML=h;
    $('#backList').onclick=()=>{state.viewCaseId=null;renderTab();};
    $('#myJudge').oninput=ev=>{c.myJudge=ev.target.value;Store.saveCase(c);};
    if($('#btnReview'))$('#btnReview').onclick=()=>openReview(id);
    if($('#btnReviewAgain'))$('#btnReviewAgain').onclick=()=>openReview(id);
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
    if(back)back.onclick=()=>{state.subPage='';renderTab();};
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
    h+=pageAIConfig(s);
    h+=`<div class="card set-group"><div class="sg-t">备份与恢复</div>`;
    const sz=Store.storageSizeEstimate();
    h+=`<div class="storage-info">当前案例 <span class="num-val">${sz.caseCount}</span> 条 · 占用 <span class="num-val">${sz.sizeText}</span></div>`;
    h+=`<button class="btn block" id="btnExport">导出备份</button><button class="btn block mt8" id="btnImport">导入备份</button><button class="btn danger block mt8" id="btnClear">一键清除全部案例</button>`;
    h+=`</div>`;
    h+=`<div class="card set-group"><div class="sg-t">提醒</div>`;
    h+=switchRow('每日时课提醒','remindDaily',s.remindDaily);
    h+=switchRow('复盘提醒','remindReview',s.remindReview);
    h+=switchRow('重要日期提醒','remindImportant',s.remindImportant);
    h+=`</div>`;
    h+=`<div class="card"><button class="btn block" id="btnAbout">关于与免责声明</button></div>`;
    h+=`<div class="card"><div class="detail-row"><span class="dk">版本</span><span>玄决 V1.0</span></div><div class="detail-row"><span class="dk">术数模块</span><span>大六壬 · 六爻 · 八字 · 梅花易数 · 小六壬 · 塔罗</span></div><div class="detail-row"><span class="dk">古籍库</span><span>10 本 / 150 段</span></div><div class="detail-row"><span class="dk">数据</span><span>本地存储 · 离线可用 · 不上传</span></div></div>`;
    return h;
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
    let h=`<div class="card set-group"><div class="sg-t">AI 模型配置</div>`;
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
      r.innerHTML='<span class="pending">测试中…</span>';
      testBtn.disabled=true;
      const ret=await AI.testConnection();
      testBtn.disabled=false;
      r.innerHTML=ret.ok
        ?'<span class="ok">✓ '+ret.msg+'</span>'
        :'<span class="fail">✗ '+ret.msg+'</span>';
    };
  }
  function bindMe(){
    $('#btnProfile').onclick=()=>openProfile();
    document.querySelectorAll('[data-set]').forEach(e=>e.onchange=ev=>{
      const k=ev.target.dataset.set;
      // aiProvider 由专用 handler 处理；temperature 由 input handler 处理；跳过
      if(k==='aiProvider'||k==='aiTemperature')return;
      let v=ev.target.type==='checkbox'?ev.target.checked:ev.target.value;
      if(['aiMaxTokens','aiTimeout'].includes(k))v=Number(v);
      // apiKey 留空时不清空原值
      if(k==='aiApiKey'&&!v)return;
      Store.setSettings({[k]:v});toast('已保存');
    });
    bindAIConfig();
    $('#btnExport').onclick=()=>doExport();
    $('#btnImport').onclick=()=>doImport();
    $('#btnClear').onclick=()=>{modal('清除全部案例','将删除所有案例数据（设置保留），不可恢复。',m=>{Store.clearAll();closeModal();toast('已清除全部案例');renderTab();});};
    $('#btnAbout').onclick=()=>modal('关于玄决',aboutHtml(),null,true,'关闭');
  }
  function aboutHtml(){
    return `<p>玄决 · 大六壬决策台 <span class="num-val">V1.0</span></p>
    <p>个人术数决策辅助工具。核心理念：辅助决策而非预测命运；规则排盘 + AI 白话解释 + 个人复盘。</p>
    <p style="margin-top:12px"><span style="color:var(--gold)">术数模块</span>：大六壬（九法三传）、六爻（纳甲六亲世应用神）、八字（大运流年流月藏干）、梅花易数、小六壬、塔罗（四牌阵）</p>
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
    if(!state.classics) state.classics={cat:'',book:'',q:'',favOnly:false};
    const f=state.classics;
    const idx=ClassicLibrary.loadIndex();
    // 若索引异步返回 Promise，加载完成后再渲染一次
    if(idx&&typeof idx.then==='function'){idx.then(()=>{if(state.tab==='classics')renderTab();});}
    const books=(idx&&idx.books)||[];
    const cats=['六爻','八字','梅花','大六壬','小六壬','塔罗'];
    const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const favs=getClassicFavs();

    let passages=[];
    if(f.book){
      const bd=ClassicLibrary.loadBook(f.book);
      passages=(bd&&bd.passages)||[];
    }else{
      passages=ClassicLibrary.search({shushu:f.cat||undefined,query:f.q||undefined,limit:40});
    }
    if(f.q)passages=passages.filter(p=>_passageMatches(p,f.q));
    if(f.favOnly)passages=passages.filter(p=>favs.includes(p.id));

    let h='';
    h+=`<div class="phead"><div><div class="ptitle">典籍</div><div class="psub">古籍知识库 · RAG 检索</div></div><div class="psub">已收录 ${books.length} 本</div></div>`;
    h+=`<div class="card classic-search"><input type="text" id="classicQuery" placeholder="搜索关键词，如「求财」「青龙」「用神」..." value="${esc(f.q)}"></div>`;
    h+=`<div class="card"><h3>按术数</h3><div class="classic-cats">${cats.map(c=>`<span class="chip ${f.cat===c?'on':''}" data-cat="${c}">${c}</span>`).join('')}</div></div>`;
    const showBooks=f.cat?books.filter(b=>b.shushu===f.cat):books;
    h+=`<div class="card"><h3>按书名</h3><div class="classic-books filter-bar">${showBooks.map(b=>`<span class="chip ${f.book===b.id?'on':''}" data-book="${b.id}">${esc(b.title)}</span>`).join('')}</div></div>`;
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
    return h;
  }

  function bindClassics(){
    const q=$('#classicQuery');
    if(q){
      let timer=null;
      q.oninput=()=>{clearTimeout(timer);timer=setTimeout(()=>{state.classics.q=q.value.trim();renderTab();},250);};
      q.onkeydown=e=>{if(e.key==='Enter'){clearTimeout(timer);state.classics.q=q.value.trim();renderTab();}};
    }
    document.querySelectorAll('.classic-cats .chip[data-cat]').forEach(el=>el.onclick=()=>{state.classics.cat=el.dataset.cat;state.classics.book='';renderTab();});
    document.querySelectorAll('.classic-books .chip[data-book]').forEach(el=>el.onclick=()=>{state.classics.book=el.dataset.book;renderTab();});
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
