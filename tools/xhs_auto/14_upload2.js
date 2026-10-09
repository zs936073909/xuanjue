// 上传 v2：确认图标裁剪 + 修正简介 + 重传 zip + 监控部署状态
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

  // 1) 若存在「上传小工具」按钮则点击进入表单
  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('button,div,span,a'));
    const hit = els.find(e => e.innerText && /上传小工具/.test(e.innerText) && e.innerText.length < 20 && e.offsetWidth > 0 && e.offsetHeight > 0);
    if (hit) hit.click();
  });
  await sleep(4000);

  // 2) 若已有表单则先修简介，否则全新填写
  const hasForm = await page.evaluate(() => !!document.querySelector('input[placeholder="请输入小工具名称"]'));
  console.log('HAS_FORM', hasForm);
  if (hasForm) {
    // 修正简介（超限）
    await page.evaluate((desc) => {
      const inp = document.querySelector('input[placeholder="一句话描述小工具的功能"]');
      if (inp) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(inp, desc);
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, DESC);
    // 若名称为空也补填
    const nameVal = await page.evaluate(() => document.querySelector('input[placeholder="请输入小工具名称"]')?.value || '');
    if (!nameVal) {
      await page.evaluate((name) => {
        const inp = document.querySelector('input[placeholder="请输入小工具名称"]');
        if (inp) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(inp, name);
          inp.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }, NAME);
    }
    const verVal = await page.evaluate(() => document.querySelector('input[placeholder*="版本号"]')?.value || '');
    if (!verVal) {
      await page.evaluate((v) => {
        const inp = document.querySelector('input[placeholder*="版本号"]');
        if (inp) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(inp, v);
          inp.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }, VERSION);
    }
    console.log('FORM_FIXED name=' + nameVal + ' desc=' + DESC + ' ver=' + verVal);
  } else {
    console.log('NO_FORM — 需重新进入上传页');
    process.exit(4);
  }

  // 3) 处理图标：若有裁剪弹窗则确认
  const cropVisible = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    return btns.some(b => /确认裁剪并上传/.test(b.innerText));
  }).catch(() => false);
  if (cropVisible) {
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const hit = btns.find(b => /确认裁剪并上传/.test(b.innerText));
      if (hit) hit.click();
    });
    console.log('CROP_CONFIRMED');
    await sleep(3000);
  } else {
    console.log('NO_CROP_MODAL');
  }

  // 4) zip 部署状态检查 + 重传
  const zipState = await page.evaluate(() => {
    const t = document.body.innerText;
    const ok = /部署成功|上传成功|已完成|100%/.test(t);
    const fail = /部署失败|上传失败|重新上传/.test(t);
    return { ok, fail, snippet: t.slice(-800) };
  }).catch(e => ({ err: e.message }));
  console.log('ZIP_STATE', JSON.stringify(zipState).slice(0, 400));

  if (zipState.fail && !zipState.ok) {
    // 点「重新上传」再传 zip
    const clickedRetry = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('button,div,span,a'));
      const hit = els.find(e => e.innerText && /重新上传|重新选择/.test(e.innerText) && e.offsetWidth > 0 && e.offsetHeight > 0);
      if (hit) { hit.click(); return true; }
      return false;
    }).catch(() => false);
    console.log('RETRY_CLICKED', clickedRetry);
    await sleep(2000);
    const zipInput = await page.$('input[type="file"][accept*="zip"]');
    if (zipInput) { await zipInput.setInputFiles(ZIP); console.log('ZIP_RETRY_UPLOADED'); }
    await sleep(10000);
  }

  // 5) 场景标签 + 同意
  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('button,div,span'));
    const hit = els.find(e => e.innerText && e.innerText.trim() === '实用工具' && e.offsetWidth > 0 && e.offsetHeight > 0);
    if (hit) hit.click();
  });
  await sleep(400);
  await page.evaluate(() => {
    const boxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
    boxes.forEach(b => { if (!b.checked) b.click(); });
  });
  await sleep(600);

  // 6) 最终状态
  await page.screenshot({ path: path.join(OUT, 'xhs-upload-v2.png'), fullPage: false });
  const fin = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      hasPublish: /发布小工具/.test(t),
      deployOk: /部署成功/.test(t),
      deployFail: /部署失败/.test(t),
      bodyTail: t.slice(-600)
    };
  }).catch(e => ({ err: e.message }));
  console.log('FINAL', JSON.stringify(fin, null, 1));

  await ctx.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
