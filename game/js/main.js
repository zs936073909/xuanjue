// 玄决 · 夜盘
// 关卡由 lunar.js + daliuren.js 的真实起课生成：月将加时、天将、三传、空亡、类神、神煞。
import { createAudio } from './audio.js';
import {
  WX, WX_COLOR, QUESTIONS, LINES, BOONS, SHA,
  overcomeBy, judge, pickWispWx, gateNeed, gateClearBonus, grade, dirName, palaceOf,
  DIFFICULTIES, difficultyById,
} from './rules.js';
import {
  THREE, DISK_R, createStage, createPlayer, createPedestals, buildPlate, makeWisp,
} from './world.js';

const audio = createAudio();
const canvas = document.getElementById('view');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

let stage, player, pedestals, plate;
let cast = null;
let hourOffset = 0;
let question = '事业合作';
let difficulty = 'normal';
let mode = 'title';
let pausedFrom = 'play';
let ready = false;
let tutorialSeen = false;
let titleAng = 0.4;
let cineT = 0;
let outroT = 0;
let outroWin = false;
let camOrbit = 0;
let dragging = null;
let moveTarget = null;
let lift = 0;
let liftTarget = 0;
let duel = null;
let layoutGates = [];
let layoutLei = -1;
let confirm = { id: -1, until: 0 };
let wxLock = 0;

const pos = new THREE.Vector3();
let yaw = 0;
const keys = Object.create(null);
const joy = { x: 0, y: 0, active: false, id: null };
const camForward = new THREE.Vector3();
const camRight = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

const run = {
  hearts: 5, maxHearts: 5, score: 0, scoreMul: 1, speedMul: 1, hoverMul: 1, wx: '土', gate: 0, leiDone: false,
  pacified: new Set(), boonTaken: new Set(), shaTaken: new Set(),
  veil: 0, slowNext: false, shengNext: false, haste: 0,
  invuln: 0, dangerTime: 0, streak: 0, defeated: false,
};

const $ = (id) => document.getElementById(id);

function setMode(next) {
  mode = next;
  document.body.classList.remove('mode-title', 'mode-cine', 'mode-play', 'mode-duel', 'mode-tutorial', 'mode-pause', 'mode-outro', 'mode-result');
  document.body.classList.add('mode-' + next);
  $('title').classList.toggle('hidden', next !== 'title');
  const look = document.getElementById('lookbar');
  if (look) look.classList.toggle('hidden', next !== 'look');
  $('result').classList.toggle('hidden', next !== 'result');
  $('tutorial').classList.toggle('hidden', next !== 'tutorial');
  $('pause').classList.toggle('hidden', next !== 'pause');
  $('skip-wrap').classList.toggle('hidden', next !== 'cine');
}

async function loadFont() {
  const res = await fetch('/game/fonts/noto-serif-sc-400.woff2');
  if (!res.ok) throw new Error('font ' + res.status);
  const face = new FontFace('XJ Serif', await res.arrayBuffer());
  await face.load();
  document.fonts.add(face);
  await document.fonts.load('600 64px "XJ Serif"');
}

function castChart() {
  const date = new Date(Date.now() + hourOffset * 2 * 3600 * 1000);
  const baZi = Lunar.getBaZi(date);
  const yj = Lunar.getYueJiang(date, '中气定将');
  const ke = DaLiuRen.qiKe(date, baZi, yj.zhiIdx, baZi.hour.zhiIdx, {
    questionType: question,
    guiRenMode: '昼夜贵人',
    sheHaiMode: '涉害取深',
  });
  cast = {
    date, baZi, yj, ke,
    explain: DaLiuRen.explainGeju(ke),
    plain: DaLiuRen.plainLang(ke, question),
    tjWX: DaLiuRen.TJ_WX,
    tjJI: DaLiuRen.TJ_JI,
  };
  layoutGates = ['初传', '中传', '末传'].map((name, idx) => {
    const sp = [ke.sanChuan.chu, ke.sanChuan.zhong, ke.sanChuan.mo][idx];
    return { name, spirit: sp, palace: palaceOf(ke.tianPan, sp.idx), done: false };
  });
  layoutLei = ke.leishenShen == null ? -1 : palaceOf(ke.tianPan, ke.leishenShen);
  paintPreview();
}

function rebuild() {
  if (plate) plate.dispose();
  plate = buildPlate(stage, cast);
  player.setSeal(cast.baZi.day.gan);
  stage.skyUniforms.uNight.value = cast.ke.guiRen.isDay ? 0.22 : 1;
  stage.moon.color.set(cast.ke.guiRen.isDay ? 0xf0c9a4 : 0xd9d4cc);
  stage.scene.fog.density = cast.ke.isFuYin ? 0.021 : 0.0135;
  paintChart();
}

function resetRun() {
  const diff = difficultyById(difficulty);
  run.maxHearts = diff.hearts;
  run.hearts = diff.hearts;
  run.scoreMul = diff.score;
  run.speedMul = diff.speed;
  run.hoverMul = diff.hover;
  run.score = 0;
  run.wx = DaLiuRen.GAN_WX[cast.baZi.day.gan] || '土';
  run.gate = 0;
  run.leiDone = false;
  run.pacified = new Set();
  run.boonTaken = new Set();
  run.shaTaken = new Set();
  run.veil = 0;
  run.slowNext = false;
  run.shengNext = false;
  run.haste = 0;
  run.invuln = 0;
  run.dangerTime = 0;
  run.streak = 0;
  run.defeated = false;
  layoutGates.forEach((g) => { g.done = false; });
  pos.set(0, 0, 0);
  yaw = 0;
  moveTarget = null;
  clearDuel(true);
  lift = 0;
  liftTarget = 0;
  if (pedestals) pedestals.setLift(0);
  if (player) setWx(run.wx, true);
  if (plate) {
    plate.palaces.forEach((p) => {
      p.general.userData.bow = 0;
      p.general.scale.setScalar(mode === 'cine' ? 0.001 : 1);
    });
  }
  paintHearts();
  paintScore();
}

function paintPreview() {
  const sc = cast.ke.sanChuan;
  const q = QUESTIONS.find((x) => x.id === question);
  $('hour-label').innerHTML = `<b>${cast.baZi.day.gz}日 · ${cast.baZi.hour.zhi}时</b><br>${fmt(cast.date)}`;
  $('preview').innerHTML =
    `<b>${cast.yj.jieqi} · 月将${cast.yj.zhi} · ${cast.ke.guiRen.label} · ${cast.ke.geju.join(' · ')}</b><br>` +
    `初 ${sc.chu.zhi}·${sc.chu.tj} → 中 ${sc.zhong.zhi}·${sc.zhong.tj} → 末 ${sc.mo.zhi}·${sc.mo.tj}<br>` +
    `所问${q ? q.label : ''}，类神${cast.ke.leishenName}` +
    (cast.ke.isFuYin ? ' · 伏吟' : '') + (cast.ke.isFanYin ? ' · 返吟' : '');
}

function paintChart() {
  const sc = cast.ke.sanChuan;
  $('chart').innerHTML =
    `<b>${cast.baZi.day.gz}日 ${cast.baZi.hour.gz}时</b>` +
    `月将${cast.yj.zhi} · ${cast.ke.guiRen.label} · <i>${cast.ke.geju[0] || '常课'}</i><br>` +
    `初${sc.chu.zhi}${sc.chu.tj} → 中${sc.zhong.zhi}${sc.zhong.tj} → 末${sc.mo.zhi}${sc.mo.tj}`;
}

