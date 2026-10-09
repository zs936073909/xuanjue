// 53_get_upload_url2.js — 监听 popup/新tab + 点击「上传小工具」后 dump 页面上出现的内容链接
const { chromium } = require('playwright-core');
const path = require('path');
const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const USER_DATA = path.join(__dirname, '.profile');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA, {
    executablePath: CHROME, headless: true, viewport: { width: 1440, height: 1100 },
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  page.on('pageerror', e => console.log('PAGEERR', e.message));
  ctx.on('page', p => { console.log('NEW_PAGE', p.url()); });

  await page.goto('https://creator.xiaohongshu.com/new/red-app', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(6000);
  if (page.url().includes('/login')) { console.log('NEED_LOGIN'); process.exit(3); }

  // 点击「上传小工具」
  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('div,span,button,a'));
    const hit = els.find(e => e.innerText && e.innerText.trim() === '上传小工具' && e.offsetWidth > 0 && e.offsetHeight > 0);
    if (hit) hit.click();
  });
  await sleep(4000);
  console.log('AFTER_URL', page.url());

  // dump 当前页新增内容（弹窗/提示/链接）
  const links = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('a').forEach(a => {
      const t = (a.innerText || '').trim();
      if (t && a.href && !a.href.startsWith('javascript')) out.push({ t: t.slice(0, 60), href: a.href });
    });
    return out.slice(0, 40);
  }).catch(() => []);
  console.log('LINKS', JSON.stringify(links, null, 1));

  const txt = await page.evaluate(() => document.body.innerText).catch(() => '');
  const lines = txt.split('\n').map(s => s.trim()).filter(Boolean);
  console.log('TAIL', JSON.stringify(lines.slice(-60), null, 1));
  await ctx.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });