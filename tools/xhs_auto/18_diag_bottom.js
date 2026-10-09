// 诊断底部结构：滚动到表单底部，截整页 + 分析同意控件/发布按钮/权限
const { chromium } = require('playwright-core');
const path = require('path');

const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const USER_DATA = path.join(__dirname, '.profile');
const OUT = path.join(__dirname, '..', '..', 'releases');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA, {
    executablePath: CHROME, headless: true, viewport: { width: 1440, height: 1200 },
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  page.on('pageerror', e => console.log('PAGEERR', e.message));
  await page.goto('https://creator.xiaohongshu.com/new/red-app', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  if (page.url().includes('/login')) { console.log('NEED_LOGIN'); process.exit(3); }

  // 进入表单
  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('button,div,span,a'));
    const hit = els.find(e => e.innerText && /上传小工具/.test(e.innerText) && e.innerText.length < 20 && e.offsetWidth > 0 && e.offsetHeight > 0);
    if (hit) hit.click();
  });
  await sleep(4000);

  // 检查是否是空表单（需要上传）
  const hasZip = await page.evaluate(() => /xuanjue-v1\.5\.0-xhs-tool\.zip/.test(document.body.innerText));
  console.log('HAS_ZIP', hasZip);

  // 滚动到最底部（多滚几次确保到底）
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => window.scrollBy(0, 1200));
    await sleep(400);
  }
  await sleep(1000);

  // 分析底部结构
  const bottom = await page.evaluate(() => {
    const t = document.body.innerText;
    const tail = t.slice(-1200);
    const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]')).map((b, i) => ({
      i, checked: b.checked, visible: !!(b.offsetWidth || b.offsetHeight),
      row: (() => { let p = b.parentElement, s = ''; for (let k = 0; k < 4 && p; k++) { s += (p.innerText || '').slice(0, 40) + '|'; p = p.parentElement; } return s; })()
    }));
    const radios = Array.from(document.querySelectorAll('input[type="radio"]')).map((b, i) => ({
      i, checked: b.checked, row: (() => { let p = b.parentElement, s = ''; for (let k = 0; k < 3 && p; k++) { s += (p.innerText || '').slice(0, 40) + '|'; p = p.parentElement; } return s; })()
    }));
    const btns = Array.from(document.querySelectorAll('button')).map(b => ({ t: b.innerText.trim().slice(0, 20), d: b.disabled, vis: !!(b.offsetWidth || b.offsetHeight) }));
    return { tail, checkboxes, radios, btns: btns.slice(-12), scrollY: window.scrollY, bodyH: document.body.scrollHeight };
  }).catch(e => ({ err: e.message }));
  console.log('BOTTOM_STRUCT', JSON.stringify(bottom, null, 1));

  await page.screenshot({ path: path.join(OUT, 'xhs-bottom-struct.png'), fullPage: false });
  await ctx.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
