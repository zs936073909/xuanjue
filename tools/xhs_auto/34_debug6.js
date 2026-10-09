// 34_debug6.js — 滚动到底部，dump 底部操作栏元素 + 伪元素 content
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
  await page.setInputFiles('input[type=file]', ['01-home.png','02-board-summary.png','03-board-plain.png','04-board-pro.png'].map(n => path.join(SHOTS, n)));
  await sleep(6000);

  const ti = page.locator('input[placeholder*="标题"]').first();
  await ti.click();
  await sleep(300);
  await page.keyboard.type('大六壬决策台：纯离线开源隐私优先', { delay: 30 });
  await sleep(500);
  await page.evaluate(b => {
    const ce = document.querySelector('[contenteditable="true"]');
    if (ce) { ce.focus(); document.execCommand('insertText', false, b); }
  }, '测试正文内容，用于定位底部操作栏。');
  await sleep(1000);

  // 滚动到底部
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(1200);

  // dump 视口底部 300px 内的所有可见元素（不过滤 class），含伪元素 content
  const bottomEls = await page.evaluate(() => {
    const vh = window.innerHeight;
    const out = [];
    document.querySelectorAll('div,button,span,a').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width > 20 && r.height > 20 && r.top > vh - 350 && r.top < vh) {
        const after = getComputedStyle(el, '::after').content;
        const before = getComputedStyle(el, '::before').content;
        const item = {
          tag: el.tagName, cls: (el.className || '').toString().slice(0, 60),
          top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height),
          inner: (el.innerText || '').slice(0, 15).replace(/\n/g, '|'),
          after: after && after !== 'none' ? after.slice(0, 20) : '', before: before && before !== 'none' ? before.slice(0, 20) : ''
        };
        // 只保留叶子附近元素，避免大量容器重复
        if (out.filter(o => o.cls === item.cls && o.top === item.top).length === 0) out.push(item);
      }
    });
    return out;
  });
  console.log('BOTTOM_VISIBLE', JSON.stringify(bottomEls, null, 1));

  // 找 z-index 高的 fixed 元素
  const fixedEls = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('div,button').forEach(el => {
      const cs = getComputedStyle(el);
      if (cs.position === 'fixed' || cs.position === 'sticky') {
        const r = el.getBoundingClientRect();
        if (r.width > 20 && r.height > 20) {
          out.push({ tag: el.tagName, cls: (el.className || '').toString().slice(0, 60), z: cs.zIndex, top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height), inner: (el.innerText || '').slice(0, 15).replace(/\n/g, '|') });
        }
      }
    });
    return out.slice(0, 30);
  });
  console.log('FIXED_ELS', JSON.stringify(fixedEls, null, 1));

  await page.screenshot({ path: path.join(OUT, 'xhs-bottom-view.png'), fullPage: false });
  await ctx.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
