// 44_debug_draft4.js — 稳健打开草稿箱：真实鼠标点击 + 逐步验证 + 切图文tab + 找草稿行
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

  // 打开草稿箱：真实鼠标点击
  const pos = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('div,span,button,a'));
    const hit = els.find(e => e.innerText && /^草稿箱\(\d+\)$/.test(e.innerText.trim()) && e.offsetWidth > 0 && e.offsetHeight > 0);
    if (!hit) return null;
    const r = hit.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  });
  console.log('POS', JSON.stringify(pos));
  if (pos) { await page.mouse.click(pos.x, pos.y); await sleep(4000); }

  // 检查弹层状态
  const modal = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      hasDlg: t.includes('草稿箱'),
      hasImageTab: /图文笔记\(\d+\)/.test(t),
      hasVideoTab: /视频笔记\(\d+\)/.test(t),
      hasEmpty: t.includes('暂无草稿') || t.includes('还没有草稿'),
      lastFew: t.slice(-600).replace(/\n+/g, ' | ')
    };
  });
  console.log('MODAL', JSON.stringify(modal, null, 1));
  await page.screenshot({ path: path.join(OUT, 'xhs-draftbox-a.png'), fullPage: false });

  // 点击「图文笔记(n)」tab
  const tabPos = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('div,span,button,a'));
    const hit = els.find(e => e.innerText && /^图文笔记\(\d+\)$/.test(e.innerText.trim()) && e.offsetWidth > 0 && e.offsetHeight > 0);
    if (!hit) return null;
    const r = hit.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  });
  console.log('TAB_POS', JSON.stringify(tabPos));
  if (tabPos) { await page.mouse.click(tabPos.x, tabPos.y); await sleep(3000); }
  await page.screenshot({ path: path.join(OUT, 'xhs-draftbox-b.png'), fullPage: false });

  // 收集「大六壬」行及其「编辑」按钮
  const rows = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('div,span').forEach(el => {
      const t = (el.innerText || '').trim();
      if (t.includes('大六壬') && t.length < 60) {
        const r = el.getBoundingClientRect();
        out.push({ t: t.replace(/\n/g, '|'), cls: (el.className || '').toString().slice(0, 40), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) });
      }
    });
    return out.slice(0, 15);
  });
  console.log('ROWS', JSON.stringify(rows, null, 1));

  const lastText = await page.evaluate(() => document.body.innerText.slice(-700).replace(/\n+/g, ' | '));
  console.log('LAST_TEXT', lastText);

  await ctx.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });