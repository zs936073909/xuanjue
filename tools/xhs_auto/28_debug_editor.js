// 28_debug_editor.js — 诊断标题输入框与底部按钮的真实 DOM 结构
const { chromium } = require('playwright-core');
const path = require('path');

const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const USER_DATA = path.join(__dirname, '.profile');
const OUT = path.join(__dirname, '..', '..', 'releases');
const SHOTS = path.join(OUT, 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA, {
    executablePath: CHROME, headless: true, viewport: { width: 1440, height: 1100 },
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  page.on('pageerror', e => console.log('PAGEERR', e.message));
  await page.goto('https://creator.xiaohongshu.com/publish/publish', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  if (page.url().includes('/login')) { console.log('NEED_LOGIN'); process.exit(3); }

  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('div,span,button'));
    const hit = els.find(e => e.innerText && e.innerText.trim() === '上传图文' && e.innerText.length < 20 && e.offsetWidth > 0 && e.offsetHeight > 0);
    if (hit) hit.click();
  });
  await sleep(2500);
  await page.setInputFiles('input[type=file]', ['01-home.png','02-board-summary.png'].map(n => path.join(SHOTS, n)));
  await sleep(6000);

  // 所有 input 元素信息
  const inputs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input')).map((el, i) => ({
      i, ph: el.placeholder, cls: el.className, type: el.type,
      val: (el.value || '').slice(0, 30), r: (() => { const x = el.getBoundingClientRect(); return { w: x.width, h: x.height, top: Math.round(x.top), left: Math.round(x.left) }; })()
    }));
  }).catch(e => [{ err: e.message }]);
  console.log('INPUTS', JSON.stringify(inputs, null, 1));

  // 所有含「暂存」「发布」文本的元素（tag/class/rect/innerText）
  const btns = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('*').forEach(el => {
      if (el.children.length > 3) return;
      const t = (el.innerText || '').trim();
      if (t && t.length < 10 && (/暂存|发布/.test(t))) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) out.push({ tag: el.tagName, cls: (el.className || '').toString().slice(0, 60), t, top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) });
      }
    });
    return out.slice(0, 40);
  }).catch(e => [{ err: e.message }]);
  console.log('BTNS', JSON.stringify(btns, null, 1));

  await ctx.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
