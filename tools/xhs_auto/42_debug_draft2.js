// 42_debug_draft2.js — 轮询草稿箱入口：点击后截图；并尝试「笔记管理」页
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

  // 尝试1：点击草稿箱(15) 并点击其子元素（可能需点击内部文本）
  const r1 = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('div,span,button,a'));
    const hit = els.find(e => e.innerText && /^草稿箱\(\d+\)$/.test(e.innerText.trim()) && e.offsetWidth > 0 && e.offsetHeight > 0);
    if (!hit) return null;
    const box = hit.getBoundingClientRect();
    return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
  });
  console.log('DRAFT_BTN_POS', JSON.stringify(r1));
  if (r1) {
    await page.mouse.click(r1.x, r1.y);
    await sleep(3000);
    await page.screenshot({ path: path.join(OUT, 'xhs-draftbox-1.png'), fullPage: false });
    const state1 = await page.evaluate(() => {
      const t = document.body.innerText;
      return {
        url: location.href,
        hasDraftList: t.includes('图文笔记') && t.includes('编辑'),
        hasBackdrop: !!document.querySelector('[class*="mask"],[class*="backdrop"],[class*="overlay"]'),
        hasModal: !!document.querySelector('[class*="modal"],[class*="popup"],[class*="dialog"],[class*="drawer"]'),
        sample: t.slice(-500).replace(/\n+/g, ' | ')
      };
    });
    console.log('STATE1', JSON.stringify(state1, null, 1));
    // 看是否有新页面标签
    const pages = ctx.pages();
    console.log('PAGE_COUNT', pages.length, pages.map(p => p.url().slice(0, 80)));
    for (const p of pages) {
      if (p !== page) {
        const txt = await p.evaluate(() => document.body.innerText.slice(0, 300)).catch(() => '');
        console.log('NEW_PAGE_TXT', txt.replace(/\n+/g, ' | '));
      }
    }
  }

  // 尝试2：左侧「笔记管理」
  const r2 = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('div,span,button,a'));
    const hit = els.find(e => e.innerText && e.innerText.trim() === '笔记管理' && e.offsetWidth > 0 && e.offsetHeight > 0);
    if (!hit) return null;
    const box = hit.getBoundingClientRect();
    return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
  });
  console.log('NOTE_MGMT_POS', JSON.stringify(r2));
  if (r2) {
    await page.mouse.click(r2.x, r2.y);
    await sleep(4000);
    console.log('URL2', page.url());
    const t2 = await page.evaluate(() => document.body.innerText.slice(0, 600)).catch(() => '');
    console.log('TXT2', t2.replace(/\n+/g, ' | '));
    await page.screenshot({ path: path.join(OUT, 'xhs-note-mgmt.png'), fullPage: false });
    // 找草稿 tab
    const draftTab = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('div,span,button,a'));
      const hit = els.find(e => e.innerText && /草稿/.test(e.innerText) && e.innerText.length < 12 && e.offsetWidth > 0 && e.offsetHeight > 0);
      if (hit) { hit.click(); return hit.innerText.trim(); }
      return null;
    });
    console.log('DRAFT_TAB', draftTab);
    await sleep(3000);
    const samples = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('div,span').forEach(el => {
        const t = (el.innerText || '').trim();
        if (t.includes('大六壬') && t.length < 60) out.push(t.replace(/\n/g, '|'));
      });
      return out.slice(0, 10);
    });
    console.log('DAFT_SAMPLES', JSON.stringify(samples, null, 1));
    await page.screenshot({ path: path.join(OUT, 'xhs-draft-list.png'), fullPage: false });
  }

  await ctx.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });