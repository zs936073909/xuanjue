// 43_debug_draft3.js — 在草稿箱弹层中点击「图文笔记(15)」tab，再取列表
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
  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('div,span,button,a'));
    const hit = els.find(e => e.innerText && /^草稿箱\(\d+\)$/.test(e.innerText.trim()) && e.offsetWidth > 0 && e.offsetHeight > 0);
    if (hit) hit.click();
  });
  await sleep(3000);

  // 点击「图文笔记(15)」
  const tab = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('div,span,button,a'));
    const hit = els.find(e => e.innerText && /^图文笔记\(\d+\)$/.test(e.innerText.trim()) && e.offsetWidth > 0 && e.offsetHeight > 0);
    if (!hit) return null;
    const r = hit.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  });
  console.log('IMAGE_TAB_POS', JSON.stringify(tab));
  if (tab) { await page.mouse.click(tab.x, tab.y); await sleep(2500); }

  // dump 弹层中所有可见行
  const items = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('div,span').forEach(el => {
      const t = (el.innerText || '').trim();
      if (t.includes('大六壬') && t.length < 80) {
        const r = el.getBoundingClientRect();
        out.push({ t: t.replace(/\n/g, '|'), cls: (el.className || '').toString().slice(0, 40), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) });
      }
    });
    return out.slice(0, 20);
  });
  console.log('ITEMS', JSON.stringify(items, null, 1));

  // dump 弹层全文本
  const modalTxt = await page.evaluate(() => {
    const m = document.querySelector('[class*="mask"],[class*="backdrop"]');
    return (document.body.innerText.slice(-1200) || '').replace(/\n+/g, ' | ');
  });
  console.log('MODAL_TXT', modalTxt);

  await page.screenshot({ path: path.join(OUT, 'xhs-draftbox-image.png'), fullPage: false });
  await ctx.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });