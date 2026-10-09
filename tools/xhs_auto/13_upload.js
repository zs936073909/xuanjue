// 上传小工具：填表 + 上传 zip + 图标 + 发布
const { chromium } = require('playwright-core');
const path = require('path');

const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const USER_DATA = path.join(__dirname, '.profile');
const OUT = path.join(__dirname, '..', '..', 'releases');

const NAME = '玄决 · 大六壬决策台';
const DESC = '离线大六壬决策台：实时时课、三层解读、多法门对比，纯本地运行';
const VERSION = '1.5.0';
const ZIP = path.join(OUT, 'xuanjue-v1.5.0-xhs-tool.zip');
const ICON = path.join(OUT, 'xhs-icon.png');

(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA, {
    executablePath: CHROME, headless: true, viewport: { width: 1440, height: 900 },
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  page.on('pageerror', e => console.log('PAGEERR', e.message));
  await page.goto('https://creator.xiaohongshu.com/new/red-app', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);

  const url0 = page.url();
  console.log('URL0', url0);
  if (url0.includes('/login')) { console.log('NEED_LOGIN'); process.exit(3); }

  // 点击「上传小工具」
  const clicked = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('button,div,span,a'));
    const hit = els.find(e => e.innerText && /上传小工具/.test(e.innerText) && e.innerText.length < 20 && e.offsetWidth > 0 && e.offsetHeight > 0);
    if (hit) { hit.click(); return true; }
    return false;
  }).catch(() => false);
  console.log('CLICKED_UPLOAD', clicked);
  await page.waitForTimeout(4000);

  // 填写名称
  await page.evaluate((name) => {
    const inp = document.querySelector('input[placeholder="请输入小工具名称"]');
    if (inp) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(inp, name);
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, NAME);
  await page.waitForTimeout(400);

  // 填写简介
  await page.evaluate((desc) => {
    const inp = document.querySelector('input[placeholder="一句话描述小工具的功能"]');
    if (inp) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(inp, desc);
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, DESC);
  await page.waitForTimeout(400);

  // 上传图标（file input: accept image）
  const iconInput = await page.$('input[type="file"][accept*="image"]');
  if (iconInput) { await iconInput.setInputFiles(ICON); console.log('ICON_UPLOADED'); }
  await page.waitForTimeout(2500);

  // 上传 zip（file input: accept .zip）
  const zipInput = await page.$('input[type="file"][accept*=".zip"], input[type="file"][accept*="zip"]');
  if (zipInput) { await zipInput.setInputFiles(ZIP); console.log('ZIP_UPLOADED'); }
  await page.waitForTimeout(6000);

  // 版本号
  await page.evaluate((v) => {
    const inp = document.querySelector('input[placeholder*="版本号"]');
    if (inp) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(inp, v);
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, VERSION);
  await page.waitForTimeout(400);

  // 场景标签：实用工具
  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('button,div,span'));
    const hit = els.find(e => e.innerText && e.innerText.trim() === '实用工具' && e.offsetWidth > 0 && e.offsetHeight > 0);
    if (hit) hit.click();
  });
  await page.waitForTimeout(500);

  // 勾选同意规范（若有 checkbox）
  await page.evaluate(() => {
    const boxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
    boxes.forEach(b => { if (!b.checked) { b.click(); } });
  });
  await page.waitForTimeout(500);

  // 截图当前表单状态
  await page.screenshot({ path: path.join(OUT, 'xhs-upload-filled.png'), fullPage: false });

  // 读取表单当前状态（验证）
  const state = await page.evaluate(() => {
    const val = (sel) => { const e = document.querySelector(sel); return e ? e.value : null; };
    const texts = [];
    document.querySelectorAll('input').forEach(i => { if (i.value) texts.push(i.placeholder + '=' + i.value); });
    const imgs = Array.from(document.querySelectorAll('img')).filter(i => i.naturalWidth > 50).length;
    return { name: val('input[placeholder="请输入小工具名称"]'), desc: val('input[placeholder="一句话描述小工具的功能"]'), ver: val('input[placeholder*="版本号"]'), texts: texts.slice(0, 6), imgs, body: document.body.innerText.slice(0, 400) };
  }).catch(e => ({ err: e.message }));
  console.log('STATE', JSON.stringify(state, null, 1));

  await ctx.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
