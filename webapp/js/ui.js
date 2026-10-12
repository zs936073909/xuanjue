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
  if (window.Fx) Fx.enhance(boardInner);
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

  // 天地盘（旋转式盘）
  h += '<div class="b-sec"><h4>天地盘 · 月将加时</h4>' + shipanHTML(ke) + '</div>';

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
    h += '<div class="b-sec">' + meihuaHTML(r) + '</div>';
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
    h += coinTossHTML(r);
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
    h += '<div class="b-sec"><h4>' + esc(r.spreadName || '韦特牌阵') + ' · ' + r.cards.length + '张</h4></div>';
    h += tarotDeckBoard(r.cards);
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
  // 法门专属实景盘面（式盘 / 三卦 / 真牌 / 铜钱）
  if (name === '大六壬' && comp.ke) h += '<div class="read-shipan">' + shipanHTML(comp.ke) + '</div>';
  if (name === '梅花易数' && comp.result && comp.result.up) h += meihuaHTML(comp.result);
  if (name === '塔罗' && comp.result && Array.isArray(comp.result.cards)) h += tarotSpreadHTML(comp.result.cards);
  if (name === '六爻' && comp.result && Array.isArray(comp.result.yaos)) h += coinTossHTML(comp.result);
  h += '<div class="read-actions"><button class="btn primary" data-board="' + esc(name) + '">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5h16M4 12h16M4 19h10"/></svg>展开盘面</button></div>';
  return h;
}
function tendBadge(t) { const x = tendOf(t); return '<span class="tend ' + x.cls + '">' + esc(x.txt) + '</span>'; }

/* ---------------- 塔罗 · 韦特真牌 ---------------- */
const TAROT_DIR = 'assets/tarot/';
function tarotSpreadHTML(cards) {
  return '<div class="spread">' + cards.map((c, i) =>
    '<div class="rcard" data-board="塔罗" title="点击展开盘面">' +
      '<div class="rc-inner">' +
        '<div class="rc-side rc-side-back"></div>' +
        '<div class="rc-side rc-side-face' + (c.reverse ? ' rev' : '') + '">' +
          (c.reverse ? '<span class="rc-ribbon">逆位</span>' : '') +
          '<img loading="' + (i === 0 ? 'eager' : 'lazy') + '" src="' + TAROT_DIR + esc(c.id) + '.jpg" alt="' + esc(c.name) + '" ' +
          'onerror="this.parentNode.classList.add(\'img-miss\')">' +
          '<div class="rc-fallback">' + esc(c.name) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="rc-cap"><div class="rc-pos">' + esc(c.pos) + '</div>' +
      '<div class="rc-nm' + (c.reverse ? ' rev' : '') + '">' + esc(c.name) + (c.reverse ? ' · 逆' : ' · 正') + '</div>' +
      '<div class="rc-mn">' + esc(c.meaning) + '</div></div>' +
    '</div>').join('') + '</div>';
}
function tarotDeckBoard(cards) {
  return '<div class="b-sec"><h4>' + esc(cards.length) + ' 张韦特牌</h4><div class="taro-deck">' +
    cards.map(c =>
      '<div class="tf-row"><div class="tf-img' + (c.reverse ? ' rev' : '') + '">' +
      '<img loading="lazy" src="' + TAROT_DIR + esc(c.id) + '.jpg" alt="' + esc(c.name) + '" ' +
      'onerror="this.style.display=\'none\'"></div>' +
      '<div class="tf-main"><div class="tf-pos">' + esc(c.pos) + '</div>' +
      '<div class="tf-nm' + (c.reverse ? ' rev' : '') + '">' + esc(c.name) + (c.reverse ? ' · 逆位' : ' · 正位') + '</div>' +
      '<div class="tf-mn">' + esc(c.meaning) + '</div></div></div>').join('') +
    '</div></div>';
}

/* ---------------- 六爻 · 乾隆通宝 ---------------- */
const COIN_ZI = 'assets/coins/obverse.jpg';
const COIN_BEI = 'assets/coins/reverse.jpg';
// 爻值 6老阴 7少阳 8少阴 9老阳；0=字面(乾隆通宝) 1=背面(光背)
const YAO_COINS = { 6: [0, 0, 0], 7: [0, 0, 1], 8: [0, 1, 1], 9: [1, 1, 1] };
const YAO_NAMES = ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻'];
const YAO_LABEL = { 6: '老阴', 7: '少阳', 8: '少阴', 9: '老阳' };
function coinTossHTML(r) {
  let h = '<div class="coin-toss">' +
    '<button class="ct-replay" data-replay type="button">重摇</button>' +
    '<div class="ct-rows">';
  r.yaos.forEach((y, i) => {
    const faces = YAO_COINS[y.val] || [0, 0, 0];
    h += '<div class="ct-row"><span class="ct-lab">' + YAO_NAMES[i][0] + '</span><div class="ct-coins">' +
      faces.map(f => '<span class="coin3d" style="--tail:' + (f ? 180 : 0) + 'deg"><i class="c-zi"></i><i class="c-bei"></i></span>').join('') +
      '</div><div class="ct-bar"><div class="ct-line' + (y.yang ? '' : ' broken') + (y.dong ? ' moving' : '') + '"></div>' +
      '<span class="ct-meta"><b>' + YAO_LABEL[y.val] + '</b>' + (y.dong ? ' · 动' : '') + '　' + esc(y.gz) + '</span></div></div>';
  });
  h += '</div><div class="ct-foot"><span>三字老阴 · 两字一背少阳 · 一字两背少阴 · 三背老阳</span>' +
    '<span>' + esc(r.benGua) + ' → ' + esc(r.bianGua) + '</span></div></div>';
  return h;
}

/* ---------------- 品牌徽标：天圆地方式盘印 ---------------- */
function brandMark() {
  let ticks = '';
  for (let b = 0; b < 12; b++) {
    const a = (b - 6) * Math.PI / 6;
    const card = b === 0 || b === 3 || b === 6 || b === 9;
    const r1 = card ? 15.6 : 17.2, r2 = 19.6;
    ticks += '<line' + (card ? ' class="bm-card"' : '') +
      ' x1="' + (24 + r1 * Math.sin(a)).toFixed(2) + '" y1="' + (24 - r1 * Math.cos(a)).toFixed(2) +
      '" x2="' + (24 + r2 * Math.sin(a)).toFixed(2) + '" y2="' + (24 - r2 * Math.cos(a)).toFixed(2) + '"/>';
  }
  return '<svg class="bm" viewBox="0 0 48 48" fill="none" aria-hidden="true">' +
    '<circle class="bm-ring" cx="24" cy="24" r="20.4"/>' + ticks +
    '<rect class="bm-dia" x="13.4" y="13.4" width="21.2" height="21.2" rx="2.6" transform="rotate(45 24 24)"/>' +
    '<circle class="bm-dot" cx="24" cy="24" r="2.1"/></svg>';
}

/* ---------------- 玄学物件背景 · 罗盘（线描，纯 SVG） ---------------- */
function ambientCompassHTML() {
  const C = 120;
  const xy = (r, deg) => {
    const a = deg * Math.PI / 180;
    return [(C + r * Math.sin(a)).toFixed(1), (C - r * Math.cos(a)).toFixed(1)];
  };
  // 二十四山刻度（每 15°），八干四维四正位（每 45°）加长并着陶土
  let ticks = '';
  for (let i = 0; i < 24; i++) {
    const deg = i * 15, card = i % 3 === 0;
    const [ox, oy] = xy(107, deg), [ix, iy] = xy(card ? 91 : 98, deg);
    ticks += '<line class="' + (card ? 'cp-accent' : '') + '" x1="' + ix + '" y1="' + iy +
      '" x2="' + ox + '" y2="' + oy + '"/>';
  }
  // 八卦方位小点
  let dots = '';
  for (let i = 0; i < 8; i++) {
    const [x, y] = xy(77, i * 45);
    dots += '<circle class="cp-dot" cx="' + x + '" cy="' + y + '" r="1.9"/>';
  }
  // 四正十字（天池外 → 内盘）
  let cross = '';
  for (let i = 0; i < 4; i++) {
    const deg = i * 90;
    const [x1, y1] = xy(51, deg), [x2, y2] = xy(68, deg);
    cross += '<line class="cp-accent" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '"/>';
  }
  return '<svg viewBox="0 0 240 240" fill="none" stroke="currentColor" aria-hidden="true">' +
    '<g class="cp-lines">' +
    '<circle cx="120" cy="120" r="116" stroke-width="2.2"/><circle cx="120" cy="120" r="107" stroke-width="1"/>' +
    ticks +
    '<circle cx="120" cy="120" r="85" stroke-width="1"/><circle cx="120" cy="120" r="69" stroke-width="1"/>' +
    dots + cross +
    '<circle cx="120" cy="120" r="50" stroke-width="1.8"/>' +
    '<g class="cp-tai">' +
    '<circle cx="120" cy="120" r="46" stroke-width="1.6"/>' +
    '<path d="M120 74 A23 23 0 0 1 120 120 A23 23 0 0 0 120 166" stroke-width="1.5"/>' +
    '<circle cx="120" cy="97" r="4.6"/><circle cx="120" cy="143" r="4.6"/>' +
    '</g></g></svg>';
}

/* ---------------- 大六壬 · 天地式盘 ---------------- */
function shipanHTML(ke) {
  const C = 180;
  const Z = Lunar.ZHI;
  const off = ((ke.offset % 12) + 12) % 12;
  const rot = ((12 - off) % 12) * 30;
  const kong = ke.kongWang || [];
  const xy = (b, r) => {
    const a = (b - 6) * Math.PI / 6;
    return [(C + r * Math.sin(a)).toFixed(1), (C - r * Math.cos(a)).toFixed(1)];
  };
  // 外盘：地盘十二支（固定）
  let earth = '';
  for (let b = 0; b < 12; b++) {
    const [x, y] = xy(b, 153);
    earth += '<text class="sp-e' + (b % 3 === 0 ? ' card' : '') + (kong.includes(b) ? ' kong' : '') +
      '" x="' + x + '" y="' + y + '">' + Z[b] + '</text>';
  }
  // 内盘：天盘十二支 + 天将（整体旋转移加正时）
  let tian = '';
  for (let b = 0; b < 12; b++) {
    const [x1, y1] = xy(b, 123);
    const [x2, y2] = xy(b, 103);
    tian += '<text class="sp-t" x="' + x1 + '" y="' + y1 + '">' + Z[b] + '</text>' +
      '<text class="sp-j" x="' + x2 + '" y="' + y2 + '">' + esc(ke.tjByShen[b] || '') + '</text>';
  }
  // 扇区
  const wedge = (p, rIn, rOut, half, cls) => {
    const a0 = (p - 6) * Math.PI / 6 - half * Math.PI / 180;
    const a1 = (p - 6) * Math.PI / 6 + half * Math.PI / 180;
    const pnt = (a, r) => [(C + r * Math.sin(a)).toFixed(1), (C - r * Math.cos(a)).toFixed(1)];
    const [x0, y0] = pnt(a0, rOut), [x1, y1] = pnt(a1, rOut);
    const [x2, y2] = pnt(a1, rIn), [x3, y3] = pnt(a0, rIn);
    return '<path class="' + cls + '" d="M' + x0 + ' ' + y0 + ' A' + rOut + ' ' + rOut + ' 0 0 1 ' + x1 + ' ' + y1 +
      ' L' + x2 + ' ' + y2 + ' A' + rIn + ' ' + rIn + ' 0 0 0 ' + x3 + ' ' + y3 + ' Z"/>';
  };
  // 标记汇聚到宫位（贵人/初/中/末可能同宫）
  const palaceOf = b => (b - off + 12) % 12;
  const marks = new Map();
  const addMark = (p, ch, cls, wedgeCls) => {
    if (!marks.has(p)) marks.set(p, { chips: [], wedge: null });
    const m = marks.get(p);
    m.chips.push({ ch, cls });
    if (!m.wedge) m.wedge = wedgeCls;
  };
  addMark(ke.guiRen.idx, ke.guiRen.label === '昼贵' ? '贵昼' : '贵夜', 'chip-gui', 'sp-w-gui');
  const sc = ke.sanChuan;
  addMark(palaceOf(sc.chu.idx), '初', 'chip-chu', 'sp-w-chu');
  addMark(palaceOf(sc.zhong.idx), '中', 'chip-zhong', 'sp-w-zhong');
  addMark(palaceOf(sc.mo.idx), '末', 'chip-mo', 'sp-w-mo');
  let wedges = '', chips = '';
  marks.forEach((m, p) => {
    if (m.wedge) wedges += wedge(p, 88, 139, 13.5, 'sp-w ' + m.wedge);
    const [x, y] = xy(p, 68);
    const clsRank = { 'chip-gui': 0, 'chip-chu': 1, 'chip-zhong': 2, 'chip-mo': 3 };
    m.chips.sort((a, b) => clsRank[a.cls] - clsRank[b.cls]);
    const ch = m.chips.map(c => c.ch).join('');
    const main = m.chips[0].cls;
    chips += '<g class="sp-chip ' + main + (ch.length > 1 ? ' two' : '') + '"><circle cx="' + x + '" cy="' + y + '" r="' +
      (ch.length > 1 ? 13 : 11) + '"/><text x="' + x + '" y="' + y + '">' + esc(ch) + '</text></g>';
  });
  // 四课上神：盘缘小点
  let lessonDots = '';
  ke.lessons.forEach((l, i) => {
    const [x, y] = xy(palaceOf(l.up), 89);
    lessonDots += '<circle class="sp-ldot" cx="' + x + '" cy="' + y + '" r="2.4"><title>' +
      ['日干课', '干阴课', '日支课', '支阴课'][i] + ' 上神' + Z[l.up] + ' ' + esc(l.upTJ || '') + '</title></circle>';
  });
  const zhanShi = (ke.yueJiang.idx - off + 12) % 12;

  return '<div class="shipan-wrap">' +
    '<svg class="shipan" viewBox="0 0 360 360" role="img" aria-label="大六壬天地盘">' +
    // 天盘旋转层的扇区/标记保持静止坐标（旋转后神归其宫）
    '<circle class="sp-r" cx="180" cy="180" r="170"/><circle class="sp-r soft" cx="180" cy="180" r="140"/>' +
    wedges +
    '<g class="tp-rot" style="--rot:' + rot + 'deg">' + tian + '</g>' +
    earth +
    '<circle class="sp-r soft" cx="180" cy="180" r="86"/>' +
    lessonDots + chips +
    // 中枢
    '<circle class="sp-hub" cx="180" cy="180" r="82"/>' +
    '<text class="sp-cap" x="180" y="160">月将加时</text>' +
    '<text class="sp-main" x="180" y="186"><tspan class="clay">' + esc(ke.yueJiang.zhi) + '将</tspan>' +
    '<tspan class="sp-plus"> 加 </tspan><tspan>' + Z[zhanShi] + '时</tspan></text>' +
    '<text class="sp-sub" x="180" y="206">' + esc(ke.guiRen.label) + ' · ' + (ke.isFuYin ? '伏吟' : ke.isFanYin ? '返吟' : '移宫') + '</text>' +
    '</svg>' +
    '<div class="sp-legend"><span><i class="lg gui"></i>贵人临宫</span><span><i class="lg chu"></i>初传</span>' +
    '<span><i class="lg zhong"></i>中传</span><span><i class="lg mo"></i>末传</span><span class="lk">虚位为旬空</span></div></div>';
}