function fmt(d) {
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function paintHearts() {
  $('hearts').querySelectorAll('i').forEach((el, i) => {
    el.classList.toggle('offlamp', i >= run.maxHearts);
    el.classList.toggle('on', i < run.hearts);
  });
}
function paintScore() {
  $('score').querySelector('b').textContent = String(run.score);
  $('streak').textContent = run.streak >= 2 ? `连应 ${run.streak}` : (run.veil > 0 ? `可避 ${run.veil}` : '');
}

function setWx(wx, silent) {
  if (!WX.includes(wx) || !player) return;
  const changed = run.wx !== wx;
  run.wx = wx;
  player.setColor(WX_COLOR[wx]);
  stage.playerLight.color.set(WX_COLOR[wx]);
  document.querySelectorAll('.wx-btn').forEach((b) => b.classList.toggle('on', b.dataset.wx === wx));
  if (changed && !silent) {
    wxLock = 1.4;
    audio.wx(wx);
  }
}

function addScore(n) {
  run.score += Math.max(0, Math.round(n * (run.scoreMul || 1)));
  paintScore();
}
function heal(n) {
  run.hearts = Math.min(5, run.hearts + n);
  paintHearts();
}

let bannerToken = 0;
function banner(text, ms = 2400) {
  const el = $('banner');
  el.textContent = text;
  el.classList.add('show');
  const token = ++bannerToken;
  setTimeout(() => { if (token === bannerToken) el.classList.remove('show'); }, ms);
}

function floatText(world, text, color) {
  const el = document.createElement('div');
  el.className = 'floater';
  el.textContent = text;
  el.style.color = color || '#F5F4EE';
  document.body.appendChild(el);
  const p = world.clone();
  const t0 = performance.now();
  function step(now) {
    const k = (now - t0) / 900;
    if (k >= 1) { el.remove(); return; }
    const s = p.clone().project(stage.camera);
    el.style.left = ((s.x * 0.5 + 0.5) * window.innerWidth) + 'px';
    el.style.top = ((-s.y * 0.5 + 0.5) * window.innerHeight - k * 40) + 'px';
    el.style.opacity = String(Math.max(0, 1 - k));
    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function playerChest() {
  return new THREE.Vector3(pos.x, 1.05, pos.z);
}
function distTo(p) {
  return Math.hypot(pos.x - p.pos.x, pos.z - p.pos.z);
}
function nearestPalace(maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const p of plate.palaces) {
    const d = distTo(p);
    if (d < bestD) { best = p; bestD = d; }
  }
  return best;
}
function currentGate() {
  return run.gate < layoutGates.length ? layoutGates[run.gate] : null;
}
function isCurrentGate(p) {
  const g = currentGate();
  return !!(g && !g.done && g.palace === p.i);
}
function isFutureGate(p) {
  return layoutGates.some((g, i) => i > run.gate && !g.done && g.palace === p.i);
}

function hurt(n, why) {
  if (run.defeated) return;
  if ((why === '煞气' || why === '来袭' || why === '被克反噬') && run.veil > 0) {
    run.veil--;
    paintScore();
    floatText(playerChest(), '遮蔽', '#d9d3c7');
    audio.empty();
    run.invuln = 0.4;
    return;
  }
  if (why === '煞气' && run.invuln > 0) return;
  run.hearts = Math.max(0, run.hearts - n);
  run.invuln = why === '煞气' ? 1.35 : 0.28;
  run.streak = 0;
  paintHearts();
  paintScore();
  audio.hurt();
  $('vignette').classList.add('hurt');
  setTimeout(() => $('vignette').classList.remove('hurt'), 180);
  floatText(playerChest(), why || '伤心神', '#e5615b');
  if (stage) stage.burst(playerChest(), 0xc45048, 8);
  if (run.hearts <= 0) {
    run.defeated = true;
    audio.fail();
    if (mode === 'duel' && duel && !duel.ending) {
      duel.ending = -1;
      duel.endT = 0.65;
    } else if (mode === 'play') startOutro(false);
  }
}

function resolveLei() {
  if (run.leiDone || layoutLei < 0) return '';
  run.leiDone = true;
  const p = plate.palaces[layoutLei];
  if (p.kong) {
    addScore(12);
    return '类神落空，所问之力发虚';
  }
  addScore(50);
  return '类神有应 · ' + p.tj;
}

function takeSha(p) {
  const notes = [];
  for (const tag of p.tags) {
    const key = p.i + ':' + tag;
    if (run.shaTaken.has(key)) continue;
    run.shaTaken.add(key);
    const spec = SHA[tag];
    if (!spec) continue;
    if (spec.score) addScore(spec.score);
    if (spec.flag === 'veil') run.veil++;
    if (spec.flag === 'haste') run.haste = 14;
    notes.push(spec.text);
  }
  paintScore();
  return notes.join('。');
}

function giveBoon(p) {
  if (run.boonTaken.has(p.i)) return '';
  run.boonTaken.add(p.i);
  const b = BOONS[p.tj];
  if (!b) return LINES[p.tj] || p.tj;
  if (b.hearts) heal(b.hearts);
  if (b.score) addScore(b.score);
  if (b.flag === 'sheng') run.shengNext = true;
  if (b.flag === 'slow') run.slowNext = true;
  if (b.flag === 'veil') run.veil++;
  paintScore();
  const lei = p.i === layoutLei ? resolveLei() : '';
  return [b.text, lei].filter(Boolean).join('。');
}

function tryVisit() {
  const p = nearestPalace(2.75);
  if (!p) { banner('附近没有可拜访的宫'); return; }
  if (isCurrentGate(p)) { startDuel(p, false); return; }
  const shaLeft = p.tags.some((t) => !run.shaTaken.has(p.i + ':' + t));
  const boonLeft = p.ji > 0 && !run.boonTaken.has(p.i);
  if (shaLeft || boonLeft) {
    const notes = [];
    if (shaLeft) notes.push(takeSha(p));
    if (boonLeft) notes.push(giveBoon(p));
    banner(notes.filter(Boolean).join('。') || p.tj);
    return;
  }
  if (isFutureGate(p)) { banner('这一宫在后面的传里'); return; }
  if (p.ji < 0 && !run.pacified.has(p.i)) {
    if (confirm.id === p.i && performance.now() < confirm.until) {
      confirm.id = -1;
      startDuel(p, true);
    } else {
      confirm = { id: p.i, until: performance.now() + 2800 };
      banner(p.tj + '煞重。再按一次确认一试');
    }
  }
}

function startDuel(palace, optional) {
  if (run.defeated || run.hearts <= 0) return;
  const arena = palace.pos.clone();
  const inward = arena.length() > 0.01 ? arena.clone().normalize() : new THREE.Vector3(0, 0, 1);
  arena.addScaledVector(inward, -3.05);
  if (arena.length() < 3.4) arena.setLength(3.4);
  const first = !optional && run.gate === 0 && !tutorialSeenDuel;
  duel = {
    palace, optional,
    need: gateNeed(palace.ji),
    progress: 0,
    hurt: false,
    cd: 0.2,
    spawnIn: 0.35,
    active: null,
    first,
    arena,
    ending: 0,
    endT: 0,
    slow: run.slowNext,
    sheng: palace.ji > 0 || run.shengNext,
    spawned: 0,
  };
  run.slowNext = false;
  run.shengNext = false;
  palace.general.userData.bow = 0;
  pedestals.place(duel.arena);
  liftTarget = 1;
  moveTarget = null;
  setMode('duel');
  audio.enter();
  const counter = overcomeBy(palace.tjWX);
  if (first) banner(`第一道光是${palace.tjWX}。用${counter}去应：站上发光的坛，光近了再按空格。`, 3400);
  else banner(LINES[palace.tj] || palace.tj);
}

let tutorialSeenDuel = false;

function killWisp(w) {
  if (!w) return;
  stage.scene.remove(w.mesh);
  w.mesh.traverse((o) => {
    if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
    if (!o.material) return;
    const mats = [].concat(o.material);
    mats.forEach((m) => m.dispose());
  });
  if (duel && duel.active === w) duel.active = null;
}

function clearDuel(drop) {
  if (duel && duel.active) killWisp(duel.active);
  if (drop) duel = null;
}

function exitDuel() {
  if (duel && duel.active) killWisp(duel.active);
  duel = null;
  liftTarget = 0;
  if (!run.defeated && mode !== 'outro' && mode !== 'result') setMode('play');
}

function spawnWisp() {
  const palace = duel.palace;
  const slow = duel.slow || (duel.first && duel.spawned === 0);
  const wx = (duel.first && duel.spawned === 0)
    ? palace.tjWX
    : pickWispWx(palace.tjWX, run.wx, Math.random(), Math.random());
  const mesh = makeWisp(wx);
  const from = palace.pos.clone();
  from.y = 1.75;
  const ang = Math.random() * Math.PI * 2;
  const hoverAt = duel.arena.clone();
  hoverAt.x += Math.cos(ang) * 1.55;
  hoverAt.z += Math.sin(ang) * 1.55;
  hoverAt.y = 1.15;
  mesh.position.copy(from);
  stage.scene.add(mesh);
  duel.active = {
    mesh, wx, phase: 'out', t: 0, from, hoverAt,
    homeT: 0,
    maxHome: (slow ? 2.2 : (palace.ji > 0 ? 1.9 : 1.45)) * (run.hoverMul || 1),
    speed: (slow ? 3.05 : (palace.ji > 0 ? 3.85 : 5.15)) * (run.speedMul || 1),
    hoverDur: (slow ? 1.3 : (palace.ji > 0 ? 0.9 : 0.58)) * (run.hoverMul || 1),
  };
  duel.spawned++;
  pedestals.highlight(overcomeBy(wx));
}

function finishWisp(w, text, color) {
  if (text) floatText(w.mesh.position, text, color);
  killWisp(w);
  if (duel && !duel.ending) duel.spawnIn = 0.55;
}

function applyJudge(w, result, timing) {
  const color = WX_COLOR[w.wx];
  if (result.progress) {
    duel.progress++;
    if (result.kind === '克' && timing > 0.66) run.streak++;
    else if (result.kind !== '克') run.streak = 0;
    let extra = 0;
    if (run.streak >= 2) extra = 6 * (run.streak - 1);
    addScore(result.score + extra);
    if (result.kind === '生') audio.sheng();
    else audio.ke(timing > 0.66);
    stage.burst(w.mesh.position, color, 14);
    stage.shockwave(pos, color);
    floatText(w.mesh.position, result.text + (extra ? ' · 连应' : ''), '#f3e6d4');
    if (duel.progress >= duel.need) beginClear();
  } else if (result.damage) {
    duel.hurt = true;
    run.streak = 0;
    hurt(1, result.text);
    stage.burst(w.mesh.position, 0xc45048, 10);
  } else {
    run.streak = 0;
    addScore(result.score);
    if (result.kind === '空') audio.empty();
    else audio.sheng();
    floatText(w.mesh.position, result.text, result.kind === '空' ? '#b7b1a6' : '#d7e2c8');
    stage.burst(w.mesh.position, color, 8);
  }
  finishWisp(w);
}

function tryCounter() {
  if (mode !== 'duel' || !duel || duel.ending || duel.cd > 0) return;
  const w = duel.active;
  if (!w || w.phase !== 'home') {
    duel.cd = 0.16;
    return;
  }
  const dist = w.mesh.position.distanceTo(playerChest());
  if (dist > 2.6) {
    duel.cd = 0.16;
    floatText(playerChest(), '未到', '#cbb8a8');
    return;
  }
  const timing = 1 - Math.max(0, Math.min(1, (dist - 0.62) / 1.9));
  const embodied = onPedestal() === overcomeBy(w.wx);
  const result = judge({
    playerWx: run.wx,
    wispWx: w.wx,
    timing,
    embodied,
    kong: duel.palace.kong || duel.palace.tj === '天空',
    kongRoll: Math.random(),
    shengCounts: duel.sheng,
  });
  duel.cd = 0.32;
  if (duel.first) { duel.first = false; tutorialSeenDuel = true; }
  applyJudge(w, result, timing);
}

function onPedestal() {
  if (!duel) return null;
  let best = null;
  let bestD = 0.8;
  for (const it of pedestals.items) {
    if (!it.world) continue;
    const d = Math.hypot(pos.x - it.world.x, pos.z - it.world.z);
    if (d < bestD) { best = it.wx; bestD = d; }
  }
  return best;
}

function beginClear() {
  if (!duel || duel.ending) return;
  duel.ending = 1;
  duel.endT = 0.9;
  const palace = duel.palace;
  palace.general.userData.bow = 1;
  audio.clear();
  stage.shockwave(palace.pos, 0xe7b49a);
  if (duel.optional) addScore(35);
  else addScore(gateClearBonus(!duel.hurt));
  run.pacified.add(palace.i);
  const lei = palace.i === layoutLei ? resolveLei() : '';
  let line;
  if (!duel.optional) {
    const g = currentGate();
    if (g && g.palace === palace.i) {
      g.done = true;
      run.gate++;
      const nxt = currentGate();
      line = nxt && nxt.palace === palace.i
        ? g.name + '已应。此宫亦是' + nxt.name + '，再应一次'
        : g.name + '已应 · ' + palace.tj;
    } else line = palace.tj + '已应';
  } else line = palace.tj + '退开';
  banner([line, lei].filter(Boolean).join('。'));
}

function updateDuel(dt) {
  duel.cd = Math.max(0, duel.cd - dt);
  const rel = pos.clone().sub(duel.arena);
  rel.y = 0;
  if (rel.length() > 2.42) {
    rel.setLength(2.42);
    pos.x = duel.arena.x + rel.x;
    pos.z = duel.arena.z + rel.z;
  }
  const stood = onPedestal();
  if (stood && stood !== run.wx && wxLock <= 0) setWx(stood, true);
  if (!duel.active && !duel.ending) {
    pedestals.highlight(overcomeBy(duel.palace.tjWX));
    duel.spawnIn -= dt;
    if (duel.spawnIn <= 0 && run.hearts > 0) spawnWisp();
  }
  const w = duel.active;
  if (w) {
    w.t += dt;
    if (w.phase === 'out') {
      const k = Math.min(1, w.t / 0.42);
      w.mesh.position.lerpVectors(w.from, w.hoverAt, smoother(k));
      if (k >= 1) { w.phase = 'hover'; w.t = 0; }
    } else if (w.phase === 'hover') {
      w.mesh.position.copy(w.hoverAt);
      w.mesh.position.y = 1.15 + Math.sin(w.t * 6) * 0.07;
      if (w.t >= w.hoverDur) { w.phase = 'home'; w.homeT = 0; }
    } else if (w.phase === 'home') {
      const target = playerChest();
      const delta = target.clone().sub(w.mesh.position);
      const dist = delta.length();
      if (dist < 0.62) {
        duel.hurt = true;
        if (duel.first) { duel.first = false; tutorialSeenDuel = true; }
        hurt(1, '来袭');
        finishWisp(w, '', '#e5615b');
      } else {
        w.mesh.position.addScaledVector(delta.normalize(), w.speed * dt);
        w.homeT += dt;
        if (w.homeT >= w.maxHome) {
          if (duel.first) { duel.first = false; tutorialSeenDuel = true; }
          finishWisp(w, '避过', '#cbb8a8');
        }
      }
    }
    if (w.mesh && w.mesh.userData.halo) {
      const s = 1 + Math.sin(performance.now() / 180) * 0.08;
      w.mesh.userData.halo.scale.setScalar(s);
    }
  }
  if (duel && duel.ending) {
    duel.endT -= dt;
    if (duel.endT <= 0) {
      const win = duel.ending > 0;
      const done = win && !duel.optional && run.gate >= 3;
      const dead = run.defeated;
      exitDuel();
      if (dead) startOutro(false);
      else if (done) startOutro(true);
    }
  }
}

function smoother(k) { return k * k * (3 - 2 * k); }

function updateDanger(dt) {
  if (mode !== 'play') {
    document.body.classList.remove('danger');
    return;
  }
  let inD = false;
  for (const p of plate.palaces) {
    if (p.ji >= 0 || run.pacified.has(p.i) || isCurrentGate(p)) continue;
    if (distTo(p) < 3.15) {
      inD = true;
      const ax = pos.x - p.pos.x;
      const az = pos.z - p.pos.z;
      const len = Math.hypot(ax, az) || 1;
      pos.x += (ax / len) * 1.7 * dt;
      pos.z += (az / len) * 1.7 * dt;
    }
  }
  document.body.classList.toggle('danger', inD);
  if (inD) {
    run.dangerTime += dt;
    if (run.dangerTime > 0.75) {
      hurt(1, '煞气');
      run.dangerTime = 0;
    }
  } else run.dangerTime = 0;
}

function collide() {
  const maxR = DISK_R - 0.75;
  const r = Math.hypot(pos.x, pos.z);
  if (r > maxR) {
    pos.x *= maxR / r;
    pos.z *= maxR / r;
  }
  if (mode === 'duel') return;
  for (const p of plate.palaces) {
    const dx = pos.x - p.pos.x;
    const dz = pos.z - p.pos.z;
    const d = Math.hypot(dx, dz);
    const min = 0.72;
    if (d < min && d > 0.001) {
      pos.x = p.pos.x + (dx / d) * min;
      pos.z = p.pos.z + (dz / d) * min;
    }
  }
}

function cameraBasis() {
  stage.camera.getWorldDirection(camForward);
  camForward.y = 0;
  if (camForward.lengthSq() < 0.0001) camForward.set(0, 0, -1);
  camForward.normalize();
  camRight.crossVectors(camForward, UP).normalize();
}

function updateMove(dt) {
  if (mode !== 'play' && mode !== 'duel') return;
  cameraBasis();
  const wish = new THREE.Vector3();
  if (keys.KeyW || keys.ArrowUp) wish.add(camForward);
  if (keys.KeyS || keys.ArrowDown) wish.sub(camForward);
  if (keys.KeyD || keys.ArrowRight) wish.add(camRight);
  if (keys.KeyA || keys.ArrowLeft) wish.sub(camRight);
  if (joy.active) wish.addScaledVector(camRight, joy.x).addScaledVector(camForward, joy.y);
  const moving = wish.lengthSq() > 0.002;
  if (moving) {
    wish.normalize();
    moveTarget = null;
    const fu = cast && cast.ke.isFuYin ? 0.88 : 1;
    const speed = (keys.ShiftLeft ? 8.2 : 6.3) * (run.haste > 0 ? 1.28 : 1) * (mode === 'duel' ? 0.94 : 1) * fu;
    pos.addScaledVector(wish, speed * dt);
    yaw = Math.atan2(-wish.x, -wish.z);
  } else if (moveTarget && mode === 'play') {
    const d = moveTarget.clone().sub(pos);
    d.y = 0;
    if (d.length() < 0.18) moveTarget = null;
    else {
      d.normalize();
      const fu = cast && cast.ke.isFuYin ? 0.88 : 1;
      pos.addScaledVector(d, 6.1 * dt * (run.haste > 0 ? 1.28 : 1) * fu);
      yaw = Math.atan2(-d.x, -d.z);
    }
  }
  if (mode === 'play') updateDanger(dt);
  collide();
}

function updateCamera(dt, t) {
  const cam = stage.camera;
  if (mode === 'title' || mode === 'look') {
    titleAng += dt * (reduceMotion ? 0.02 : 0.065);
    cam.position.set(Math.sin(titleAng) * 20, 11.2, Math.cos(titleAng) * 20);
    cam.lookAt(0, 1.1, 0);
    return;
  }
  if (mode === 'cine') {
    const k = Math.min(1, cineT / (reduceMotion ? 0.8 : 6.4));
    const e = smoother(k);
    cam.position.set(Math.sin(k) * (1 - e) * 8, 22 - e * 16.6, 15 - e * 6.6);
    cam.lookAt(0, 1, 0);
    return;
  }
  if (mode === 'outro') {
    const desired = new THREE.Vector3(0.3, 22.5, 0.4);
    cam.position.lerp(desired, 1 - Math.exp(-1.6 * dt));
    cam.lookAt(0, 0, 0);
    return;
  }
  let desired;
  if (mode === 'duel' && duel) {
    const inward = duel.arena.clone().normalize();
    desired = duel.arena.clone().addScaledVector(inward, -6.4);
    desired.y = 6.5;
    cam.position.lerp(desired, 1 - Math.exp(-3.2 * dt));
    cam.lookAt(duel.arena.x, 1.1, duel.arena.z);
    return;
  }
  if (!dragging) camOrbit *= Math.exp(-0.55 * dt);
  const facing = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const back = facing.multiplyScalar(-1);
  const bx = back.x * Math.cos(camOrbit) - back.z * Math.sin(camOrbit);
  const bz = back.x * Math.sin(camOrbit) + back.z * Math.cos(camOrbit);
  desired = new THREE.Vector3(pos.x + bx * 7.5, 4.7, pos.z + bz * 7.5);
  cam.position.lerp(desired, 1 - Math.exp(-4.2 * dt));
  cam.lookAt(pos.x, 1.15, pos.z);
  void t;
}

function updateWorld(t, dt) {
  stage.skyUniforms.uTime.value = t;
  stage.seaUniforms.uTime.value = t;
  if (plate) {
    plate.decorRing.rotation.z = cast.ke.isFanYin ? Math.sin(t * 0.8) * 0.18 : t * 0.04;
    const showRun = mode !== 'title' && mode !== 'result';
    plate.palaces.forEach((p) => {
      p.general.userData.tick(t);
      const gateIdx = layoutGates.findIndex((g, i) => g.palace === p.i && i === (showRun ? run.gate : 0) && (showRun ? run.gate < 3 : true));
      const isObj = showRun ? isCurrentGate(p) : layoutGates[0] && layoutGates[0].palace === p.i;
      p.beacon.visible = isObj;
      p.beacon.material.opacity = 0.2 + Math.sin(t * 3) * 0.1;
      p.leiBeam.visible = p.i === layoutLei && !run.leiDone;
      p.leiBeam.material.opacity = 0.16 + Math.sin(t * 2.2) * 0.06;
      const dangerOn = showRun && p.ji < 0 && !run.pacified.has(p.i) && !isObj;
      p.danger.material.opacity = dangerOn ? 0.26 + Math.sin(t * 4) * 0.1 : 0;
      p.objective.material.opacity = isObj && showRun ? 0.4 + Math.sin(t * 3.2) * 0.18 : 0;
      void gateIdx;
    });
    const focus = (showRun && currentGate()) ? plate.palaces[currentGate().palace] : plate.palaces[layoutGates[0] ? layoutGates[0].palace : 0];
    if (focus) stage.gateLight.position.lerp(new THREE.Vector3(focus.pos.x, 2.4, focus.pos.z), 1 - Math.exp(-3 * dt));
    const gate = currentGate();
    const showGuide = (mode === 'play') && gate && plate.palaces[gate.palace];
    if (stage.guide) {
      stage.guide.set(pos, showGuide ? plate.palaces[gate.palace].pos : pos, !!showGuide, t);
    }
  }
  stage.gateLight.intensity = 26 + Math.sin(t * 2.2) * 6;
  stage.playerLight.position.set(pos.x, 1.15, pos.z);
  const dust = stage.dust.geometry.attributes.position;
  for (let i = 1; i < dust.array.length; i += 3) {
    dust.array[i] += dt * 0.07;
    if (dust.array[i] > 3.8) dust.array[i] = 0.15;
  }
  dust.needsUpdate = true;
  lift += (liftTarget - lift) * Math.min(1, dt * 4);
  if (pedestals) pedestals.setLift(lift);
  if (run.haste > 0) run.haste = Math.max(0, run.haste - dt);
  if (run.invuln > 0) run.invuln = Math.max(0, run.invuln - dt);
  if (wxLock > 0) wxLock = Math.max(0, wxLock - dt);
  stage.updateFx(dt);
}

function updateHUD() {
  if (mode !== 'play' && mode !== 'duel' && mode !== 'tutorial') return;
  const obj = $('objective');
  const g = currentGate();
  if (!g) {
    obj.querySelector('strong').textContent = '三传已应';
    obj.querySelector('span').textContent = '可以在盘上再走一走';
  } else if (mode === 'duel' && duel) {
    const w = duel.active;
    obj.querySelector('strong').textContent = (duel.optional ? '试 · ' : '') + duel.palace.tj;
    obj.querySelector('span').textContent = w
      ? `来袭 ${w.wx} · 用 ${overcomeBy(w.wx)} 去应 · ${duel.progress}/${duel.need}`
      : `克${duel.palace.tjWX}用${overcomeBy(duel.palace.tjWX)} · ${duel.progress}/${duel.need}`;
  } else {
    const p = plate.palaces[g.palace];
    obj.querySelector('strong').textContent = `${g.name} · ${p.zhi}宫 · ${p.tj}`;
    obj.querySelector('span').textContent =
      `在${dirName(pos, p.pos)} · 克${p.tjWX}用${overcomeBy(p.tjWX)}` +
      (p.kong ? ' · 空亡' : '') + (p.ji > 0 ? ' · 吉' : ' · 凶');
  }
  const near = nearestPalace(3);
  let prompt = '';
  if (mode === 'duel') prompt = '空格 · 应';
  else if (near && isCurrentGate(near) && distTo(near) < 2.8) prompt = '空格 · 入' + g.name;
  else if (near && distTo(near) < 2.7) {
    const bits = [];
    if (near.tags.some((t) => !run.shaTaken.has(near.i + ':' + t))) bits.push('E · 取' + near.tags[0]);
    if (near.ji > 0 && !run.boonTaken.has(near.i) && !isCurrentGate(near)) bits.push('E · 拜访' + near.tj);
    else if (near.ji < 0 && !run.pacified.has(near.i) && !isCurrentGate(near) && !isFutureGate(near)) bits.push('E · 试' + near.tj);
    prompt = bits.join('   ') || `${near.tj} · ${near.zhi}${near.sx}`;
  }
  const promptEl = $('prompt');
  promptEl.textContent = prompt;
  promptEl.classList.toggle('hidden', !prompt);
  const ying = $('btn-ying');
  if (mode === 'duel') ying.textContent = '应';
  else if (near && isCurrentGate(near) && distTo(near) < 2.8) ying.textContent = '入';
  else ying.textContent = '访';
  let readyHit = false;
  if (mode === 'duel' && duel && duel.active && duel.active.phase === 'home') {
    readyHit = duel.active.mesh.position.distanceTo(playerChest()) < 2.6;
  }
  ying.classList.toggle('ready', readyHit);
  paintDetail(near);
  drawMinimap();
}

function paintDetail(near) {
  const el = $('detail');
  if (!el) return;
  if (!near || (mode !== 'play' && mode !== 'duel') || distTo(near) > 4.2) {
    el.classList.remove('show');
    return;
  }
  const state = DaLiuRen.wangXiang(near.skyIdx, cast.baZi.month.zhiIdx);
  const tags = near.tags.length ? near.tags.join('·') : '无神煞';
  el.innerHTML = `<b>${near.tj}</b> · ${near.tjWX} · ${near.ji > 0 ? '吉' : '凶'} · ${state}` +
    `<br>${near.zhi}${near.sx}宫 · 天盘${near.sky}` +
    (near.kong ? ' · 空亡' : '') +
    `<br>${tags}` +
    (near.i === layoutLei ? '<br>此宫是类神' : '');
  el.classList.add('show');
}

function drawMinimap() {
  const c = $('minimap');
  const g = c.getContext('2d');
  const w = c.width;
  const cx = w / 2;
  const rad = w * 0.38;
  g.clearRect(0, 0, w, w);
  g.fillStyle = 'rgba(18,16,14,.2)';
  g.beginPath();
  g.arc(cx, cx, rad + 8, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#8F8B81';
  g.font = '14px "XJ Serif", serif';
  g.textAlign = 'center';
  g.fillText('子', cx, cx - rad - 6);
  g.strokeStyle = 'rgba(217,119,87,.45)';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(cx, cx, rad, 0, Math.PI * 2);
  g.stroke();
  const scale = rad / DISK_R;
  for (const p of plate.palaces) {
    const x = cx + p.pos.x * scale;
    const y = cx + p.pos.z * scale;
    const obj = isCurrentGate(p);
    g.fillStyle = obj ? '#E8956F' : (p.i === layoutLei && !run.leiDone ? '#d9d3c7' : (p.ji > 0 ? '#7d9a78' : '#a85850'));
    g.beginPath();
    g.arc(x, y, obj ? 6 : 4, 0, Math.PI * 2);
    g.fill();
  }
  const px = cx + pos.x * scale;
  const py = cx + pos.z * scale;
  g.save();
  g.translate(px, py);
  g.rotate(-yaw);
  g.fillStyle = '#F5F4EE';
  g.beginPath();
  g.moveTo(0, -7);
  g.lineTo(4.5, 5);
  g.lineTo(-4.5, 5);
  g.closePath();
  g.fill();
  g.restore();
}

function startRun() {
  if (!ready) return;
  audio.unlock();
  setMode('cine');
  resetRun();
  cineT = 0;
  canvas.focus();
}

function finishCine() {
  if (plate) plate.palaces.forEach((p) => p.general.scale.setScalar(1));
  if (cast.ke.isFuYin) banner('伏吟：盘气沉住，步子慢一分');
  else if (cast.ke.isFanYin) banner('返吟：天地对冲，天盘在摇');
  else if (cast.ke.geju[0]) banner(cast.ke.geju[0] + ' · ' + (cast.ke.sanChuan.method || ''));
  if (!tutorialSeen) {
    tutorialSeen = true;
    setMode('tutorial');
  } else setMode('play');
}

function startOutro(win) {
  outroWin = win;
  outroT = 0;
  setMode('outro');
  liftTarget = 0;
}

const STORE_KEY = 'xuanjue-ye-pan-v1';
function loadRecords() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || { best: 0, runs: [] }; }
  catch (e) { return { best: 0, runs: [] }; }
}
function rememberRun(gradeName) {
  const rec = loadRecords();
  const won = !run.defeated && outroWin;
  const entry = {
    score: run.score, grade: gradeName, question, won,
    geju: (cast.ke.geju || []).join('·'),
    hour: cast.baZi.hour.zhi, day: cast.baZi.day.gz, at: Date.now(),
  };
  const fresh = won && entry.score > (rec.best || 0);
  if (won) rec.best = Math.max(rec.best || 0, entry.score);
  rec.runs = [entry, ...(rec.runs || [])].slice(0, 8);
  try { localStorage.setItem(STORE_KEY, JSON.stringify(rec)); } catch (e) { /* 隐私模式可忽略 */ }
  paintRecords();
  return { rec, fresh };
}
function paintRecords() {
  const el = $('records');
  if (!el) return;
  const rec = loadRecords();
  const rows = (rec.runs || []).slice(0, 3).map((r) => `${r.day || ''}${r.hour || ''}时 ${r.grade} ${r.score}`).join(' · ');
  el.textContent = rec.best ? `本机最佳 ${rec.best}` + (rows ? ` · 近课 ${rows}` : '') : '还没有课录。走完一局会记在这台设备上。';
}
function resultPlainText() {
  const sc = cast.ke.sanChuan;
  return [
    `玄决·夜盘 ${cast.baZi.day.gz}日 ${cast.baZi.hour.gz}时`,
    `${cast.ke.geju.join(' · ')} · ${cast.ke.sanChuan.method}`,
    `初${sc.chu.zhi}${sc.chu.tj} → 中${sc.zhong.zhi}${sc.zhong.tj} → 末${sc.mo.zhi}${sc.mo.tj}`,
    cast.plain.state,
    `倾向：${cast.plain.tendency}`,
    '仅供文化体验，不是预测。',
  ].join('\n');
}

function showResult() {
  const kongGates = layoutGates.filter((g) => plate.palaces[g.palace].kong).length;
  const g = grade({ defeated: run.defeated || !outroWin, score: run.score, hearts: run.hearts, kongGates });
  $('grade').innerHTML = `${g.name}<small>这一局的走法</small>`;
  $('grade-line').textContent = g.line;
  const remembered = rememberRun(g.name);
  $('grade-score').textContent = `应验 ${run.score} · 心神 ${run.hearts}` +
    (run.leiDone ? ' · 类神已应' : ' · 类神未访') +
    (remembered.fresh && !run.defeated && outroWin ? ' · 新高' : '') +
    ` · 本机最佳 ${remembered.rec.best}`;
  const ex = cast.explain.map((row) => `<div class="kv"><b>${row.k}</b><span>${row.v}</span></div>`).join('');
  const pl = cast.plain;
  const lessons = cast.ke.lessons.map((l) => `${l.downLabel}上${Lunar.ZHI[l.up]}乘${l.upTJ}`).join(' · ');
  $('tradition').innerHTML =
    `<p>${cast.ke.sanChuan.method} · ${cast.ke.geju.join(' · ')}</p>` +
    ex +
    `<p>${pl.state}</p>` +
    `<div class="kv"><b>倾向</b><span>${pl.tendency}</span></div>` +
    `<div class="kv"><b>宜</b><span>${(pl.doAct || []).join('；') || '—'}</span></div>` +
    `<div class="kv"><b>忌</b><span>${(pl.dontAct || []).join('；') || '—'}</span></div>` +
    `<div class="kv"><b>四课</b><span>${lessons}</span></div>`;
  setMode('result');
}

function showTitle() {
  if (plate) plate.palaces.forEach((p) => {
    p.general.userData.bow = 0;
    p.general.scale.setScalar(1);
  });
  liftTarget = 0;
  setMode('title');
  paintPreview();
  paintRecords();
}

function resize() {
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  stage.renderer.setSize(w, h, false);
  stage.camera.aspect = w / Math.max(1, h);
  stage.camera.updateProjectionMatrix();
  document.body.classList.toggle('narrow', w < 860);
}

function loop(now) {
  requestAnimationFrame(loop);
  const t = now / 1000;
  const dt = Math.min(0.05, Math.max(0.001, (now - (loop.last || now)) / 1000));
  loop.last = now;
  if (mode === 'pause') {
    stage.renderer.render(stage.scene, stage.camera);
    return;
  }
  if (mode === 'cine') {
    cineT += dt;
    const dur = reduceMotion ? 0.9 : 6.6;
    if (plate) {
      plate.palaces.forEach((p, i) => {
        const start = 0.08 + (i / 12) * 0.45;
        const k = Math.max(0.001, Math.min(1, (cineT / dur - start) / 0.16));
        p.general.scale.setScalar(k);
      });
    }
    if (cineT >= dur) finishCine();
  }
  if (mode === 'play' || mode === 'duel') updateMove(dt);
  if (mode === 'duel' && duel) updateDuel(dt);
  if (mode === 'outro') {
    outroT += dt;
    if (outroT > (reduceMotion ? 0.6 : 2.15)) showResult();
  }
  const moving = mode === 'play' || mode === 'duel';
  const bob = moving ? Math.sin(t * 9) * 0.03 : Math.sin(t * 1.4) * 0.012;
  if (player) {
    player.group.position.set(pos.x, (mode === 'title' || mode === 'look' ? 0 : bob), pos.z);
    player.group.rotation.y = yaw;
    player.aura.rotation.z = t * 0.5;
    if (player.tick) player.tick(t, moving && (mode === 'play' || mode === 'duel'));
  }
  updateWorld(t, dt);
  updateCamera(dt, t);
  updateHUD();
  stage.renderer.render(stage.scene, stage.camera);
}

function clickMove(ev) {
  if (mode !== 'play' || !plate) return;
  const rect = canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((ev.clientX - rect.left) / rect.width) * 2 - 1,
    -((ev.clientY - rect.top) / rect.height) * 2 + 1
  );
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, stage.camera);
  plate.disk.updateWorldMatrix(true, false);
  const hits = ray.intersectObject(plate.disk, false);
  if (hits[0]) moveTarget = hits[0].point.clone();
}

function bindPointer() {
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    canvas.focus();
    dragging = { x: e.clientX, y: e.clientY, ox: camOrbit, moved: false, id: e.pointerId };
  });
  window.addEventListener('pointermove', (e) => {
    if (!dragging || e.pointerId !== dragging.id) return;
    const dx = e.clientX - dragging.x;
    if (Math.abs(dx) > 5 || Math.abs(e.clientY - dragging.y) > 5) dragging.moved = true;
    if (dragging.moved && !document.body.classList.contains('touch') && (mode === 'play' || mode === 'duel' || mode === 'look')) {
      camOrbit = dragging.ox - dx * 0.005;
    }
  });
  window.addEventListener('pointerup', (e) => {
    if (!dragging || e.pointerId !== dragging.id) return;
    const tap = !dragging.moved;
    dragging = null;
    if (tap && e.target === canvas) clickMove(e);
  });

  const joyEl = $('joy');
  const knob = $('knob');
  function moveJoy(e) {
    const rect = joyEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const len = Math.hypot(dx, dy) || 1;
    const max = 36;
    if (len > max) { dx *= max / len; dy *= max / len; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    joy.x = dx / max;
    joy.y = -dy / max;
  }
  joyEl.addEventListener('pointerdown', (e) => {
    joy.active = true;
    joy.id = e.pointerId;
    joyEl.setPointerCapture(e.pointerId);
    moveJoy(e);
    e.preventDefault();
  });
  joyEl.addEventListener('pointermove', (e) => { if (joy.id === e.pointerId) moveJoy(e); });
  const endJoy = (e) => {
    if (joy.id !== e.pointerId) return;
    joy.active = false;
    joy.x = 0;
    joy.y = 0;
    joy.id = null;
    knob.style.transform = '';
  };
  joyEl.addEventListener('pointerup', endJoy);
  joyEl.addEventListener('pointercancel', endJoy);
}

function onActionKey() {
  if (mode === 'cine') { finishCine(); return; }
  if (mode === 'tutorial') { setMode('play'); return; }
  if (mode === 'duel') { tryCounter(); return; }
  if (mode === 'play') {
    const near = nearestPalace(2.8);
    if (near && isCurrentGate(near)) startDuel(near, false);
  }
}

function bindKeys() {
  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    if (e.code === 'Space' || e.code === 'Enter') onActionKey();
    if (e.code === 'KeyE') {
      if (mode === 'play') tryVisit();
    }
    if (e.code === 'Escape') {
      if (mode === 'play' || mode === 'duel') { pausedFrom = mode; setMode('pause'); }
      else if (mode === 'pause') setMode(pausedFrom);
      else if (mode === 'cine') finishCine();
    }
    const digit = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4 }[e.code];
    if (digit !== undefined && (mode === 'play' || mode === 'duel')) setWx(WX[digit], false);
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
}

function syncMute() {
  document.querySelectorAll('.mute').forEach((b) => { b.textContent = audio.muted ? '声关' : '声开'; });
}

function bindUI() {
  const chips = $('chips');
  QUESTIONS.forEach((q) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (q.id === question ? ' on' : '');
    b.textContent = q.label;
    b.title = '类神' + q.lei;
    b.addEventListener('click', () => {
      if (!ready) return;
      audio.unlock();
      question = q.id;
      chips.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b));
      castChart();
      rebuild();
      audio.ui();
    });
    chips.appendChild(b);
  });
  const elements = $('elements');
  WX.forEach((wx, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'wx-btn';
    b.dataset.wx = wx;
    b.style.setProperty('--c', WX_COLOR[wx]);
    b.innerHTML = `<span>${wx}</span><small>${i + 1} 克${{ 金: '木', 木: '土', 土: '水', 水: '火', 火: '金' }[wx]}</small>`;
    b.addEventListener('click', () => {
      audio.unlock();
      if (mode === 'play' || mode === 'duel') setWx(wx, false);
    });
    elements.appendChild(b);
  });
  for (let i = 0; i < 6; i++) {
    const lamp = document.createElement('i');
    $('hearts').appendChild(lamp);
  }
  const diffs = $('diffs');
  DIFFICULTIES.forEach((d) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (d.id === difficulty ? ' on' : '');
    b.textContent = d.label;
    b.title = d.hint;
    b.addEventListener('click', () => {
      if (!ready) return;
      difficulty = d.id;
      diffs.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b));
      audio.ui();
    });
    diffs.appendChild(b);
  });
  $('btn-start').addEventListener('click', startRun);
  $('btn-look').addEventListener('click', () => { if (ready) { audio.unlock(); setMode('look'); } });
  $('btn-look-back').addEventListener('click', () => setMode('title'));
  $('btn-copy').addEventListener('click', async () => {
    const text = resultPlainText();
    try {
      await navigator.clipboard.writeText(text);
      $('btn-copy').textContent = '已复制';
    } catch (e) {
      $('btn-copy').textContent = '复制失败';
    }
    setTimeout(() => { $('btn-copy').textContent = '复制课辞'; }, 1400);
  });
  $('hour-prev').addEventListener('click', () => shiftHour(-1));
  $('hour-next').addEventListener('click', () => shiftHour(1));
  $('hour-now').addEventListener('click', () => shiftHour(0, true));
  $('skip').addEventListener('click', () => { if (mode === 'cine') finishCine(); });
  $('btn-tutorial').addEventListener('click', () => setMode('play'));
  $('btn-resume').addEventListener('click', () => setMode(pausedFrom));
  $('btn-abort').addEventListener('click', () => {
    clearDuel(true);
    liftTarget = 0;
    showTitle();
  });
  $('btn-retry').addEventListener('click', () => startRun());
  $('btn-nexthour').addEventListener('click', () => { hourOffset++; castChart(); rebuild(); showTitle(); });
  $('btn-title').addEventListener('click', showTitle);
  $('btn-ying').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    audio.unlock();
    onYing();
  });
  document.querySelectorAll('.mute').forEach((b) => b.addEventListener('click', () => {
    audio.unlock();
    audio.setMuted(!audio.muted);
    syncMute();
  }));
  window.addEventListener('resize', () => { if (stage) resize(); });
  window.addEventListener('touchstart', () => document.body.classList.add('touch'), { once: true, passive: true });
  if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');
}

