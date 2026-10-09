// 36_check_review.js — 检查小工具审核状态
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
  await page.goto('https://creator.xiaohongshu.com/new/red-app', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  if (page.url().includes('/login')) { console.log('NEED_LOGIN'); process.exit(3); }

  const txt = await page.evaluate(() => document.body.innerText).catch(() => '');
  const lines = txt.split('\n').map(s => s.trim()).filter(Boolean);
  const statusLines = lines.filter(l => /审核|玄决|大六壬|V1\.|已上架|已通过|被驳回|驳回/.test(l));
  console.log('STATUS_LINES', JSON.stringify(statusLines.slice(0, 30), null, 1));

  await ctx.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