/* ---------------- 梅花易数 · 三卦联动 ---------------- */
const MH_BITS = [[1, 1, 1], [1, 1, 0], [1, 0, 1], [1, 0, 0], [0, 1, 1], [0, 1, 0], [0, 0, 1], [0, 0, 0]];
const MH_TRI = ['乾', '兑', '离', '震', '巽', '坎', '艮', '坤'];
function hexStackHTML(bits, moveLine, changeLine) {
  let h = '<div class="hx-stack">';
  for (let i = 5; i >= 0; i--) {
    const move = moveLine === i + 1, changed = changeLine === i + 1;
    h += '<div class="hx-line ' + (bits[i] ? 'yang' : 'yin') + (move ? ' move' : '') + (changed ? ' changed' : '') +
      '" style="--i:' + (5 - i) + '"><i></i>' +
      (move ? '<b class="hx-mk">动</b>' : '') + (changed ? '<b class="hx-mk ch">变</b>' : '') + '</div>';
  }
  return h + '</div>';
}
function triSymHTML(t) {
  // 微型三爻（自上而下），纯 CSS 绘制，避免八卦 Unicode 在缺字体环境出豆腐块
  const bits = MH_BITS[MH_TRI.indexOf(t.n)] || [1, 1, 1];
  let bars = '';
  for (let k = 2; k >= 0; k--) bars += '<i class="' + (bits[k] ? 'y' : 'n') + '"></i>';
  return '<span class="mh-sym wx-' + esc(t.wx) + '">' + bars + '</span>';
}
function triChipHTML(t, role) {
  return '<div class="mh-tri">' + triSymHTML(t) +
    '<span class="tn">' + esc(t.attr) + esc(t.n) + '</span>' +
    (role ? '<span class="mh-role ' + (role === '体' ? 'ti' : role === '用' ? 'yong' : 'bian') + '">' + esc(role) + '</span>' : '') + '</div>';
}
function hexCardHTML(title, tag, cls, up, dn, bits, moveLine, changeLine, roles) {
  return '<div class="mh-gua ' + cls + '">' +
    '<div class="mh-gname">' + esc(title) + '<span>' + esc(tag) + '</span></div>' +
    hexStackHTML(bits, moveLine, changeLine) +
    '<div class="mh-tris">' + triChipHTML(up, roles ? roles.up : '') + triChipHTML(dn, roles ? roles.dn : '') + '</div></div>';
}
function meihuaHTML(r) {
  const uI = MH_TRI.indexOf(r.up.n), dI = MH_TRI.indexOf(r.dn.n);
  const huUI = MH_TRI.indexOf(r.huGua.up.n), huDI = MH_TRI.indexOf(r.huGua.dn.n);
  const ben = MH_BITS[dI].concat(MH_BITS[uI]);
  const hu = MH_BITS[huDI].concat(MH_BITS[huUI]);
  const bian = MH_BITS[dI].concat(MH_BITS[uI]);
  bian[r.dongLine - 1] = bian[r.dongLine - 1] ? 0 : 1;
  const dongInUp = r.dongLine > 3;
  const roles = dongInUp ? { up: '用', dn: '体' } : { up: '体', dn: '用' };
  return '<div class="mh-wrap"><div class="mh-flow">' +
    hexCardHTML(r.guaName, '本卦 · 当下', 'ben', r.up, r.dn, ben, r.dongLine, 0, roles) +
    '<div class="mh-arrow"><span class="ar"></span><span class="ar-t">互 · 过程</span></div>' +
    hexCardHTML(r.huGua.name, '互卦 · 中段', 'hu', r.huGua.up, r.huGua.dn, hu, 0, 0, null) +
    '<div class="mh-arrow"><span class="ar"></span><span class="ar-t">变 · 结果</span></div>' +
    hexCardHTML(r.bianGua.name, '变卦 · 终局', 'bian', r.bianGua.up, r.bianGua.dn, bian, 0, r.dongLine,
      dongInUp ? { up: '变用', dn: '体' } : { up: '体', dn: '变用' }) +
    '</div>' +
    '<div class="mh-rel ' + (r.relGood ? 'good' : (r.rel.indexOf('克体') >= 0 ? 'bad' : 'warn')) + '"><span class="mr-k">体用</span><b>' + esc(r.rel) + '</b>' +
    '<span class="mr-d">体 ' + esc(r.tiGua.n) + '（' + esc(r.tiGua.wx) + '）主自身 · 用 ' + esc(r.yongGua.n) + '（' + esc(r.yongGua.wx) + '）主所问</span></div></div>';
}

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
  if (window.Fx) Fx.enhance(view);
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
  if (window.Fx) Fx.enhance(z);
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
  if (window.Fx) Fx.enhance(view);
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

// 六爻「重摇」：同一时刻重新随机起卦，刷新缓存与当前视图/盘面并重播掷钱动画
async function replayLiuYao(btn) {
  if (btn.disabled) return;
  const toss = btn.closest('.coin-toss');
  if (!toss) return;
  const inBoard = !!toss.closest('#board');
  const m = location.hash.match(/^#\/case\/(.+)$/);
  let date, qtype, holder, isCurrent;
  let caseId = null;
  if (m) {
    caseId = decodeURIComponent(m[1]);
    const c = getCase(caseId);
    const cache = caseCache[caseId];
    if (!c || !cache || !cache['六爻']) return;
    date = new Date(c.createdAt); qtype = c.qType;
    holder = cache['六爻']; isCurrent = cache.current === '六爻';
  } else {
    const r = getRt();
    if (!r.others['六爻']) return;
    date = r.date; qtype = '其他';
    holder = r.others['六爻']; isCurrent = r.current === '六爻';
  }
  if (!holder.comp) return;
  btn.disabled = true;
  try {
    // 真实三枚铜钱：三字=老阴6(1/8) 两字一背=少阳7(3/8) 一字两背=少阴8(3/8) 三背=老阳9(1/8)
    const yaos = [];
    for (let i = 0; i < 6; i++) {
      let bei = 0;
      for (let c = 0; c < 3; c++) if (Math.random() < 0.5) bei++;
      yaos.push({ val: [6, 7, 8, 9][bei] });
    }
    const comp = ShuShu.compute('六爻', { date, questionType: qtype, askInfo: { yaos, date, note: '手动重摇' } });
    holder.comp = comp;
    if (inBoard && app.classList.contains('board-open')) {
      genericBoard('六爻', comp); // openBoard 内部会 Fx.enhance 重播动画
    } else if (isCurrent) {
      const z = $('#readZone');
      if (z) {
        z.innerHTML = readingBlock('六爻', comp);
        if (window.Fx) Fx.enhance(z);
        const b = $('[data-board]', z);
        if (b) b.onclick = () => {
          if (caseId) { const cache = caseCache[caseId]; genericBoard('六爻', cache['六爻'].comp); }
          else genericBoard('六爻', getRt().others['六爻'].comp);
        };
      }
    }
  } catch (e) {
    toast('重摇失败，请再试一次');
    btn.disabled = false;
  }
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

/* ============================================================
   视图：命盘 —— 终身命理（八字 × 紫微斗数 × AI 问对）
   排盘复用同源引擎 ShuShu.baZiByBirth / ziWeiDouShu，零算法改动。
   ============================================================ */
const K_MING = 'xj_web_ming';
const K_MING_CHAT = 'xj_web_ming_chat';
const K_CLOUD = 'xj_web_cloud';
const MING_CITIES = ['北京','上海','广州','深圳','成都','杭州','南京','武汉','西安','重庆','天津','苏州','郑州','长沙','福州','沈阳','哈尔滨','长春','石家庄','太原','济南','青岛','合肥','南昌','昆明','贵阳','南宁','海口','兰州','银川','西宁','乌鲁木齐','拉萨','呼和浩特','台北','香港','澳门'];
const WX_HEX = { '金': '#B7924B', '木': '#5B9A6E', '水': '#5790B5', '火': '#D0744F', '土': '#A8915E' };
let mingCache = null; // {profile,bazi,ziwei}
let mingBusy = false;

function getProfile() { return LS.get(K_MING, null); }
function birthInfoOf(p) {
  const d0 = new Date(p.iso);
  const d = p.unknownHour ? new Date(d0.getFullYear(), d0.getMonth(), d0.getDate(), 12, 0) : d0;
  return { date: d, gender: p.gender, unknownHour: !!p.unknownHour, zhenTaiyang: !!p.zhenTaiyang, place: p.place || '' };
}

/* ---------- 云客户端（与 APK 端同契约：/v1/auth/* + /v1/ai/chat） ---------- */
const Cloud = {
  all() { return LS.get(K_CLOUD, null); },
  save(s) { LS.set(K_CLOUD, s); },
  rand(n) {
    const a = 'abcdefghjkmnpqrstuvwxyz23456789';
    let out = '';
    try {
      const buf = new Uint8Array(n);
      crypto.getRandomValues(buf);
      for (let i = 0; i < n; i++) out += a[buf[i] % a.length];
    } catch (e) { for (let i = 0; i < n; i++) out += a[Math.floor(Math.random() * a.length)]; }
    return out;
  },
  genToken() {
    const s = this.rand(24);
    return s.replace(/(.{4})(?=.)/g, '$1-');
  },
  genRecovery() { return 'xj-' + this.rand(20); },
  async req(path, opts, retry) {
    const s = this.all();
    const headers = {};
    if (s && s.access) headers.authorization = 'Bearer ' + s.access;
    let body = opts.body;
    if (body) { headers['content-type'] = 'application/json'; body = JSON.stringify(body); }
    let res, txt;
    try {
      res = await fetch(path, { method: opts.method || 'GET', headers, body, signal: opts.signal });
      txt = await res.text();
    } catch (e) { const err = new Error('网络连接失败，请检查网络后重试。'); err.status = 0; throw err; }
    let j = null;
    try { j = txt ? JSON.parse(txt) : null; } catch (e) { j = { raw: txt }; }
    if (res.status === 401 && retry !== false && s && s.refresh) {
      const rj = await this.req('/v1/auth/refresh', { method: 'POST', body: { refresh: s.refresh } }, false);
      s.access = rj.access; s.refresh = rj.refresh; this.save(s);
      return this.req(path, opts, false);
    }
    if (!res.ok) {
      const code = j && j.error;
      const msg = ({
        rate_limited: '模型限流中，请稍后再试。',
        quota_exceeded: '今日云端问答额度已用完，明天再来。',
        upstream_error: '模型服务开小差了，请稍后重试。',
        upstream_rejected: '模型服务拒绝了这次请求，请换个问法。',
        logged_out: '云端会话已失效，请重新连接。',
        ai_disabled: '云端 AI 暂未开启。'
      })[code] || (res.status === 429 ? '请求过于频繁，请稍候再试。' :
        res.status === 503 ? '云端 AI 暂未开启。' :
        (res.status === 401 || res.status === 403) ? '云端会话已失效，请重新连接。' :
        res.status >= 500 ? '云端服务异常，请稍后重试。' : '云端 AI 调用失败，请稍后重试。');
      const err = new Error(msg); err.status = res.status; err.code = code; throw err;
    }
    return j;
  },
  async ensure() {
    const s = this.all();
    if (s && s.access) return { s, registered: false };
    const token = this.genToken(), recovery = this.genRecovery();
    const j = await this.req('/v1/auth/register', { method: 'POST', body: { token, recovery, deviceName: 'web' } }, false);
    const saved = { token, recovery, access: j.access, refresh: j.refresh, userId: j.userId, at: Date.now() };
    this.save(saved);
    return { s: saved, registered: true };
  }
};

/* ---------- 视图渲染 ---------- */
function renderMing() {
  const p = getProfile();
  if (!p) { renderMingForm(null); return; }
  const info = birthInfoOf(p);
  let bazi = null, baziErr = '';
  try { bazi = ShuShu.baZiByBirth(info); } catch (e) { baziErr = String(e.message || e); }
  mingCache = { profile: p, bazi, ziwei: null };

  let h = '<div class="reading-inner" data-view="ming">';
  h += mingHeadHTML(p, bazi);
  h += '<div class="ming-grid"><div class="ming-left" id="mingLeft">';
  if (bazi) {
    h += baziHTML(bazi.result);
  } else {
    h += '<div class="m-panel"><p class="b-note">八字排盘失败：' + esc(baziErr) + '</p></div>';
  }
  h += '<div id="zwBody"><div class="m-panel"><h3>紫微斗数<span class="sub">十二宫 · 四化 · 大限流年</span></h3>' +
    '<div class="zw-loading"><span class="spin" style="display:inline-block;width:14px;height:14px;border:2px solid var(--line-2);border-top-color:var(--clay);border-radius:50%;animation:spin .7s linear infinite;margin-right:9px;vertical-align:-2px"></span>正在安星布斗…</div></div></div>';
  h += '</div>';
  h += chatHTML();
  h += '</div></div>';
  view.innerHTML = h;
  bindMingHead();
  bindChat();
  if (window.Fx) Fx.enhance(view);
  // 五行条生长
  setTimeout(() => {
    $$('.wx-fill').forEach(f => { f.style.width = f.dataset.v + '%'; });
  }, 120);
  // 紫微懒加载（iztro 库较大）
  ensureVendor('紫微斗数').then(ok => {
    const box = $('#zwBody');
    if (!box) return;
    if (!ok) { box.innerHTML = '<div class="m-panel"><h3>紫微斗数</h3><p class="b-note">紫微排盘库加载失败，请刷新重试。</p></div>'; return; }
    let zw = null;
    try { zw = ShuShu.ziWeiDouShu(info); } catch (e) {
      box.innerHTML = '<div class="m-panel"><h3>紫微斗数</h3><p class="b-note">排盘异常：' + esc(String(e.message || e)) + '</p></div>';
      return;
    }
    mingCache.ziwei = zw;
    box.innerHTML = ziweiHTML(zw);
    if (window.Fx) Fx.enhance(box);
  });
}

function mingHeadHTML(p, bazi) {
  const d = new Date(p.iso);
  const solar = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  const tags = [];
  tags.push('<span class="m-tag">' + (p.gender === '女' ? '女命' : '男命') + '</span>');
  if (p.unknownHour) tags.push('<span class="m-tag warn">时辰未知 · 午时参考</span>');
  if (p.zhenTaiyang && p.place) tags.push('<span class="m-tag gold">真太阳时 · ' + esc(p.place) + '</span>');
  const note = bazi && bazi.result && bazi.result.zhenTaiyangNote ? esc(bazi.result.zhenTaiyangNote) : '';
  return '<div class="m-panel ming-head"><div>' +
    '<div class="kicker" style="margin-bottom:8px">终身命盘 · 八字 × 紫微</div>' +
    '<div class="ming-title">命盘</div>' +
    '<div class="ming-sub"><span>公历 ' + esc(solar) + '</span>' + tags.join('') + (note ? '<span>' + note + '</span>' : '') + '</div>' +
    '</div><div class="ming-actions"><button class="btn ghost sm" id="mingEdit">修改生辰</button></div></div>';
}

function baziHTML(comp) {
  const R = comp;
  let h = '<div class="m-panel"><h3>四柱八字<span class="sub">立春换年 · 节令换月</span></h3><div class="bazi-pillars">';
  R.pillars.forEach(p => {
    h += '<div class="bp' + (p.name === '日柱' ? ' day' : '') + (p.unknown ? ' unknown' : '') + '">' +
      '<div class="bp-lab">' + p.name + '</div>' +
      '<div class="bp-gan wx-' + (p.ganWx || '') + '">' + esc(p.gan || '—') + '</div>' +
      '<div class="bp-zhi wx-' + (p.zhiWx || '') + '">' + esc(p.zhi || '—') + '</div>' +
      '<div class="bp-ss">' + esc(p.ganShen || '') + '</div>' +
      '<div class="bp-cg">' + (p.cangGan || []).map(c => esc(c.gan) + '<span style="opacity:.7">' + esc(c.shiShen ? '·' + c.shiShen : '') + '</span>').join('　') + '</div>' +
      '<div class="bp-ny">' + esc(R.naYin[p.name] || '') + '</div></div>';
  });
  h += '</div></div>';

  // 日主 · 喜用 · 五行
  const maxCnt = Math.max.apply(null, Object.keys(R.wxCountAll).map(k => R.wxCountAll[k]).concat([1]));
  h += '<div class="m-panel"><h3>日主喜用<span class="sub">强弱 · 调候 · 五行分布</span></h3>' +
    '<div class="m-tags" style="margin-bottom:14px">' +
    '<span class="m-tag clay">日主 ' + esc(R.dayGan) + ' · ' + esc(R.dayWx) + '</span>' +
    '<span class="m-tag ' + (R.dayStrong ? 'good' : 'warn') + '">' + (R.dayStrong ? '身偏强' : '身偏弱') + '</span>' +
    '<span class="m-tag gold">用神 · ' + esc(R.yongShen) + '</span>' +
    (R.xiJi.xi || []).map(x => '<span class="m-tag good">喜 ' + x + '</span>').join('') +
    (R.xiJi.ji || []).map(x => '<span class="m-tag warn">忌 ' + x + '</span>').join('') +
    '</div>' +
    '<p style="font-size:12.5px;color:var(--ink-3);line-height:1.7;margin-bottom:15px">' + esc(R.xiJi.reason) + '；' + esc(R.xiJi.tiaoHou) + '</p>' +
    '<div class="wx-bars">' +
    ['金','木','水','火','土'].map(w =>
      '<div class="wx-row"><span class="w-lab wx-' + w + '">' + w + '</span>' +
      '<span class="wx-track"><span class="wx-fill" data-v="' + (R.wxCountAll[w] / maxCnt * 100).toFixed(0) + '" style="background:' + WX_HEX[w] + '"></span></span>' +
      '<span class="w-cnt">' + R.wxCountAll[w] + '</span></div>').join('') +
    '</div></div>';

  // 大运
  const nowY = new Date().getFullYear();
  const birthY = R.birthDate.getFullYear();
  const age = nowY - birthY + 1;
  let curIdx = R.daYun.findIndex(d => age >= d.startAge && age <= d.endAge);
  if (curIdx < 0) curIdx = 0;
  h += '<div class="m-panel"><h3>大运<span class="sub">' + (R.daYunForward ? '阳年顺行' : '阴年逆行') + ' · ' + R.daYunStartAge.toFixed(1) + '岁起运</span></h3>' +
    '<div class="dy-scroll">' + R.daYun.map((d, i) =>
      '<div class="dy-step' + (i === curIdx ? ' cur' : '') + '"><div class="dy-gz wx-' + esc(d.ganWx) + '">' + esc(d.gz) + '</div>' +
      '<div class="dy-age">' + d.startAge + '-' + d.endAge + '岁</div>' +
      '<div class="dy-year">' + d.startYear + '-' + d.endYear + '</div>' +
      '<div class="dy-ss">' + esc(d.ganShen) + '</div></div>').join('') + '</div>' +
    '<div class="dy-now"><span class="m-tag clay">当前 ' + esc(R.daYun[curIdx].gz) + ' 运</span>' +
      '<span class="m-tag">流年 ' + esc(R.liuNian.gz) + '</span>' +
      '<span class="m-tag">流月 ' + esc(R.liuYue.gz) + '</span></div></div>';

  // 格局 · 神煞 · 刑冲
  const ssTags = Object.keys(R.shenSha).map(k => {
    const v = R.shenSha[k];
    const t = Array.isArray(v) ? v.join('/') : String(v);
    if (!t) return '';
    return '<span class="m-tag">' + esc(k) + ' ' + esc(t) + '</span>';
  }).join('');
  h += '<div class="m-panel"><h3>格局 · 神煞<span class="sub">子平定格 · 古法神煞</span></h3>' +
    '<div class="m-tags" style="margin-bottom:12px"><span class="m-tag gold">' + esc(R.geJu.name) + '</span></div>' +
    '<p style="font-size:12.5px;color:var(--ink-2);line-height:1.7;margin-bottom:13px">' + esc(R.geJu.method) + '。' + esc(R.geJu.yongShen) + '。</p>' +
    '<div class="m-tags" style="margin-bottom:12px">' + ssTags + '</div>' +
    '<p style="font-size:12px;color:var(--ink-3);line-height:1.7;margin-bottom:8px">刑冲合害：' + esc(R.xingChong.summary) + '</p>' +
    '<p style="font-size:12px;color:var(--ink-3);line-height:1.7">胎元 ' + esc(R.taiYuan.gz) + ' · 命宫 ' + esc(R.mingGong.gz) + ' · 身宫 ' + esc(R.shenGong.gz) + '</p>' +
    '</div>';
  return h;
}

/* ---------- 紫微斗数盘面 ---------- */
const ZW_POS = { '寅': [4, 1], '卯': [3, 1], '辰': [2, 1], '巳': [1, 1], '午': [1, 2], '未': [1, 3], '申': [1, 4], '酉': [2, 4], '戌': [3, 4], '亥': [4, 4], '子': [4, 3], '丑': [4, 2] };
function ziweiHTML(comp) {
  if (!comp || !comp.result) {
    return '<div class="m-panel"><h3>紫微斗数</h3><p class="b-note">' + esc((comp && comp.error) || '紫微排盘失败') + '</p></div>';
  }
  const R = comp.result, a = R.astrolabe;
  const soulP = R.soulPalace, bodyP = R.bodyPalace;
  const decP = R.decadal && R.decadal.palaceName;
  const yrP = R.yearly && R.yearly.palaceName;
  const mut = {};
  (R.siHua && R.siHua.byPalace || []).forEach(x => { if (x.palace && x.star) mut[x.palace + '|' + x.star] = x.type; });

  let cells = '';
  (a.palaces || []).forEach(p => {
    const pos = ZW_POS[p.earthlyBranch] || [1, 1];
    const cls = ['zw-cell'];
    if (p.name === soulP) cls.push('soul');
    if (p.name === decP) cls.push('decadal');
    if (p.name === yrP) cls.push('yearly');
    const majors = (p.majorStars || []).map(s => {
      const t = mut[p.name + '|' + s.name] || s.mutagen || '';
      return '<span class="' + (t ? 'mut-' + t : '') + '">' + esc(s.name) + '</span>' +
        (s.brightness ? '<span class="zh">' + esc(String(s.brightness).slice(0, 1)) + '</span>' : '');
    }).join(' ');
    const mins = (p.minorStars || []).map(s => s.name).concat((p.adjectiveStars || []).map(s => s.name)).join(' ');
    const marks = [];
    if (p.name === soulP) marks.push('<span class="zw-mk mk-soul">命</span>');
    if (p.name === bodyP) marks.push('<span class="zw-mk mk-soul" style="background:var(--ink-3)">身</span>');
    if (p.name === decP) marks.push('<span class="zw-mk mk-dec">限</span>');
    if (p.name === yrP) marks.push('<span class="zw-mk mk-yr">年</span>');
    cells += '<div class="' + cls.join(' ') + '" style="grid-row:' + pos[0] + ';grid-column:' + pos[1] + '">' +
      '<div class="zw-top"><span class="zw-name">' + esc(p.name) + '</span><span class="zw-gz">' + esc(p.heavenlyStem + p.earthlyBranch) + '</span>' +
      '<span class="zw-marks">' + marks.join('') + '</span></div>' +
      '<div class="zw-maj">' + (majors || '<span style="color:var(--ink-3);font-size:11px">空宫</span>') + '</div>' +
      '<div class="zw-min">' + esc(mins) + '</div></div>';
  });

  const si4 = R.siHua;
  const si4Tags = si4 ? [
    '<span class="m-tag" style="color:var(--gold)">化禄 ' + esc(si4.化禄) + '</span>',
    '<span class="m-tag clay">化权 ' + esc(si4.化权) + '</span>',
    '<span class="m-tag" style="color:#5B7FA6">化科 ' + esc(si4.化科) + '</span>',
    '<span class="m-tag warn">化忌 ' + esc(si4.化忌) + '</span>'
  ].join('') : '';

  let h = '<div class="m-panel"><h3>紫微斗数<span class="sub">命宫 ' + esc(soulP) + ' · 身宫 ' + esc(bodyP) + '</span></h3>';
  h += '<div class="m-tags" style="margin-bottom:13px">' +
    '<span class="m-tag clay">命宫 ' + esc(soulP) + (R.majorStars.length ? ' · ' + R.majorStars.join('、') : ' · 空宫') + '</span>' +
    '<span class="m-tag">身宫 ' + esc(bodyP) + '</span>' +
    '<span class="m-tag gold">五行局 ' + esc(a.fiveElementsClass || '—') + '</span>' +
    '<span class="m-tag">命主 ' + esc(a.soul || '—') + ' · 身主 ' + esc(a.body || '—') + '</span>' +
    si4Tags + '</div>';
  if (R.decadal) h += '<p style="font-size:12.5px;color:var(--ink-2);margin-bottom:12px">大限 ' + esc(R.decadal.palaceName) + '（' + R.decadal.startAge + '-' + R.decadal.endAge + '岁）' +
    (R.decadal.stars && R.decadal.stars.length ? ' · ' + esc(R.decadal.stars.join('、')) : '') +
    (R.yearly ? '　流年 ' + esc(R.yearly.yearlyGanZhi) + ' 走' + esc(R.yearly.palaceName) : '') + '</p>';
  h += '<div class="zw-grid">' + cells +
    '<div class="zw-center"><div class="zc-seal">' + brandMark() + '</div>' +
    '<div class="zc-ju">' + esc(a.fiveElementsClass || '') + '</div>' +
    '<div class="zc-zhu">命主 ' + esc(a.soul || '—') + ' · 身主 ' + esc(a.body || '—') + '</div>' +
    (si4 ? '<div class="zc-zhu" style="line-height:1.7">禄<span class="mut-禄">' + esc(si4.化禄) + '</span> · 权<span class="mut-权">' + esc(si4.化权) + '</span> · 科<span class="mut-科">' + esc(si4.化科) + '</span> · 忌<span class="mut-忌">' + esc(si4.化忌) + '</span></div>' : '') +
    '</div></div>';
  if (R.solarDate) h += '<p style="font-size:11.5px;color:var(--ink-3);margin-top:11px">出生 ' + esc(R.solarDate) + ' · 早子/晚子按 iztro 时辰校正</p>';
  h += '</div>';
  return h;
}

/* ---------- 生辰表单（新建/编辑共用） ---------- */
function renderMingForm(profile) {
  const p = profile || { gender: '男', iso: '1995-01-01T08:00', unknownHour: false, zhenTaiyang: false, place: '' };
  let h = '<div class="reading-inner" data-view="ming"><div class="m-form">' +
    '<div class="kicker">终身命盘 · 八字 × 紫微</div>' +
    '<h2 style="font-family:var(--serif);font-size:25px;font-weight:600;margin:8px 0 6px">先排下你的命盘</h2>' +
    '<p style="font-size:13.5px;color:var(--ink-3);line-height:1.7">出生信息只保存在本机浏览器，用于排盘与 AI 问答的命盘上下文，不会随问事上传。</p>' +
    '<div class="m-panel" style="margin-top:18px">' +
    '<div class="m-field" style="margin-top:0"><label>性别</label><div class="seg" id="mfSeg">' +
    ['男', '女'].map(g => '<button type="button" data-g="' + g + '" class="' + (p.gender === g ? 'on' : '') + '">' + g + '命</button>').join('') +
    '</div></div>' +
    '<div class="m-field"><label>出生日期与时辰（公历）</label>' +
    '<input type="datetime-local" id="mfDate" value="' + esc(p.iso) + '"' + (p.unknownHour ? ' disabled' : '') + '></div>' +
    '<div class="m-switch-row"><button class="switch' + (p.unknownHour ? ' on' : '') + '" id="mfUnknown" aria-label="时辰未知"></button>' +
      '<div><div>时辰未知</div><div class="msr-d">八字时柱从略，紫微以午时参考排盘</div></div></div>' +
    '<div class="m-switch-row"><button class="switch' + (p.zhenTaiyang ? ' on' : '') + '" id="mfZhen" aria-label="真太阳时"></button>' +
      '<div><div>真太阳时校正</div><div class="msr-d">按出生地经度修正时辰交界</div></div></div>' +
    '<div class="m-field" id="mfPlaceWrap" style="' + (p.zhenTaiyang ? '' : 'display:none') + '"><label>出生城市</label>' +
      '<input type="text" id="mfPlace" list="cityList" placeholder="如：成都，或 东经104.1°" value="' + esc(p.place || '') + '">' +
      '<datalist id="cityList">' + MING_CITIES.map(c => '<option value="' + c + '">').join('') + '</datalist></div>' +
    '<div class="m-form-foot">' +
      (profile ? '<button class="btn ghost" id="mfCancel">返回</button>' : '<a class="btn ghost" href="#/home">返回</a>') +
      '<button class="btn primary" id="mfSave">排盘' +
      '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>' +
    '</div>' +
    '<p class="m-note-line">八字以立春为年界、节令为月界；紫微依早子/晚子分时时辰。排盘引擎与安卓端同源同算。</p>' +
    '</div></div></div>';
  view.innerHTML = h;
  if (window.Fx) Fx.enhance(view);

  let form = { gender: p.gender, unknownHour: !!p.unknownHour, zhenTaiyang: !!p.zhenTaiyang };
  $$('#mfSeg button').forEach(b => b.onclick = () => {
    form.gender = b.dataset.g;
    $$('#mfSeg button').forEach(x => x.classList.toggle('on', x === b));
  });
  $('#mfUnknown').onclick = () => {
    form.unknownHour = !form.unknownHour;
    $('#mfUnknown').classList.toggle('on', form.unknownHour);
    $('#mfDate').disabled = form.unknownHour;
    if (form.unknownHour) {
      const v = $('#mfDate').value || p.iso;
      $('#mfDate').value = v.slice(0, 10) + 'T12:00';
    }
  };
  $('#mfZhen').onclick = () => {
    form.zhenTaiyang = !form.zhenTaiyang;
    $('#mfZhen').classList.toggle('on', form.zhenTaiyang);
    $('#mfPlaceWrap').style.display = form.zhenTaiyang ? '' : 'none';
  };
  const cancel = $('#mfCancel');
  if (cancel) cancel.onclick = () => location.hash = '#/ming';
  $('#mfSave').onclick = () => {
    const iso = $('#mfDate').value;
    const d = new Date(iso);
    if (!iso || isNaN(d.getTime())) { toast('请选择有效的出生日期'); return; }
    if (form.zhenTaiyang && !$('#mfPlace').value.trim()) { toast('开启真太阳时后请填写出生城市'); return; }
    const np = { gender: form.gender, iso, unknownHour: form.unknownHour, zhenTaiyang: form.zhenTaiyang, place: $('#mfPlace').value.trim() };
    LS.set(K_MING, np);
    mingCache = null;
    toast('命盘已排定');
    if (location.hash === '#/ming') renderMing(); else location.hash = '#/ming';
  };
}

function bindMingHead() {
  const b = $('#mingEdit');
  if (b) b.onclick = () => renderMingForm(getProfile());
}

/* ---------- AI 问对 ---------- */
const MING_SUGGESTS = ['我的事业格局与适合行业？', '感情婚姻怎么看？', '财运走势与理财倾向', '健康上要注意什么？', '今年流年的重点提醒', '当前大运这十年怎么走？'];
function chatHTML() {
  return '<div class="ming-chat">' +
    '<div class="chat-h"><div class="ch-ico">问</div><div><div class="ch-t">命盘问对</div>' +
    '<div class="ch-d">结合八字 · 紫微 · 大运流年</div></div>' +
    '<button class="chat-status" id="chatStatus" title="云令牌"><span class="cd"></span><span id="chatStatusTxt">待连接</span></button></div>' +
    '<div class="chat-msgs" id="chatMsgs"></div>' +
    '<div class="chat-suggest" id="chatSuggest">' +
    MING_SUGGESTS.map(q => '<button class="chip" data-q="' + esc(q) + '">' + esc(q) + '</button>').join('') +
    '</div>' +
    '<div class="chat-input"><textarea id="chatInput" rows="1" placeholder="就命盘问点什么… Enter 发送"></textarea>' +
    '<button class="chat-send" id="chatSend"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5M6 11l6-6 6 6"/></svg></button></div>' +
    '<div class="chat-foot">AI 内容由云端模型生成，仅作文化参考，不构成医疗、法律、投资建议</div>' +
    '</div>';
}
function getChat() { return LS.get(K_MING_CHAT, []); }
function saveChat(a) { LS.set(K_MING_CHAT, a.slice(-40)); }
function md2html(s) {
  return esc(s).split(/\n{2,}/).map(p =>
    '<p>' + p.replace(/\n/g, '<br>').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') + '</p>'
  ).join('');
}
function paintChat(withWelcome) {
  const box = $('#chatMsgs');
  if (!box) return;
  const msgs = getChat();
  if (!msgs.length && withWelcome) {
    const r = mingCache && mingCache.bazi && mingCache.bazi.result;
    const zw = mingCache && mingCache.ziwei && mingCache.ziwei.result;
    let hi = '命盘已排好。我可以结合你的八字、紫微与大运流年，回答事业、感情、财运、健康、流年节奏等问题。';
    if (r) hi += '\n\n你是 **' + r.dayGan + r.dayWx + ' 日主**，' + (r.dayStrong ? '身偏强' : '身偏弱') + '，用神参考「' + r.yongShen + '」；';
    if (zw) hi += '紫微命宫在 **' + zw.soulPalace + '**' + (zw.majorStars.length ? '，主星 ' + zw.majorStars.join('、') : '（空宫）') + '。';
    hi += '\n\n试试右下角的问题，或直接输入你关心的事。';
    box.innerHTML = '<div class="msg ai">' + md2html(hi) + '</div>';
    box.scrollTop = box.scrollHeight;
    return;
  }
  box.innerHTML = msgs.map(m =>
    m.role === 'user' ? '<div class="msg user">' + esc(m.content) + '</div>' :
    '<div class="msg ai">' + md2html(m.content) + '</div>').join('');
  box.scrollTop = box.scrollHeight;
}
function setChatStatus(online, text) {
  const st = $('#chatStatus'); if (!st) return;
  st.classList.toggle('online', !!online);
  const t = $('#chatStatusTxt'); if (t && text) t.textContent = text;
}
function bindChat() {
  paintChat(true);
  setChatStatus(!!(Cloud.all() && Cloud.all().access), Cloud.all() && Cloud.all().access ? '已连接' : '待连接');
  const input = $('#chatInput');
  const send = $('#chatSend');
  const doSend = () => {
    const text = input.value.trim();
    if (!text || mingBusy) { if (!text) input.focus(); return; }
    input.value = ''; input.style.height = 'auto';
    const msgs = getChat();
    msgs.push({ role: 'user', content: text });
    saveChat(msgs);
    paintChat(false);
    askCloud(text);
  };
  send.onclick = doSend;
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
  });
  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 96) + 'px'; });
  $$('#chatSuggest .chip').forEach(c => c.onclick = () => {
    if (mingBusy) return;
    input.value = c.dataset.q; doSend();
  });
  $('#chatStatus').onclick = () => {
    const s = Cloud.all();
    if (!s) { toast('完成第一次问答后自动开通云令牌'); return; }
    credentialModal(s);
  };
}

