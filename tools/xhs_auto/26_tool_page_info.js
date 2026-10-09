// 26_tool_page_info.js — 访问小工具管理页，读取公告/文档，了解笔记挂载方式与审核状态
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

  // 先到小工具管理页（new/red-app 上次停留页）
  await page.goto('https://creator.xiaohongshu.com/new/red-app', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  if (page.url().includes('/login')) { console.log('NEED_LOGIN'); process.exit(3); }

  // 如果当前不是小工具页，点击侧边栏「小工具」
  if (!/tool|widget|app/.test(page.url())) {
    await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('div,span,a'));
      const hit = els.find(e => e.innerText && e.innerText.trim() === '小工具' && e.offsetWidth > 0 && e.offsetHeight > 0 && e.innerText.length < 10);
      if (hit) hit.click();
    });
    await sleep(3000);
  }
  console.log('URL', page.url());

  // 读取页面全文（含公告）
  const txt = await page.evaluate(() => document.body.innerText).catch(() => '');
  console.log('TEXT', txt.slice(0, 2500).replace(/\n+/g, ' | '));

  // 查找「开发者文档」「使用指南」「如何挂载」等链接
  const links = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('a').forEach(a => {
      const t = (a.innerText || '').trim();
      if (t && t.length < 40 && a.href && !a.href.includes('javascript')) out.push({ t, href: a.href });
    });
    return out.slice(0, 30);
  }).catch(() => []);
  console.log('LINKS', JSON.stringify(links, null, 1));

  await page.screenshot({ path: path.join(OUT, 'xhs-tool-page-info.png'), fullPage: false });
  await ctx.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
