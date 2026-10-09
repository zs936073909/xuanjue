// 探索发布笔记流程：点击「去发布」进入发布器，确认能否挂载小工具
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
  await page.goto('https://creator.xiaohongshu.com/new/red-app', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  if (page.url().includes('/login')) { console.log('NEED_LOGIN'); process.exit(3); }

  // 点击「去发布」或「发布笔记」
  const clicked = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('button,div,span,a'));
    const hit = els.find(e => e.innerText && (e.innerText.trim() === '去发布' || /去发布/.test(e.innerText)) && e.innerText.length < 20 && e.offsetWidth > 0 && e.offsetHeight > 0);
    if (hit) { hit.click(); return true; }
    return false;
  }).catch(() => false);
  console.log('GO_PUBLISH_CLICKED', clicked);
  await sleep(6000);

  console.log('URL', page.url());
  const info = await page.evaluate(() => {
    const t = document.body.innerText.slice(0, 800);
    return { url: location.href, txt: t.replace(/\n+/g, ' | ') };
  }).catch(e => ({ err: e.message }));
  console.log('INFO', JSON.stringify(info, null, 1));
  await page.screenshot({ path: path.join(OUT, 'xhs-note-editor.png'), fullPage: false });
  await ctx.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