function buildMingSystem() {
  const L = [
    '你是用户的「终身命理顾问」。基于下方八字与紫微斗数命盘，通过多轮对话帮用户做自我觉察与趋吉避凶参考。',
    '要求：',
    '1. 白话、具体、分阶段（结合大运/流年），不下"断终身"式绝对结论；',
    '2. 以喜用神为日常建议核心，多用方位、颜色、行业、作息、人际等可执行语言；',
    '3. 重大选择给"宜观察的信号 / 宜等待的时机"，不替用户做决定；',
    '4. 禁止绝对化措辞与改命、法事、符咒、消灾等说法；健康仅为文化参考，必要时提示就医；',
    '5. 回答控制在 350 字内，可用小标题或分点，关键处可用 **加粗**。'
  ].join('\n');
  let ctx = '';
  const R = mingCache && mingCache.bazi && mingCache.bazi.result;
  if (R) {
    ctx += '\n\n# 八字命盘\n';
    ctx += '四柱：' + R.pillars.map(p => p.name + p.gz + '（' + p.ganShen + '）').join(' ') + '\n';
    ctx += '日主：' + R.dayGan + '（' + R.dayWx + '），' + (R.dayStrong ? '偏强' : '偏弱') + '；参考用神：' + R.yongShen + '\n';
    ctx += '喜：' + (R.xiJi.xi || []).join('、') + '；忌：' + (R.xiJi.ji || []).join('、') + '；调候：' + R.xiJi.tiaoHou + '\n';
    ctx += '五行分布（含藏干）：' + R.wxStr + '；格局：' + R.geJu.name + '\n';
    const nowY = new Date().getFullYear(), age = nowY - R.birthDate.getFullYear() + 1;
    const cur = R.daYun.find(d => age >= d.startAge && age <= d.endAge) || R.daYun[0];
    ctx += '大运：' + R.daYunStartAge.toFixed(1) + '岁' + (R.daYunForward ? '顺排' : '逆排') +
      '；当前大运 ' + cur.gz + '（' + cur.startAge + '-' + cur.endAge + '岁，' + cur.ganShen + '）\n';
    ctx += '当前流年 ' + R.liuNian.gz + '，流月 ' + R.liuYue.gz + '\n';
    if (R.unknownHour) ctx += '注意：用户时辰未知，时柱从略，相关判断需保守。\n';
  }
  const Z = mingCache && mingCache.ziwei && mingCache.ziwei.result;
  if (Z && Z.astrolabe) {
    ctx += '\n# 紫微斗数命盘\n';
    ctx += '命宫：' + Z.soulPalace + (Z.majorStars.length ? '（主星 ' + Z.majorStars.join('、') + '）' : '（空宫）') +
      '；身宫：' + Z.bodyPalace + '；五行局 ' + (Z.astrolabe.fiveElementsClass || '—') +
      '；命主 ' + (Z.astrolabe.soul || '—') + '，身主 ' + (Z.astrolabe.body || '—') + '\n';
    (Z.astrolabe.palaces || []).forEach(p => {
      const ms = (p.majorStars || []).map(s => s.name + (s.brightness ? '(' + s.brightness + ')' : '')).join('、');
      ctx += p.name + '(' + p.heavenlyStem + p.earthlyBranch + ')：' + (ms || '空宫') + '\n';
    });
    if (Z.siHua) ctx += '生年四化：化禄 ' + Z.siHua.化禄 + '、化权 ' + Z.siHua.化权 + '、化科 ' + Z.siHua.化科 + '、化忌 ' + Z.siHua.化忌 + '\n';
    if (Z.decadal) ctx += '当前大限：' + Z.decadal.palaceName + '（' + Z.decadal.startAge + '-' + Z.decadal.endAge + '岁）\n';
    if (Z.yearly) ctx += '当前流年：' + Z.yearly.yearlyGanZhi + ' 在' + Z.yearly.palaceName + '\n';
  }
  return L + ctx;
}

async function askCloud() {
  mingBusy = true;
  const send = $('#chatSend'); if (send) send.disabled = true;
  const box = $('#chatMsgs');
  const ty = document.createElement('div');
  ty.className = 'msg ai';
  ty.innerHTML = '<span class="chat-typing"><i></i><i></i><i></i></span>';
  box.appendChild(ty); box.scrollTop = box.scrollHeight;

  let content = '';
  try {
    const ensured = await Cloud.ensure();
    if (ensured.registered) credentialModal(ensured.s, true);
    setChatStatus(true, '已连接');
    const history = getChat().slice(-20).map(m => ({ role: m.role, content: m.content }));
    const j = await Cloud.req('/v1/ai/chat', {
      method: 'POST',
      body: { messages: [{ role: 'system', content: buildMingSystem() }].concat(history), temperature: .7, max_tokens: 900 }
    });
    content = (j && j.content || '').trim();
    if (!content) content = '云端这次没有给出有效回复，请换个问法再试一次。';
  } catch (e) {
    content = '⚠ ' + (e.message || '云端连接失败，请稍后重试。') + '\n\n命盘本身已完整保存在本机；你也可以稍后在网络正常时继续问对。';
  }

  // 流式落字（本地模拟打字机节奏）
  ty.innerHTML = '<span class="caret"></span>';
  const caret = ty.querySelector('.caret');
  let shown = 0;
  const step = () => {
    if (!document.body.contains(ty)) { mingBusy = false; if (send) send.disabled = false; return; }
    shown = Math.min(content.length, shown + 3);
    caret.innerHTML = md2html(content.slice(0, shown));
    box.scrollTop = box.scrollHeight;
    if (shown < content.length) { setTimeout(step, 12); return; }
    ty.innerHTML = md2html(content);
    const msgs = getChat();
    if (msgs.length && msgs[msgs.length - 1].role === 'user') {
      msgs.push({ role: 'assistant', content });
      saveChat(msgs);
    }
    mingBusy = false; if (send) send.disabled = false;
    box.scrollTop = box.scrollHeight;
  };
  setTimeout(step, 60);
}

function credentialModal(s, justRegistered) {
  const row = (k, v) => '<label>' + k + '</label><div style="display:flex;gap:8px;margin-top:6px">' +
    '<input type="text" readonly value="' + esc(v) + '" id="cpVal" style="margin-top:0;flex:1;font-family:ui-monospace,monospace;font-size:12.5px">' +
    '<button class="btn ghost sm" id="cpCopy">复制</button></div>';
  const m = openModal(
    '<h3>' + (justRegistered ? '云令牌已自动开通' : '我的云令牌') + '</h3>' +
    '<p>AI 问答通过云端模型提供，令牌只用于识别你的本机会话。<strong style="color:var(--clay)">请复制保存恢复口令</strong>：清浏览器数据后，只有它能找回会话额度。</p>' +
    row('同步令牌', s.token) + row('恢复口令', s.recovery) +
    '<div class="modal-foot"><button class="btn primary" data-act="yes">我已保存</button></div>'
  );
  $('[data-act=yes]', m.root).onclick = m.close;
  $('#cpCopy', m.root).onclick = () => {
    const v = $('#cpVal', m.root).value;
    if (navigator.clipboard) navigator.clipboard.writeText(v).then(() => toast('已复制'));
    else { $('#cpVal', m.root).select(); document.execCommand('copy'); toast('已复制'); }
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
  const titles = { home: '时课', ming: '命盘', classics: '典籍', history: '问事录', settings: '设置', case: '问事' };
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
  else if (hash === '#/ming') { setNav('ming'); renderMing(); }
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
// 六爻重摇（全局事件委托，覆盖时课页/案例页/盘面抽屉）
document.addEventListener('click', e => {
  const b = e.target.closest('[data-replay]');
  if (b) replayLiuYao(b);
});
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

/* ---------------- 玄学背景交互：磁针追鼠标 / 铜钱 3D 倾摆可拨 / 景深视差 ---------------- */
function ambientFX() {
  const fine = window.matchMedia && window.matchMedia('(hover:hover) and (pointer:fine)').matches;
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const compass = $('#ambCompass');
  if (!compass) return;

  // 天池磁针：朱砂/素白双色，独立于慢转刻盘，实时指向光标
  const needle = document.createElement('div');
  needle.className = 'amb-needle';
  needle.innerHTML = '<svg viewBox="0 0 240 240" aria-hidden="true">' +
    '<line x1="120" y1="44" x2="120" y2="196" stroke-width="1.4" stroke="currentColor" stroke-dasharray="132 8 108" stroke-linecap="round" opacity=".55"/>' +
    '<path d="M120 40 L114.6 120 L120 132 L125.4 120 Z" fill="currentColor" opacity=".65"/>' +
    '<circle cx="120" cy="120" r="4.6" fill="none" stroke="currentColor" stroke-width="1.6" opacity=".7"/>' +
    '<circle cx="120" cy="120" r="1.6" fill="currentColor" opacity=".7"/></svg>';
  compass.appendChild(needle);

  const coins = [...document.querySelectorAll('.amb-coin')];
  const yaos = [...document.querySelectorAll('.amb-yao')];
  coins.forEach(c => { c.style.pointerEvents = 'auto'; c.style.cursor = 'pointer'; });

  if (!fine || reduced) return; // 无精鼠标或减弱动效：只保留磁针位与慢转，不做视差

  // 视差景深系数（位移 px / 倾摆 deg），物件越"远"动得越少
  const DEPTH = [
    { el: compass, dx: 16, dy: 12, tx: 0, ty: 0 },
    { el: coins[0], dx: -20, dy: -13, tx: 9, ty: 13 },
    { el: coins[1], dx: -13, dy: -9, tx: 7, ty: 10 },
    { el: coins[2], dx: -17, dy: -11, tx: 8, ty: 12 },
    { el: yaos[0], dx: -24, dy: -16, tx: 0, ty: 0 },
    { el: yaos[1], dx: -21, dy: -14, tx: 0, ty: 0 }
  ].filter(d => d.el);

  let tx = 0, ty = 0, cx = 0, cy = 0, ang = 0, angT = 0;
  let raf = 0, lastMove = 0, running = false;

  function frame() {
    cx += (tx - cx) * .1; cy += (ty - cy) * .1;
    // 磁针走最短弧（跨 ±180° 边界不绕远）
    let da = angT - ang;
    while (da > 180) da -= 360;
    while (da < -180) da += 360;
    ang += da * .12;
    for (const d of DEPTH) {
      d.el.style.setProperty('--dx', (cx * d.dx).toFixed(2) + 'px');
      d.el.style.setProperty('--dy', (cy * d.dy).toFixed(2) + 'px');
      if (d.tx) d.el.style.setProperty('--tx', (cy * d.tx).toFixed(2) + 'deg');
      if (d.ty) d.el.style.setProperty('--ty', (cx * d.ty).toFixed(2) + 'deg');
    }
    compass.style.setProperty('--nrot', ang.toFixed(2) + 'deg');
    const idle = Date.now() - lastMove > 2400;
    let rest = angT - ang;
    while (rest > 180) rest -= 360;
    while (rest < -180) rest += 360;
    if (idle && Math.abs(cx) < .002 && Math.abs(cy) < .002 && Math.abs(rest) < .4) {
      raf = 0; running = false; return;
    }
    raf = requestAnimationFrame(frame);
  }
  function wake() { if (!running) { running = true; raf = requestAnimationFrame(frame); } }

  window.addEventListener('pointermove', (e) => {
    tx = e.clientX / window.innerWidth * 2 - 1;
    ty = e.clientY / window.innerHeight * 2 - 1;
    const r = compass.getBoundingClientRect();
    angT = Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI + 90;
    lastMove = Date.now();
    wake();
  }, { passive: true });

  // 静止后目标全部回正（视差、倾摆、磁针归北）
  setInterval(() => {
    if (Date.now() - lastMove > 2400) { tx = 0; ty = 0; angT = 0; }
  }, 600);

  // 拨铜钱：翻钱一周 + 轻落
  coins.forEach(c => {
    c.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const inner = c.querySelector('.amb-float');
      if (!inner) return;
      inner.classList.remove('coin-flip');
      void inner.offsetWidth;
      inner.classList.add('coin-flip');
      setTimeout(() => inner.classList.remove('coin-flip'), 900);
    });
  });
}

