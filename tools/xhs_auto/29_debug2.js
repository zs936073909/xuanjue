// 29_debug2.js — 深度诊断标题输入框属性与底部操作栏结构
const { chromium } = require('playwright-core');
const path = require('path');

const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const USER_DATA = path.join(__dirname, '.profile');
const OUT = path.join(__dirname, '..', '..', 'releases');
const SHOTS = path.join(OUT, 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA, {
    executablePath: CHROME, headless: true, viewport: { width: 1440, height: 1100 },
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  page.on('pageerror', e => console.log('PAGEERR', e.message));
  await page.goto('https://creator.xiaohongshu.com/publish/publish', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  if (page.url().includes('/login')) { console.log('NEED_LOGIN'); process.exit(3); }

  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('div,span,button'));
    const hit = els.find(e => e.innerText && e.innerText.trim() === '上传图文' && e.innerText.length < 20 && e.offsetWidth > 0 && e.offsetHeight > 0);
    if (hit) hit.click();
  });
  await sleep(2500);
  await page.setInputFiles('input[type=file]', ['01-home.png','02-board-summary.png'].map(n => path.join(SHOTS, n)));
  await sleep(6000);

  // 标题输入框详细属性
  const ti = await page.evaluate(() => {
    const el = document.querySelector('input[placeholder*="标题"]');
    if (!el) return 'none';
    const r = el.getBoundingClientRect();
    return {
      readOnly: el.readOnly, disabled: el.disabled, maxlength: el.maxLength,
      autocapitalize: el.autocapitalize, tabIndex: el.tabIndex,
      rect: { top: r.top, left: r.left, w: r.width, h: r.height },
      outer: el.outerHTML.slice(0, 300)
    };
  });
  console.log('TITLE_INPUT', JSON.stringify(ti, null, 1));

  // 用 locator.click + keyboard.type 填标题
  const titleInput = page.locator('input[placeholder*="标题"]').first();
  await titleInput.click();
  await sleep(300);
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('大六壬决策台：纯离线开源隐私优先', { delay: 40 });
  await sleep(800);
  const afterType = await page.evaluate(() => {
    const el = document.querySelector('input[placeholder*="标题"]');
    return el ? el.value : 'none';
  });
  console.log('TITLE_AFTER_TYPE', JSON.stringify(afterType));

  // 底部按钮：抓取页面最底部区域的 HTML 片段（滚动到底）
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(1000);
  const bottom = await page.evaluate(() => {
    const t = document.body.innerText;
    // 找含「暂存」「发布」的整行
    return t.split('\n').map(s => s.trim()).filter(s => s && (s.includes('暂存') || s === '发布' || s.includes('保存'))).slice(0, 10);
  });
  console.log('BOTTOM_LINES', JSON.stringify(bottom, null, 1));

  // 抓取底部操作栏外层 HTML
  const bottomHtml = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('div')).filter(d => {
      const t = (d.innerText || '').trim();
      return t === '暂存离开\n发布' || (t.includes('暂存离开') && t.includes('发布') && t.length < 20);
    });
    if (els.length) return els[0].outerHTML.slice(0, 800);
    return 'none';
  });
  console.log('BOTTOM_HTML', bottomHtml);

  await ctx.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
