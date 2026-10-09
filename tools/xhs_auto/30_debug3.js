// 30_debug3.js — 查找「暂存离开/发布」按钮：扫描 iframe、shadow DOM、所有 button
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

  // iframe 列表
  const iframes = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('iframe')).map(f => ({ src: (f.src || '').slice(0, 120), cls: f.className, w: f.width, h: f.height }));
  });
  console.log('IFRAMES', JSON.stringify(iframes, null, 1));

  // 点击上传图文
  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('div,span,button'));
    const hit = els.find(e => e.innerText && e.innerText.trim() === '上传图文' && e.innerText.length < 20 && e.offsetWidth > 0 && e.offsetHeight > 0);
    if (hit) hit.click();
  });
  await sleep(2500);
  await page.setInputFiles('input[type=file]', ['01-home.png','02-board-summary.png'].map(n => path.join(SHOTS, n)));
  await sleep(6000);

  // 所有 button 元素文本 + rect
  const buttons = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button')).map((b, i) => {
      const r = b.getBoundingClientRect();
      return { i, t: (b.innerText || '').trim().slice(0, 20), cls: (b.className || '').toString().slice(0, 50), top: Math.round(r.top), w: Math.round(r.width) };
    }).filter(b => b.w > 0);
  });
  console.log('BUTTONS', JSON.stringify(buttons, null, 1));

  // 扫描所有元素中文本恰为「暂存离开」或「发布」的（不限 children 数）
  const all = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('*').forEach(el => {
      const t = (el.innerText || '').trim();
      if (t === '暂存离开' || t === '发布') {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) out.push({ tag: el.tagName, cls: (el.className || '').toString().slice(0, 60), top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) });
      }
    });
    return out;
  });
  console.log('ALL_MATCH', JSON.stringify(all, null, 1));

  await ctx.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
