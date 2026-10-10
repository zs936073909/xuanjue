// 桌面壳层走查：同一页面在桌面宽屏与手机窄屏下的布局对比 + 关键交互回归
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const CHROME = '/opt/google/chrome/chrome';
const BASE = process.env.BASE_URL || 'http://localhost:8899/';
const OUT = path.join(__dirname, '..', '..', 'releases', 'verify-desktop');
fs.mkdirSync(OUT, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const errors = [];
const check = (cond, label) => {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + label);
  if (!cond) errors.push(label);
  return cond;
};

// 走到问事结果页（桌面/手机共用同一套交互路径，顺带回归功能）
async function walkToResult(page) {
  await page.goto(BASE, { waitUntil: 'load', timeout: 90000 });
  await sleep(2500);
  await page.evaluate(() => {
    const cb = document.querySelector('#agreeCheck');
    if (cb) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
    const b = document.querySelector('#btnEnter');
    if (b && !b.disabled) b.click();
  });
  await sleep(1800);
  await page.evaluate(() => { const t = document.querySelector('.tab[data-tab="ask"]'); if (t) t.click(); });
  await sleep(1200);
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('[data-type]')].find(e => e.dataset.type === '感情关系');
    if (el) el.click();
  });
  await sleep(400);
  await page.evaluate(() => {
    const n = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === '下一步');
    if (n) { n.scrollIntoView({ block: 'center' }); n.click(); }
  });
  await sleep(1100);
  await page.evaluate(() => {
    const inp = document.querySelector('#fTitle');
    if (inp) { inp.value = '与合作伙伴的项目进展如何'; inp.dispatchEvent(new Event('input', { bubbles: true })); }
    const n = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === '下一步');
    if (n) { n.scrollIntoView({ block: 'center' }); n.click(); }
  });
  await sleep(1100);
  await page.evaluate(() => {
    const m = [...document.querySelectorAll('[data-qike-method]')].find(e => e.dataset.qikeMethod === 'number');
    if (m) m.click();
  });
  await sleep(400);
  await page.evaluate(() => {
    const f = document.querySelector('#fNum');
    if (f) { f.value = '3,8'; f.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  await sleep(300);
  await page.evaluate(() => {
    const n = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === '生成结果');
    if (n) { n.scrollIntoView({ block: 'center' }); n.click(); }
  });
  await sleep(2600);
}

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME, headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });

  // ============ 桌面 1440 ============
  console.log('——— 桌面视口 1440×900 ———');
  const dp = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  dp.on('pageerror', e => { errors.push('desktop pageerror: ' + e.message); console.log('PAGEERR', e.message); });
  await dp.goto(BASE, { waitUntil: 'load', timeout: 90000 });
  await sleep(2500);
  await dp.screenshot({ path: path.join(OUT, 'd1-gate.png') });

  // 壳层断言：侧导航常驻可见 + 内容列已离开屏幕中线
  // 必须先过闸门：tabbar 位于 #main 内，闸门页时 #main 还是 hidden，量不到尺寸
  await dp.evaluate(() => {
    const cb = document.querySelector('#agreeCheck');
    if (cb) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
    const b = document.querySelector('#btnEnter');
    if (b && !b.disabled) b.click();
  });
  await sleep(1800);
  const shell = await dp.evaluate(() => {
    const tb = document.querySelector('.tabbar');
    const cs = tb ? getComputedStyle(tb) : null;
    const main = document.querySelector('#main');
    return {
      tabbarPos: cs ? cs.position : null,
      tabbarDir: cs ? cs.flexDirection : null,
      tabbarLeft: tb ? Math.round(tb.getBoundingClientRect().left) : null,
      tabbarW: tb ? Math.round(tb.getBoundingClientRect().width) : null,
      mainLeft: main ? Math.round(main.getBoundingClientRect().left) : null,
      bodyW: document.body.clientWidth
    };
  });
  console.log('SHELL =', JSON.stringify(shell));
  check(shell.tabbarPos === 'fixed', '侧导航 position:fixed（桌面常驻）');
  check(shell.tabbarDir === 'column', '侧导航竖向排列');
  check(shell.tabbarW === 216, '侧导航宽 216px');
  check(shell.mainLeft >= 216, '内容列左缘避开侧导航（' + shell.mainLeft + 'px）');
  check(shell.bodyW > 1000, '桌面 body 铺满，不再钉 480px（' + shell.bodyW + 'px）');
  await dp.screenshot({ path: path.join(OUT, 'd2-gate-wide.png') });

  await walkToResult(dp);
  const desk = await dp.evaluate(() => {
    const pc = document.querySelector('#page-container');
    const cards = pc ? pc.querySelectorAll('.card').length : 0;
    const txt = document.body.innerText;
    return { cards, hasResult: /卦|六壬|解|断/.test(txt) && txt.length > 300, scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth };
  });
  check(desk.hasResult, '桌面问事结果页渲染实质内容（卡片 ' + desk.cards + ' 张）');
  check(desk.scrollW <= desk.clientW + 1, '桌面无横向溢出（scrollW ' + desk.scrollW + ' ≤ clientW ' + desk.clientW + '）');
  await dp.screenshot({ path: path.join(OUT, 'd3-result.png'), fullPage: false });
  await dp.screenshot({ path: path.join(OUT, 'd4-result-full.png'), fullPage: true });

  // tab 切换仍正常（桌面侧导航复用同一 DOM）
  await dp.evaluate(() => { const t = document.querySelector('.tab[data-tab="home"]'); if (t) t.click(); });
  await sleep(1400);
  const homeOk = await dp.evaluate(() => {
    const active = document.querySelector('.tab.active');
    return !!active && active.dataset.tab === 'home';
  });
  check(homeOk, '桌面侧导航 tab 切换到首页，激活态正确');
  await dp.screenshot({ path: path.join(OUT, 'd5-home.png') });
  await dp.close();

  // ============ 手机 420 ============
  console.log('——— 手机视口 420×860 ———');
  const mp = await browser.newPage({ viewport: { width: 420, height: 860 }, deviceScaleFactor: 2 });
  mp.on('pageerror', e => { errors.push('mobile pageerror: ' + e.message); console.log('PAGEERR', e.message); });
  await mp.goto(BASE, { waitUntil: 'load', timeout: 90000 });
  await sleep(2500);
  // 同桌面：先过闸门再量 tabbar（tabbar 在 #main 内，hidden 时无尺寸）
  await mp.evaluate(() => {
    const cb = document.querySelector('#agreeCheck');
    if (cb) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
    const b = document.querySelector('#btnEnter');
    if (b && !b.disabled) b.click();
  });
  await sleep(1800);
  const mshell = await mp.evaluate(() => {
    const tb = document.querySelector('.tabbar');
    const cs = tb ? getComputedStyle(tb) : null;
    const r = tb ? tb.getBoundingClientRect() : null;
    return { pos: cs ? cs.position : null, dir: cs ? cs.flexDirection : null, bottom: r ? Math.round(r.bottom) : null, w: r ? Math.round(r.width) : null, vh: window.innerHeight };
  });
  console.log('MOBILE_SHELL =', JSON.stringify(mshell));
  check(mshell.pos === 'fixed' && mshell.dir === 'row', '手机仍是底部横排 tabbar');
  check(mshell.bottom === mshell.vh, '手机 tabbar 贴底（bottom=' + mshell.bottom + '）');
  await mp.screenshot({ path: path.join(OUT, 'm1-gate.png') });

  await walkToResult(mp);
  const mob = await mp.evaluate(() => {
    const txt = document.body.innerText;
    return { hasResult: /卦|六壬|解|断/.test(txt) && txt.length > 300, scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth };
  });
  check(mob.hasResult, '手机问事结果页渲染实质内容（无回归）');
  check(mob.scrollW <= mob.clientW + 1, '手机无横向溢出');
  await mp.screenshot({ path: path.join(OUT, 'm2-result.png') });
  await mp.close();

  await browser.close();
  console.log('\n===== 汇总 =====');
  if (errors.length) {
    console.log('失败 ' + errors.length + ' 项：');
    errors.forEach(e => console.log('  - ' + e));
    process.exit(1);
  }
  console.log('全部通过。截图目录：' + OUT);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
