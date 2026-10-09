const { chromium } = require('playwright-core');
const path = require('path');
const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const USER_DATA = path.join('/workspace/xuanjue/tools/xhs_auto', '.profile');
const OUT = '/workspace/xuanjue/releases';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA, {
    executablePath: CHROME, headless: true, viewport: { width: 1440, height: 1100 },
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  page.on('pageerror', e => console.log('PAGEERR', e.message));
  await page.goto('https://creator.xiaohongshu.com/new/note-manager', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(7000);
  if (page.url().includes('/login')) { console.log('NEED_LOGIN'); process.exit(3); }
  console.log('URL', page.url());
  // 抓取笔记行结构：标题 + 状态
  const rows = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('div,li,tr').forEach(e => {
      const t = (e.innerText || '').trim();
      if (t.length < 200 && t.length > 5 && /大六壬|玄决|vibecoding/.test(t) && e.children.length < 8) {
        out.push(t.replace(/\n+/g, ' | '));
      }
    });
    return out.slice(0, 10);
  }).catch(() => []);
  console.log('ROWS', JSON.stringify(rows, null, 1));
  await page.screenshot({ path: path.join(OUT, 'xhs-verify-now.png'), fullPage: false });
  console.log('SHOT', path.join(OUT, 'xhs-verify-now.png'));
  await ctx.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
