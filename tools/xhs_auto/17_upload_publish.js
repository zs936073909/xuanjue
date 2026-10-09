// 上传+发布 v5：单会话全流程（填表→图标→zip部署→同意→发布）
const { chromium } = require('playwright-core');
const path = require('path');

const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const USER_DATA = path.join(__dirname, '.profile');
const OUT = path.join(__dirname, '..', '..', 'releases');

const NAME = '玄决 · 大六壬决策台';
const DESC = '离线大六壬决策台';
const VERSION = '1.5.0';
const ZIP = path.join(OUT, 'xuanjue-v1.5.0-xhs-tool.zip');
const ICON = path.join(OUT, 'xhs-icon.png');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const setInput = (page, sel, val) => page.evaluate(({ sel, val }) => {
  const inp = document.querySelector(sel);
  if (!inp) return false;
  const proto = inp.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  setter.call(inp, val);
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}, { sel, val });

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

  // 1) 进入上传表单
  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('button,div,span,a'));
    const hit = els.find(e => e.innerText && /上传小工具/.test(e.innerText) && e.innerText.length < 20 && e.offsetWidth > 0 && e.offsetHeight > 0);
    if (hit) hit.click();
  });
  await sleep(4000);

  // 2) 填表
  await setInput(page, 'input[placeholder="请输入小工具名称"]', NAME);
  await sleep(300);
  await setInput(page, 'input[placeholder="一句话描述小工具的功能"]', DESC);
  await sleep(300);
  await setInput(page, 'input[placeholder*="版本号"]', VERSION);
  await sleep(500);

  // 3) 上传图标 + 确认裁剪
  const iconInput = await page.$('input[type="file"][accept*="image"]');
  if (iconInput) { await iconInput.setInputFiles(ICON); console.log('ICON_SET'); }
  await sleep(3500);
  const crop = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const hit = btns.find(b => /确认裁剪并上传/.test(b.innerText));
    if (hit) { hit.click(); return true; }
    return false;
  }).catch(() => false);
  console.log('CROP_CONFIRMED', crop);
  await sleep(3500);

  // 4) 上传 zip 并等待部署
  const zipInput = await page.$('input[type="file"][accept*="zip"]');
  if (zipInput) { await zipInput.setInputFiles(ZIP); console.log('ZIP_SET'); }
  await sleep(3000);

  let deploy = null;
  for (let i = 0; i < 40; i++) {
    const st = await page.evaluate(() => {
      const t = document.body.innerText;
      const zipName = /xuanjue-v1\.5\.0-xhs-tool\.zip/.test(t);
      const hasRetry = /重新上传/.test(t);
      const deployOk = /部署成功(?!后可)/.test(t);
      const deployFail = /部署失败|上传失败/.test(t);
      return { zipName, hasRetry, deployOk, deployFail };
    }).catch(() => null);
    if (st && (st.deployOk || st.deployFail)) { deploy = st; break; }
    await sleep(3000);
  }
  console.log('DEPLOY', JSON.stringify(deploy));
  if (!deploy || deploy.deployFail) { console.log('DEPLOY_FAILED'); process.exit(5); }

  // 5) 场景标签「实用工具」
  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('button,div,span'));
    const hit = els.find(e => e.innerText && e.innerText.trim() === '实用工具' && e.offsetWidth > 0 && e.offsetHeight > 0);
    if (hit) hit.click();
  });
  await sleep(500);

  // 6) 滚动到底部，勾选同意规范（自定义 span 模拟 checkbox：点击 label）
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(800);
  const agree = await page.evaluate(() => {
    const label = document.querySelector('label.app-form__protocol');
    if (!label) return null;
    const span = label.querySelector('.app-form__checkbox');
    const alreadyChecked = span && /checked|active|on/i.test(span.className);
    if (!alreadyChecked) { label.click(); }
    return 'clicked';
  }).catch(() => null);
  console.log('AGREE_CHECKED', agree);
  await sleep(1000);

  // 7) 发布按钮状态 + 点击发布
  const pubBefore = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => /发布小工具/.test(x.innerText));
    return b ? { disabled: b.disabled, text: b.innerText } : null;
  }).catch(() => null);
  console.log('PUB_BEFORE', JSON.stringify(pubBefore));
  await page.screenshot({ path: path.join(OUT, 'xhs-publish-ready.png'), fullPage: false });

  if (pubBefore && !pubBefore.disabled) {
    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button')).find(x => /发布小工具/.test(x.innerText));
      if (b) b.click();
    });
    console.log('PUBLISH_CLICKED');
    await sleep(6000);
    await page.screenshot({ path: path.join(OUT, 'xhs-publish-result.png'), fullPage: false });
    const after = await page.evaluate(() => ({
      url: location.href,
      txt: document.body.innerText.slice(0, 700)
    })).catch(e => ({ err: e.message }));
    console.log('AFTER', JSON.stringify(after, null, 1));
  } else {
    console.log('PUBLISH_STILL_DISABLED');
    // 诊断：列出页面所有 checkbox 与按钮
    const diag = await page.evaluate(() => ({
      checkboxes: Array.from(document.querySelectorAll('input[type="checkbox"]')).map(b => ({ checked: b.checked, row: (b.closest('label,div')?.innerText || '').slice(0, 60) })),
      pubBtn: Array.from(document.querySelectorAll('button')).filter(b => /发布/.test(b.innerText)).map(b => ({ t: b.innerText, d: b.disabled }))
    })).catch(e => ({ err: e.message }));
    console.log('DIAG', JSON.stringify(diag, null, 1));
  }

  await ctx.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
