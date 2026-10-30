// hehun.js — 合婚合盘本地规则引擎
// 输入双方八字 / 紫微命盘 + 测试时间的实时盘（大六壬/六爻/梅花/小六壬/塔罗），
// 输出可解释的六维评分与建议，供结果页与 AI 上下文使用。
// 原则：只描述倾向与互动模式，不下婚姻结论；分数是相对的，不是命定。
(function (global) {
  var STEM_WX = { 甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水' };
  var WX_SHENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
  var WX_KE = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };

  // 地支关系（合 > 三合 > 平 > 刑 > 害 > 冲）
  var ZHI_HE = ['子丑', '寅亥', '卯戌', '辰酉', '巳申', '午未'];
  var ZHI_SANHE = [['申', '子', '辰'], ['寅', '午', '戌'], ['巳', '酉', '丑'], ['亥', '卯', '未']];
  var ZHI_CHONG = ['子午', '丑未', '寅申', '卯酉', '辰戌', '巳亥'];
  var ZHI_HAI = ['子未', '丑午', '寅巳', '卯辰', '申亥', '酉戌'];
  var ZHI_XING = ['子卯', '寅巳', '巳申', '寅申', '丑戌', '戌未', '丑未'];

  function pairHit(list, a, b) {
    var p1 = a + b, p2 = b + a;
    return list.some(function (x) { return x === p1 || x === p2; });
  }
  function zhiRelation(a, b) {
    if (!a || !b) return { type: '未知', label: '地支资料不足', score: 62 };
    if (pairHit(ZHI_HE, a, b)) return { type: '六合', label: a + b + '六合', score: 90 };
    for (var i = 0; i < ZHI_SANHE.length; i++) {
      var g = ZHI_SANHE[i];
      if (g.indexOf(a) >= 0 && g.indexOf(b) >= 0) return { type: '三合', label: a + b + '三合' + g.join(''), score: 85 };
    }
    if (pairHit(ZHI_XING, a, b)) return { type: '刑', label: a + b + '相刑', score: 56 };
    if (pairHit(ZHI_CHONG, a, b)) return { type: '冲', label: a + b + '相冲', score: 45 };
    if (pairHit(ZHI_HAI, a, b)) return { type: '害', label: a + b + '相害', score: 55 };
    return { type: '平', label: a + b + '平和', score: 65 };
  }

  // 十四主星 → 性格族群
  var STAR_GROUP = {
    紫微: '稳重', 天府: '稳重', 武曲: '稳重', 天相: '稳重',
    七杀: '变动', 破军: '变动', 贪狼: '变动',
    天机: '温和', 太阴: '温和', 天同: '温和', 天梁: '温和',
    太阳: '表达', 巨门: '表达', 廉贞: '表达'
  };
  // 族群相处矩阵（行 A、列 B）
  var GROUP_MATRIX = {
    稳重: { 稳重: 78, 温和: 88, 变动: 80, 表达: 75 },
    温和: { 稳重: 88, 温和: 75, 变动: 82, 表达: 78 },
    变动: { 稳重: 80, 温和: 82, 变动: 55, 表达: 70 },
    表达: { 稳重: 75, 温和: 78, 变动: 70, 表达: 60 }
  };

  function starGroup(name) { return STAR_GROUP[name] || ''; }
  function firstMajor(ziweiRes) {
    if (!ziweiRes) return '';
    var r = ziweiRes.result || ziweiRes;
    var arr = (r && r.majorStars) || [];
    return arr.length ? arr[0] : '';
  }
  function spouseStars(ziweiRes) {
    if (!ziweiRes) return [];
    var r = ziweiRes.result || ziweiRes;
    var ast = r && r.astrolabe;
    if (!ast || !Array.isArray(ast.palaces)) return [];
    var p = ast.palaces.filter(function (x) { return x && x.name === '夫妻'; })[0];
    if (!p) return [];
    return (p.majorStars || []).map(function (s) { return s.name; }).filter(Boolean);
  }

  function wxRelation(a, b) {
    if (!a || !b) return { label: '五行资料不足', score: 62 };
    if (a === b) return { label: '同属' + a + '（比和）', score: 72 };
    if (WX_SHENG[a] === b) return { label: a + '生' + b + '（我生）', score: 84 };
    if (WX_SHENG[b] === a) return { label: b + '生' + a + '（生我）', score: 86 };
    if (WX_KE[a] === b) return { label: a + '克' + b + '（我克）', score: 60 };
    if (WX_KE[b] === a) return { label: b + '克' + a + '（克我）', score: 56 };
    return { label: '中性', score: 65 };
  }

  function baziOf(x) {
    if (!x) return null;
    return x.result || x;
  }

  function dayZhiOf(bazi) {
    if (!bazi || !Array.isArray(bazi.pillars) || bazi.pillars.length < 3) return '';
    return bazi.pillars[2].zhi || '';
  }
  function yearZhiOf(bazi) {
    if (!bazi || !Array.isArray(bazi.pillars) || !bazi.pillars.length) return '';
    return bazi.pillars[0].zhi || '';
  }

  function realtimeScore(realtime) {
    var map = { 宜主动: 84, 宜等待: 64, 宜谨慎: 50 };
    var parts = [], vals = [];
    (realtime || []).forEach(function (item) {
      if (!item || !item.name) return;
      var p = item.result && item.result.plain ? item.result.plain : (item.plain || null);
      var tend = p && p.tendency ? p.tendency : '';
      if (!tend || tend === '不可用') return;
      vals.push(map[tend] != null ? map[tend] : 65);
      parts.push(item.name + '：' + tend);
    });
    if (!vals.length) return { score: 62, label: '实时盘未起或不可用，本项按中性计', parts: [] };
    var avg = Math.round(vals.reduce(function (s, v) { return s + v; }, 0) / vals.length);
    return { score: avg, label: parts.join('；'), parts: parts };
  }

  function round(n) { return Math.max(0, Math.min(100, Math.round(n))); }

  function analyze(input) {
    input = input || {};
    var A = input.a || {}, B = input.b || {};
    var aB = baziOf(A.bazi), bB = baziOf(B.bazi);
    var aZ = A.ziwei, bZ = B.ziwei;
    var dims = [];

    // 1) 年支（生肖）关系
    var relYZ = zhiRelation(yearZhiOf(aB), yearZhiOf(bB));
    dims.push({
      key: 'year', label: '年支·生肖', weight: 12, score: relYZ.score,
      verdict: relYZ.type === '六合' || relYZ.type === '三合' ? '相合' : (relYZ.type === '冲' ? '相冲' : (relYZ.type === '平' ? '平和' : '有刑害')),
      detail: 'A 年支 ' + (yearZhiOf(aB) || '—') + ' × B 年支 ' + (yearZhiOf(bB) || '—') + '：' + relYZ.label
    });

    // 2) 日主五行
    var relDay = wxRelation(aB && aB.dayWx, bB && bB.dayWx);
    var strongBonus = 0, strongNote = '';
    if (aB && bB && typeof aB.dayStrong === 'boolean' && typeof bB.dayStrong === 'boolean') {
      if (aB.dayStrong !== bB.dayStrong) { strongBonus = 5; strongNote = '一强一弱，互补性较好'; }
      else { strongBonus = -3; strongNote = '双方强弱相近，需注意各自坚持'; }
    }
    dims.push({
      key: 'day', label: '日主·五行', weight: 20, score: round(relDay.score + strongBonus),
      verdict: relDay.score >= 80 ? '相生' : (relDay.score >= 65 ? '平和' : '相克'),
      detail: 'A 日主 ' + ((aB && aB.dayGan) || '—') + (aB && aB.dayWx ? '（' + aB.dayWx + '）' : '') + ' × B 日主 ' + ((bB && bB.dayGan) || '—') + (bB && bB.dayWx ? '（' + bB.dayWx + '）' : '') + '：' + relDay.label + (strongNote ? '；' + strongNote : '')
    });

    // 3) 夫妻宫（日支 + 紫微夫妻宫）
    var relSpouse = zhiRelation(dayZhiOf(aB), dayZhiOf(bB));
    var aSp = spouseStars(aZ), bSp = spouseStars(bZ);
    var aG = starGroup(aSp[0]), bG = starGroup(bSp[0]);
    var starScore = 65, starNote = '夫妻宫无主星或资料不足，按中性计';
    if (aG && bG) {
      starScore = GROUP_MATRIX[aG][bG];
      starNote = 'A 夫妻宫 ' + aSp[0] + '（' + aG + '型） × B 夫妻宫 ' + bSp[0] + '（' + bG + '型）';
    }
    dims.push({
      key: 'spouse', label: '夫妻宫', weight: 22, score: round(relSpouse.score * 0.6 + starScore * 0.4),
      verdict: relSpouse.score >= 80 && starScore >= 75 ? '相契' : (relSpouse.type === '冲' ? '需磨合' : '平稳'),
      detail: '日支（配偶宫）A ' + (dayZhiOf(aB) || '—') + ' × B ' + (dayZhiOf(bB) || '—') + '：' + relSpouse.label + '；' + starNote
    });

    // 4) 五行互补（用喜神互济）
    var start = 50, xiA = (aB && aB.xiJi && aB.xiJi.xi) || [], xiB = (bB && bB.xiJi && bB.xiJi.xi) || [];
    var jiA = (aB && aB.xiJi && aB.xiJi.ji) || [], jiB = (bB && bB.xiJi && bB.xiJi.ji) || [];
    var cntA = (aB && aB.wxCountAll) || {}, cntB = (bB && bB.wxCountAll) || {};
    var aHelp = 0, bHelp = 0;
    xiA.slice(0, 3).forEach(function (w) { if (cntB[w] > 0) aHelp += 6; });
    xiB.slice(0, 3).forEach(function (w) { if (cntA[w] > 0) bHelp += 6; });
    aHelp = Math.min(aHelp, 18); bHelp = Math.min(bHelp, 18);
    var penalty = 0, penNote = [];
    if (aB && aB.dayWx && jiB.indexOf(aB.dayWx) >= 0) { penalty += 7; penNote.push('A 日主五行属 B 忌神'); }
    if (bB && bB.dayWx && jiA.indexOf(bB.dayWx) >= 0) { penalty += 7; penNote.push('B 日主五行属 A 忌神'); }
    var wxScore = round(start + aHelp + bHelp - penalty);
    dims.push({
      key: 'wx', label: '五行互补', weight: 16, score: wxScore,
      verdict: wxScore >= 78 ? '互补' : (wxScore >= 60 ? '尚可' : '偏耗'),
      detail: 'A 喜 ' + (xiA.join('、') || '—') + '，在 B 局中出现可补 ' + aHelp + ' 分；B 喜 ' + (xiB.join('、') || '—') + '，在 A 局中出现可补 ' + bHelp + ' 分' + (penNote.length ? '；扣分项：' + penNote.join('、') : '')
    });

    // 5) 紫微命宫性格匹配
    var aMain = firstMajor(aZ), bMain = firstMajor(bZ);
    var aMainG = starGroup(aMain), bMainG = starGroup(bMain);
    var pScore = 62, pNote = '命宫主星资料不足，按中性计';
    if (aMainG && bMainG) {
      pScore = GROUP_MATRIX[aMainG][bMainG];
      pNote = 'A 命宫 ' + aMain + '（' + aMainG + '型） × B 命宫 ' + bMain + '（' + bMainG + '型）';
    }
    dims.push({
      key: 'star', label: '紫微性格', weight: 18, score: pScore,
      verdict: pScore >= 80 ? '投契' : (pScore >= 70 ? '可相处' : '差异大'),
      detail: pNote
    });

    // 6) 实时盘同频
    var rt = realtimeScore(input.realtime);
    dims.push({
      key: 'realtime', label: '实时盘', weight: 12, score: rt.score,
      verdict: rt.score >= 78 ? '顺势' : (rt.score >= 60 ? '平稳' : '需谨慎'),
      detail: rt.label
    });

    var total = 0, wsum = 0;
    dims.forEach(function (d) { total += d.score * d.weight; wsum += d.weight; });
    var score = Math.round(total / wsum);

    var level, levelTip;
    if (score >= 80) { level = '契合度较高'; levelTip = '关系基础与互动模式较顺，适合稳步推进、把现实条件谈清楚。'; }
    else if (score >= 70) { level = '可发展'; levelTip = '整体可用，但有一两处需要磨合的差异，宜慢不宜急。'; }
    else if (score >= 58) { level = '中等'; levelTip = '并非不合，而是需要主动经营与明确边界，避免靠默契硬撑。'; }
    else { level = '挑战较多'; levelTip = '差异集中在关键维度，建议先观察互动质量，再决定投入程度。'; }

    var highlights = [], risks = [];
    dims.forEach(function (d) {
      if (d.score >= 80) highlights.push(d.label + '：' + d.verdict + '（' + d.score + '）');
      if (d.score < 60) risks.push(d.label + '：' + d.verdict + '（' + d.score + '）— ' + d.detail);
    });

    var adviceMap = {
      year: '年支有冲刑时，给彼此留独立空间，重要决定不要正面硬碰。',
      day: '日主相克时，沟通节奏容易错位，先约定「怎么吵、多久和好」的规则。',
      spouse: '夫妻宫偏弱时，把期待说清楚，比让对方猜更有效；避免用冷处理当答案。',
      wx: '五行互补不足时，多用双方共同喜用的方位、颜色、活动来补位，减少消耗。',
      star: '性格族群差异大时，按「谁擅长谁主导」分工，别在对方不擅长的领域较劲。',
      realtime: '实时盘偏谨慎时，近期不宜催定关系，先做些低压力、可观察的相处。'
    };
    var adviceThreshold = { year: 60, day: 68, spouse: 70, wx: 65, star: 70, realtime: 68 };
    var advice = dims.filter(function (d) { return d.score < (adviceThreshold[d.key] || 65); }).map(function (d) { return adviceMap[d.key]; }).filter(Boolean);
    if (!advice.length) advice.push('整体较顺，重点放在把现实条件（节奏、金钱、家庭边界）谈清楚，而不是反复验证「合不合」。');
    advice.push('合婚评分是关系倾向的相对参考，不决定你们能不能在一起；最终看双方的意愿与行动。');

    var summaryText = [
      '## 合婚局部分析（规则引擎，非命定结论）',
      '综合契合度：' + score + '/100（' + level + '）',
      '测试时间：' + (input.testTime ? String(input.testTime) : '—'),
      '六维评分：'
    ].concat(dims.map(function (d) { return '- ' + d.label + '（权重' + d.weight + '%）：' + d.score + '，' + d.verdict + '；' + d.detail; }))
      .concat(['优势：' + (highlights.join('；') || '无明显高分项'), '风险：' + (risks.join('；') || '无明显低分项')])
      .join('\n');

    return {
      score: score, level: level, levelTip: levelTip,
      dimensions: dims, highlights: highlights, risks: risks, advice: advice,
      summaryText: summaryText,
      meta: {
        aMainStar: aMain, bMainStar: bMain,
        aSpouseStars: aSp, bSpouseStars: bSp,
        aDayZhi: dayZhiOf(aB), bDayZhi: dayZhiOf(bB),
        aYearZhi: yearZhiOf(aB), bYearZhi: yearZhiOf(bB)
      }
    };
  }

  global.HeHun = { analyze: analyze, zhiRelation: zhiRelation, starGroup: starGroup };
})(typeof window !== 'undefined' ? window : globalThis);
