/* ============================================================
   玄决 · Web 桌面端 · 高级感动效层
   1) 鼠标拖尾：主光晕 + 7 颗尾随点（仅 fine pointer / 允许动效）
   2) 点击涟漪：主按钮/胶囊/牌面按下时迸发陶土微粒
   3) 入场编排：为区块内 .stagger 子级添加交错延迟
   纯装饰：aria-hidden + pointer-events:none，不参与任何业务逻辑。
   ============================================================ */
(function () {
'use strict';

const fine = window.matchMedia && window.matchMedia('(hover:hover) and (pointer:fine)');
const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
const GLOW_N = 7, LERP = .22, TRAIL = .16, IDLE_MS = 1400;

let layer = null, dots = [], raf = 0, alive = false;
let mx = -300, my = -300, lastMove = 0;

function buildLayer() {
  layer = document.createElement('div');
  layer.id = 'pointer-fx';
  layer.setAttribute('aria-hidden', 'true');
  const frag = document.createDocumentFragment();
  const glow = document.createElement('i');
  glow.className = 'pf-glow';
  frag.appendChild(glow);
  dots.push({ el: glow, x: mx, y: mx === -300 ? -300 : -300 });
  for (let i = 1; i <= GLOW_N; i++) {
    const d = document.createElement('i');
    d.className = 'pf-dot pf-dot-' + i;
    frag.appendChild(d);
    dots.push({ el: d, x: -300, y: -300 });
  }
  layer.appendChild(frag);
  document.body.appendChild(layer);
}

function frame() {
  const head = dots[0];
  head.x += (mx - head.x) * LERP;
  head.y += (my - head.y) * LERP;
  for (let i = 1; i < dots.length; i++) {
    const prev = dots[i - 1], cur = dots[i];
    cur.x += (prev.x - cur.x) * TRAIL;
    cur.y += (prev.y - cur.y) * TRAIL;
  }
  for (const d of dots) d.el.style.transform = 'translate3d(' + (d.x | 0) + 'px,' + (d.y | 0) + 'px,0)';
  if (Date.now() - lastMove > IDLE_MS) { sleep(); return; }
  raf = requestAnimationFrame(frame);
}
function wake() { if (!layer) return; if (!alive) { alive = true; layer.classList.add('on'); } if (!raf) raf = requestAnimationFrame(frame); }
function sleep() { if (raf) cancelAnimationFrame(raf); raf = 0; alive = false; if (layer) layer.classList.remove('on'); }

function onMove(e) { mx = e.clientX; my = e.clientY; lastMove = Date.now(); wake(); }
function onOver(e) {
  if (!layer) return;
  const hot = e.target.closest && e.target.closest('button,a,.chip,.m-cap,.nav-item,.rcard,.hist-item,.book-row,.coin-toss,[data-ripple]');
  layer.classList.toggle('hot', !!hot);
  const press = e.target.closest && e.target.closest('textarea,input,select,[contenteditable]');
  layer.classList.toggle('texting', !!press);
}

/* ---------- 点击微粒涟漪 ---------- */
function burst(x, y) {
  if (!fine || (reduced && reduced.matches) || !layer) return;
  const n = 6;
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i');
    p.className = 'pf-burst';
    const ang = (Math.PI * 2 / n) * i + Math.random() * .5;
    const dist = 22 + Math.random() * 16;
    p.style.left = x + 'px';
    p.style.top = y + 'px';
    p.style.setProperty('--dx', (Math.cos(ang) * dist).toFixed(1) + 'px');
    p.style.setProperty('--dy', (Math.sin(ang) * dist).toFixed(1) + 'px');
    layer.appendChild(p);
    setTimeout(() => p.remove(), 520);
  }
}
function onDown(e) {
  if (e.button != null && e.button !== 0) return;
  const t = e.target.closest && e.target.closest('button,.chip,.m-cap,.nav-item,.rcard,.coin-toss,[data-ripple]');
  if (t) burst(e.clientX, e.clientY);
}

/* ---------- 入场编排 ---------- */
function enhance(root) {
  if (!root) return;
  // 塔罗牌阵：挂载后依次翻牌
  const spreads = root.querySelectorAll('.spread');
  spreads.forEach(sp => {
    if (sp.dataset.fx) return;
    sp.dataset.fx = '1';
    requestAnimationFrame(() => requestAnimationFrame(() => sp.classList.add('play')));
  });
  // 摇卦：挂载后播放
  const tosses = root.querySelectorAll('.coin-toss');
  tosses.forEach(t => {
    if (t.dataset.fx) return;
    t.dataset.fx = '1';
    requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('play')));
  });
  // 交错入场
  root.querySelectorAll('.stagger').forEach(sg => {
    Array.prototype.forEach.call(sg.children, (ch, i) => {
      ch.style.animationDelay = Math.min(i * 55, 440) + 'ms';
    });
  });
}

function init() {
  if (!fine || !fine.matches || (reduced && reduced.matches)) return;
  buildLayer();
  window.addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('pointerover', onOver, { passive: true });
  document.addEventListener('pointerdown', onDown, { passive: true });
  document.addEventListener('pointerleave', sleep);
  window.addEventListener('blur', sleep);
  document.addEventListener('visibilitychange', () => { if (document.hidden) sleep(); });
  if (fine.addEventListener) fine.addEventListener('change', () => { if (!fine.matches) sleep(); });
  if (reduced.addEventListener) reduced.addEventListener('change', () => { if (reduced.matches) sleep(); });
}

window.Fx = { enhance, replay(el) {
  if (!el) return;
  el.classList.remove('play');
  void el.offsetWidth;
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('play')));
} };

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

})();
