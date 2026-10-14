/* pointer-fx.js — 桌面鼠标拖尾光晕（Claude 系气质：陶土暖光，不喧宾夺主）
   为什么存在：桌面端需要"活"的现代感；触屏与 reduced-motion 用户完全不参与。
   为什么这么写：
   ① 只动 transform，循环内零布局读写 —— 拖尾不应引发回流
   ② lerp 链式跟随（头快尾慢）比逐帧记录坐标更省内存，也更顺滑
   ③ 空闲/切后台/失焦即停帧 —— 静止时成本趋近于零
   ④ 门禁用 matchMedia 且监听变化：外接鼠标插拔、系统动效开关切换都即时生效 */
(function () {
  'use strict';

  /** @typedef {{el:HTMLElement,x:number,y:number}} TrailNode */

  var fineQ = window.matchMedia && window.matchMedia('(hover:hover) and (pointer:fine)');
  var reduceQ = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!fineQ || !reduceQ) return;

  var COUNT = 7;        // 拖尾节数（不含头部光晕）
  var HEAD_LERP = 0.22; // 光晕跟随速度
  var TAIL_LERP = 0.16; // 尾巴逐节跟随速度
  var IDLE_MS = 1400;   // 无操作停帧阈值

  /** @type {TrailNode[]} */
  var nodes = [];
  var layer = null;
  var raf = 0;
  var lastMove = 0;
  var visible = false;
  var targetX = -200, targetY = -200;

  function build() {
    layer = document.createElement('div');
    layer.id = 'pointer-fx';
    layer.setAttribute('aria-hidden', 'true'); // 纯装饰，读屏与键盘用户不感知
    var frag = document.createDocumentFragment();
    var glow = document.createElement('i');
    glow.className = 'pf-glow';
    frag.appendChild(glow);
    nodes.push({ el: glow, x: targetX, y: targetY });
    for (var i = 0; i < COUNT; i++) {
      var dot = document.createElement('i');
      dot.className = 'pf-dot pf-dot-' + (i + 1); // 尺寸/透明度阶梯交给 CSS
      frag.appendChild(dot);
      nodes.push({ el: dot, x: targetX, y: targetY });
    }
    layer.appendChild(frag);
    document.body.appendChild(layer);
  }

  function frame() {
    // 链式 lerp：头部追光标，后一节追前一节，自然形成锥形拖尾
    var head = nodes[0];
    head.x += (targetX - head.x) * HEAD_LERP;
    head.y += (targetY - head.y) * HEAD_LERP;
    for (var i = 1; i < nodes.length; i++) {
      var prev = nodes[i - 1], cur = nodes[i];
      cur.x += (prev.x - cur.x) * TAIL_LERP;
      cur.y += (prev.y - cur.y) * TAIL_LERP;
    }
    for (var j = 0; j < nodes.length; j++) {
      var n = nodes[j];
      n.el.style.transform = 'translate3d(' + (n.x | 0) + 'px,' + (n.y | 0) + 'px,0)';
    }
    if (Date.now() - lastMove > IDLE_MS) { stop(); return; }
    raf = requestAnimationFrame(frame);
  }

  function show() {
    if (visible || !layer) return;
    visible = true;
    layer.classList.add('on');
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (visible && layer) {
      visible = false;
      layer.classList.remove('on');
    }
  }

  /** @param {PointerEvent} e */
  function onMove(e) {
    targetX = e.clientX;
    targetY = e.clientY;
    lastMove = Date.now();
    show();
    // layer 不存在 = 门禁未通过（触屏 / reduced-motion，已 teardown）：
    // 此时绝不能排帧，否则 frame() 会读到空 nodes 数组而抛错
    if (!layer) return;
    if (!raf) raf = requestAnimationFrame(frame);
  }

  function teardown() {
    stop();
    if (layer && layer.parentNode) layer.parentNode.removeChild(layer);
    layer = null;
    nodes = [];
    window.removeEventListener('pointermove', onMove);
  }

  function sync() {
    // 粗指针（触屏）或系统开了"减少动态效果"：一律不参与
    if (!fineQ.matches || reduceQ.matches) { teardown(); return; }
    if (!layer) build();
  }

  sync();
  window.addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('pointerleave', stop);
  window.addEventListener('blur', stop);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop();
  });
  if (fineQ.addEventListener) {
    fineQ.addEventListener('change', sync);
    reduceQ.addEventListener('change', sync);
  } else if (fineQ.addListener) {
    // Safari <14 兜底
    fineQ.addListener(sync);
    reduceQ.addListener(sync);
  }
})();
