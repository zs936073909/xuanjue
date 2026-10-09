// 41_debug_draft.js — 打开草稿箱，dump 弹层内容，找到最新草稿的准确位置
const { chromium } = require('playwright-core');
const path = require('path');

const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const USER_DATA = path.join(__dirname, '.profile');
const OUT = path.join(__dirname, '..', '..', 'releases');
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

  // 打开草稿箱
  const draftBox = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('div,span,button,a'));
    const hit = els.find(e => e.innerText && /^草稿箱\(\d+\)$/.test(e.innerText.trim()) && e.offsetWidth > 0 && e.offsetHeight > 0);
    if (hit) { hit.click(); return hit.innerText.trim(); }
    return 'not-found';
  });
  console.log('DRAFT_BOX', draftBox);
  await sleep(3000);

  await page.screenshot({ path: path.join(OUT, 'xhs-draftbox.png'), fullPage: false });

  // dump 页面所有含「大六壬」的文本块（含父容器）
  const samples = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('div,span').forEach(el => {
      const t = (el.innerText || '').trim();
      if (t.includes('大六壬') && t.length < 100) {
        const r = el.getBoundingClientRect();
        out.push({ t: t.replace(/\n/g, '|'), cls: (el.className || '').toString().slice(0, 40), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) });
      }
    });
    return out.slice(0, 20);
  });
  console.log('DALIUREN_SAMPLES', JSON.stringify(samples, null, 1));

  // dump 可见的「编辑」按钮
  const edits = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('div,span,button').forEach(el => {
      const t = (el.innerText || '').trim();
      if (t === '编辑' && el.offsetWidth > 0 && el.offsetHeight > 0) {
        const r = el.getBoundingClientRect();
        out.push({ cls: (el.className || '').toString().slice(0, 40), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) });
      }
    });
    return out.slice(0, 15);
  });
  console.log('EDIT_BTNS', JSON.stringify(edits, null, 1));

  await ctx.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });