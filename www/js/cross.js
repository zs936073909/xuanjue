// cross.js — T3 多盘交叉摘要：对多术数结果做规则化交叉分析
// 输入：{术数名:{name,result,plain}}，输出一致点 / 冲突点 / 综合建议 / 观察信号 / 复盘周期 / 免责声明
(function(global){
  'use strict';

  // 术数权重表：大六壬主事件成败，八字长期，六爻短期，梅花过程，小六壬快速，塔罗心理，黄历参考
  const WEIGHTS={
    '大六壬':5, '八字':4, '六爻':3, '梅花易数':3, '小六壬':2, '塔罗':2, '黄历':1
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
      return {consistent:[],conflict:[],advice:[],signals:[],reviewDays:21,disclaimer};
    }

    // ===== 一致点判断 =====
    // 1) 多个术数 tendency 同向
    const tendMap={};
    plainNames.forEach(n=>{
      const t=plains[n].tendency||'宜观察';
      if(!tendMap[t])tendMap[t]=[];
      tendMap[t].push(n);
    });
    Object.keys(tendMap).forEach(t=>{
      if(tendMap[t].length>=2){
        consistent.push({desc:'各盘倾向一致为「'+t+'」',shushu:tendMap[t].slice()});
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

    // ===== 冲突点判断 =====
    // 1) 一盘 tendency=宜主动，另一盘=宜等待
    const actList=plainNames.filter(n=>plains[n].tendency==='宜主动');
    const waitList=plainNames.filter(n=>plains[n].tendency==='宜等待');
    if(actList.length&&waitList.length){
      conflict.push({desc:'部分盘建议主动推进，部分盘建议等待时机，节奏不一致',shushu:actList.concat(waitList)});
    }

    // 2) 一盘偏吉（tendency 含"主动"），另一盘偏凶（risks 非空且 tendency 含"谨慎"）
    const jiList=plainNames.filter(n=>(plains[n].tendency||'').includes('主动'));
    const xiongList=plainNames.filter(n=>(plains[n].tendency||'').includes('谨慎')&&(plains[n].risks||[]).length>0);
    if(jiList.length&&xiongList.length){
      conflict.push({desc:'部分盘倾向偏吉、部分盘提示存在风险，需权衡',shushu:jiList.concat(xiongList)});
    }

    // 3) 一盘机会关键词与另一盘风险关键词重叠
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

    // ===== 综合建议 =====
    // 按权重倒序排列
    const sortedByWeight=plainNames.slice().sort((a,b)=>(WEIGHTS[b]||0)-(WEIGHTS[a]||0));
    let mainShu=mainName;
    if(!mainShu||!plains[mainShu]){
      mainShu=sortedByWeight[0];
    }
    const mainPlain=plains[mainShu];

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
      disclaimer
    };
  }

  const CrossAnalyzer={WEIGHTS,analyze};
  global.CrossAnalyzer=CrossAnalyzer;
})(window);
