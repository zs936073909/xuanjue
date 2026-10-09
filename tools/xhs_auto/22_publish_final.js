// 最终发布：单会话全流程 + 选择「不需要权限」权限 + 同意 + 发布
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

  // 权限：点击「不需要权限」标签（scrollIntoView 后真实点击）
  await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('.app-form__permission-tag')).find(s => s.innerText.trim() === '不需要权限');
    if (el) el.scrollIntoView({ block: 'center', behavior: 'instant' });
  });
  await sleep(800);
  const permBox = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('.app-form__permission-tag')).find(s => s.innerText.trim() === '不需要权限');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, top: r.top, bottom: r.bottom, vh: window.innerHeight };
  });
  console.log('PERM_BOX', JSON.stringify(permBox));
  if (permBox && permBox.top >= 0 && permBox.bottom <= permBox.vh) {
    await page.mouse.click(permBox.x, permBox.y);
    await sleep(1000);
  }
  const permAfter = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('.app-form__permission-tag')).find(s => s.innerText.trim() === '不需要权限');
    return el ? el.className : null;
  }).catch(() => null);
  console.log('PERM_AFTER', permAfter);

  // 同意（scrollIntoView + 真实点击）
  await page.evaluate(() => {
    const label = document.querySelector('label.app-form__protocol');
    if (label) label.scrollIntoView({ block: 'center', behavior: 'instant' });
  });
  await sleep(800);
  const agreeBox = await page.evaluate(() => {
    const label = document.querySelector('label.app-form__protocol');
    if (!label) return null;
    const r = label.getBoundingClientRect();
    return { x: r.x + 16, y: r.y + r.height / 2, top: r.top, bottom: r.bottom, vh: window.innerHeight };
  });
  if (agreeBox && agreeBox.top >= 0 && agreeBox.bottom <= agreeBox.vh) {
    await page.mouse.click(agreeBox.x, agreeBox.y);
    await sleep(1500);
  }
  const agreeAfter = await page.evaluate(() => {
    const span = document.querySelector('label.app-form__protocol .app-form__checkbox');
    return span ? span.className : null;
  }).catch(() => null);
  console.log('AGREE_AFTER', agreeAfter);

  // 发布按钮状态
  const pub = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => /发布小工具/.test(x.innerText));
    return b ? { disabled: b.disabled } : null;
  }).catch(() => null);
  console.log('PUB', JSON.stringify(pub));
  await page.screenshot({ path: path.join(OUT, 'xhs-publish-final.png'), fullPage: false });

  if (pub && !pub.disabled) {
    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button')).find(x => /发布小工具/.test(x.innerText));
      if (b) b.click();
    });
    console.log('PUBLISH_CLICKED');
    await sleep(6000);
    await page.screenshot({ path: path.join(OUT, 'xhs-publish-result.png'), fullPage: false });
    const after = await page.evaluate(() => ({ url: location.href, txt: document.body.innerText.slice(0, 800) })).catch(e => ({ err: e.message }));
    console.log('AFTER', JSON.stringify(after, null, 1));
  } else {
    console.log('PUB_STILL_DISABLED');
  }

  await ctx.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
