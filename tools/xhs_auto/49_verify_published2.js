// 49_verify_published2.js — 点「已发布」tab 后 dump 笔记列表 DOM 与截图
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

  await page.goto('https://creator.xiaohongshu.com/new/note-manager', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(6000);
  if (page.url().includes('/login')) { console.log('NEED_LOGIN'); process.exit(3); }

  // 点「已发布」tab
  const tab = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('div,span,button,a'));
    const hit = els.find(e => e.innerText && e.innerText.trim() === '已发布' && e.offsetWidth > 0 && e.offsetHeight > 0);
    if (!hit) return null;
    const r = hit.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  });
  if (tab) { await page.mouse.click(tab.x, tab.y); await sleep(3500); }

  // dump 整个主内容区文本（列表区）
  const txt = await page.evaluate(() => document.body.innerText);
  const lines = txt.split('\n').map(s => s.trim()).filter(Boolean);
  const start = lines.findIndex(l => l === '已发布' || l === '全部' || l === '审核中');
  console.log('LIST', JSON.stringify(lines.slice(Math.max(0, start - 2), start + 40), null, 1));

  // 抓取包含日期时间的笔记行元素
  const rows = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('div').forEach(e => {
      const t = (e.innerText || '').trim();
      if (t.length > 4 && t.length < 150 && /2026-09-2\d/.test(t) && !/创作服务平台/.test(t)) {
        out.push({ tag: e.tagName, txt: t.replace(/\n+/g, ' | ') });
      }
    });
    return out.slice(0, 15);
  }).catch(() => []);
  console.log('ROWS', JSON.stringify(rows, null, 1));

  await page.screenshot({ path: path.join(OUT, 'xhs-verify-published2.png'), fullPage: true });
  await ctx.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
