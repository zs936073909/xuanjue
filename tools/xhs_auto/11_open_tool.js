// 点击侧边栏「小工具」菜单进入小工具页
const { chromium } = require('playwright-core');
const path = require('path');

const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const USER_DATA = path.join(__dirname, '.profile');
const OUT = path.join(__dirname, '..', '..', 'releases');

(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA, {
    executablePath: CHROME, headless: true, viewport: { width: 1440, height: 900 },
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  await page.goto('https://creator.xiaohongshu.com/new/home', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4500);

  // 点击「小工具」
  const clicked = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('div,span,a,li,aside,nav'));
    const hit = els.find(e => e.innerText && e.innerText.trim() === '小工具' && e.offsetWidth > 0 && e.offsetHeight > 0 && e.innerText.length < 10);
    if (hit) { hit.click(); return true; }
    return false;
  }).catch(() => false);
  console.log('CLICKED', clicked);
  await page.waitForTimeout(5000);

  const info = await page.evaluate(() => ({
    url: location.href,
    txt: document.body ? document.body.innerText.slice(0, 800) : ''
  })).catch(e => ({ err: e.message }));
  console.log('URL:', info.url);
  console.log('TXT:', (info.txt || '').replace(/\n+/g, ' | '));
  await page.screenshot({ path: path.join(OUT, 'xhs-tool-page.png') });
  await ctx.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
