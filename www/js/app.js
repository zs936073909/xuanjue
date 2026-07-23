// app.js — 玄决主应用：路由、页面渲染、问事向导、盘面、案例、设置
(function(global){
  const $=s=>document.querySelector(s);
  const ZHI=Lunar.ZHI,GAN=Lunar.GAN;
  const state={tab:'home',ask:null,currentKe:null,viewCaseId:null,boardMode:'pro',reviewing:null};

  // ---------- utils ----------
  function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),1800);}
  function el(tag,cls,html){const e=document.createElement(tag);if(cls)e.className=cls;if(html!==undefined)e.innerHTML=html;return e;}
  function pad(n){return n<10?'0'+n:''+n;}
  function fmtDateTime(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+' '+pad(d.getHours())+':'+pad(d.getMinutes());}
  function fmtDate(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
  function jdnVal(y,m,d){const a=Math.floor((14-m)/12);const y2=y+4800-a,m2=m+12*a-3;return d+Math.floor((153*m2+2)/5)+365*y2+Math.floor(y2/4)-Math.floor(y2/100)+Math.floor(y2/400)-32045;}

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
    const baZi=Lunar.getBaZi(date);
    const yj=Lunar.getYueJiang(date);
    const sc=Lunar.getShiChen(date);
    const ke=DaLiuRen.qiKe(date,baZi,yj.zhiIdx,sc.index,{questionType});
    ke.dateStr=fmtDateTime(date);
    ke.scStr=sc.name+'（'+sc.range+'）';
    const plain=DaLiuRen.plainLang(ke,questionType);
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
    else if(state.tab==='case')c.innerHTML=pageCaseList();
    else if(state.tab==='me')c.innerHTML=pageMe();
    bindTab();
  }
  function bindTab(){
    if(state.tab==='home')bindHome();
    else if(state.tab==='ask')bindAsk();
    else if(state.tab==='board')bindBoardCenter();
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
    // 待复盘
    if(todo.length){
      h+=`<div class="card"><h3>待复盘提醒</h3>`;
      todo.slice(0,3).forEach(c=>{h+=`<div class="recent-item" data-review="${c.id}"><div><div class="ri-t">${c.title}</div><div class="ri-m">${c.questionType} · ${fmtDate(new Date(c.createdAt))}</div></div><div class="ri-r">去复盘</div></div>`;});
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
    $('#btnViewBoard').onclick=()=>{state.tab='board';renderTab();setTimeout(()=>showDaliurenBoard(state.currentKe),30);};
    document.querySelectorAll('.qa-item').forEach(e=>e.onclick=()=>{
      state.ask=newAsk();state.ask.bg.questionType=e.dataset.type;state.ask.step=2;state.tab='ask';renderTab();
    });
    document.querySelectorAll('[data-case]').forEach(e=>e.onclick=()=>{state.viewCaseId=e.dataset.case;state.tab='case';renderTab();setTimeout(openCaseDetail,30);});
    document.querySelectorAll('[data-review]').forEach(e=>e.onclick=()=>{state.viewCaseId=e.dataset.review;state.tab='case';renderTab();setTimeout(()=>openReview(e.dataset.review),30);});
  }

  // ================= 问事向导 =================
  function newAsk(){return{step:1,bg:{questionType:'',title:'',desc:'',mood:'',urgent:'',hasOption:false,optA:'',optB:'',persons:'',other:'',adviceType:[]},method:'auto',methodTime:'',methodInput:'',shushu:['大六壬'],computed:null};}
  const TYPES=['感情关系','事业合作','学习考试','出行移动','签约交易','人际沟通','财务决策','健康倾向','失物寻找','二选一决策','其他'];
  const METHODS=[['auto','当前时间自动起课'],['manual','手动选择时间'],['random','随机起卦'],['number','数字起卦'],['hanzi','汉字起卦'],['coin','硬币起卦'],['baoshu','报数起卦'],['recommend','自动推荐术数']];
  const MOODS=['平静','焦虑','急切','犹豫','愤怒','期待','低落','迷茫'];
  const URGENT=['立即','今日','本周','不急'];

  function pageAsk(){
    const a=state.ask;const s=a.step;
    let steps='';
    for(let i=1;i<=5;i++){const cls=i<s?'done':(i===s?'cur':'');steps+=`<div class="step-wrap ${i===s?'cur':''}"><div class="step-dot ${cls}">${i<s?'✓':i}</div><div class="stt">${['类型','背景','起课','术数','结果'][i-1]}</div></div>`;}
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
    let h='<div class="field"><label>选择起课方式</label><div class="chips">';
    h+=METHODS.map(m=>`<span class="chip ${a.method===m[0]?'on':''}" data-method="${m[0]}">${m[1]}</span>`).join('');
    h+='</div></div>';
    if(a.method==='manual')h+=`<div class="field"><label>起课时间</label><input type="datetime-local" id="fTime" value="${a.methodTime||fmtLocalDT(new Date())}"></div>`;
    if(['number','baoshu'].includes(a.method))h+=`<div class="field"><label>输入数字（多个用逗号）</label><input type="text" id="fNum" value="${a.methodInput}" placeholder="如 3,8"></div>`;
    if(a.method==='hanzi')h+=`<div class="field"><label>输入汉字</label><input type="text" id="fHan" value="${a.methodInput}" placeholder="如 玄"></div>`;
    h+=`<div class="section-note">说明：大六壬以时间起课，数字/汉字/硬币方式将折算为占时。</div>`;
    h+=`<div class="shike-cmd"><button class="btn ghost" id="prevStep">上一步</button><button class="btn primary" id="nextStep">下一步</button></div>`;
    return h;
  }
  function askStep4(a){
    const PRESET=['大六壬','六爻','梅花易数','小六壬','塔罗','八字','紫微斗数','奇门遁甲','星盘','黄历'];
    let h='<div class="field"><label>选择使用术数（可多选）</label><div class="chips">';
    h+=PRESET.map(s=>`<span class="chip ${a.shushu.includes(s)?'on':''}" data-shu="${s}">${s}</span>`).join('');
    h+='</div></div>';
    h+=`<button class="btn block" id="presetDefault">应用默认推荐组合（大六壬主盘）</button>`;
    h+=`<div class="section-note">注：V0.1 仅大六壬完整排盘可用，其余术数为简化参考。多选将生成主盘+辅盘交叉摘要。</div>`;
    h+=`<div class="shike-cmd"><button class="btn ghost" id="prevStep">上一步</button><button class="btn primary" id="nextStep">生成结果</button></div>`;
    return h;
  }
  function askStep5(a){return renderResult(a);}
  function fmtLocalDT(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes());}

  function bindAsk(){
    const a=state.ask;
    // step1
    document.querySelectorAll('[data-type]').forEach(e=>{if(state.ask.step===1)e.onclick=()=>{a.bg.questionType=e.dataset.type;renderTab();};});
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
    // step3
    if(a.step===3){
      document.querySelectorAll('[data-method]').forEach(e=>e.onclick=()=>{a.method=e.dataset.method;renderTab();});
      if(a.method==='manual')a.methodTime=$('#fTime')?$('#fTime').value:a.methodTime;
      if(['number','baoshu'].includes(a.method)&&$('#fNum'))a.methodInput=$('#fNum').value;
      if(a.method==='hanzi'&&$('#fHan'))a.methodInput=$('#fHan').value;
    }
    // step4
    if(a.step===4){
      document.querySelectorAll('[data-shu]').forEach(e=>e.onclick=()=>{const s=e.dataset.shu;const i=a.shushu.indexOf(s);if(i>=0)a.shushu.splice(i,1);else a.shushu.push(s);renderTab();});
      const pd=$('#presetDefault');if(pd)pd.onclick=()=>{a.shushu=['大六壬'];renderTab();};
    }
    // nav
    const next=$('#nextStep'),prev=$('#prevStep');
    if(next)next.onclick=()=>goNext();
    if(prev)prev.onclick=()=>{state.ask.step--;renderTab();};
  }
  function goNext(){
    const a=state.ask;
    if(a.step===1){if(!a.bg.questionType){toast('请选择问题类型');return;}a.step=2;renderTab();return;}
    if(a.step===2){
      if(!a.bg.title.trim()){toast('请填写问题标题');return;}
      a.step=3;renderTab();return;
    }
    if(a.step===3){
      // 收集 step3 输入
      if(a.method==='manual'&&$('#fTime'))a.methodTime=$('#fTime').value;
      if(['number','baoshu'].includes(a.method)&&$('#fNum'))a.methodInput=$('#fNum').value;
      if(a.method==='hanzi'&&$('#fHan'))a.methodInput=$('#fHan').value;
      a.step=4;renderTab();return;
    }
    if(a.step===4){
      if(!a.shushu.length){toast('请至少选择一种术数');return;}
      // 计算
      a.computed=computeAskResult(a);
      a.step=5;renderTab();return;
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
  function computeAskResult(a){
    const date=resolveZhanTime(a);
    const comp=computeDaliuren(date,a.bg.questionType);
    state.currentKe=comp;
    // 同时计算所选其它术数
    const shushuResults={};
    a.shushu.forEach(s=>{
      if(s!=='大六壬'){const r=ShuShu.compute(s,date);if(r)shushuResults[s]=r;}
    });
    return{date,comp,shushu:a.shushu,shushuResults};
  }
  function renderResult(a){
    const c=a.computed;
    const sensitive=AI.detectSensitive(a.bg.title+' '+a.bg.desc);
    let h='';
    if(sensitive){
      h+=`<div class="card"><div class="warn-text">检测到敏感关键词「${sensitive.keyword}」。</div><div class="section-note">${sensitiveHint(sensitive.cat)}</div></div>`;
    }
    // 纯术数盘面（盘面中心入口）
    if(c.shushu&&!c.comp){
      h+=renderShuShuResult(c.shushu);
      h+=`<div class="card"><h3>操作</h3>`;
      h+=`<button class="btn primary block mt8" id="btnSaveCase">保存为案例</button>`;
      h+=`<button class="btn block mt8" id="btnExportBoard">导出盘面（文本）</button>`;
      h+=`</div>`;
      setTimeout(()=>bindResult(a),20);
      return h;
    }
    const p=c.comp.plain;
    h+=renderDaliurenResult(c.comp);
    // 其它术数辅盘
    const others=a.shushu.filter(s=>s!=='大六壬');
    if(others.length){
      h+=`<div class="card"><h3>其它术数辅盘</h3>`;
      others.forEach(s=>{
        const r=c.shushuResults&&c.shushuResults[s];
        if(r){h+=renderShuShuResult(r);}
        else{h+=`<div class="plain-card"><div class="pc-t">${s}</div><div class="pc-c">${crossHint(s,p)}</div></div>`;}
      });
      h+=`</div>`;
    }
    // 多盘交叉
    if(others.length){
      h+=`<div class="card"><h3>多盘交叉摘要</h3>`;
      h+=renderCross(a);
      h+=`</div>`;
    }
    h+=`<div class="card"><h3>操作</h3>`;
    h+=`<button class="btn primary block mt8" id="btnSaveCase">保存为案例</button>`;
    h+=`<button class="btn block mt8" id="btnCopyPrompt">复制 AI 提示词</button>`;
    h+=`<button class="btn block mt8" id="btnExportBoard">导出盘面（文本）</button>`;
    h+=`<div class="section-note">复盘提醒：约 ${p.reviewDays} 日后（系统将出现在首页与案例库）</div>`;
    h+=`</div>`;
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
    h+=`</div>`;
    h+=`<div class="section-note">起卦数：年${r.numbers.year} 月${r.numbers.month} 日${r.numbers.day} 时${r.numbers.time}</div>`;
    return h;
  }
  function renderLiuYao(r){
    let h=`<div class="shu-result-title" style="font-size:18px;margin:6px 0">${r.benGua}${r.bianGua!==r.benGua?' → '+r.bianGua:''}</div>`;
    h+=`<div class="yao-list">`;
    const yaoNames=['初爻','二爻','三爻','四爻','五爻','上爻'];
    r.yaos.forEach((y,i)=>{
      const cls=y.dong?'yao-line dong':'yao-line';
      const sym=y.yang?'— —':'— — —'.slice(0,y.yang?3:5);
      // 简化符号：阳爻 ▬▬▬，阴爻 ▬ ▬
      const symStr=y.yang?'▬▬▬':'▬ ▬';
      h+=`<div class="${cls}"><span class="yl-idx">${yaoNames[i]}</span><span class="yl-sym">${symStr}</span><span style="font-size:10px;color:${y.dong?'var(--red)':'var(--muted)'}">${y.dong?'动':' '} ${y.val}</span></div>`;
    });
    h+=`</div>`;
    h+=`<div class="kv-grid">`;
    h+=`<div class="kv"><span class="k">本卦</span><span class="v">${r.benGua}</span></div>`;
    h+=`<div class="kv"><span class="k">变卦</span><span class="v">${r.bianGua}</span></div>`;
    h+=`<div class="kv"><span class="k">动爻数</span><span class="v">${r.dongCount}</span></div>`;
    h+=`<div class="kv"><span class="k">日干五行</span><span class="v">${r.dayGanWx}</span></div>`;
    h+=`</div>`;
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
      h+=`</div>`;
    });
    h+=`</div>`;
    h+=`<div class="wx-bar">`;
    Object.keys(r.wxCount).forEach(k=>{
      h+=`<div class="wx-pill"><div class="wp-n">${k}</div><div class="wp-c">${r.wxCount[k]}</div></div>`;
    });
    h+=`</div>`;
    h+=`<div class="kv-grid mt8">`;
    h+=`<div class="kv"><span class="k">日主</span><span class="v">${r.dayGan}（${r.dayWx}）</span></div>`;
    h+=`<div class="kv"><span class="k">强弱</span><span class="v">${r.dayStrong?'偏强':'偏弱'}</span></div>`;
    h+=`<div class="kv"><span class="k">五行</span><span class="v">${r.wxStr}</span></div>`;
    h+=`<div class="kv"><span class="k">参考用神</span><span class="v">${r.yongShen}</span></div>`;
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
    const map={'六爻':'以大六壬三传为用神参考，倾向一致。','梅花易数':'体用关系参考，短期趋势与主盘相近。','小六壬':'快速吉凶参考，倾向 '+p.tendency+'。','塔罗':'心理投射工具，不作确定预测，用于觉察决策心理。','八字':'长期倾向参考，需结合流年。','紫微斗数':'宫位趋势参考，V0.1 暂为占位。','奇门遁甲':'时机方位参考，V0.1 暂为占位。','星盘':'性格关系参考，V0.1 暂为占位。','黄历':'今日宜忌参考，见首页黄历卡。'};
    return map[s]||'参考占位。';
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
    if(btnExp)btnExp.onclick=()=>{if(comp)exportBoardText(comp);else exportShuShuText(c.shushu);};
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
    const isShuOnly=!!(c.shushu&&!c.comp);
    const plain=isShuOnly?c.shushu.plain:c.comp.plain;
    const title=(a.bg.title&&a.bg.title.trim())||((isShuOnly?c.shushu.name:'大六壬')+'盘 · '+fmtDateTime(c.date||new Date()));
    const obj={
      id:Store.genId(),createdAt:Date.now(),
      title,questionType:a.bg.questionType||'其他',desc:a.bg.desc||'',mood:a.bg.mood||'',urgent:a.bg.urgent||'',
      hasOption:a.bg.hasOption||false,optA:a.bg.optA||'',optB:a.bg.optB||'',persons:a.bg.persons||'',other:a.bg.other||'',adviceType:a.bg.adviceType||[],
      shushu:a.shushu.join('、'),method:a.method||'auto',
      qikeTime:(c.date||new Date()).toISOString(),qikePlace:'',
      board:isShuOnly?null:serializeKe(c.comp),
      shushuBoard:isShuOnly?serializeShu(c.shushu):(c.shushuResults?serializeShuResults(c.shushuResults):null),
      plain,
      myJudge:'',actions:[],signals:plain.signals,
      reviewDue:Date.now()+plain.reviewDays*86400000,
      result:'',verified:'',unhit:'',reflect:'',tags:[],favor:false
    };
    Store.saveCase(obj);
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
  // P1 术数已实现：小六壬/梅花易数/六爻/塔罗/八字；P2 暂为占位
  const SHU_P1=['小六壬','梅花易数','六爻','塔罗','八字'];
  const SHU_P2=['紫微斗数','奇门遁甲','星盘'];
  function pageBoardCenter(){
    let h=`<div class="phead"><div class="ptitle">盘面</div><div class="psub">专业盘面研究</div></div>`;
    h+=`<div class="card"><h3>大六壬<span class="shu-badge">主盘</span></h3><button class="btn primary block" id="btnDlNow">此刻起课</button><button class="btn block mt8" id="btnDlManual">手动时间起课</button></div>`;
    h+=`<div class="card"><h3>其它术数<span class="shu-badge">P1 已上线</span></h3>`;
    SHU_P1.forEach(s=>{
      h+=`<div class="recent-item" data-shu="${s}"><div class="ri-t">${s}</div><div class="ri-m">点击此刻起课</div><div class="ri-r">›</div></div>`;
    });
    h+=`</div>`;
    h+=`<div class="card"><h3>更多术数<span class="shu-badge">P2 待完善</span></h3>`;
    SHU_P2.forEach(s=>{
      h+=`<div class="recent-item" data-shu2="${s}"><div class="ri-t">${s}</div><div class="ri-m">V0.1 占位，后续版本</div><div class="ri-r">›</div></div>`;
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
    document.querySelectorAll('[data-shu2]').forEach(e=>e.onclick=()=>toast(e.dataset.shu2+' 模块为 P2 待完善'));
    const lb=$('#lastBoard');if(lb)lb.onclick=()=>showDaliurenBoard(state.currentKe);
  }
  // P1 术数盘面展示（复用 ask 渠道）
  function showShuShuBoard(res){
    state.ask={bg:{questionType:'其他'},computed:{shushu:res},step:5,shushu:[res.name],_placeholder:true,_shushuOnly:true};
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
  function pageCaseList(){
    const cases=Store.listCases();
    let h=`<div class="phead"><div class="ptitle">案例</div><div class="psub">共 ${cases.length} 条</div></div>`;
    // 统计入口
    h+=`<div class="card"><div class="review-stat" id="miniStat"></div><button class="btn block" id="btnStat">复盘统计</button></div>`;
    // 筛选
    const types=['全部',...new Set(cases.map(c=>c.questionType))];
    h+=`<div class="filter-bar" id="filterBar">${types.map((t,i)=>`<span class="chip ${i===0?'on':''}" data-filter="${t}">${t}</span>`).join('')}</div>`;
    h+=`<div id="caseListBody"></div>`;
    setTimeout(()=>renderCaseListBody('全部'),10);
    return h;
  }
  function renderCaseListBody(filter){
    const body=$('#caseListBody');if(!body)return;
    let cases=Store.listCases();
    if(filter&&filter!=='全部')cases=cases.filter(c=>c.questionType===filter);
    if(!cases.length){body.innerHTML='<div class="empty">暂无案例</div>';return;}
    body.innerHTML=cases.map(c=>`<div class="recent-item" data-case="${c.id}"><div><div class="ri-t">${c.title}</div><div class="ri-m">${c.questionType} · ${c.shushu} · ${fmtDate(new Date(c.createdAt))}</div></div><div class="ri-r">${c.reviewed?(c.review.result||'已复盘'):'待复盘'}</div></div>`).join('');
    body.querySelectorAll('[data-case]').forEach(e=>e.onclick=()=>openCaseDetail(e.dataset.case));
    // mini stat
    const ms=$('#miniStat');
    if(ms){const st=Store.reviewStats();ms.innerHTML=`<div class="stat-box"><div class="sb-n">${st.total}</div><div class="sb-l">已复盘</div></div><div class="stat-box"><div class="sb-n">${st.acc}%</div><div class="sb-l">个人准确率</div></div>`;}
  }
  function bindCaseList(){
    document.querySelectorAll('#filterBar .chip').forEach(e=>e.onclick=()=>{
      document.querySelectorAll('#filterBar .chip').forEach(x=>x.classList.remove('on'));e.classList.add('on');
      renderCaseListBody(e.dataset.filter);
    });
    const bs=$('#btnStat');if(bs)bs.onclick=()=>openStats();
  }
  function openCaseDetail(id){
    if(id===undefined)id=state.viewCaseId;
    const c=Store.getCase(id);if(!c){toast('案例不存在');return;}
    state.viewCaseId=id;
    const container=$('#page-container');
    let h=`<div class="phead"><div><div class="ptitle">案例详情</div><div class="psub">${fmtDate(new Date(c.createdAt))}</div></div><button class="btn ghost sm" id="backList">返回</button></div>`;
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
      const r=c.review;
      h+=`<div class="detail-row"><span class="dk">实际结果</span><span style="text-align:right;max-width:70%">${r.actual||'—'}</span></div>`;
      h+=`<div class="detail-row"><span class="dk">应验程度</span><span>${r.result}</span></div>`;
      if(r.unhit)h+=`<div class="detail-row"><span class="dk">未应验点</span><span>${r.unhit}</span></div>`;
      if(r.reflect)h+=`<div class="detail-row"><span class="dk">反思</span><span>${r.reflect}</span></div>`;
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
    let body=`<div class="field"><label>实际结果</label><textarea id="rActual">${c.review&&c.review.actual||''}</textarea></div>`;
    body+=`<div class="field"><label>应验程度</label><div class="chips" id="rResChips">${results.map(r=>`<span class="chip ${(c.review&&c.review.result===r)?'on':''}" data-res="${r}">${r}</span>`).join('')}</div></div>`;
    body+=`<div class="field"><label>未应验点</label><textarea id="rUnhit">${c.review&&c.review.unhit||''}</textarea></div>`;
    body+=`<div class="field"><label>我的反思</label><textarea id="rReflect">${c.review&&c.review.reflect||''}</textarea></div>`;
    let chosen=c.review&&c.review.result||'';
    modal('复盘',body,(m)=>{
      const actual=$('#rActual').value,unhit=$('#rUnhit').value,reflect=$('#rReflect').value;
      if(!chosen){toast('请选择应验程度');return;}
      Store.addReview(id,{actual,unhit,reflect,result:chosen});
      closeModal();toast('复盘已保存');openCaseDetail(id);
    },true,'保存复盘');
    setTimeout(()=>{
      document.querySelectorAll('#rResChips .chip').forEach(e=>e.onclick=()=>{chosen=e.dataset.res;document.querySelectorAll('#rResChips .chip').forEach(x=>x.classList.remove('on'));e.classList.add('on');});
    },30);
  }
  function openStats(){
    const st=Store.reviewStats();
    let body=`<div class="review-stat"><div class="stat-box"><div class="sb-n">${st.total}</div><div class="sb-l">已复盘案例</div></div><div class="stat-box"><div class="sb-n">${st.acc}%</div><div class="sb-l">个人准确率</div></div></div>`;
    body+=`<div class="set-group"><div class="sg-t">按应验程度</div>`;
    ['应验','部分应验','未应验','无法判断'].forEach(r=>body+=`<div class="detail-row"><span class="dk">${r}</span><span>${st.byResult[r]||0}</span></div>`);
    body+=`</div>`;
    body+=`<div class="set-group"><div class="sg-t">按问题类型</div>`;
    if(Object.keys(st.byType).length)Object.keys(st.byType).forEach(k=>body+=`<div class="detail-row"><span class="dk">${k}</span><span>${st.byType[k]}</span></div>`);
    else body+='<div class="empty">暂无数据</div>';
    body+=`</div>`;
    body+=`<div class="set-group"><div class="sg-t">按术数</div>`;
    if(Object.keys(st.byShu).length)Object.keys(st.byShu).forEach(k=>body+=`<div class="detail-row"><span class="dk">${k}</span><span>${st.byShu[k]}</span></div>`);
    else body+='<div class="empty">暂无数据</div>';
    body+='</div>';
    body+=`<div class="section-note">统计仅用于个人校准，不对外展示。</div>`;
    modal('复盘统计',body,null,true,'关闭');
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
    h+=selectRow('大六壬贵人','dlGuiRen',['昼夜贵人','天乙贵人']);
    h+=selectRow('涉害取法','dlSheHai',['涉害取深','涉害取孟仲季']);
    h+=selectRow('月将设置','yueJiang',['中气定将','节气定将']);
    h+=switchRow('八字真太阳时','zhenTaiyang',s.zhenTaiyang);
    h+=switchRow('塔罗正逆位','tarotReverse',s.tarotReverse);
    h+=`</div>`;
    h+=`<div class="card set-group"><div class="sg-t">AI 设置</div>`;
    h+=selectRow('AI 语气','aiTone',['专业谨慎','温和陪伴','直接简洁','传统术数','心理探索']);
    h+=selectRow('解读长度','aiLength',['简短','标准','详细']);
    h+=switchRow('显示专业术语','showTerm',s.showTerm);
    h+=switchRow('自动生成行动建议','autoAdvice',s.autoAdvice);
    h+=switchRow('自动复制提示词','autoCopyPrompt',s.autoCopyPrompt);
    h+=switchRow('离线模式','offlineMode',s.offlineMode);
    h+=`</div>`;
    h+=`<div class="card set-group"><div class="sg-t">隐私与安全</div>`;
    h+=switchRow('应用锁','appLock',s.appLock);
    h+=switchRow('生物识别','bioLock',s.bioLock);
    h+=switchRow('本地加密','localEncrypt',s.localEncrypt);
    h+=`<div class="section-note">本应用数据仅保存在本机，不上传服务器。</div>`;
    h+=`</div>`;
    h+=`<div class="card set-group"><div class="sg-t">备份与恢复</div>`;
    h+=`<button class="btn block" id="btnExport">导出备份</button><button class="btn block mt8" id="btnImport">导入备份</button><button class="btn danger block mt8" id="btnClear">一键清除全部案例</button>`;
    h+=`</div>`;
    h+=`<div class="card set-group"><div class="sg-t">提醒</div>`;
    h+=switchRow('每日时课提醒','remindDaily',s.remindDaily);
    h+=switchRow('复盘提醒','remindReview',s.remindReview);
    h+=switchRow('重要日期提醒','remindImportant',s.remindImportant);
    h+=`</div>`;
    h+=`<div class="card"><button class="btn block" id="btnAbout">关于与免责声明</button></div>`;
    h+=`<div class="card"><div class="detail-row"><span class="dk">版本</span><span>玄决 V0.1（个人可用版）</span></div><div class="detail-row"><span class="dk">数据</span><span>本地存储 · 离线可用</span></div></div>`;
    return h;
  }
  function selectRow(label,key,opts){
    const s=Store.getSettings();const cur=s[key];
    return `<div class="field" style="margin:8px 0"><label>${label}</label><select data-set="${key}">${opts.map(o=>`<option ${o===cur?'selected':''}>${o}</option>`).join('')}</select></div>`;
  }
  function switchRow(label,key,val){
    return `<div class="switch"><span>${label}</span><input type="checkbox" data-set="${key}" ${val?'checked':''}></div>`;
  }
  function bindMe(){
    $('#btnProfile').onclick=()=>openProfile();
    document.querySelectorAll('[data-set]').forEach(e=>e.onchange=ev=>{
      const k=ev.target.dataset.set;const v=ev.target.type==='checkbox'?ev.target.checked:ev.target.value;
      Store.setSettings({[k]:v});toast('已保存');
    });
    $('#btnExport').onclick=()=>doExport();
    $('#btnImport').onclick=()=>doImport();
    $('#btnClear').onclick=()=>{modal('清除全部案例','将删除所有案例数据（设置保留），不可恢复。',m=>{Store.clearAll();closeModal();toast('已清除全部案例');renderTab();});};
    $('#btnAbout').onclick=()=>modal('关于玄决',aboutHtml(),null,true,'关闭');
  }
  function aboutHtml(){
    return `<p>玄决 · 大六壬决策台</p><p>个人术数决策辅助工具。核心理念：辅助决策而非预测命运；规则排盘 + AI 白话解释 + 个人复盘。</p>
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
    const a=document.createElement('a');a.href=url;a.download='xuanjue-backup-'+fmtDate(new Date())+'.json';document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
    toast('备份已导出');
  }
  function doImport(){
    const inp=document.createElement('input');inp.type='file';inp.accept='.json';
    inp.onchange=ev=>{
      const f=ev.target.files[0];if(!f)return;
      const r=new FileReader();
      r.onload=()=>{try{const obj=JSON.parse(r.result);modal('导入备份','将覆盖当前数据，确认导入？',m=>{Store.importBackup(obj);closeModal();toast('备份已导入');renderTab();});}catch(e){toast('文件解析失败');}};
      r.readAsText(f);
    };
    inp.click();
  }

  // boot
  document.addEventListener('DOMContentLoaded',init);
  global.App={toast,computeDaliuren};
})(window);
