// 发布 v4：表单已就绪（图标+zip 部署成功），完成同意勾选并点击发布
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

  // 进入已有表单（小工具列表可能有「编辑」或直接展开；点上传小工具按钮进入）
  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('button,div,span,a'));
    const hit = els.find(e => e.innerText && /上传小工具|继续编辑|编辑/.test(e.innerText) && e.innerText.length < 20 && e.offsetWidth > 0 && e.offsetHeight > 0);
    if (hit) hit.click();
  });
  await sleep(4000);

  // 滚动到底部确保同意区域可见
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(800);

  // 检查当前表单状态（是否仍是空表单 vs 已填表单）
  const st = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      hasZip: /xuanjue-v1\.5\.0-xhs-tool\.zip/.test(t),
      deployOk: /部署成功(?!后可)/.test(t),
      emptyForm: !!document.querySelector('input[placeholder="请输入小工具名称"]') && !/xuanjue-v1\.5\.0-xhs-tool\.zip/.test(t)
    };
  }).catch(() => null);
  console.log('FORM_STATE', JSON.stringify(st));

  if (!st.hasZip || !st.deployOk) {
    // 表单是空的（新会话丢失）：需要重新走上传流程 → 退出让 15 脚本重跑
    console.log('FORM_EMPTY_NEED_UPLOAD');
    process.exit(4);
  }

  // 确认「所需权限」默认「不需要权限」（radio/checkbox 组，默认应已选中）
  // 勾选「我已阅读并同意《小工具发布安全规范》」
  const agree = await page.evaluate(() => {
    // 找同意相关的 checkbox（排除权限选项里的 checkbox）
    const boxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
    let hit = null;
    for (const b of boxes) {
      const row = b.closest('label,div') ? (b.closest('label,div').innerText || '') : '';
      if (/安全规范|同意|发布规范/.test(row)) { hit = b; break; }
    }
    if (!hit) hit = boxes[boxes.length - 1]; // 兜底：最后一个 checkbox
    if (hit && !hit.checked) { hit.click(); }
    return hit ? hit.checked : null;
  }).catch(() => null);
  console.log('AGREE_CHECKED', agree);
  await sleep(800);

  // 再次检查发布按钮状态
  const pubBefore = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => /发布小工具/.test(x.innerText));
    return b ? { disabled: b.disabled, text: b.innerText } : null;
  }).catch(() => null);
  console.log('PUB_BEFORE', JSON.stringify(pubBefore));

  await page.screenshot({ path: path.join(OUT, 'xhs-publish-ready.png'), fullPage: false });

  // 若已可用则点击发布
  if (pubBefore && !pubBefore.disabled) {
    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button')).find(x => /发布小工具/.test(x.innerText));
      if (b) b.click();
    });
    console.log('PUBLISH_CLICKED');
    await sleep(5000);
    await page.screenshot({ path: path.join(OUT, 'xhs-publish-result.png'), fullPage: false });
    const after = await page.evaluate(() => ({
      url: location.href,
      txt: document.body.innerText.slice(0, 600)
    })).catch(e => ({ err: e.message }));
    console.log('AFTER', JSON.stringify(after, null, 1));
  } else {
    console.log('PUBLISH_STILL_DISABLED');
  }

  await ctx.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
