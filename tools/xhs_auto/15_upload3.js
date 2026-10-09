// 上传 v3：单会话全流程（填表→图标裁剪→zip→部署轮询→标签→同意→发布）
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
    executablePath: CHROME, headless: true, viewport: { width: 1440, height: 900 },
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

  // 3) 上传图标并确认裁剪
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

  // 4) 上传 zip 并等待部署（轮询真实部署状态）
  const zipInput = await page.$('input[type="file"][accept*="zip"]');
  if (zipInput) { await zipInput.setInputFiles(ZIP); console.log('ZIP_SET'); }
  await sleep(3000);

  // 轮询：真实部署成功标志 = 上传区出现「部署成功」非提示性文案 / 文件名出现且无「重新上传」
  let deploy = null;
  for (let i = 0; i < 30; i++) {
    const st = await page.evaluate(() => {
      const t = document.body.innerText;
      const zipName = /xuanjue-v1\.5\.0-xhs-tool\.zip/.test(t);
      const hasRetry = /重新上传/.test(t);
      const deployOk = /部署成功(?!后可)/.test(t); // 排除「部署成功后可扫码预览」提示
      const deployFail = /部署失败|上传失败/.test(t);
      return { zipName, hasRetry, deployOk, deployFail };
    }).catch(() => null);
    if (st && (st.deployOk || st.deployFail || (st.zipName && !st.hasRetry))) { deploy = st; break; }
    await sleep(3000);
  }
  console.log('DEPLOY', JSON.stringify(deploy));

  // 5) 场景标签「实用工具」
  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('button,div,span'));
    const hit = els.find(e => e.innerText && e.innerText.trim() === '实用工具' && e.offsetWidth > 0 && e.offsetHeight > 0);
    if (hit) hit.click();
  });
  await sleep(500);

  // 6) 勾选同意
  await page.evaluate(() => {
    const boxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
    boxes.forEach(b => { if (!b.checked) b.click(); });
  });
  await sleep(600);

  // 7) 截图 + 状态汇总（含发布按钮是否存在及其禁用态）
  await page.screenshot({ path: path.join(OUT, 'xhs-upload-v3.png'), fullPage: false });
  const fin = await page.evaluate(() => {
    const t = document.body.innerText;
    const pubBtn = Array.from(document.querySelectorAll('button')).find(b => /发布小工具/.test(b.innerText));
    return {
      iconShown: /图标.*png|预览简介和图标/.test(t) && !/格式支持/.test(t.slice(0, 200)),
      hasPubBtn: !!pubBtn,
      pubDisabled: pubBtn ? pubBtn.disabled : null,
      deployOkReal: /部署成功(?!后可)/.test(t),
      deployFail: /部署失败|上传失败/.test(t),
      zipVisible: /xuanjue-v1\.5\.0-xhs-tool\.zip/.test(t),
      tail: t.slice(-500)
    };
  }).catch(e => ({ err: e.message }));
  console.log('FINAL', JSON.stringify(fin, null, 1));

  await ctx.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
