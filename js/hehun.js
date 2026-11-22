// hehun.js — 合婚合盘（《三命通会》法，规则引擎）
//
// 立论依据（均为古法通行口径，非自创）：
//   · 《三命通会·卷七·论女命》：「妇人从夫，先观夫星以定出身之贵贱……官煞财得地，夫利也。」
//   · 《三命通会·论六亲》：男以财为妻、女以官（官杀）为夫，取阴阳之正合。
//   · 年命纳音合婚：纳音相生为上，比和为次，相克易生摩擦；古谚「纳音上克下，有福；下克上，不宜」。
//   · 夫妻宫：日支为配偶宫，喜合喜生，忌冲刑害。
//
// 与上一版的区别：上一版是「八字 + 紫微」七维加权（含实时盘），本版回到《三命通会》的
// 子平/纳音体系，只用五项：年命纳音、年支生肖、日主十神、夫妻宫、夫妻星得地。
// 紫微不再计入评分（保留在结果 meta 里作旁参），避免把两套体系揉成一个分数。
//
// 原则不变：只描述关系倾向与互动模式，不下婚姻结论；分数是相对参考，不是命定。
(function (global) {
  'use strict';

  var STEM_WX = { 甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水' };
  var WX_SHENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
  var WX_KE = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };
  var WX_ALL = ['金', '木', '水', '火', '土'];

  var GAN_HE = ['甲己', '乙庚', '丙辛', '丁壬', '戊癸'];
  var GAN_CHONG = ['甲庚', '乙辛', '丙壬', '丁癸'];

  var ZHI_HE = ['子丑', '寅亥', '卯戌', '辰酉', '巳申', '午未'];
  var ZHI_SANHE = [['申', '子', '辰'], ['寅', '午', '戌'], ['巳', '酉', '丑'], ['亥', '卯', '未']];
  var ZHI_SANHUI = [['寅', '卯', '辰'], ['巳', '午', '未'], ['申', '酉', '戌'], ['亥', '子', '丑']];
  var ZHI_CHONG = ['子午', '丑未', '寅申', '卯酉', '辰戌', '巳亥'];
  var ZHI_HAI = ['子未', '丑午', '寅巳', '卯辰', '申亥', '酉戌'];
  var ZHI_XING = ['子卯', '寅巳', '巳申', '寅申', '丑戌', '戌未', '丑未'];
  var ZHI_PO = ['子酉', '寅亥', '卯午', '辰丑', '巳申', '未戌'];

  // 年柱纳音表（60 甲子 → 30 纳音），用于 bazi.naYin 缺失时兜底
  var NA_YIN = ['海中金', '炉中火', '大林木', '路旁土', '剑锋金', '山头火', '涧下水', '城头土', '白蜡金', '杨柳木',
    '泉中水', '屋上土', '霹雳火', '松柏木', '长流水', '沙中金', '山下火', '平地木', '壁上土', '金箔金',
    '覆灯火', '天河水', '大驿土', '钗钏金', '桑柘木', '大溪水', '沙中土', '天上火', '石榴木', '大海水'];

  function pairHit(list, a, b) {
    var p1 = a + b, p2 = b + a;
    for (var i = 0; i < list.length; i++) { if (list[i] === p1 || list[i] === p2) return true; }
    return false;
  }
  function groupHit(groups, a, b) {
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      if (g.indexOf(a) >= 0 && g.indexOf(b) >= 0) return g;
    }
    return null;
  }
  function clamp(n) { return Math.max(0, Math.min(100, Math.round(n))); }
  function round1(n) { return Math.round(n * 10) / 10; }

  // 地支关系（六合 > 三合 > 三会 > 平 > 破 > 刑 > 害 > 冲）
  function zhiRelation(a, b) {
    if (!a || !b) return { type: '未知', label: '地支资料不足', score: 62 };
    if (pairHit(ZHI_HE, a, b)) return { type: '六合', label: a + b + '六合', score: 90 };
    var sg = groupHit(ZHI_SANHE, a, b);
    if (sg) return { type: '三合', label: a + b + '三合' + sg.join(''), score: 86 };
    var sh = groupHit(ZHI_SANHUI, a, b);
    if (sh) return { type: '三会', label: a + b + '三会' + sh.join(''), score: 82 };
    if (pairHit(ZHI_PO, a, b)) return { type: '破', label: a + b + '相破', score: 59 };
    if (pairHit(ZHI_XING, a, b)) return { type: '刑', label: a + b + '相刑', score: 51 };
    if (pairHit(ZHI_HAI, a, b)) return { type: '害', label: a + b + '相害', score: 55 };
    if (pairHit(ZHI_CHONG, a, b)) return { type: '冲', label: a + b + '相冲', score: 43 };
    return { type: '平', label: a + b + '平和', score: 70 };
  }

  function baziOf(x) { return x ? (x.result || x) : null; }
  function ziweiRes(x) {
    if (!x) return null;
    var r = x.result || x;
    return r && r.astrolabe ? r : null;
  }
  function yearPillar(bazi) { return bazi && bazi.pillars && bazi.pillars[0] ? bazi.pillars[0] : null; }
  function dayPillar(bazi) { return bazi && bazi.pillars && bazi.pillars[2] ? bazi.pillars[2] : null; }
  function yearZhiOf(bazi) { var p = yearPillar(bazi); return p ? p.zhi : ''; }
  function dayZhiOf(bazi) { var p = dayPillar(bazi); return p ? p.zhi : ''; }
  function dayGanOf(bazi) { return bazi ? bazi.dayGan || (dayPillar(bazi) || {}).gan || '' : ''; }
  function dayWxOf(bazi) { return bazi ? (bazi.dayWx || STEM_WX[dayGanOf(bazi)] || '') : ''; }

  function gz60(gz) {
    var GAN = '甲乙丙丁戊己庚辛壬癸', ZHI = '子丑寅卯辰巳午未申酉戌亥';
    var g = GAN.indexOf(String(gz).charAt(0)), z = ZHI.indexOf(String(gz).charAt(1));
    if (g < 0 || z < 0) return -1;
    var i = g; while (i % 12 !== z) i += 10;
    return i % 60;
  }
  // 年命纳音五行：优先用八字结果里的 naYin['年柱']，缺失时按 60 甲子纳音表回推
  function nayinOf(bazi) {
    if (!bazi) return { name: '', wx: '' };
    var n = bazi.naYin && bazi.naYin['年柱'];
    if (!n) {
      var yp = yearPillar(bazi);
      var idx = yp ? gz60(yp.gz) : -1;
      if (idx >= 0) n = NA_YIN[Math.floor(idx / 2)];
    }
    if (!n) return { name: '', wx: '' };
    var m = String(n).match(/[金木水火土]/g);
    return { name: n, wx: m && m.length ? m[m.length - 1] : '' };
  }

  // 十神计数：天干 + 地支藏干
  function shenCount(bazi, targetShen) {
    if (!bazi || !bazi.pillars) return 0;
    var n = 0;
    bazi.pillars.forEach(function (p) {
      if (p.ganShen && p.ganShen === targetShen) n++;
      (p.cang || []).forEach(function (c) { if (c.shen === targetShen) n++; });
    });
    return n;
  }
  // 女命夫星＝正官/七杀；男命妻星＝正财/偏财
  function spouseStarStat(bazi, gender) {
    var isMale = gender === '男';
    var a = shenCount(bazi, isMale ? '正财' : '正官');
    var b = shenCount(bazi, isMale ? '偏财' : '七杀');
    return { total: a + b, main: a, off: b, star: isMale ? '妻星（财）' : '夫星（官杀）' };
  }

  function wxRelation(a, b) {
    if (!a || !b) return { label: '五行资料不足', score: 62, code: 'unknown' };
    if (a === b) return { label: '同属' + a + '（比和）', score: 70, code: 'same' };
    if (WX_SHENG[a] === b) return { label: a + '生' + b + '（我生）', score: 80, code: 'wo-sheng' };
    if (WX_SHENG[b] === a) return { label: b + '生' + a + '（生我）', score: 84, code: 'sheng-wo' };
    if (WX_KE[a] === b) return { label: a + '克' + b + '（我克）', score: 62, code: 'wo-ke' };
    if (WX_KE[b] === a) return { label: b + '克' + a + '（克我）', score: 58, code: 'ke-wo' };
    return { label: '中性', score: 65, code: 'neutral' };
  }

  // ---------------- 1) 年命纳音（权重 30，古法合婚首要参考） ----------------
  function dimNaYin(A, B) {
    var aB = baziOf(A.bazi), bB = baziOf(B.bazi);
    var aN = nayinOf(aB), bN = nayinOf(bB);
    var aG = (A.gender || '男') === '男';
    var s = 62, label = '年命资料不足，按中性计', code = 'unknown';
    if (aN.wx && bN.wx) {
      if (aN.wx === bN.wx) { s = 74; label = '同属' + aN.wx + '（比和）'; code = 'same'; }
      else if (WX_SHENG[aN.wx] === bN.wx) { s = 88; label = 'A 命' + aN.wx + ' 生 B 命' + bN.wx; code = 'sheng'; }
      else if (WX_SHENG[bN.wx] === aN.wx) { s = 86; label = 'B 命' + bN.wx + ' 生 A 命' + aN.wx; code = 'sheng'; }
      else if (WX_KE[aN.wx] === bN.wx) {
        // 「上克下，有福」——男命纳音克女命纳音，古法不作大凶，但也不给高分
        if (aG) { s = 66; label = '男命' + aN.wx + ' 克 女命' + bN.wx + '（上克下，古谓有福）'; code = 'ke-male'; }
        else { s = 56; label = '女命' + aN.wx + ' 克 男命' + bN.wx; code = 'ke-female'; }
      } else if (WX_KE[bN.wx] === aN.wx) {
        if (!aG) { s = 66; label = '女命' + bN.wx + ' 克 男命' + aN.wx + '（上克下，古谓有福）'; code = 'ke-female'; }
        else { s = 56; label = '男命' + aN.wx + ' 克 女命' + bN.wx; code = 'ke-male'; }
      }
    }
    return {
      key: 'nayin', label: '年命纳音', weight: 30, score: clamp(s), scoreA: clamp(s), scoreB: clamp(s),
      verdict: s >= 84 ? '相生' : (s >= 70 ? '比和' : (s >= 60 ? '有制衡' : '相克')),
      detail: 'A 年命' + (aN.name || '—') + ' × B 年命' + (bN.name || '—') + '：' + label,
      evidence: [{ rule: 'nayin', text: label, delta: s - 62 }]
    };
  }

  // ---------------- 2) 年支生肖（权重 15） ----------------
  function dimShengXiao(A, B) {
    var rel = zhiRelation(yearZhiOf(baziOf(A.bazi)), yearZhiOf(baziOf(B.bazi)));
    return {
      key: 'shengxiao', label: '年支·生肖', weight: 15, score: clamp(rel.score), scoreA: clamp(rel.score), scoreB: clamp(rel.score),
      verdict: (rel.type === '六合' || rel.type === '三合' || rel.type === '三会') ? '相合' : (rel.type === '冲' ? '相冲' : (rel.type === '平' ? '平和' : '有刑害')),
      detail: 'A 年支 ' + (yearZhiOf(baziOf(A.bazi)) || '—') + ' × B 年支 ' + (yearZhiOf(baziOf(B.bazi)) || '—') + '：' + rel.label,
      evidence: [{ rule: 'year-zhi', text: rel.label, delta: rel.score - 70 }]
    };
  }

  // ---------------- 3) 日主·十神（权重 20） ----------------
  function dimDayMaster(A, B) {
    var aB = baziOf(A.bazi), bB = baziOf(B.bazi);
    var aG = dayGanOf(aB), bG = dayGanOf(bB);
    var aW = dayWxOf(aB), bW = dayWxOf(bB);
    var ev = [], s = 65;
    var rel = wxRelation(aW, bW);
    s += rel.score - 65;
    ev.push({ rule: 'day-wx', text: '日主 ' + (aG || '—') + '(' + (aW || '—') + ') × ' + (bG || '—') + '(' + (bW || '—') + ')：' + rel.label, delta: rel.score - 65 });

    if (pairHit(GAN_HE, aG, bG)) { s += 12; ev.push({ rule: 'gan-he', text: '日干' + aG + bG + '天干五合，主相互吸引', delta: 12 }); }
    else if (pairHit(GAN_CHONG, aG, bG)) { s -= 8; ev.push({ rule: 'gan-chong', text: '日干' + aG + bG + '天干相冲，主立场易对立', delta: -8 }); }

    // 夫妻星互见：男以财为妻、女以官为夫——《三命通会·论六亲》
    var aMale = (A.gender || '男') === '男';
    var aSpouseWx = aMale ? WX_KE[aW] : inverseKe(aW); // 男：我克者为财；女：克我者为官
    var bSpouseWx = ((B.gender || '女') === '男') ? WX_KE[bW] : inverseKe(bW);
    if (aSpouseWx && aSpouseWx === bW) { s += 6; ev.push({ rule: 'spouse-star-a', text: 'B 日主' + bW + '正合 A 的' + (aMale ? '妻星（财）' : '夫星（官）'), delta: 6 }); }
    if (bSpouseWx && bSpouseWx === aW) { s += 6; ev.push({ rule: 'spouse-star-b', text: 'A 日主' + aW + '正合 B 的' + (((B.gender || '女') === '男') ? '妻星（财）' : '夫星（官）'), delta: 6 }); }

    var score = clamp(s);
    return {
      key: 'rizhu', label: '日主·十神', weight: 20, score: score, scoreA: clamp(s), scoreB: clamp(s),
      verdict: score >= 80 ? '相投' : (score >= 68 ? '尚可' : (score >= 58 ? '需磨合' : '张力大')),
      detail: 'A 日主 ' + (aG || '—') + '（' + (aW || '—') + '） × B 日主 ' + (bG || '—') + '（' + (bW || '—') + '）：' + rel.label,
      evidence: ev
    };
  }
  // 克我者：反查 WX_KE；无解时返回空
  function inverseKe(wx) {
    if (!wx) return '';
    for (var i = 0; i < WX_ALL.length; i++) { if (WX_KE[WX_ALL[i]] === wx) return WX_ALL[i]; }
    return '';
  }

  // ---------------- 4) 夫妻宫（日支，权重 20） ----------------
  function dimSpousePalace(A, B) {
    var rel = zhiRelation(dayZhiOf(baziOf(A.bazi)), dayZhiOf(baziOf(B.bazi)));
    var ev = [{ rule: 'ri-zhi', text: '日支（配偶宫）' + (dayZhiOf(baziOf(A.bazi)) || '—') + ' × ' + (dayZhiOf(baziOf(B.bazi)) || '—') + '：' + rel.label, delta: rel.score - 70 }];
    var score = clamp(rel.score);
    return {
      key: 'fugong', label: '夫妻宫（日支）', weight: 20, score: score, scoreA: score, scoreB: score,
      verdict: score >= 82 ? '相契' : (score >= 68 ? '平稳' : (score >= 56 ? '需磨合' : '易生波折')),
      detail: 'A 日支 ' + (dayZhiOf(baziOf(A.bazi)) || '—') + ' × B 日支 ' + (dayZhiOf(baziOf(B.bazi)) || '—') + '：' + rel.label,
      evidence: ev
    };
  }

  // ---------------- 5) 夫星/妻星得地（权重 15） ----------------
  function dimSpouseStar(A, B) {
    var aS = spouseStarStat(baziOf(A.bazi), A.gender || '男');
    var bS = spouseStarStat(baziOf(B.bazi), B.gender || '女');
    function scoreOf(st) { return st.total >= 3 ? 88 : (st.total === 2 ? 82 : (st.total === 1 ? 74 : 62)); }
    var aScore = scoreOf(aS), bScore = scoreOf(bS);
    var score = clamp((aScore + bScore) / 2);
    return {
      key: 'fuxing', label: '夫星/妻星得地', weight: 15, score: score, scoreA: aScore, scoreB: bScore,
      verdict: score >= 80 ? '得地' : (score >= 70 ? '有根' : '偏弱'),
      detail: 'A（' + (A.gender || '男') + '）' + aS.star + ' ' + aS.total + ' 见；B（' + (B.gender || '女') + '）' + bS.star + ' ' + bS.total + ' 见。' +
        '古法女命重夫星得地、男命重妻星得地，此处按四柱天干与藏干合计。',
      evidence: [{ rule: 'spouse-star-count', text: 'A ' + aS.total + ' 见 / B ' + bS.total + ' 见', delta: score - 70 }]
    };
  }

  // 置信度：数据完整度
  function confidenceOf(aB, bB) {
    var c = 58;
    if (!aB || !bB) return { level: '低', score: 35, note: '八字资料不足，结论仅供参考' };
    if (!aB.unknownHour) c += 12;
    if (!bB.unknownHour) c += 12;
    if (aB.naYin && bB.naYin) c += 8;
    c = clamp(c);
    var level = c >= 82 ? '高' : (c >= 68 ? '中高' : (c >= 55 ? '中' : '低'));
    return {
      level: level, score: c,
      note: level === '高' ? '双方时辰与年命完整，结论稳定性较好' : '部分信息缺失（时辰未知/年命缺失），结论波动较大'
    };
  }

  // 当下时机：实时盘（若有）＋双方当前大运流年
  function timingOf(A, B, realtime, aB, bB) {
    var parts = [];
    var rtScores = [];
    (realtime || []).forEach(function (item) {
      if (!item || !item.name) return;
      var p = item.result && item.result.plain ? item.result.plain : (item.plain || null);
      var tend = p && p.tendency ? p.tendency : '';
      if (!tend || tend === '不可用') return;
      var map = { 宜主动: 84, 宜速决: 80, 宜沟通: 78, 宜观察: 70, 宜等待: 64, 宜谨慎: 50 };
      rtScores.push(map[tend] != null ? map[tend] : 65);
      parts.push(item.name + '：' + tend);
    });
    var rtScore = rtScores.length ? Math.round(rtScores.reduce(function (s, v) { return s + v; }, 0) / rtScores.length) : 62;
    [[aB, 'A'], [bB, 'B']].forEach(function (pair) {
      var bz = pair[0], who = pair[1];
      if (!bz) return;
      var ln = bz.liuNian;
      var cur = null;
      if (bz.daYun && bz.birthDate) {
        var age = new Date().getFullYear() - new Date(bz.birthDate).getFullYear() + 1;
        for (var i = 0; i < bz.daYun.length; i++) {
          var d = bz.daYun[i];
          if (age >= d.startAge && age <= d.endAge) { cur = d; break; }
        }
      }
      var seg = who + ' 当前';
      if (cur) seg += '走 ' + cur.gz + ' 运' + (cur.ganShen ? '（' + cur.ganShen + '）' : '');
      if (ln) seg += '，流年 ' + ln.gz;
      if (cur || ln) parts.push(seg);
    });
    if (!parts.length) parts.push('未起实时盘，仅按本命盘看，当下时机权重低');
    var advice;
    if (rtScore >= 78) advice = '当下盘面偏顺，适合把关系往前推一步，但仍以现实节奏为准。';
    else if (rtScore >= 62) advice = '当下属于平稳期，适合稳定互动、观察对方处理压力的方式，不必急着定性。';
    else advice = '当下盘面偏谨慎，近期易有情绪或外部干扰，建议降低对抗性话题，先做低压力相处。';
    return { score: rtScore, text: parts.join('；'), advice: advice };
  }

  function analyze(input) {
    input = input || {};
    var A = input.a || {}, B = input.b || {};
    var aB = baziOf(A.bazi), bB = baziOf(B.bazi);

    var dims = [
      dimNaYin(A, B),
      dimShengXiao(A, B),
      dimDayMaster(A, B),
      dimSpousePalace(A, B),
      dimSpouseStar(A, B)
    ];

    var total = 0, wsum = 0;
    dims.forEach(function (d) { total += d.score * d.weight; wsum += d.weight; });
    var score = Math.round(total / wsum);

    var level, levelTip;
    if (score >= 82) { level = '契合度较高'; levelTip = '纳音与日柱关系较顺，适合稳步推进、把现实条件谈清楚。'; }
    else if (score >= 72) { level = '可发展'; levelTip = '整体可用，但有一两处需要磨合的差异，宜慢不宜急。'; }
    else if (score >= 62) { level = '中等偏稳'; levelTip = '基础尚可，重点在主动经营与明确边界，别靠默契硬撑。'; }
    else if (score >= 52) { level = '需磨合'; levelTip = '差异集中在部分维度，建议先观察真实互动质量，再决定投入程度。'; }
    else { level = '挑战较多'; levelTip = '关键维度张力较大，建议给关系留出更长的观察期，避免在情绪高点做决定。'; }

    var highlights = [], risks = [];
    dims.forEach(function (d) {
      if (d.score >= 80) highlights.push(d.label + '：' + d.verdict + '（' + d.score + '）');
      if (d.score < 60) risks.push(d.label + '：' + d.verdict + '（' + d.score + '）— ' + d.detail);
    });

    var adviceMap = {
      nayin: '年命纳音相克时，古法主张用共同喜用的方位、颜色与居住环境来调和；不必因此否定关系。',
      shengxiao: '年支有冲刑时，给彼此留独立空间，重要决定不要正面硬碰。',
      rizhu: '日主张力偏大时，先约定「怎么吵、多久和好」的规则，别在情绪高点做判断。',
      fugong: '夫妻宫偏弱时，把期待说清楚，比让对方猜更有效；避免用冷处理当答案。',
      fuxing: '夫星/妻星偏弱，不等于婚姻不好；古法只是提示「对关系的承载需要更多主动经营」。'
    };
    var adviceThreshold = { nayin: 70, shengxiao: 62, rizhu: 66, fugong: 64, fuxing: 70 };
    var advice = dims.filter(function (d) { return d.score < (adviceThreshold[d.key] || 64); })
      .map(function (d) { return adviceMap[d.key]; }).filter(Boolean);
    if (!advice.length) advice.push('整体较顺，重点把现实条件（节奏、金钱、家庭边界）谈清楚，而不是反复验证「合不合」。');
    advice.push('《三命通会》的合婚法只看年命、日柱与夫妻宫的关系倾向，不预测婚姻成败；最终看双方的意愿与行动。');

    var conf = confidenceOf(aB, bB);
    var timing = timingOf(A, B, input.realtime, aB, bB);
    var aZ = ziweiRes(A.ziwei), bZ = ziweiRes(B.ziwei);

    var summaryText = [
      '## 合婚合盘分析（《三命通会》法，规则引擎，非命定结论）',
      '综合契合度：' + score + '/100（' + level + '）',
      '数据置信度：' + conf.level + '（' + conf.score + '）—— ' + conf.note,
      '测试时间：' + (input.testTime ? String(input.testTime) : '—'),
      '五维评分：'
    ].concat(dims.map(function (d) {
      return '- ' + d.label + '（权重' + d.weight + '%）：' + d.score + '，' + d.verdict + '；' + d.detail;
    })).concat([
      '优势：' + (highlights.join('；') || '无明显高分项'),
      '风险：' + (risks.join('；') || '无明显低分项'),
      '当下时机：' + timing.text,
      '时机建议：' + timing.advice,
      '方法说明：年命纳音（古法合婚首要）、年支生肖、日主十神、夫妻宫（日支）、夫星/妻星得地五项加权；紫微仅作旁参，不计分。'
    ]).join('\n');

    return {
      method: 'sanmingtonghui',
      score: score, level: level, levelTip: levelTip,
      confidence: conf, timing: timing,
      dimensions: dims, highlights: highlights, risks: risks, advice: advice,
      summaryText: summaryText,
      meta: {
        aNayin: nayinOf(aB), bNayin: nayinOf(bB),
        aDayGan: dayGanOf(aB), bDayGan: dayGanOf(bB),
        aDayZhi: dayZhiOf(aB), bDayZhi: dayZhiOf(bB),
        aYearZhi: yearZhiOf(aB), bYearZhi: yearZhiOf(bB),
        aSpouseStars: spouseStarsOf(aZ), bSpouseStars: spouseStarsOf(bZ)
      }
    };
  }

  // 紫微夫妻宫主星（仅作旁参展示，不计分）
  function spouseStarsOf(ziwei) {
    if (!ziwei || !ziwei.astrolabe || !Array.isArray(ziwei.astrolabe.palaces)) return [];
    for (var i = 0; i < ziwei.astrolabe.palaces.length; i++) {
      var p = ziwei.astrolabe.palaces[i];
      if (p.name === '夫妻') return (p.majorStars || []).map(function (s) { return s.name; }).filter(Boolean);
    }
    return [];
  }

  global.HeHun = { analyze: analyze, zhiRelation: zhiRelation, GAN_HE: GAN_HE, GAN_CHONG: GAN_CHONG };
})(typeof window !== 'undefined' ? window : globalThis);
