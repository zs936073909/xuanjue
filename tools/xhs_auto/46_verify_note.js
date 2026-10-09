// 46_verify_note.js — 笔记管理页验证已发布的参赛笔记
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
  // 笔记管理页
  await page.goto('https://creator.xiaohongshu.com/new/note-manager', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(6000);
  if (page.url().includes('/login')) { console.log('NEED_LOGIN'); process.exit(3); }
  console.log('URL', page.url());

  const txt = await page.evaluate(() => document.body.innerText).catch(() => '');
  const lines = txt.split('\n').map(s => s.trim()).filter(Boolean);
  const hits = lines.filter(l => /大六壬|玄决|vibecoding|已发布|审核中|待发布/.test(l));
  console.log('HITS', JSON.stringify(hits.slice(0, 30), null, 1));

  await page.screenshot({ path: path.join(OUT, 'xhs-note-verify.png'), fullPage: false });
  await ctx.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });