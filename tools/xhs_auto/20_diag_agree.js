// 诊断发布按钮禁用原因：真实点击同意 + 检查权限选项 + 按钮状态
const { chromium } = require('playwright-core');
const path = require('path');

const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const USER_DATA = path.join(__dirname, '.profile');
const OUT = path.join(__dirname, '..', '..', 'releases');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const NAME = '玄决 · 大六壬决策台';
const DESC = '离线大六壬决策台';
const VERSION = '1.5.0';
const ZIP = path.join(OUT, 'xuanjue-v1.5.0-xhs-tool.zip');
const ICON = path.join(OUT, 'xhs-icon.png');

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
  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('button,div,span,a'));
    const hit = els.find(e => e.innerText && /上传小工具/.test(e.innerText) && e.innerText.length < 20 && e.offsetWidth > 0 && e.offsetHeight > 0);
    if (hit) hit.click();
  });
  await sleep(4000);

  // 填表
  const setInput = (sel, val) => page.evaluate(({ sel, val }) => {
    const inp = document.querySelector(sel);
    if (!inp) return;
    const proto = inp.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(inp, val);
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  }, { sel, val });
  await setInput('input[placeholder="请输入小工具名称"]', NAME);
  await setInput('input[placeholder="一句话描述小工具的功能"]', DESC);
  await setInput('input[placeholder*="版本号"]', VERSION);
  await sleep(500);

  // 图标
  const iconInput = await page.$('input[type="file"][accept*="image"]');
  if (iconInput) { await iconInput.setInputFiles(ICON); }
  await sleep(3500);
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const hit = btns.find(b => /确认裁剪并上传/.test(b.innerText));
    if (hit) hit.click();
  });
  await sleep(3500);

  // zip
  const zipInput = await page.$('input[type="file"][accept*="zip"]');
  if (zipInput) { await zipInput.setInputFiles(ZIP); }
  await sleep(3000);
  let deployOk = false;
  for (let i = 0; i < 40; i++) {
    deployOk = await page.evaluate(() => /部署成功(?!后可)/.test(document.body.innerText)).catch(() => false);
    if (deployOk) break;
    await sleep(3000);
  }
  console.log('DEPLOY_OK', deployOk);

  // 场景标签
  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('button,div,span'));
    const hit = els.find(e => e.innerText && e.innerText.trim() === '实用工具' && e.offsetWidth > 0 && e.offsetHeight > 0);
    if (hit) hit.click();
  });
  await sleep(500);

  // 滚动到底
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(1000);

  // 用真实鼠标点击同意 label
  const labelBox = await page.evaluate(() => {
    const label = document.querySelector('label.app-form__protocol');
    if (!label) return null;
    const r = label.getBoundingClientRect();
    return { x: r.x + 20, y: r.y + r.height / 2 };
  });
  console.log('LABEL_BOX', JSON.stringify(labelBox));
  if (labelBox) {
    await page.mouse.click(labelBox.x, labelBox.y);
    await sleep(1200);
  }

  // 点击后检查 span class + 发布按钮
  const after = await page.evaluate(() => {
    const label = document.querySelector('label.app-form__protocol');
    const span = label ? label.querySelector('.app-form__checkbox') : null;
    const pub = Array.from(document.querySelectorAll('button')).find(x => /发布小工具/.test(x.innerText));
    // 权限 tags
    const permTags = Array.from(document.querySelectorAll('.app-form__permission-tag')).map(s => ({ t: s.innerText.trim(), cls: s.className }));
    return {
      spanClass: span ? span.className : null,
      pubDisabled: pub ? pub.disabled : null,
      permTags
    };
  }).catch(e => ({ err: e.message }));
  console.log('AFTER_CLICK', JSON.stringify(after, null, 1));

  await page.screenshot({ path: path.join(OUT, 'xhs-agree-checked.png'), fullPage: false });
  await ctx.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
