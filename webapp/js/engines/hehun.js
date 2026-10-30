// hehun.js — 合婚合盘本地规则引擎（重做版）
//
// 设计参考（均为开源项目，仅借鉴思路与权重，未整库搬运）：
//   · Ficere/tianji（MIT）           —— 百分制骨架：逐维得分、双向均值、置信度、分档评级
//   · Jabberwocky238/bazi（无声明）  —— 喜用神双向计分：基线 50，用神/喜神/调候/通关/忌神加减，跨盘合冲刑害克
//   · xuemian168/bazi-skill（Apache-2.0）—— 维度顺序与权重：日主/五行喜用/日支夫妻宫/年支/紫微/其他
//   · SylarLong/iztro（MIT）         —— 紫微事实层：命宫、夫妻宫主星、生年四化（由 shushu.js 提供）
//
// 原则：只描述关系倾向与互动模式，不下婚姻结论；分数是相对参考，不是命定。
// 输出结构对上层页面保持兼容：score / level / levelTip / dimensions / highlights / risks / advice / summaryText / meta
// 新增：scoreA / scoreB（双向得分）、confidence、timing、每维 evidence（可解释、可回归）。
(function (global) {
  'use strict';

  var STEM_WX = { 甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水' };
  var WX_SHENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
  var WX_KE = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };
  var WX_ALL = ['金', '木', '水', '火', '土'];

  // 天干五合 / 相冲
  var GAN_HE = ['甲己', '乙庚', '丙辛', '丁壬', '戊癸'];
  var GAN_CHONG = ['甲庚', '乙辛', '丙壬', '丁癸'];

  // 地支关系
  var ZHI_HE = ['子丑', '寅亥', '卯戌', '辰酉', '巳申', '午未'];
  var ZHI_SANHE = [['申', '子', '辰'], ['寅', '午', '戌'], ['巳', '酉', '丑'], ['亥', '卯', '未']];
  var ZHI_SANHUI = [['寅', '卯', '辰'], ['巳', '午', '未'], ['申', '酉', '戌'], ['亥', '子', '丑']];
  var ZHI_CHONG = ['子午', '丑未', '寅申', '卯酉', '辰戌', '巳亥'];
  var ZHI_HAI = ['子未', '丑午', '寅巳', '卯辰', '申亥', '酉戌'];
  var ZHI_XING = ['子卯', '寅巳', '巳申', '寅申', '丑戌', '戌未', '丑未'];
  var ZHI_PO = ['子酉', '寅亥', '卯午', '辰丑', '巳申', '未戌'];

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
  var SHA_LIST = ['擎羊', '陀罗', '火星', '铃星', '地空', '地劫'];

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

  // 地支关系（合 > 三合 > 三会 > 平 > 破 > 刑 > 害 > 冲）
  function zhiRelation(a, b) {
    if (!a || !b) return { type: '未知', label: '地支资料不足', score: 62 };
    if (pairHit(ZHI_HE, a, b)) return { type: '六合', label: a + b + '六合', score: 90 };
    var sg = groupHit(ZHI_SANHE, a, b);
    if (sg) return { type: '三合', label: a + b + '三合' + sg.join(''), score: 85 };
    var sh = groupHit(ZHI_SANHUI, a, b);
    if (sh) return { type: '三会', label: a + b + '三会' + sh.join(''), score: 82 };
    if (pairHit(ZHI_PO, a, b)) return { type: '破', label: a + b + '相破', score: 58 };
    if (pairHit(ZHI_XING, a, b)) return { type: '刑', label: a + b + '相刑', score: 56 };
    if (pairHit(ZHI_HAI, a, b)) return { type: '害', label: a + b + '相害', score: 55 };
    if (pairHit(ZHI_CHONG, a, b)) return { type: '冲', label: a + b + '相冲', score: 45 };
    return { type: '平', label: a + b + '平和', score: 65 };
  }

  function starGroup(name) { return STAR_GROUP[name] || ''; }

  function baziOf(x) { return x ? (x.result || x) : null; }
  function ziweiRes(x) {
    if (!x) return null;
    var r = x.result || x;
    return r && r.astrolabe ? r : null;
  }

  function yearPillar(bazi) {
    return bazi && bazi.pillars && bazi.pillars[0] ? bazi.pillars[0] : null;
  }
  function dayPillar(bazi) {
    return bazi && bazi.pillars && bazi.pillars[2] ? bazi.pillars[2] : null;
  }
  function yearZhiOf(bazi) { var p = yearPillar(bazi); return p ? p.zhi : ''; }
  function yearGanOf(bazi) { var p = yearPillar(bazi); return p ? p.gan : ''; }
  function dayZhiOf(bazi) { var p = dayPillar(bazi); return p ? p.zhi : ''; }
  function dayGanOf(bazi) { return bazi ? bazi.dayGan || (dayPillar(bazi) || {}).gan || '' : ''; }
  function dayWxOf(bazi) { return bazi ? (bazi.dayWx || STEM_WX[dayGanOf(bazi)] || '') : ''; }

  // 紫微：命宫 / 夫妻宫主星、四化、三方四正
  function palaceOf(ziwei, name) {
    if (!ziwei || !ziwei.astrolabe || !Array.isArray(ziwei.astrolabe.palaces)) return null;
    for (var i = 0; i < ziwei.astrolabe.palaces.length; i++) {
      if (ziwei.astrolabe.palaces[i].name === name) return ziwei.astrolabe.palaces[i];
    }
    return null;
  }
  function starNames(p) {
    if (!p) return [];
    return (p.majorStars || []).map(function (s) { return s.name; }).filter(Boolean);
  }
  function spouseStars(ziwei) { return starNames(palaceOf(ziwei, '夫妻')); }
  function mingStars(ziwei) { return starNames(palaceOf(ziwei, '命宫')); }
  function firstMajor(ziwei) { var s = mingStars(ziwei); return s.length ? s[0] : ''; }
  function palaceShaCount(ziwei, palaceName) {
    var p = palaceOf(ziwei, palaceName);
    if (!p) return 0;
    var all = (p.minorStars || []).map(function (s) { return s.name; });
    var n = 0;
    all.forEach(function (x) { if (SHA_LIST.indexOf(x) >= 0) n++; });
    return n;
  }
  function siHuaOf(ziwei) {
    if (!ziwei || !ziwei.siHua) return null;
    return { lu: ziwei.siHua.化禄, quan: ziwei.siHua.化权, ke: ziwei.siHua.化科, ji: ziwei.siHua.化忌 };
  }

  function wxRelation(a, b) {
    if (!a || !b) return { label: '五行资料不足', score: 62, code: 'unknown' };
    if (a === b) return { label: '同属' + a + '（比和）', score: 72, code: 'same' };
    if (WX_SHENG[a] === b) return { label: a + '生' + b + '（我生）', score: 82, code: 'wo-sheng' };
    if (WX_SHENG[b] === a) return { label: b + '生' + a + '（生我）', score: 86, code: 'sheng-wo' };
    if (WX_KE[a] === b) return { label: a + '克' + b + '（我克）', score: 58, code: 'wo-ke' };
    if (WX_KE[b] === a) return { label: b + '克' + a + '（克我）', score: 54, code: 'ke-wo' };
    return { label: '中性', score: 65, code: 'neutral' };
  }

  // 夫妻星：男命以财（我克）为妻星，女命以官（克我）为夫星
  function spouseStarWx(gender, myWx) {
    if (!myWx) return '';
    if (gender === '男') return WX_KE[myWx];
    for (var i = 0; i < WX_ALL.length; i++) { if (WX_KE[WX_ALL[i]] === myWx) return WX_ALL[i]; }
    return '';
  }

  // 巨细：五行在某盘中的"有/无/旺"
  function wxPresence(bazi, wx) {
    if (!bazi || !wx) return 0;
    var c = (bazi.wxCountAll || {})[wx];
    return typeof c === 'number' ? c : 0;
  }

  // ---------------- 1) 日主 · 十神（权重 18） ----------------
  function dimDayMaster(A, B) {
    var aB = baziOf(A.bazi), bB = baziOf(B.bazi);
    var aG = dayGanOf(aB), bG = dayGanOf(bB);
    var aW = dayWxOf(aB), bW = dayWxOf(bB);
    var ev = [];
    var s = 50;

    if (pairHit(GAN_HE, aG, bG)) { s += 18; ev.push({ rule: 'gan-he', text: '日干' + aG + bG + '天干五合，主相互吸引、易生默契', delta: 18 }); }
    else if (pairHit(GAN_CHONG, aG, bG)) { s -= 10; ev.push({ rule: 'gan-chong', text: '日干' + aG + bG + '天干相冲，主立场易对立', delta: -10 }); }

    var rel = wxRelation(aW, bW);
    if (rel.code === 'wo-sheng') { s += 10; ev.push({ rule: 'wx-wosheng', text: '日主' + aW + '生对方' + bW + '，付出型互动', delta: 10 }); }
    else if (rel.code === 'sheng-wo') { s += 12; ev.push({ rule: 'wx-shengwo', text: '对方' + bW + '生日主' + aW + '，易得照顾', delta: 12 }); }
    else if (rel.code === 'same') { s += 4; ev.push({ rule: 'wx-same', text: '双方日主同属' + aW + '，比和但易各执己见', delta: 4 }); }
    else if (rel.code === 'wo-ke') { s -= 6; ev.push({ rule: 'wx-woke', text: '日主' + aW + '克对方' + bW + '，主导欲较强', delta: -6 }); }
    else if (rel.code === 'ke-wo') { s -= 8; ev.push({ rule: 'wx-kewo', text: '对方' + bW + '克日主' + aW + '，易有压力感', delta: -8 }); }

    // 夫妻星：对方日主是否落在我的财/官星
    var aStar = spouseStarWx(A.gender || '男', aW);
    var bStar = spouseStarWx(B.gender || '女', bW);
    if (aStar && aStar === bW) { s += 8; ev.push({ rule: 'spouse-star-a', text: 'B 日主' + bW + '正合 A 命' + (A.gender === '女' ? '官' : '财') + '星，属传统婚配吉象', delta: 8 }); }
    if (bStar && bStar === aW) { s += 8; ev.push({ rule: 'spouse-star-b', text: 'A 日主' + aW + '正合 B 命' + (B.gender === '女' ? '官' : '财') + '星', delta: 8 }); }

    // 日主强弱互补
    if (aB && bB && typeof aB.dayStrong === 'boolean' && typeof bB.dayStrong === 'boolean') {
      if (aB.dayStrong !== bB.dayStrong) { s += 5; ev.push({ rule: 'strength-balance', text: '一强一弱，互补性较好', delta: 5 }); }
      else { s -= 3; ev.push({ rule: 'strength-same', text: '双方强弱相近，各自坚持需留意', delta: -3 }); }
    }

    var score = clamp(s);
    return {
      key: 'day', label: '日主·十神', weight: 18, score: score,
      scoreA: clamp(s), scoreB: clamp(s),
      verdict: score >= 80 ? '相投' : (score >= 68 ? '尚可' : (score >= 58 ? '需磨合' : '张力大')),
      detail: 'A 日主 ' + (aG || '—') + (aW ? '（' + aW + '）' : '') + ' × B 日主 ' + (bG || '—') + (bW ? '（' + bW + '）' : '') + '：' + rel.label + (ev.length ? '；' + ev[ev.length - 1].text : ''),
      evidence: ev
    };
  }

  // ---------------- 2) 五行喜用互补（权重 22，双向计分） ----------------
  function oneWayHelp(giver, taker) {
    // 返回 { score: 0-100, ev: [] }：giver 局能给 taker 补多少
    if (!giver || !taker) return { score: 50, ev: [] };
    var ev = [], s = 50;
    var yong = String(taker.yongShen || '').match(/[金木水火土]/);
    var yongWx = yong ? yong[0] : '';
    if (yongWx) {
      var n = wxPresence(giver, yongWx);
      if (n > 0) { s += 12; ev.push({ rule: 'yong-shen', text: '对方用神' + yongWx + '在其局中x' + n + '，补益明显', delta: 12 }); }
      else { s -= 4; ev.push({ rule: 'yong-miss', text: '对方用神' + yongWx + '在其局中缺位', delta: -4 }); }
    }
    var xi = (taker.xiJi && taker.xiJi.xi) || [];
    xi.slice(0, 2).forEach(function (w) {
      if (wxPresence(giver, w) > 0) { s += 6; ev.push({ rule: 'xi-shen', text: '对方喜神' + w + '在其局中出现', delta: 6 }); }
    });
    var ji = (taker.xiJi && taker.xiJi.ji) || [];
    var giverDayWx = dayWxOf(giver);
    if (giverDayWx && ji.indexOf(giverDayWx) >= 0) {
      s -= 4; ev.push({ rule: 'ji-shen', text: '其日主' + giverDayWx + '属对方忌神', delta: -4 });
    }
    return { score: clamp(s), ev: ev };
  }
  function tongGuanScore(aB, bB) {
    // 双方日主相克时，若各自局中有"通关"五行，则缓和
    var aW = dayWxOf(aB), bW = dayWxOf(bB);
    if (!aW || !bW) return { delta: 0, note: '' };
    var mid = '';
    if (WX_KE[aW] === bW) mid = WX_SHENG[aW];      // A 克 B，A→mid→B
    else if (WX_KE[bW] === aW) mid = WX_SHENG[bW];
    if (!mid) return { delta: 0, note: '' };
    var has = wxPresence(aB, mid) > 0 || wxPresence(bB, mid) > 0;
    return has
      ? { delta: 7, note: '双方日主相克，但局中有' + mid + '通关，可转化为推动力' }
      : { delta: 0, note: '双方日主相克且缺' + mid + '通关，摩擦较直接' };
  }
  function dimWuXing(A, B) {
    var aB = baziOf(A.bazi), bB = baziOf(B.bazi);
    var ra = oneWayHelp(aB, bB); // A 补 B
    var rb = oneWayHelp(bB, aB); // B 补 A
    var tg = tongGuanScore(aB, bB);
    var scoreA = clamp(ra.score + (tg.delta ? tg.delta * 0.5 : 0));
    var scoreB = clamp(rb.score + (tg.delta ? tg.delta * 0.5 : 0));
    var score = clamp((scoreA + scoreB) / 2 + (tg.delta ? 2 : 0));
    var ev = [];
    ra.ev.forEach(function (e) { ev.push(Object.assign({}, e, { who: 'A→B' })); });
    rb.ev.forEach(function (e) { ev.push(Object.assign({}, e, { who: 'B→A' })); });
    if (tg.note) ev.push({ rule: 'tong-guan', text: tg.note, delta: tg.delta });
    return {
      key: 'wx', label: '五行喜用', weight: 22, score: score, scoreA: scoreA, scoreB: scoreB,
      verdict: score >= 78 ? '互补' : (score >= 62 ? '尚可' : '偏耗'),
      detail: 'A 补 B ' + scoreA + ' 分；B 补 A ' + scoreB + ' 分。A 用神「' + ((aB && aB.yongShen) || '—') + '」，B 用神「' + ((bB && bB.yongShen) || '—') + '」' + (tg.note ? '；' + tg.note : ''),
      evidence: ev
    };
  }

  // ---------------- 3) 夫妻宫（权重 20） ----------------
  function dimSpouse(A, B) {
    var aB = baziOf(A.bazi), bB = baziOf(B.bazi);
    var aZ = ziweiRes(A.ziwei), bZ = ziweiRes(B.ziwei);
    var rel = zhiRelation(dayZhiOf(aB), dayZhiOf(bB));
    var aSp = spouseStars(aZ), bSp = spouseStars(bZ);
    var aG = starGroup(aSp[0]), bG = starGroup(bSp[0]);
    var starScore = 62, starNote = '夫妻宫无主星或资料不足，按中性计';
    if (aG && bG) {
      starScore = GROUP_MATRIX[aG][bG];
      starNote = 'A 夫妻宫 ' + aSp[0] + '（' + aG + '型） × B 夫妻宫 ' + bSp[0] + '（' + bG + '型）';
    }
    var ev = [{ rule: 'ri-zhi', text: '日支（配偶宫）' + (dayZhiOf(aB) || '—') + ' × ' + (dayZhiOf(bB) || '—') + '：' + rel.label, delta: rel.score - 65 }];
    if (aG && bG) ev.push({ rule: 'spouse-star-group', text: starNote, delta: starScore - 60 });

    // 夫妻宫化忌 / 煞星：影响各自婚姻宫的稳定度
    var penalty = 0;
    [aZ, bZ].forEach(function (z, i) {
      var who = i === 0 ? 'A' : 'B';
      var p = palaceOf(z, '夫妻');
      if (!p) return;
      var hasJi = (p.majorStars || []).some(function (s) { return s.mutagen === '忌'; });
      if (hasJi) { penalty += 6; ev.push({ rule: 'spouse-ji', text: who + '夫妻宫主星化忌，婚姻议题较敏感', delta: -6 }); }
      var sha = palaceShaCount(z, '夫妻');
      if (sha >= 2) { penalty += 4; ev.push({ rule: 'spouse-sha', text: who + '夫妻宫煞星 ' + sha + ' 颗，易有反复', delta: -4 }); }
    });

    var score = clamp(rel.score * 0.65 + starScore * 0.35 - penalty);
    return {
      key: 'spouse', label: '夫妻宫', weight: 20, score: score, scoreA: score, scoreB: score,
      verdict: score >= 80 ? '相契' : (score >= 64 ? '平稳' : (score >= 52 ? '需磨合' : '易生波折')),
      detail: '日支 A ' + (dayZhiOf(aB) || '—') + ' × B ' + (dayZhiOf(bB) || '—') + '：' + rel.label + '；' + starNote + (penalty ? '；已计入夫妻宫化忌/煞星扣分 ' + penalty + ' 分' : ''),
      evidence: ev
    };
  }

  // ---------------- 4) 年支 · 生肖（权重 8） ----------------
  function dimYear(A, B) {
    var aB = baziOf(A.bazi), bB = baziOf(B.bazi);
    var rel = zhiRelation(yearZhiOf(aB), yearZhiOf(bB));
    var score = clamp(rel.score + 0); // 年支基础关系
    return {
      key: 'year', label: '年支·生肖', weight: 8, score: score, scoreA: score, scoreB: score,
      verdict: rel.type === '六合' || rel.type === '三合' || rel.type === '三会' ? '相合' : (rel.type === '冲' ? '相冲' : (rel.type === '平' ? '平和' : '有刑害')),
      detail: 'A 年支 ' + (yearZhiOf(aB) || '—') + ' × B 年支 ' + (yearZhiOf(bB) || '—') + '：' + rel.label,
      evidence: [{ rule: 'year-zhi', text: rel.label, delta: rel.score - 65 }]
    };
  }

  // ---------------- 5) 紫微性格与四化（权重 17） ----------------
  function siHuaCross(aZ, bZ) {
    var ev = [], delta = 0;
    var aH = siHuaOf(aZ), bH = siHuaOf(bZ);
    if (!aH || !bH) return { delta: 0, ev: ev };
    var aMing = mingStars(aZ), aSp = spouseStars(aZ);
    var bMing = mingStars(bZ), bSp = spouseStars(bZ);
    if (aH.lu && bMing.indexOf(aH.lu) >= 0) { delta += 8; ev.push({ rule: 'sihua-lu', text: 'A 化禄星' + aH.lu + '正坐 B 命宫，天然亲近', delta: 8 }); }
    if (bH.lu && aMing.indexOf(bH.lu) >= 0) { delta += 8; ev.push({ rule: 'sihua-lu', text: 'B 化禄星' + bH.lu + '正坐 A 命宫', delta: 8 }); }
    if (aH.ji && bMing.indexOf(aH.ji) >= 0) { delta -= 8; ev.push({ rule: 'sihua-ji', text: 'A 化忌星' + aH.ji + '落 B 命宫，易成执念点', delta: -8 }); }
    if (bH.ji && aMing.indexOf(bH.ji) >= 0) { delta -= 8; ev.push({ rule: 'sihua-ji', text: 'B 化忌星' + bH.ji + '落 A 命宫', delta: -8 }); }
    if (aH.quan && bSp.indexOf(aH.quan) >= 0) { delta += 4; ev.push({ rule: 'sihua-quan', text: 'A 化权星入 B 夫妻宫，助力关系', delta: 4 }); }
    if (bH.ke && aSp.indexOf(bH.ke) >= 0) { delta += 4; ev.push({ rule: 'sihua-ke', text: 'B 化科星入 A 夫妻宫', delta: 4 }); }
    return { delta: delta, ev: ev };
  }
  function dimZiwei(A, B) {
    var aZ = ziweiRes(A.ziwei), bZ = ziweiRes(B.ziwei);
    var aMain = firstMajor(aZ), bMain = firstMajor(bZ);
    var aMainG = starGroup(aMain), bMainG = starGroup(bMain);
    var mScore = 62, mNote = '命宫主星资料不足，按中性计';
    if (aMainG && bMainG) {
      mScore = GROUP_MATRIX[aMainG][bMainG];
      mNote = 'A 命宫 ' + aMain + '（' + aMainG + '型） × B 命宫 ' + bMain + '（' + bMainG + '型）';
    }
    var aSp = spouseStars(aZ), bSp = spouseStars(bZ);
    var aSG = starGroup(aSp[0]), bSG = starGroup(bSp[0]);
    var spScore = 62;
    if (aSG && bSG) spScore = GROUP_MATRIX[aSG][bSG];
    var cross = siHuaCross(aZ, bZ);
    // 命宫三方四正煞星多，稳定性打折
    var shaA = palaceShaCount(aZ, '命宫'), shaB = palaceShaCount(bZ, '命宫');
    var shaPenalty = (shaA >= 2 ? 3 : 0) + (shaB >= 2 ? 3 : 0);

    var score = clamp(60 + (mScore - 60) * 0.5 + (spScore - 60) * 0.25 + cross.delta - shaPenalty);
    var ev = [{ rule: 'ming-star-group', text: mNote, delta: (mScore - 60) * 0.5 }]
      .concat(cross.ev)
      .concat(shaPenalty ? [{ rule: 'ming-sha', text: '命宫三方四正煞星偏多，稳定性略降', delta: -shaPenalty }] : []);
    return {
      key: 'star', label: '紫微性格', weight: 17, score: score, scoreA: score, scoreB: score,
      verdict: score >= 80 ? '投契' : (score >= 68 ? '可相处' : (score >= 56 ? '差异明显' : '易冲突')),
      detail: mNote + (cross.ev.length ? '；' + cross.ev.map(function (e) { return e.text; }).join('；') : '') + (shaPenalty ? '；命宫煞星扣 ' + shaPenalty + ' 分' : ''),
      evidence: ev
    };
  }

  // ---------------- 6) 纳音 · 命宫（权重 5） ----------------
  function naYinWx(bazi, key) {
    var n = bazi && bazi.naYin && bazi.naYin[key];
    if (!n) return '';
    var m = String(n).match(/[金木水火土]/g);
    return m && m.length ? m[m.length - 1] : '';
  }
  function dimOther(A, B) {
    var aB = baziOf(A.bazi), bB = baziOf(B.bazi);
    var s = 60, ev = [];
    var aNY = naYinWx(aB, '年柱'), bNY = naYinWx(bB, '年柱');
    if (aNY && bNY) {
      var r = wxRelation(aNY, bNY);
      s += (r.score - 65) * 0.6;
      ev.push({ rule: 'nayin', text: '年柱纳音 ' + aNY + ' × ' + bNY + '：' + r.label, delta: round1((r.score - 65) * 0.6) });
    }
    var aMG = aB && aB.mingGong && aB.mingGong.zhi, bMG = bB && bB.mingGong && bB.mingGong.zhi;
    if (aMG && bMG) {
      var mr = zhiRelation(aMG, bMG);
      s += (mr.score - 65) * 0.4;
      ev.push({ rule: 'ming-gong', text: '命宫地支 ' + aMG + ' × ' + bMG + '：' + mr.label, delta: round1((mr.score - 65) * 0.4) });
    }
    if (!ev.length) ev.push({ rule: 'fallback', text: '纳音/命宫资料不足，按中性计', delta: 0 });
    var score = clamp(s);
    return {
      key: 'other', label: '纳音·命宫', weight: 5, score: score, scoreA: score, scoreB: score,
      verdict: score >= 75 ? '相助' : (score >= 58 ? '平常' : '相碍'),
      detail: ev.map(function (e) { return e.text; }).join('；'),
      evidence: ev
    };
  }

  // ---------------- 7) 实时盘（权重 10） ----------------
  function realtimeScore(realtime) {
    var map = { 宜主动: 84, 宜速决: 80, 宜沟通: 78, 宜观察: 70, 宜等待: 64, 宜谨慎: 50 };
    var parts = [], vals = [];
    (realtime || []).forEach(function (item) {
      if (!item || !item.name) return;
      var p = item.result && item.result.plain ? item.result.plain : (item.plain || null);
      var tend = p && p.tendency ? p.tendency : '';
      if (!tend || tend === '不可用') return;
      vals.push(map[tend] != null ? map[tend] : 65);
      parts.push(item.name + '：' + tend);
    });
    if (!vals.length) return { score: 62, label: '实时盘未起或不可用，本项按中性计', parts: [], count: 0 };
    var avg = Math.round(vals.reduce(function (s, v) { return s + v; }, 0) / vals.length);
    return { score: avg, label: parts.join('；'), parts: parts, count: vals.length };
  }
  function dimRealtime(realtime) {
    var rt = realtimeScore(realtime);
    return {
      key: 'realtime', label: '实时盘', weight: 10, score: rt.score, scoreA: rt.score, scoreB: rt.score,
      verdict: rt.score >= 78 ? '顺势' : (rt.score >= 62 ? '平稳' : '需谨慎'),
      detail: rt.label,
      evidence: [{ rule: 'realtime-tendency', text: rt.label, delta: rt.score - 65 }],
      _count: rt.count
    };
  }

  // 置信度：数据完整度越高越可信
  function confidenceOf(aB, bB, aZ, bZ, rtDim) {
    var c = 55;
    if (!aB || !bB) return { level: '低', score: 35, note: '八字资料不足，结论仅供参考' };
    if (!aB.unknownHour) c += 10;
    if (!bB.unknownHour) c += 10;
    if (aZ && bZ) c += 10;
    if (rtDim._count >= 2) c += 8;
    else if (rtDim._count === 1) c += 3;
    c = clamp(c);
    var level = c >= 82 ? '高' : (c >= 68 ? '中高' : (c >= 55 ? '中' : '低'));
    return { level: level, score: c, note: level === '高' ? '双方时辰与紫微盘完整，结论稳定性较好' : '部分信息缺失（时辰未知 / 紫微缺失），结论波动较大' };
  }

  // 当下时机：结合实时盘与双方当前大运流年
  function timingOf(A, B, realtime, aB, bB) {
    var parts = [];
    var rt = realtimeScore(realtime);
    if (rt.parts.length) parts.push('实时盘：' + rt.parts.join('；'));
    else parts.push('实时盘未起，仅按本命盘判断，当下时机权重低');

    [[aB, 'A'], [bB, 'B']].forEach(function (pair) {
      var bz = pair[0], who = pair[1];
      if (!bz) return;
      var ln = bz.liuNian;
      var cur = null;
      if (bz.daYun && bz.birthDate) {
        var age = new Date().getFullYear() - bz.birthDate.getFullYear() + 1;
        for (var i = 0; i < bz.daYun.length; i++) {
          var d = bz.daYun[i];
          if (age >= d.startAge && age <= d.endAge) { cur = d; break; }
        }
      }
      var seg = who + ' 当前';
      if (cur) seg += '走 ' + cur.gz + ' 运（' + (cur.ganShen || '') + '）';
      if (ln) seg += '，流年 ' + ln.gz + (ln.ganShen ? '（' + ln.ganShen + '）' : '');
      if (cur || ln) parts.push(seg);
    });

    var advice;
    if (rt.score >= 78) advice = '当下盘面偏顺，适合把关系往前推一步（明确关系、见家长、共同计划），但仍以现实节奏为准。';
    else if (rt.score >= 62) advice = '当下属于平稳期，适合稳定互动、观察对方处理压力的方式，不必急着定性。';
    else advice = '当下盘面偏谨慎，近期易有情绪或外部干扰，建议降低对抗性话题，先做低压力相处，等流月转顺再谈关键议题。';
    return { score: rt.score, text: parts.join('；'), advice: advice };
  }

  function round(n) { return clamp(n); }

  function analyze(input) {
    input = input || {};
    var A = input.a || {}, B = input.b || {};
    var aB = baziOf(A.bazi), bB = baziOf(B.bazi);
    var aZ = ziweiRes(A.ziwei), bZ = ziweiRes(B.ziwei);

    var dimRealtimeRes = dimRealtime(input.realtime);
    var dims = [
      dimDayMaster(A, B),
      dimWuXing(A, B),
      dimSpouse(A, B),
      dimYear(A, B),
      dimZiwei(A, B),
      dimOther(A, B),
      dimRealtimeRes
    ];

    var total = 0, wsum = 0;
    dims.forEach(function (d) { total += d.score * d.weight; wsum += d.weight; });
    var score = Math.round(total / wsum);

    var level, levelTip;
    if (score >= 82) { level = '契合度较高'; levelTip = '关系基础与互动模式较顺，适合稳步推进、把现实条件谈清楚。'; }
    else if (score >= 72) { level = '可发展'; levelTip = '整体可用，但有一两处需要磨合的差异，宜慢不宜急。'; }
    else if (score >= 62) { level = '中等偏稳'; levelTip = '基础尚可，重点在于主动经营与明确边界，别靠默契硬撑。'; }
    else if (score >= 52) { level = '需磨合'; levelTip = '差异集中在部分维度，建议先观察真实互动质量，再决定投入程度。'; }
    else { level = '挑战较多'; levelTip = '关键维度张力较大，建议给关系留出更长的观察期，避免在情绪高点做决定。'; }

    var highlights = [], risks = [];
    dims.forEach(function (d) {
      if (d.score >= 78) highlights.push(d.label + '：' + d.verdict + '（' + d.score + '）');
      if (d.score < 58) risks.push(d.label + '：' + d.verdict + '（' + d.score + '）— ' + d.detail);
    });

    var adviceMap = {
      day: '日主与十神张力偏大时，先约定「怎么吵、多久和好」的规则，别在情绪高点做判断。',
      wx: '五行互补不足时，多用双方共同喜用的方位、颜色、活动来补位，减少消耗。',
      spouse: '夫妻宫偏弱时，把期待说清楚，比让对方猜更有效；避免用冷处理当答案。',
      year: '年支有冲刑时，给彼此留独立空间，重要决定不要正面硬碰。',
      star: '性格族群差异大时，按「谁擅长谁主导」分工，别在对方不擅长的领域较劲。',
      other: '纳音/命宫略相碍，多在共同环境里建立稳定的相处仪式。',
      realtime: '实时盘偏谨慎时，近期不宜催定关系，先做些低压力、可观察的相处。'
    };
    var adviceThreshold = { day: 66, wx: 62, spouse: 64, year: 58, star: 68, other: 58, realtime: 62 };
    var advice = dims.filter(function (d) { return d.score < (adviceThreshold[d.key] || 62); })
      .map(function (d) { return adviceMap[d.key]; }).filter(Boolean);
    if (!advice.length) advice.push('整体较顺，重点放在把现实条件（节奏、金钱、家庭边界）谈清楚，而不是反复验证「合不合」。');
    advice.push('合婚评分是关系倾向的相对参考，不决定你们能不能在一起；最终看双方的意愿与行动。');

    var conf = confidenceOf(aB, bB, aZ, bZ, dimRealtimeRes);
    var timing = timingOf(A, B, input.realtime, aB, bB);

    var summaryText = [
      '## 合婚合盘分析（规则引擎，非命定结论）',
      '综合契合度：' + score + '/100（' + level + '）',
      '数据置信度：' + conf.level + '（' + conf.score + '）—— ' + conf.note,
      '测试时间：' + (input.testTime ? String(input.testTime) : '—'),
      '七维评分：'
    ].concat(dims.map(function (d) {
      return '- ' + d.label + '（权重' + d.weight + '%）：' + d.score + '，' + d.verdict + '；' + d.detail;
    }))
      .concat([
        '双向得分：A→B ' + Math.round(dims.reduce(function (s, d) { return s + d.scoreA * d.weight; }, 0) / wsum) +
        '；B→A ' + Math.round(dims.reduce(function (s, d) { return s + d.scoreB * d.weight; }, 0) / wsum),
        '优势：' + (highlights.join('；') || '无明显高分项'),
        '风险：' + (risks.join('；') || '无明显低分项'),
        '当下时机：' + timing.text,
        '时机建议：' + timing.advice
      ]).join('\n');

    return {
      score: score, level: level, levelTip: levelTip,
      confidence: conf, timing: timing,
      dimensions: dims, highlights: highlights, risks: risks, advice: advice,
      summaryText: summaryText,
      meta: {
        aMainStar: firstMajor(aZ), bMainStar: firstMajor(bZ),
        aSpouseStars: spouseStars(aZ), bSpouseStars: spouseStars(bZ),
        aDayZhi: dayZhiOf(aB), bDayZhi: dayZhiOf(bB),
        aYearZhi: yearZhiOf(aB), bYearZhi: yearZhiOf(bB),
        aDayGan: dayGanOf(aB), bDayGan: dayGanOf(bB),
        aDayWx: dayWxOf(aB), bDayWx: dayWxOf(bB)
      }
    };
  }

  global.HeHun = { analyze: analyze, zhiRelation: zhiRelation, starGroup: starGroup, GAN_HE: GAN_HE, GAN_CHONG: GAN_CHONG };
})(typeof window !== 'undefined' ? window : globalThis);
