// 52_get_upload_url.js — 点击「上传小工具」入口，抓取跳转后的上传页 URL（供用户自助上传）
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
  await page.waitForTimeout(6000);
  if (page.url().includes('/login')) { console.log('NEED_LOGIN'); process.exit(3); }

  // 找「上传小工具」可点击元素
  const pos = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('div,span,button,a'));
    const hit = els.find(e => e.innerText && e.innerText.trim() === '上传小工具' && e.offsetWidth > 0 && e.offsetHeight > 0);
    if (!hit) return null;
    const r = hit.getBoundingClientRect();
    // 顺带把最近的 <a> 父级 href 找出来
    let anc = hit;
    while (anc && anc.tagName !== 'A') anc = anc.parentElement;
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), href: anc && anc.href ? anc.href : null, tag: hit.tagName };
  });
  console.log('UPLOAD_ENTRY', JSON.stringify(pos));
  if (!pos) { await ctx.close(); process.exit(0); }

  // 若本身是链接直接记录；否则点击看跳转
  if (pos.href) {
    console.log('DIRECT_LINK', pos.href);
  } else {
    await page.mouse.click(pos.x, pos.y);
    await sleep(5000);
    console.log('AFTER_URL', page.url());
    // 可能新开 tab
    await sleep(2000);
    for (const p of ctx.pages()) {
      if (p !== page) console.log('NEW_TAB', p.url());
    }
  }
  await ctx.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });