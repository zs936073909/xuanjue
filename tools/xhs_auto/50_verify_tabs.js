// 50_verify_tabs.js — 逐个点击「已发布」「审核中」「未通过」tab，比对列表数量与标题，确认「大六壬」笔记归属
const { chromium } = require('playwright-core');
const path = require('path');
const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const USER_DATA = path.join(__dirname, '.profile');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function listNotes(page) {
  return page.evaluate(() => {
    const lines = (document.body.innerText || '').split('\n').map(s => s.trim()).filter(Boolean);
    return lines.filter(l => /大六壬决策台|这是一篇想找对象|2026-09-2\d|^全部 \d+$/.test(l)).slice(0, 12);
  }).catch(() => []);
}

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

  for (const name of ['已发布', '审核中', '未通过']) {
    const pos = await page.evaluate((nm) => {
      const els = Array.from(document.querySelectorAll('div,span,button,a'));
      const hit = els.find(e => e.innerText && e.innerText.trim() === nm && e.offsetWidth > 0 && e.offsetHeight > 0);
      if (!hit) return null;
      const r = hit.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    }, name);
    if (!pos) { console.log(name, '-> tab not found'); continue; }
    await page.mouse.click(pos.x, pos.y);
    await sleep(3500);
    const notes = await listNotes(page);
    console.log('TAB[' + name + '] ->', JSON.stringify(notes));
  }
  await ctx.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
