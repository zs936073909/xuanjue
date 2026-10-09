// 探索创作服务平台导航，寻找小工具上传入口
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
  await page.waitForTimeout(6000);

  const info = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a')).map(a => a.innerText.trim() + ' => ' + a.href).filter(s => s.length > 3 && !s.startsWith('=> javascript'));
    const menuText = document.body.innerText.slice(0, 1200);
    return { url: location.href, links: links.slice(0, 60), menuText };
  }).catch(e => ({ err: e.message }));
  console.log('URL:', info.url);
  console.log('MENU:', (info.menuText || '').replace(/\n+/g, ' | ').slice(0, 900));
  console.log('LINKS:');
  (info.links || []).forEach(l => console.log('  ' + l));
  await page.screenshot({ path: path.join(OUT, 'xhs-creator-home.png') });
  await ctx.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
