// 进入小工具管理页，寻找上传入口
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
  // 先找「小工具」链接的 href
  await page.goto('https://creator.xiaohongshu.com/new/home', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);
  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a')).map(a => ({ t: a.innerText.trim(), h: a.href }))
      .filter(x => /小工具|builder|skill|tool/i.test(x.t) || /tool|builder|skill/i.test(x.h))
      .slice(0, 30);
  });
  console.log('TOOL_LINKS');
  links.forEach(l => console.log('  [' + l.t + '] ' + l.h));
  await ctx.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
