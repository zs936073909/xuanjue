// 48_verify_published.js — 点「已发布」筛选 tab，并尝试打开「大六壬」笔记获取公开链接
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

  await page.goto('https://creator.xiaohongshu.com/new/note-manager', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(6000);
  if (page.url().includes('/login')) { console.log('NEED_LOGIN'); process.exit(3); }

  // 1. 点「已发布」tab
  const tab = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('div,span,button,a'));
    const hit = els.find(e => e.innerText && e.innerText.trim() === '已发布' && e.offsetWidth > 0 && e.offsetHeight > 0);
    if (!hit) return null;
    const r = hit.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), txt: hit.innerText.trim() };
  });
  console.log('PUBLISHED_TAB', JSON.stringify(tab));
  if (tab) { await page.mouse.click(tab.x, tab.y); await sleep(3000); }

  // 2. 找「大六壬」笔记行，dump 其 href / 行内链接
  const links = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('a').forEach(a => {
      const t = (a.innerText || '').trim();
      if (t && /大六壬|玄决/.test(t) && a.href) out.push({ t: t.slice(0, 60), href: a.href });
    });
    return out.slice(0, 10);
  }).catch(() => []);
  console.log('LINKS', JSON.stringify(links, null, 1));

  // 3. 点笔记行（标题含大六壬），观察跳转 URL
  const click = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('div,span,a'));
    const hit = els.find(e => e.innerText && /大六壬决策台/.test(e.innerText) && e.innerText.length < 120 && e.offsetWidth > 0 && e.offsetHeight > 0);
    if (!hit) return null;
    const r = hit.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  });
  console.log('CLICK_POS', JSON.stringify(click));
  if (click) {
    await page.mouse.click(click.x, click.y);
    await sleep(4000);
    console.log('AFTER_URL', page.url());
  }

  await page.screenshot({ path: path.join(OUT, 'xhs-verify-published.png'), fullPage: false });
  await ctx.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
