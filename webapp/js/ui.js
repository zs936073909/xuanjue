/* ============================================================
   玄决 · Web 桌面端交互层
   架构：左导航 / 中阅读台（白话断语优先）/ 右盘面抽屉（按需滑入）
   排盘引擎与 APK 端同源（window.Lunar/Huangli/DaLiuRen/ShuShu/ClassicLibrary），
   本文件只做：取数 → 组织 → 渲染，不重写任何算法。
   ============================================================ */
(function () {
'use strict';

/* ---------------- 工具 ---------------- */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
function fmtDT(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
function fmtMD(d) { return pad(d.getMonth() + 1) + '月' + pad(d.getDate()) + '日 ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
function uid() { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

const QTYPES = ['感情关系', '事业合作', '财务决策', '签约交易', '出行移动', '健康倾向', '其他'];
const METHODS = ['大六壬', '梅花易数', '小六壬', '六爻', '塔罗', '奇门遁甲'];
const VENDOR_SRC = {
  iching: 'js/engines/vendor/iching-shifa.min.js',
  tarot: 'js/engines/vendor/tarot-kit.min.js',
  qimen: 'js/engines/vendor/qimendunjia-standalone.min.js',
  iztro: 'js/engines/iztro.min.js'
};
const METHOD_VENDOR = { '六爻': 'iching', '塔罗': 'tarot', '奇门遁甲': 'qimen', '紫微斗数': 'iztro' };
const _vendorPromise = {};
function ensureVendor(method) {
  const key = METHOD_VENDOR[method];
  if (!key) return Promise.resolve(true);
  if (_vendorPromise[key]) return _vendorPromise[key];
  _vendorPromise[key] = new Promise(res => {
    const s = document.createElement('script');
    s.src = VENDOR_SRC[key];
    s.onload = () => res(true);
    s.onerror = () => { delete _vendorPromise[key]; res(false); };
    document.head.appendChild(s);
  });
  return _vendorPromise[key];
}

/* ---------------- 本机存储（与 APK 端隔离命名空间） ---------------- */
const K_SET = 'xj_web_settings';
const K_CASES = 'xj_web_cases';
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
const DEFAULT_SET = { theme: 'light', dlGuiRen: '昼夜贵人', dlSheHai: '涉害取深', yueJiang: '中气定将', tarotReverse: '随机正逆位', railHidden: false };
let settings = Object.assign({}, DEFAULT_SET, LS.get(K_SET, {}));
function saveSettings() { LS.set(K_SET, settings); }

function listCases() { return LS.get(K_CASES, []); }
function getCase(id) { return listCases().find(c => c.id === id) || null; }
function saveCase(c) {
  const arr = listCases();
  const i = arr.findIndex(x => x.id === c.id);
  if (i >= 0) arr[i] = c; else arr.unshift(c);
  LS.set(K_CASES, arr);
}
function deleteCase(id) { LS.set(K_CASES, listCases().filter(c => c.id !== id)); }

/* ---------------- 引擎封装（薄包装，零算法改动） ---------------- */
function computeDL(date, qType) {
  const bz = Lunar.getBaZi(date);
  const yj = Lunar.getYueJiang(date, settings.yueJiang);
  const sc = Lunar.getShiChen(date);
  const ke = DaLiuRen.qiKe(date, bz, yj.zhiIdx, sc.index, {
    questionType: qType, guiRenMode: settings.dlGuiRen, sheHaiMode: settings.dlSheHai
  });
  const plain = DaLiuRen.plainLang(ke, qType);
  return { name: '大六壬', ke, plain, baZi: bz, yj, sc };
}
async function computeMethod(name, date, qType) {
  await ensureVendor(name);
  if (name === '大六壬') return computeDL(date, qType);
  if (name === '梅花易数') return ShuShu.compute('梅花易数', date);
  if (name === '小六壬') return ShuShu.compute('小六壬', { date, questionType: qType });
  if (name === '六爻') return ShuShu.compute('六爻', date);
  if (name === '塔罗') return ShuShu.compute('塔罗', { date, spread: 'three', tarotReverse: settings.tarotReverse });
  if (name === '奇门遁甲') return ShuShu.compute('奇门遁甲', { date, questionType: qType });
  return null;
}
function tendOf(t) {
  if (t === '宜主动') return { cls: 'good', txt: t };
  if (t === '宜谨慎') return { cls: 'warn', txt: t };
  if (t === '宜速决' || t === '宜等待') return { cls: 'wait', txt: t };
  if (t === '不可用') return { cls: 'na', txt: t };
  return { cls: 'calm', txt: t || '宜观察' };
}
function compOK(r) { return r && r.plain && !r.error && !(r.result && r.result.error); }

/* ---------------- 全局状态 ---------------- */
const app = $('#app');
const view = $('#view');
const boardInner = $('#boardInner');
// rt：此刻时课缓存，跨时辰即失效
let rt = null;
function rtKey(d) { const sc = Lunar.getShiChen(d); return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate() + '#' + sc.index; }
function buildRt() {
  const now = new Date();
  const bz = Lunar.getBaZi(now);
  const lunar = Lunar.solarToLunar(now);
  const jq = Lunar.currentNextJieQi(now);
  const hl = Huangli.getDayYiJi(bz.month.zhiIdx, bz.day.zhiIdx);
  const zs = Huangli.getDayZhiShen(bz.month.zhiIdx, bz.day.zhiIdx);
  const cs = Huangli.getChongSha(bz.day.zhiIdx);
  const dl = computeDL(now, '其他');
  // 内置小法门即时可算；大库法门等用户点胶囊再懒加载
  const others = {};
  try { others['梅花易数'] = { status: 'ready', comp: ShuShu.compute('梅花易数', now) }; } catch (e) { others['梅花易数'] = { status: 'error' }; }
  try { others['小六壬'] = { status: 'ready', comp: ShuShu.compute('小六壬', { date: now, questionType: '其他' }) }; } catch (e) { others['小六壬'] = { status: 'error' }; }
  ['六爻', '塔罗', '奇门遁甲'].forEach(n => { others[n] = { status: 'idle' }; });
  return {
    key: rtKey(now), date: now, bz, lunar, jq, hl, zs, cs, dl, others,
    current: '大六壬'
  };
}
function getRt() { if (!rt || rt.key !== rtKey(new Date())) rt = buildRt(); return rt; }
// 案例页各自的法门结果缓存：caseId → {name:{status,comp}}
const caseCache = {};

/* ---------------- 吐司 / 模态 ---------------- */
let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}
function openModal(html) {
  const root = $('#modalRoot');
  root.innerHTML = '<div class="modal-bg"></div><div class="modal">' + html + '</div>';
  root.classList.add('show');
  const close = () => { root.classList.remove('show'); root.innerHTML = ''; };
  $('.modal-bg', root).onclick = close;
  const c = $('.modal-close', root); if (c) c.onclick = close;
  return { root, close };
}
function confirmModal(title, text, okText, onOk) {
  const m = openModal(
    '<h3>' + esc(title) + '</h3><p>' + esc(text) + '</p>' +
    '<div class="modal-foot"><button class="btn ghost" data-act="no">取消</button>' +
    '<button class="btn primary" data-act="yes">' + esc(okText) + '</button></div>'
  );
  $('[data-act=no]', m.root).onclick = m.close;
  $('[data-act=yes]', m.root).onclick = () => { m.close(); onOk(); };
}

/* ---------------- 右栏：盘面抽屉 ---------------- */
function openBoard(html) {
  boardInner.innerHTML = html;
  app.classList.add('board-open');
  $('#board').setAttribute('aria-hidden', 'false');
  const c = $('.board-close', boardInner);
  if (c) c.onclick = closeBoard;
}
function closeBoard() {
  app.classList.remove('board-open');
  $('#board').setAttribute('aria-hidden', 'true');
}
function boardHead(title) {
  return '<div class="board-h"><h3>' + esc(title) + '</h3>' +
    '<button class="board-close" aria-label="关闭盘面"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>';
}

/* 大六壬完整盘面 */
function dlBoard(comp) {
  const ke = comp.ke, ZHI = Lunar.ZHI;
  const tjJi = DaLiuRen.TJ_JI;
  let h = boardHead('大六壬盘面');

  // 天地盘
  h += '<div class="b-sec"><h4>天地盘 · 月将加时</h4><div class="tp-grid">';
  for (let i = 0; i < 12; i++) {
    const tian = ke.tianPan[i];
    const kong = ke.kongWang.includes(i);
    h += '<div class="tp-cell' + (kong ? ' kong' : '') + '">' +
      '<div class="tian">' + ZHI[tian] + '</div>' +
      '<div class="tj">' + esc(ke.tjByShen[tian]) + '</div>' +
      '<div class="di">' + ZHI[i] + '宫</div></div>';
  }
  h += '</div></div>';

  // 四课（一→四）
  const lnames = ['日干', '干阴', '日支', '支阴'];
  h += '<div class="b-sec"><h4>四课</h4><div class="lessons">';
  ke.lessons.forEach((l, i) => {
    h += '<div class="lesson"><div class="l-up">' + ZHI[l.up] + '</div>' +
      '<div class="l-tj">' + esc(l.upTJ) + '</div>' +
      '<div class="l-down">' + esc(l.downLabel) + '</div>' +
      '<div class="l-name">' + lnames[i] + '</div></div>';
  });
  h += '</div></div>';

  // 三传
  const sc = ke.sanChuan;
  const rows = [['初传', sc.chu], ['中传', sc.zhong], ['末传', sc.mo]];
  h += '<div class="b-sec"><h4>三传</h4><div class="chuans">';
  rows.forEach(([lab, c]) => {
    const ji = tjJi[c.tj];
    const cls = ji > 0 ? 'ji' : (ji < 0 ? 'xiong' : '');
    h += '<div class="chuan ' + cls + '"><span class="c-lab">' + lab + '</span>' +
      '<span class="c-zhi">' + c.zhi + '</span>' +
      '<span class="c-tj">' + esc(c.tj) + (ji > 0 ? ' · 吉' : ji < 0 ? ' · 凶' : ' · 平') + '</span>' +
      (ke.kongWang.includes(c.idx) ? '<span class="c-kong">空亡</span>' : '') +
      '<span class="c-wx">' + esc(c.wx) + '</span></div>';
  });
  h += '</div><div class="chuan-method">发用：' + esc(sc.method) + (ke.isFuYin ? ' · 伏吟' : '') + (ke.isFanYin ? ' · 返吟' : '') + '</div></div>';

  // 基本信息
  h += '<div class="b-sec"><h4>课体</h4><dl class="kv">' +
    kvRow('月将', ke.yueJiang.zhi + '（' + ke.yueJiang.wx + '）') +
    kvRow('占时', comp.sc.name + ' ' + comp.sc.range) +
    kvRow('贵人', ke.guiRen.label + ' · ' + ke.guiRen.zhi + '（乘' + ZHI[ke.tianPan[ke.guiRen.idx]] + '）') +
    kvRow('空亡', ZHI[ke.kongWang[0]] + ZHI[ke.kongWang[1]]) +
    (ke.leishenName ? kvRow('类神', esc(ke.leishenName) + ' · 乘' + ZHI[ke.leishenShen] + (ke.kongWang.includes(ke.leishenShen) ? '（落空）' : '')) : '') +
    kvRow('干支', ke.baZi.day.gz + '日') +
    '</dl></div>';

  // 格局
  if (ke.geju && ke.geju.length) {
    h += '<div class="b-sec"><h4>格局</h4><div class="tag-row">' +
      ke.geju.map(g => '<span class="b-tag gold">' + esc(g) + '</span>').join('') + '</div></div>';
  }
  // 神煞：引擎返回 {yima,taohua,huagai,taiSui,yueJian}
  const SS_LABELS = { yima: '驿马', taohua: '桃花', huagai: '华盖', taiSui: '太岁', yueJian: '月建' };
  const ss = [];
  if (ke.shenSha && typeof ke.shenSha === 'object') {
    Object.keys(SS_LABELS).forEach(k => {
      const v = ke.shenSha[k];
      if (v && v !== '—') ss.push(SS_LABELS[k] + ' ' + v);
    });
  }
  if (ss.length) {
    h += '<div class="b-sec"><h4>神煞</h4><div class="tag-row">' +
      ss.map(s => '<span class="b-tag">' + esc(s) + '</span>').join('') + '</div></div>';
  }
  openBoard(h);
}
function kvRow(k, v) { return '<dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd>'; }

/* 其他法门盘面要点 */
function genericBoard(name, comp) {
  const r = comp.result;
  let h = boardHead(name + ' · 盘面要点');
  if (!r || r.error) { h += '<p class="b-note">' + esc((r && r.error) || '该法门排盘库未就绪') + '</p>'; openBoard(h); return; }

  if (name === '梅花易数') {
    h += '<div class="b-sec"><dl class="kv">' +
      kvRow('本卦', r.guaName) + kvRow('上卦', r.up.n + '（' + r.up.attr + '·' + r.up.wx + '）') +
      kvRow('下卦', r.dn.n + '（' + r.dn.attr + '·' + r.dn.wx + '）') +
      kvRow('动爻', '第' + r.dongLine + '爻') +
      kvRow('体卦', r.tiGua.n + '（' + r.tiGua.wx + '）') +
      kvRow('用卦', r.yongGua.n + '（' + r.yongGua.wx + '）') +
      kvRow('体用', r.rel) +
      kvRow('互卦', r.huGua.name) + kvRow('变卦', r.bianGua.name) + '</dl></div>';
  } else if (name === '小六壬') {
    h += '<div class="b-sec"><h4>三宫</h4><div class="tag-row" style="margin-bottom:12px">' +
      r.positions.map(p => '<span class="b-tag gold">' + esc(p.k + ' · ' + p.v) + '</span>').join('') + '</div>' +
      '<dl class="kv">' +
      kvRow('时宫吉凶', r.detail.ji) + kvRow('时宫五行', r.detail.wx) +
      kvRow('时宫属性', r.detail.attr) + kvRow('三宫生克', r.chain) +
      kvRow('释义', r.detail.desc) + '</dl></div>';
  } else if (name === '六爻') {
    const ynames = ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻'];
    h += '<div class="b-sec"><dl class="kv">' +
      kvRow('本卦', r.benGua) + kvRow('变卦', r.bianGua) + kvRow('互卦', r.huGua) +
      kvRow('卦宫', r.palace + '（' + r.palaceWx + '）') +
      kvRow('世应', '世' + r.shiLine + ' / 应' + r.yingLine) +
      kvRow('动爻', (r.dongPositions && r.dongPositions.length) ? '第' + r.dongPositions.join('、') + '爻' : '无动爻') +
      kvRow('用神', (r.yongShen.target || '—') + (r.yongShen.yao ? ' · ' + r.yongShen.yao.liuQin + r.yongShen.yao.gz : '')) +
      kvRow('空亡', (r.kongWang || '—')) + kvRow('月破', r.yuePo.zhi) +
      kvRow('日辰', r.dayGz) + '</dl></div>';
    h += '<div class="b-sec"><h4>六爻纳甲</h4><div class="yao-row">' +
      r.yaos.map((y, i) => '<div class="yao' + (y.dong ? ' dong' : '') + '">' +
        '<span class="y-n">' + ynames[i] + '</span>' +
        '<span class="y-gz">' + esc(y.gz) + '</span>' +
        '<span class="y-rest">' + esc([y.liuQin, y.liuShou, y.isShi ? '世' : '', y.isYing ? '应' : ''].filter(Boolean).join(' · ')) + '</span>' +
        (y.dong ? '<span class="y-dong">动</span>' : '') + '</div>').join('') +
      '</div></div>';
  } else if (name === '塔罗') {
    h += '<div class="b-sec"><h4>' + esc(r.spreadName || '牌阵') + ' · ' + r.cards.length + '张</h4><div class="taro-row">' +
      r.cards.map(c => '<div class="taro-card"><div class="tc-pos">' + esc(c.pos) + '</div>' +
        '<div class="tc-name' + (c.reverse ? ' rev' : '') + '">' + esc(c.name) + (c.reverse ? ' · 逆位' : ' · 正位') + '</div>' +
        '<div class="tc-mean">' + esc(c.meaning) + '</div></div>').join('') +
      '</div></div>';
  } else {
    // 奇门等：防御式取标量
    const rows = [];
    const info = r.info || {};
    Object.keys(info).slice(0, 16).forEach(k => {
      const v = info[k];
      if (typeof v === 'string' || typeof v === 'number') rows.push(kvRow(k, v));
    });
    if (r.targetName) rows.push(kvRow('用神', r.targetName));
    if (r.relation) rows.push(kvRow('关系', r.relation));
    h += '<div class="b-sec"><dl class="kv">' + rows.join('') + '</dl></div>';
  }
  openBoard(h);
}

/* ---------------- 中央阅读块（白话优先，各法门共用） ---------------- */
function readingBlock(name, comp) {
  if (!compOK(comp)) {
    return '<div class="reading-head"><span class="method-title">' + esc(name) + '</span>' +
      tendBadge('不可用') + '</div>' +
      '<p class="verdict">该法门此刻未能起盘。</p>' +
      '<p class="b-note">' + esc((comp && (comp.error || (comp.result && comp.result.error))) || '排盘库加载失败，请稍后重试') + '</p>';
  }
  const p = comp.plain;
  const t = tendOf(p.tendency);
  let h = '<div class="reading-head"><span class="method-title">' + esc(name) + '</span>' +
    '<span class="tend ' + t.cls + '">' + esc(t.txt) + '</span></div>';
  h += '<p class="verdict">' + esc(p.state) + '</p>';
  h += '<div class="acts">' +
    '<div class="act-col do"><h4>宜</h4><ul>' + (p.doAct || []).slice(0, 4).map(x => '<li>' + esc(x) + '</li>').join('') + '</ul></div>' +
    '<div class="act-col dont"><h4>忌</h4><ul>' + (p.dontAct || []).slice(0, 4).map(x => '<li>' + esc(x) + '</li>').join('') + '</ul></div>' +
    '</div>';
  const sigs = (p.signals || []).slice(0, 5);
  if (p.env) sigs.push(p.env);
  if (sigs.length) {
    h += '<div class="signals">' + sigs.slice(0, 6).map((s, i) =>
      '<div class="signal"><span class="sig-k">' + (i === sigs.length - 1 && p.env && s === p.env ? '处境' : '观察') + '</span><span>' + esc(s) + '</span></div>'
    ).join('') + '</div>';
  }
  h += '<div class="read-actions"><button class="btn primary" data-board="' + esc(name) + '">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5h16M4 12h16M4 19h10"/></svg>展开盘面</button></div>';
  return h;
}
function tendBadge(t) { const x = tendOf(t); return '<span class="tend ' + x.cls + '">' + esc(x.txt) + '</span>'; }

/* ---------------- 视图：时课首页 ---------------- */
function renderHome() {
  const r = getRt();
  const weekCN = '周' + ['日', '一', '二', '三', '四', '五', '六'][r.date.getDay()];
  const cur = r.current === '大六壬' ? r.dl : (r.others[r.current] && r.others[r.current].comp);

  let h = '<div class="reading-inner" data-view="home">';
  h += '<div class="kicker">此刻时课 · 实时</div>';

  // 元信息条（只出现一次）
  h += '<div class="now-meta"><div class="now-gz">' +
    gzSpan(r.bz.year.gz) + '<span class="sep">·</span>' + gzSpan(r.bz.month.gz) + '<span class="sep">·</span>' +
    gzSpan(r.bz.day.gz) + gzSpan(r.bz.hour.gz) + '</div>';
  h += '<div class="now-cols">' +
    nc('农历', r.lunar ? r.lunar.monthStr + r.lunar.dayStr : '—') +
    nc('时辰', r.dl.sc.name + ' ' + r.dl.sc.range) +
    nc('节气', (r.jq.cur ? r.jq.cur.name : '—') + ' → ' + (r.jq.next ? r.jq.next.name : '—')) +
    nc('值神', r.zs.n + (r.zs.g ? '（吉）' : '（凶）')) +
    nc('冲煞', r.cs.chong + ' · ' + r.cs.sha) +
    '</div>';
  h += '<div class="now-yiji"><span class="yj-char yi">宜</span><span class="yj-tags">' +
    r.hl.yi.slice(0, 5).map(x => '<span class="yj-tag">' + esc(x) + '</span>').join('') + '</span>' +
    '<span class="yj-char ji" style="margin-left:8px">忌</span><span class="yj-tags">' +
    r.hl.ji.slice(0, 5).map(x => '<span class="yj-tag">' + esc(x) + '</span>').join('') + '</span></div>';
  h += '</div>';

  // 当前法门断语（同一时刻只渲染一个，不重复）
  h += '<div id="readZone">' + (cur ? readingBlock(r.current, cur) : loadingBlock()) + '</div>';

  // 同刻他法胶囊
  h += '<div class="other-methods"><div class="om-head"><h3>同刻别法</h3><span>同一时刻独立起盘，点按切换对照</span></div><div class="om-row">';
  METHODS.forEach(name => {
    if (name === r.current) { h += '<span class="m-cap current">' + esc(name) + '</span>'; return; }
    const o = name === '大六壬' ? null : r.others[name];
    if (!o || o.status === 'idle') {
      h += '<button class="m-cap" data-method="' + esc(name) + '"><span class="mini-load">' + esc(name) + ' · 起盘</span></button>';
    } else if (o.status === 'loading') {
      h += '<span class="m-cap loading"><span class="spin"></span>' + esc(name) + '</span>';
    } else if (o.status === 'ready' && compOK(o.comp)) {
      const t = tendOf(o.comp.plain.tendency);
      h += '<button class="m-cap" data-method="' + esc(name) + '"><span class="dot ' + t.cls + '"></span>' + esc(name) + '</button>';
    } else {
      h += '<button class="m-cap" data-method="' + esc(name) + '"><span class="dot na"></span>' + esc(name) + '</button>';
    }
  });
  h += '</div></div>';

  // 问事输入（唯一的创建入口）
  h += '<div class="ask-box" id="askBox">' +
    '<textarea id="askInput" rows="1" placeholder="想问什么？一句话说清处境，比如：这个 offer 要不要接…"></textarea>' +
    '<div class="ask-bar"><div class="q-chips" id="qChips">' +
    QTYPES.map((q, i) => '<button class="chip' + (q === '其他' ? ' on' : '') + '" data-q="' + esc(q) + '">' + esc(q) + '</button>').join('') +
    '</div>' +
    '<button class="ask-send" id="askSend">起课<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>' +
    '</div></div>';
  h += '<div class="ask-hint"><span><kbd>Enter</kbd> 起课</span><span><kbd>Shift</kbd>+<kbd>Enter</kbd> 换行</span><span><kbd>/</kbd> 快速聚焦</span></div>';

  h += '</div>';
  view.innerHTML = h;
  bindHome();
}
function gzSpan(g) { return '<span style="font-family:var(--serif);letter-spacing:.06em">' + esc(g) + '</span>'; }
function nc(k, v) { return '<span class="nc"><span class="k">' + esc(k) + '</span><span class="v">' + esc(v) + '</span></span>'; }
function loadingBlock() {
  return '<div class="reading-head"><span class="method-title">起盘中</span></div>' +
    '<p class="verdict" style="font-size:18px;color:var(--ink-3)"><span class="spin" style="display:inline-block;width:15px;height:15px;border:2px solid var(--line-2);border-top-color:var(--clay);border-radius:50%;animation:spin .7s linear infinite;vertical-align:-2px;margin-right:10px"></span>正在加载排盘库…</p>';
}

let qtypeSel = '其他';
function bindHome() {
  const input = $('#askInput');
  // chip 选择
  $$('#qChips .chip').forEach(c => c.onclick = () => {
    $$('#qChips .chip').forEach(x => x.classList.remove('on'));
    c.classList.add('on'); qtypeSel = c.dataset.q;
  });
  const doAsk = () => {
    const text = input.value.trim();
    if (!text) { input.focus(); toast('先写一句你想问的事'); return; }
    const c = {
      id: uid(), title: text.length > 28 ? text.slice(0, 28) + '…' : text,
      desc: text, qType: qtypeSel, createdAt: new Date().toISOString(),
      reviewed: false, reviewNote: '', reviewAt: null
    };
    saveCase(c);
    renderRecent();
    location.hash = '#/case/' + c.id;
    toast('已起课，存入问事录');
  };
  $('#askSend').onclick = doAsk;
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doAsk(); }
  });
  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 180) + 'px'; });

  // 展开盘面
  $$('#readZone [data-board]').forEach(b => b.onclick = () => {
    const name = b.dataset.board;
    const comp = name === '大六壬' ? getRt().dl : getRt().others[name].comp;
    if (name === '大六壬') dlBoard(comp); else genericBoard(name, comp);
  });

  // 胶囊切换 / 懒加载
  $$('.om-row [data-method]').forEach(btn => btn.onclick = () => switchRtMethod(btn.dataset.method));
}
async function switchRtMethod(name) {
  const r = getRt();
  if (name === '大六壬') { r.current = '大六壬'; paintRtRead(); return; }
  const o = r.others[name];
  if (o.status === 'loading') return;
  if (o.status !== 'ready') {
    o.status = 'loading';
    paintCapsules();
    const ok = await ensureVendor(name);
    if (!ok) { o.status = 'idle'; toast(name + ' 排盘库加载失败'); paintCapsules(); return; }
    try { o.comp = await computeMethod(name, r.date, '其他'); o.status = 'ready'; }
    catch (e) { o.status = 'error'; toast(name + ' 起盘异常'); paintCapsules(); return; }
  }
  r.current = name;
  paintRtRead();
  paintCapsules();
}
function paintRtRead() {
  const r = getRt();
  const z = $('#readZone');
  if (!z) return;
  const comp = r.current === '大六壬' ? r.dl : (r.others[r.current] && r.others[r.current].comp);
  z.innerHTML = comp ? readingBlock(r.current, comp) : loadingBlock();
  const b = $('[data-board]', z);
  if (b) b.onclick = () => { if (r.current === '大六壬') dlBoard(r.dl); else genericBoard(r.current, r.others[r.current].comp); };
}
function paintCapsules() {
  // 重绘胶囊排即可（成本极低）
  const row = $('.om-row');
  if (!row) return;
  const r = getRt();
  row.innerHTML = METHODS.map(name => {
    if (name === r.current) return '<span class="m-cap current">' + esc(name) + '</span>';
    const o = name === '大六壬' ? null : r.others[name];
    if (!o || o.status === 'idle') return '<button class="m-cap" data-method="' + esc(name) + '"><span class="mini-load">' + esc(name) + ' · 起盘</span></button>';
    if (o.status === 'loading') return '<span class="m-cap loading"><span class="spin"></span>' + esc(name) + '</span>';
    if (o.status === 'ready' && compOK(o.comp)) {
      const t = tendOf(o.comp.plain.tendency);
      return '<button class="m-cap" data-method="' + esc(name) + '"><span class="dot ' + t.cls + '"></span>' + esc(name) + '</button>';
    }
    return '<button class="m-cap" data-method="' + esc(name) + '"><span class="dot na"></span>' + esc(name) + '</button>';
  }).join('');
  $$('.om-row [data-method]').forEach(btn => btn.onclick = () => switchRtMethod(btn.dataset.method));
}

/* ---------------- 视图：案例读盘 ---------------- */
function renderCase(id) {
  const c = getCase(id);
  if (!c) { renderNotFound(); return; }
  if (!caseCache[id]) caseCache[id] = { '大六壬': { status: 'ready', comp: computeDL(new Date(c.createdAt), c.qType) }, current: '大六壬' };
  const cache = caseCache[id];
  const date = new Date(c.createdAt);
  let h = '<div class="reading-inner" data-view="case">';
  h += '<div class="case-head"><div class="kicker">问事 · ' + esc(c.qType) + '</div>' +
    '<div class="case-q">' + esc(c.desc) + '</div>' +
    '<div class="case-meta"><span>起课于 <b>' + fmtDT(date) + '</b></span><span>主法 <b>大六壬</b></span></div></div>';

  if (c.reviewed) {
    h += '<div class="review-banner"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 13 4 4L19 7"/></svg>已复盘：' + esc(c.reviewNote || '已记录结果') + '</div>';
  }
  const cur = cache.current === '大六壬' ? cache['大六壬'].comp : (cache[cache.current] && cache[cache.current].comp);
  h += '<div id="readZone">' + (cur ? readingBlock(cache.current, cur) : loadingBlock()) + '</div>';

  h += '<div class="read-actions" style="margin-top:18px">' +
    '<button class="btn ghost" id="btnReview"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>' + (c.reviewed ? '修改复盘' : '事后复盘') + '</button>' +
    '<button class="btn ghost" id="btnDelCase"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>删除</button>' +
    '</div>';

  // 同刻别法
  h += '<div class="other-methods"><div class="om-head"><h3>同一时刻 · 别法对照</h3></div><div class="om-row">';
  METHODS.forEach(name => {
    if (name === cache.current) { h += '<span class="m-cap current">' + esc(name) + '</span>'; return; }
    const o = cache[name];
    if (!o || o.status === 'idle') h += '<button class="m-cap" data-method="' + esc(name) + '"><span class="mini-load">' + esc(name) + ' · 起盘</span></button>';
    else if (o.status === 'loading') h += '<span class="m-cap loading"><span class="spin"></span>' + esc(name) + '</span>';
    else if (o.status === 'ready' && compOK(o.comp)) {
      const t = tendOf(o.comp.plain.tendency);
      h += '<button class="m-cap" data-method="' + esc(name) + '"><span class="dot ' + t.cls + '"></span>' + esc(name) + '</button>';
    } else h += '<button class="m-cap" data-method="' + esc(name) + '"><span class="dot na"></span>' + esc(name) + '</button>';
  });
  h += '</div></div></div>';

  view.innerHTML = h;

  $('#btnReview').onclick = () => reviewModal(c);
  $('#btnDelCase').onclick = () => confirmModal('删除这条问事？', '删除后不可恢复，排盘记录与复盘都会一并清除。', '删除', () => {
    deleteCase(id); delete caseCache[id]; renderRecent();
    location.hash = '#/history'; toast('已删除');
  });
  $$('#readZone [data-board]').forEach(b => b.onclick = () => {
    const nm = b.dataset.board;
    const cp = nm === '大六壬' ? cache['大六壬'].comp : cache[nm].comp;
    if (nm === '大六壬') dlBoard(cp); else genericBoard(nm, cp);
  });
  $$('.om-row [data-method]').forEach(btn => btn.onclick = () => switchCaseMethod(id, btn.dataset.method));
}
async function switchCaseMethod(id, name) {
  const cache = caseCache[id];
  const c = getCase(id);
  if (name === '大六壬') { cache.current = '大六壬'; renderCase(id); return; }
  const o = cache[name] || (cache[name] = { status: 'idle' });
  if (o.status === 'loading') return;
  if (o.status !== 'ready') {
    o.status = 'loading'; renderCase(id);
    const ok = await ensureVendor(name);
    if (!ok) { o.status = 'idle'; toast(name + ' 排盘库加载失败'); renderCase(id); return; }
    try { o.comp = await computeMethod(name, new Date(c.createdAt), c.qType); o.status = 'ready'; }
    catch (e) { o.status = 'error'; renderCase(id); return; }
  }
  cache.current = name;
  renderCase(id);
}
function reviewModal(c) {
  const m = openModal(
    '<h3>事后复盘</h3><p>过几天回头看：当时这一课，和事情的实际走向对得上吗？复盘只存在你本机。</p>' +
    '<label>结果</label><select id="rvOutcome">' +
    ['应验', '部分应验', '未应验'].map(x => '<option' + (c.reviewNote && c.reviewNote.indexOf(x) === 0 ? ' selected' : '') + '>' + x + '</option>').join('') +
    '</select>' +
    '<label>备注（实际发生了什么）</label><textarea id="rvNote" placeholder="例如：一周后对方主动联系，合作谈成…">' + esc(c.reviewNote.replace(/^(应验|部分应验|未应验)/, '')) + '</textarea>' +
    '<div class="modal-foot"><button class="btn ghost" data-act="no">取消</button><button class="btn primary" data-act="yes">保存复盘</button></div>'
  );
  $('[data-act=no]', m.root).onclick = m.close;
  $('[data-act=yes]', m.root).onclick = () => {
    const oc = $('#rvOutcome', m.root).value;
    const nt = $('#rvNote', m.root).value.trim();
    c.reviewed = true; c.reviewAt = new Date().toISOString(); c.reviewNote = oc + (nt ? ' · ' + nt : '');
    saveCase(c); renderRecent(); m.close(); renderCase(c.id); toast('复盘已保存');
  };
}

/* ---------------- 视图：典籍 ---------------- */
const clsState = { cat: '', bookId: '', q: '' };
const CLASSIC_CATS = ['', '大六壬', '六爻', '梅花', '小六壬', '八字', '紫微斗数', '塔罗'];
function renderClassics() {
  let h = '<div class="reading-inner" data-view="classics">';
  h += '<div class="kicker">典籍 · 本地全文检索</div>';
  h += '<h2 style="font-family:var(--serif);font-size:26px;font-weight:600;margin-bottom:6px">古籍库</h2>';
  h += '<p style="font-size:13.5px;color:var(--ink-3);margin-bottom:22px">十四部公版典籍，按盘面特征与关键词本地检索，不联网。</p>';
  h += '<div class="search-box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></svg>' +
    '<input id="clsSearch" type="search" placeholder="搜原文或白话，如：初传、贵人、空亡…" value="' + esc(clsState.q) + '"></div>';
  h += '<div class="cat-row" id="clsCats">' + CLASSIC_CATS.map(c =>
    '<button class="chip' + (clsState.cat === c ? ' on' : '') + '" data-cat="' + esc(c) + '">' + (c || '全部') + '</button>').join('') + '</div>';
  h += '<div id="clsBody"></div></div>';
  view.innerHTML = h;

  let t;
  $('#clsSearch').addEventListener('input', e => {
    clearTimeout(t);
    t = setTimeout(() => { clsState.q = e.target.value.trim(); clsState.bookId = ''; paintClassicsBody(); }, 220);
  });
  $$('#clsCats .chip').forEach(ch => ch.onclick = () => {
    $$('#clsCats .chip').forEach(x => x.classList.remove('on'));
    ch.classList.add('on'); clsState.cat = ch.dataset.cat; clsState.bookId = ''; paintClassicsBody();
  });
  paintClassicsBody();
}
function paintClassicsBody() {
  const body = $('#clsBody');
  const idx = ClassicLibrary.loadIndex();
  if (idx && typeof idx.then === 'function') { idx.then(() => paintClassicsBody()); body.innerHTML = '<div class="empty"><div class="e-d">正在载入典籍索引…</div></div>'; return; }
  if (!idx || !idx.books) { body.innerHTML = '<div class="empty"><div class="e-d">典籍索引未找到（data/classics/index.json）。</div></div>'; return; }
  let books = idx.books;
  if (clsState.cat) books = books.filter(b => b.shushu === clsState.cat);

  // 检索模式
  if (clsState.q) {
    let hits = [];
    try { hits = ClassicLibrary.search({ shushu: clsState.cat || undefined, query: clsState.q, limit: 40 }) || []; } catch (e) { hits = []; }
    if (!hits.length) { body.innerHTML = '<div class="empty"><div class="e-t">没有检到相关段落</div><div class="e-d">换个关键词试试，或换一个法门分类。</div></div>'; return; }
    body.innerHTML = hits.map(p =>
      '<div class="passage"><div class="p-cite">' + esc(ClassicLibrary.formatCitation(p)) + '</div>' +
      '<div class="p-text">' + esc(p.text) + '</div>' +
      (p.comment ? '<div class="p-comment">' + esc(p.comment) + '</div>' : '') +
      ((p.tags || []).length ? '<div class="p-tags">' + p.tags.slice(0, 5).map(t => '<span class="p-tag">' + esc(t) + '</span>').join('') + '</div>' : '') +
      '</div>').join('');
    return;
  }
  // 单本阅读
  if (clsState.bookId) {
    const bd = ClassicLibrary.loadBook(clsState.bookId);
    if (bd && typeof bd.then === 'function') { bd.then(() => paintClassicsBody()); body.innerHTML = '<div class="empty"><div class="e-d">正在载入…</div></div>'; return; }
    const passages = (bd && bd.passages) || [];
    body.innerHTML = '<button class="btn ghost sm" id="clsBack" style="margin-bottom:14px">← 返回书目</button>' +
      passages.slice(0, 60).map(p =>
        '<div class="passage"><div class="p-cite">' + esc(ClassicLibrary.formatCitation(p)) + '</div>' +
        '<div class="p-text">' + esc(p.text) + '</div>' +
        (p.comment ? '<div class="p-comment">' + esc(p.comment) + '</div>' : '') + '</div>').join('');
    $('#clsBack').onclick = () => { clsState.bookId = ''; paintClassicsBody(); };
    return;
  }
  // 书目列表
  body.innerHTML = '<div class="book-list">' + books.map(b =>
    '<div class="book-row" data-book="' + esc(b.id) + '">' +
    '<div class="book-ico">' + esc(b.title.slice(0, 1)) + '</div>' +
    '<div class="book-main"><div class="book-t">' + esc(b.title) + '</div>' +
    '<div class="book-m">' + esc([b.dynasty, b.author].filter(Boolean).join(' · ')) + ' · ' + (b.passage_count || 0) + ' 段</div></div>' +
    '<span class="b-tag">' + esc(b.shushu) + '</span></div>').join('') + '</div>';
  $$('.book-row', body).forEach(r => r.onclick = () => { clsState.bookId = r.dataset.book; paintClassicsBody(); });
}

/* ---------------- 视图：问事录 ---------------- */
function renderHistory() {
  const cases = listCases();
  let h = '<div class="reading-inner" data-view="history">';
  h += '<div class="kicker">问事录 · 仅存本机</div>';
  h += '<h2 style="font-family:var(--serif);font-size:26px;font-weight:600;margin-bottom:22px">历次问事</h2>';
  if (!cases.length) {
    h += emptyHTML(
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.7 1.6"/></svg>',
      '还没有问事记录', '回到时课页，在底部写下你想问的事，一课即成一条可复盘的记录。',
      '<button class="btn primary" id="emptyGo">去起一课</button>'
    );
  } else {
    h += cases.map(c => {
      const d = new Date(c.createdAt);
      let dot = 'todo', tip = '待复盘';
      if (c.reviewed) { dot = 'done'; tip = '已复盘'; }
      else if (Date.now() - d.getTime() > 7 * 864e5) { dot = 'due'; tip = '复盘期已到'; }
      return '<div class="hist-item" data-case="' + esc(c.id) + '">' +
        '<span class="review-dot ' + dot + '" title="' + tip + '"></span>' +
        '<div class="hist-main"><div class="hist-t">' + esc(c.title) + '</div>' +
        '<div class="hist-m"><span>' + esc(c.qType) + '</span><span>' + fmtMD(d) + '</span><span>' + tip + '</span></div></div>' +
        '<button class="hist-del" data-del="' + esc(c.id) + '" aria-label="删除"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg></button>' +
        '</div>';
    }).join('');
  }
  h += '</div>';
  view.innerHTML = h;
  const go = $('#emptyGo'); if (go) go.onclick = () => location.hash = '#/home';
  $$('.hist-item').forEach(it => it.onclick = e => {
    if (e.target.closest('[data-del]')) return;
    location.hash = '#/case/' + it.dataset.case;
  });
  $$('[data-del]').forEach(b => b.onclick = e => {
    e.stopPropagation();
    const id = b.dataset.del;
    confirmModal('删除这条问事？', '删除后不可恢复。', '删除', () => { deleteCase(id); delete caseCache[id]; renderRecent(); renderHistory(); toast('已删除'); });
  });
}

/* ---------------- 视图：设置 ---------------- */
function renderSettings() {
  const s = settings;
  const sel = (key, opts) => '<select data-set="' + key + '">' + opts.map(o => '<option' + (s[key] === o ? ' selected' : '') + '>' + o + '</option>').join('') + '</select>';
  let h = '<div class="reading-inner" data-view="settings">';
  h += '<div class="kicker">设置</div><h2 style="font-family:var(--serif);font-size:26px;font-weight:600;margin-bottom:22px">偏好</h2>';

  h += '<div class="set-sec"><h3>外观</h3><div class="set-row"><div class="set-main"><div class="set-t">深色模式</div><div class="set-d">暖纸 / 暖墨双主题，随时切换</div></div>' +
    '<button class="switch' + (s.theme === 'dark' ? ' on' : '') + '" id="swTheme" aria-label="深色模式"></button></div></div>';

  h += '<div class="set-sec"><h3>排盘口径</h3><div class="sec-d">仅影响起课算法取值，与 APK 端默认一致。</div>';
  h += '<div class="set-row"><div class="set-main"><div class="set-t">大六壬贵人</div></div>' + sel('dlGuiRen', ['昼夜贵人', '夜贵人', '甲戊庚牛羊']) + '</div>';
  h += '<div class="set-row"><div class="set-main"><div class="set-t">涉害取法</div></div>' + sel('dlSheHai', ['涉害取深', '涉害取孟仲季']) + '</div>';
  h += '<div class="set-row"><div class="set-main"><div class="set-t">月将设置</div></div>' + sel('yueJiang', ['中气定将', '节气定将']) + '</div>';
  h += '<div class="set-row"><div class="set-main"><div class="set-t">塔罗正逆位</div></div>' + sel('tarotReverse', ['随机正逆位', '仅正位']) + '</div></div>';

  h += '<div class="set-sec"><h3>数据</h3><div class="sec-d">所有问事与偏好只保存在此浏览器的 localStorage，不经过服务器。</div>' +
    '<div class="set-row"><div class="set-main"><div class="set-t">清空本机数据</div><div class="set-d">删除全部问事录并还原默认设置</div></div>' +
    '<button class="btn ghost sm" id="btnWipe">清空</button></div></div>';

  h += '<div class="set-sec"><h3>关于</h3><div class="sec-d">玄决网页版（桌面端）· 排盘引擎与安卓端同源同算。</div></div>';
  h += '</div>';
  view.innerHTML = h;

  $('#swTheme').onclick = () => { settings.theme = settings.theme === 'dark' ? 'light' : 'dark'; applyTheme(); saveSettings(); renderSettings(); };
  $$('select[data-set]').forEach(sl => sl.onchange = () => {
    settings[sl.dataset.set] = sl.value; saveSettings();
    rt = null; // 排路口径变更，此刻课作废重算
    if (location.hash === '#/home' || !location.hash) renderHome();
    toast('已保存，时课将按新口径重算');
  });
  $('#btnWipe').onclick = () => confirmModal('清空全部本机数据？', '问事录、偏好都会被删除，页面会刷新。', '全部清空', () => {
    localStorage.removeItem(K_CASES); localStorage.removeItem(K_SET);
    location.reload();
  });
}

function renderNotFound() {
  view.innerHTML = '<div class="reading-inner">' + emptyHTML(
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.5"/></svg>',
    '没有找到这条记录', '它可能已被删除。', '<button class="btn primary" onclick="location.hash=\'#/home\'">回到时课</button>'
  ) + '</div>';
}
function emptyHTML(iconSvg, title, desc, action) {
  return '<div class="empty"><div class="e-mark">' + iconSvg + '</div>' +
    '<div class="e-t">' + esc(title) + '</div><div class="e-d">' + esc(desc) + '</div>' + (action || '') + '</div>';
}

/* ---------------- 侧栏 ---------------- */
function renderRecent() {
  const cases = listCases().slice(0, 6);
  const el = $('#recentList');
  if (!cases.length) { el.innerHTML = '<div class="recent-empty">还没有记录<br>在时课页底部问事</div>'; return; }
  el.innerHTML = cases.map(c =>
    '<div class="recent-item" data-case="' + esc(c.id) + '" title="' + esc(c.desc) + '">' + esc(c.title) + '</div>').join('');
  $$('.recent-item', el).forEach(it => it.onclick = () => location.hash = '#/case/' + it.dataset.case);
}
function setNav(route) {
  $$('#nav .nav-item').forEach(n => n.classList.toggle('active', n.dataset.route === route));
  const titles = { home: '时课', classics: '典籍', history: '问事录', settings: '设置', case: '问事' };
  $('#crumb').textContent = titles[route] || '时课';
}
function applyTheme() {
  document.documentElement.setAttribute('data-theme', settings.theme);
  $('#themeLabel').textContent = settings.theme === 'dark' ? '浅色模式' : '深色模式';
  const meta = document.querySelector('meta[name=theme-color]');
}

/* ---------------- 路由 ---------------- */
function route() {
  closeBoard();
  const hash = location.hash || '#/home';
  if (hash.startsWith('#/case/')) { setNav('case'); renderCase(hash.slice(7)); }
  else if (hash === '#/classics') { setNav('classics'); renderClassics(); }
  else if (hash === '#/history') { setNav('history'); renderHistory(); }
  else if (hash === '#/settings') { setNav('settings'); renderSettings(); }
  else { location.hash = '#/home'; setNav('home'); renderHome(); }
}

/* ---------------- 时钟 ---------------- */
function tickClock() {
  const d = new Date();
  $('#clock').textContent = pad(d.getHours()) + ':' + pad(d.getMinutes());
}
let clockTimer = setInterval(() => {
  tickClock();
  // 跨时辰自动刷新此刻课（仅当停留在时课页）
  if (rt && rt.key !== rtKey(new Date()) && (location.hash === '#/home' || !location.hash)) {
    rt = null; renderHome();
  }
}, 20000);

/* ---------------- 快捷键 & 全局 ---------------- */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (app.classList.contains('board-open')) closeBoard();
    else if ($('#modalRoot').classList.contains('show')) { $('#modalRoot').classList.remove('show'); $('#modalRoot').innerHTML = ''; }
    return;
  }
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault(); goAsk(); return;
  }
  if (!typing && e.key === '/') { e.preventDefault(); goAsk(); }
});
function goAsk() {
  if (location.hash !== '#/home' && location.hash !== '') location.hash = '#/home';
  setTimeout(() => { const i = $('#askInput'); if (i) i.focus(); }, 60);
}

$('#newAsk').onclick = goAsk;
$('#nav').addEventListener('click', e => {
  const b = e.target.closest('.nav-item');
  if (b) location.hash = '#/' + b.dataset.route;
});
$('#themeBtn').onclick = () => {
  settings.theme = settings.theme === 'dark' ? 'light' : 'dark';
  saveSettings(); applyTheme();
};
$('#railCollapse').onclick = () => {
  app.classList.add('rail-hidden'); settings.railHidden = true; saveSettings();
};
$('#railOpen').onclick = () => {
  app.classList.remove('rail-hidden'); settings.railHidden = false; saveSettings();
};
window.addEventListener('hashchange', route);

/* ---------------- 启动 ---------------- */
applyTheme();
if (settings.railHidden) app.classList.add('rail-hidden');
renderRecent();
tickClock();
route();

})();