/* ---------------- 启动 ---------------- */
$('#brandMark').innerHTML = brandMark();
// 开屏一次性入场编排（减弱动效时不加 boot，元素直接全显）
const motionOK = !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
if (motionOK) document.documentElement.classList.add('boot');
// 玄学背景：罗盘内加旋转层；铜钱加漂浮层、卦爻加淡入层（静态透明度/角度在外层，规避 keyframes 变量兼容）
const ambCompass = $('#ambCompass');
if (ambCompass) {
  ambCompass.innerHTML = '<div class="amb-spin">' + ambientCompassHTML() + '</div>';
  document.querySelectorAll('.amb-coin > svg').forEach(svg => {
    const w = document.createElement('div');
    w.className = 'amb-float';
    svg.parentNode.insertBefore(w, svg);
    w.appendChild(svg);
  });
  document.querySelectorAll('.amb-yao > svg').forEach(svg => {
    const w = document.createElement('div');
    w.className = 'amb-fade';
    svg.parentNode.insertBefore(w, svg);
    w.appendChild(svg);
  });
  // 暖光晕移到 body：fixed 全屏铺底，让侧栏/抽屉的毛玻璃能磨到它
  const aurora = document.querySelector('.amb-aurora');
  if (aurora) document.body.appendChild(aurora);
  ambientFX();
}
if (motionOK) setTimeout(() => document.documentElement.classList.remove('boot'), 1500);
applyTheme();
if (settings.railHidden) app.classList.add('rail-hidden');
renderRecent();
tickClock();
route();

})();
