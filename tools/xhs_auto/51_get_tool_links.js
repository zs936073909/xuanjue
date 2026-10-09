// 51_get_tool_links.js — 抓取小工具管理/上传页面的所有入口链接 + 当前状态，供用户自助操作
const { chromium } = require('playwright-core');
const path = require('path');
const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const USER_DATA = path.join(__dirname, '.profile');
const fs = require('fs');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA, {
    executablePath: CHROME, headless: true, viewport: { width: 1440, height: 1100 },
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  page.on('pageerror', e => console.log('PAGEERR', e.message));
  await page.goto('https://creator.xiaohongshu.com/new/red-app', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(6000);
  if (page.url().includes('/login')) { console.log('NEED_LOGIN'); process.exit(3); }
  console.log('URL', page.url());

  // 页面所有可见链接
  const links = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('a').forEach(a => {
      const t = (a.innerText || '').trim();
      if (t && t.length < 60 && a.href && !a.href.startsWith('javascript')) out.push({ t, href: a.href });
    });
    return out.slice(0, 40);
  }).catch(() => []);
  console.log('LINKS', JSON.stringify(links, null, 1));

  // 页面状态关键词
  const txt = await page.evaluate(() => document.body.innerText).catch(() => '');
  const lines = txt.split('\n').map(s => s.trim()).filter(Boolean);
  const info = lines.filter(l => /玄决|大六壬|审核|V1\.5|上传|创建|发布|上架|管理/.test(l)).slice(0, 40);
  console.log('INFO', JSON.stringify(info, null, 1));

  await page.screenshot({ path: path.join(__dirname, '..', '..', 'releases', 'xhs-tool-manage-now.png'), fullPage: false });
  await ctx.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });