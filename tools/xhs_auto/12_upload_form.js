// 进入上传小工具流程：点击「上传小工具」按钮，观察表单结构
const { chromium } = require('playwright-core');
const path = require('path');

const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const USER_DATA = path.join(__dirname, '.profile');
const OUT = path.join(__dirname, '..', '..', 'releases');

(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA, {
    executablePath: CHROME, headless: true, viewport: { width: 1440, height: 900 },
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  await page.goto('https://creator.xiaohongshu.com/new/red-app', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4500);

  // 点击「上传小工具」
  const clicked = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('button,div,span,a'));
    const hit = els.find(e => e.innerText && /上传小工具/.test(e.innerText) && e.innerText.length < 20 && e.offsetWidth > 0 && e.offsetHeight > 0);
    if (hit) { hit.click(); return true; }
    return false;
  }).catch(() => false);
  console.log('CLICKED_UPLOAD', clicked);
  await page.waitForTimeout(5000);

  const info = await page.evaluate(() => ({
    url: location.href,
    txt: document.body ? document.body.innerText.slice(0, 1500) : '',
    inputs: Array.from(document.querySelectorAll('input,textarea,select')).map(i => ({ type: i.type, id: i.id, ph: i.placeholder, accept: i.accept, cls: (i.className||'').slice(0,40) })).slice(0, 30),
    buttons: Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim()).filter(Boolean).slice(0, 20)
  })).catch(e => ({ err: e.message }));
  console.log('URL:', info.url);
  console.log('TXT:', (info.txt || '').replace(/\n+/g, ' | ').slice(0, 900));
  console.log('INPUTS:', JSON.stringify(info.inputs, null, 0));
  console.log('BUTTONS:', JSON.stringify(info.buttons));
  await page.screenshot({ path: path.join(OUT, 'xhs-upload-form.png') });
  await ctx.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
