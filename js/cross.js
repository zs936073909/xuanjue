// cross.js — T3 多盘交叉摘要：对多术数结果做规则化交叉分析
// 输入：{术数名:{name,result,plain}}，输出一致点 / 冲突点 / 综合建议 / 观察信号 / 复盘周期 / 免责声明
(function(global){
  'use strict';

  // 术数权重表：大六壬主事件成败，八字/紫微长期，奇门时空，六爻短期，梅花过程，小六壬快速，塔罗心理，黄历参考
  const WEIGHTS={
    '大六壬':5, '八字':4, '紫微斗数':4, '奇门遁甲':4, '六爻':3, '梅花易数':3, '小六壬':2, '塔罗':2, '黄历':1
  };

  // 倾向方向映射：用于判断多盘是否同向
  const TEND_DIRECTION={
    '宜主动':1,
    '宜等待':-1,
    '宜谨慎':-1,
    '宜观察':0
  };

  // 禁用词 → 替换词（advice 与 consistent 不得出现绝对化措辞）
  const FORBIDDEN_MAP={
    '必然':'倾向',
    '一定':'可能',
    '肯定':'可能',
    '必成':'倾向',
    '必败':'倾向'
  };
  const FORBIDDEN_RE=/必然|一定|肯定|必成|必败/g;

  // 语义重叠检测：提取 2 字以上中文词，取交集
  function semanticOverlap(arr1, arr2){
    if(!Array.isArray(arr1)||!Array.isArray(arr2))return [];
    const kw1=new Set(arr1.join(' ').match(/[\u4e00-\u9fa5]{2,}/g)||[]);
    const kw2=new Set(arr2.join(' ').match(/[\u4e00-\u9fa5]{2,}/g)||[]);
    return [...kw1].filter(k=>kw2.has(k));
  }

  // 禁用词替换（字符串）
  function sanitizeText(s){
    if(typeof s!=='string')return s;
    return s.replace(FORBIDDEN_RE,m=>FORBIDDEN_MAP[m]||'可能');
  }

  // 禁用词替换（数组元素为字符串或 {desc,shushu} 对象）
  function sanitizeArr(arr){
    if(!Array.isArray(arr))return arr;
    return arr.map(x=>{
      if(typeof x==='string')return sanitizeText(x);
      if(x&&typeof x==='object'){
        const o={};
        Object.keys(x).forEach(k=>{
          if(k==='shushu')o[k]=x[k];
          else if(Array.isArray(x[k]))o[k]=x[k].map(v=>typeof v==='string'?sanitizeText(v):v);
          else if(typeof x[k]==='string')o[k]=sanitizeText(x[k]);
          else o[k]=x[k];
        });
        return o;
      }
      return x;
    });
  }

  // 主入口：分析多盘结果
  function analyze(mainName, results){
    results=results||{};
    const names=Object.keys(results);
    const disclaimer='以上交叉摘要为多术数规则化参考，不构成确定性预测。重大决策请结合实际情况判断。';

    if(!names.length){
      return {consistent:[],conflict:[],advice:[],signals:[],reviewDays:21,disclaimer};
    }

    // 收集每盘的 plain 字段（缺失的术数跳过）
    const plains={};
    names.forEach(n=>{
      const r=results[n];
      if(r&&r.plain)plains[n]=r.plain;
    });
    const plainNames=Object.keys(plains);

    const consistent=[];
    const conflict=[];
    const advice=[];
    const signals=[];

    if(!plainNames.length){
      return {consistent:[],conflict:[],advice:[],signals:[],reviewDays:21,consensusScore:0,tendency:'宜观察',disclaimer};
    }

    // 按权重倒序排列，用于后续主盘选择和建议排序
    const sortedByWeight=plainNames.slice().sort((a,b)=>(WEIGHTS[b]||0)-(WEIGHTS[a]||0));
    let mainShu=mainName;
    if(!mainShu||!plains[mainShu]){
      mainShu=sortedByWeight[0];
    }
    const mainPlain=plains[mainShu];

    // ===== 一致点判断 =====
    // 1) 多个术数 tendency 同向（含方向聚合：主动 vs 谨慎/等待 vs 观察）
    const directionGroups={'1':[],'-1':[],'0':[]};
    plainNames.forEach(n=>{
      const t=plains[n].tendency||'宜观察';
      const dir=TEND_DIRECTION[t];
      if(dir!==undefined)directionGroups[dir].push({name:n,tendency:t});
    });
    Object.keys(directionGroups).forEach(dir=>{
      const g=directionGroups[dir];
      if(g.length>=2){
        const label=dir==='1'?'主动推进':(dir==='-1'?'谨慎等待':'观察');
        consistent.push({desc:'多盘倾向一致为「'+label+'」',shushu:g.map(x=>x.name)});
      }
    });

    // 2) doAct 关键词交集
    for(let i=0;i<plainNames.length;i++){
      for(let j=i+1;j<plainNames.length;j++){
        const a=plainNames[i],b=plainNames[j];
        const ov=semanticOverlap(plains[a].doAct||[],plains[b].doAct||[]);
        if(ov.length){
          consistent.push({desc:'建议均含「'+ov.join('、')+'」',shushu:[a,b]});
        }
      }
    }

    // 3) risks 关键词交集
    for(let i=0;i<plainNames.length;i++){
      for(let j=i+1;j<plainNames.length;j++){
        const a=plainNames[i],b=plainNames[j];
        const ov=semanticOverlap(plains[a].risks||[],plains[b].risks||[]);
        if(ov.length){
          consistent.push({desc:'风险提示均含「'+ov.join('、')+'」',shushu:[a,b]});
        }
      }
    }

    // 4) signals 关键词交集
    for(let i=0;i<plainNames.length;i++){
      for(let j=i+1;j<plainNames.length;j++){
        const a=plainNames[i],b=plainNames[j];
        const ov=semanticOverlap(plains[a].signals||[],plains[b].signals||[]);
        if(ov.length){
          consistent.push({desc:'观察信号均含「'+ov.join('、')+'」',shushu:[a,b]});
        }
      }
    }

    // 5) opps 机会关键词交集
    for(let i=0;i<plainNames.length;i++){
      for(let j=i+1;j<plainNames.length;j++){
        const a=plainNames[i],b=plainNames[j];
        const ov=semanticOverlap(plains[a].opps||[],plains[b].opps||[]);
        if(ov.length){
          consistent.push({desc:'机会方向均含「'+ov.join('、')+'」',shushu:[a,b]});
        }
      }
    }

    // ===== 冲突点判断 =====
    // 1) 方向完全相反：主动 vs 谨慎/等待
    const actList=plainNames.filter(n=>TEND_DIRECTION[plains[n].tendency||'宜观察']===1);
    const waitList=plainNames.filter(n=>TEND_DIRECTION[plains[n].tendency||'宜观察']===-1);
    if(actList.length&&waitList.length){
      conflict.push({desc:'部分盘建议主动推进，部分盘建议谨慎等待，节奏不一致',shushu:actList.concat(waitList)});
    }

    // 2) 主动 vs 观察：行动信号不统一
    const observeList=plainNames.filter(n=>TEND_DIRECTION[plains[n].tendency||'宜观察']===0);
    if(actList.length&&observeList.length){
      conflict.push({desc:'部分盘建议主动，部分盘建议继续观察，需更多信息再决断',shushu:actList.concat(observeList)});
    }

    // 3) 一盘机会与另一盘风险重叠
    for(let i=0;i<plainNames.length;i++){
      for(let j=0;j<plainNames.length;j++){
        if(i===j)continue;
        const a=plainNames[i],b=plainNames[j];
        const ov=semanticOverlap(plains[a].opps||[],plains[b].risks||[]);
        if(ov.length){
          conflict.push({desc:a+'提示的机会「'+ov.join('、')+'」与'+b+'提示的风险重叠',shushu:[a,b]});
        }
      }
    }

    // 4) 主盘与次盘 dontAct 冲突
    sortedByWeight.slice(1).forEach(n=>{
      const p=plains[n];
      if(!p||!Array.isArray(p.dontAct))return;
      const mainDoArr=mainPlain.doAct||[];
      p.dontAct.forEach(dont=>{
        const ov=semanticOverlap(mainDoArr,[dont]);
        if(ov.length){
          conflict.push({desc:'主盘建议「'+ov.join('、')+'」与'+n+'提示的忌讳「'+dont+'」冲突',shushu:[mainShu,n]});
        }
      });
    });

    // ===== 综合倾向与共识度 =====
    let totalDirW=0,totalDirV=0;
    plainNames.forEach(n=>{
      const w=WEIGHTS[n]||1;
      const dir=TEND_DIRECTION[plains[n].tendency||'宜观察']||0;
      totalDirW+=w;
      totalDirV+=dir*w;
    });
    let tendency='宜观察';
    if(totalDirW>0){
      const avg=totalDirV/totalDirW;
      if(avg>0.3)tendency='宜主动';
      else if(avg<-0.3)tendency='宜谨慎';
      else tendency='宜观察';
    }
    // 共识度：基于倾向离散程度、一致点数量、冲突点数量
    const maxDirW=Math.max(...Object.values(directionGroups).map(g=>g.reduce((s,x)=>(WEIGHTS[x.name]||1)+s,0)));
    const dirScore=totalDirW>0?Math.round((maxDirW/totalDirW)*60):0;
    const overlapScore=Math.min(consistent.length*10,25);
    const conflictPenalty=Math.min(conflict.length*10,20);
    const consensusScore=Math.max(0,Math.min(100,dirScore+overlapScore-conflictPenalty));

    // ===== 综合建议 =====
    if(mainPlain&&Array.isArray(mainPlain.doAct)){
      // 主建议：取权重最高术数的 doAct
      mainPlain.doAct.forEach(d=>{
        if(!d)return;
        if(advice.some(a=>a.includes(d)))return;
        advice.push('主建议（'+mainShu+'）：'+d);
      });
      // 合并其他术数 doAct 中不与主盘 dontAct 冲突的项
      sortedByWeight.forEach(n=>{
        if(n===mainShu)return;
        const p=plains[n];
        if(!p||!Array.isArray(p.doAct))return;
        const mainDontArr=mainPlain.dontAct||[];
        p.doAct.forEach(d=>{
          if(!d)return;
          // 与主盘 dontAct 关键词重叠则视为冲突，跳过
          if(mainDontArr.some(dont=>semanticOverlap([d],[dont]).length>0))return;
          // 已存在相同建议则跳过
          if(advice.some(a=>a.includes(d)))return;
          advice.push('参考'+n+'的「'+d+'」');
        });
      });
    }

    // 若多盘冲突明显，追加折中建议
    if(conflict.length>=2&&consensusScore<50){
      advice.push('综合建议：多盘信号分歧较大，建议小步验证、保留退路，待信号更一致再加大投入。');
    }else if(consistent.length>=2&&consensusScore>=70){
      advice.push('综合建议：多盘信号高度一致，可按照主建议积极推进，同时留意共同提示的风险。');
    }

    // ===== 观察信号 =====
    // 合并所有术数 plain.signals，去重并标注来源
    const signalSeen=new Set();
    plainNames.forEach(n=>{
      const sigs=plains[n].signals||[];
      sigs.forEach(s=>{
        if(!s||signalSeen.has(s))return;
        signalSeen.add(s);
        signals.push('['+n+'] '+s);
      });
    });

    // ===== 复盘时间：按权重加权平均 =====
    let totalW=0,totalD=0;
    plainNames.forEach(n=>{
      const w=WEIGHTS[n]||1;
      const d=Number(plains[n].reviewDays)||21;
      totalW+=w;totalD+=d*w;
    });
    const reviewDays=totalW>0?Math.round(totalD/totalW):21;

    // ===== 禁用词替换：仅作用于 advice 与 consistent =====
    const cleanConsistent=sanitizeArr(consistent);
    const cleanAdvice=sanitizeArr(advice);

    return {
      consistent:cleanConsistent,
      conflict,
      advice:cleanAdvice,
      signals,
      reviewDays,
      consensusScore,
      tendency,
      disclaimer
    };
  }

  const CrossAnalyzer={WEIGHTS,analyze};
  global.CrossAnalyzer=CrossAnalyzer;
})(window);