function onYing() {
  if (mode === 'duel') tryCounter();
  else if (mode === 'play') {
    const near = nearestPalace(2.8);
    if (near && isCurrentGate(near)) startDuel(near, false);
    else tryVisit();
  }
}

function shiftHour(delta, now) {
  if (!ready) return;
  audio.unlock();
  audio.ui();
  hourOffset = now ? 0 : hourOffset + delta;
  castChart();
  rebuild();
}

async function init() {
  bindUI();
  bindKeys();
  bindPointer();
  if (!window.Lunar || !window.DaLiuRen) {
    $('loading').textContent = '起课模块没有加载';
    return;
  }
  try { await loadFont(); } catch (err) { console.warn(err); }
  try {
    stage = createStage(canvas);
  } catch (err) {
    $('loading').textContent = '这个环境没有 WebGL';
    return;
  }
  player = createPlayer(stage);
  pedestals = createPedestals(stage);
  try {
    castChart();
    rebuild();
    resetRun();
  } catch (err) {
    console.error(err);
    $('loading').textContent = '起课失败';
    $('preview').textContent = String(err && err.message || err);
    return;
  }
  resize();
  ready = true;
  $('btn-look').disabled = false;
  paintRecords();
  $('loading').classList.add('hidden');
  requestAnimationFrame(loop);
}

init();
