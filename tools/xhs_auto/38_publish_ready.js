// 38_publish_ready.js — 审核通过后的发布脚本（打开草稿箱最新草稿 → 添加组件-小工具 → 挂载 → 发布）
// 前置：小工具已审核通过（添加组件区出现「小工具」入口）
const { chromium } = require('playwright-core');
const path = require('path');

const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const USER_DATA = path.join(__dirname, '.profile');
const OUT = path.join(__dirname, '..', '..', 'releases');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TOOL_NAME = '玄决 · 大六壬决策台';

(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA, {
    executablePath: CHROME, headless: true, viewport: { width: 1440, height: 1100 },
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  page.on('pageerror', e => console.log('PAGEERR', e.message));

  // 1. 打开发布页并进入图文模式，检查「添加组件-小工具」入口
  await page.goto('https://creator.xiaohongshu.com/publish/publish', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  if (page.url().includes('/login')) { console.log('NEED_LOGIN'); process.exit(3); }
  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('div,span,button'));
    const hit = els.find(e => e.innerText && e.innerText.trim() === '上传图文' && e.innerText.length < 20 && e.offsetWidth > 0 && e.offsetHeight > 0);
    if (hit) hit.click();
  });
  await sleep(2500);
  await page.setInputFiles('input[type=file]', [path.join(OUT, 'shots', '01-home.png')]);
  await sleep(6000);

  // 2. 查找「小工具」入口（在添加组件区）
  const toolEntry = await page.evaluate(() => {
    const t = document.body.innerText;
    const idx = t.indexOf('添加组件');
    if (idx < 0) return 'no-component';
    const seg = t.slice(idx, idx + 800);
    return seg.includes('小工具') ? 'has-tool' : 'no-tool';
  });
  console.log('TOOL_ENTRY', toolEntry);

  if (toolEntry === 'no-tool') {
    // 尝试点击「添加组件」区或展开更多
    await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('div,span,button'));
      const hit = els.find(e => e.innerText && e.innerText.trim() === '添加组件' && e.offsetWidth > 0 && e.offsetHeight > 0);
      if (hit) hit.click();
    });
    await sleep(1500);
    const again = await page.evaluate(() => {
      const t = document.body.innerText;
      const idx = t.indexOf('添加组件');
      if (idx < 0) return 'no-component';
      return t.slice(idx, idx + 1200).includes('小工具') ? 'has-tool' : 'no-tool';
    });
    console.log('TOOL_ENTRY_AFTER_CLICK', again);
  }

  // 3. 若找到「小工具」入口，点击并选择我们的工具
  const clickedTool = await page.evaluate(name => {
    const els = Array.from(document.querySelectorAll('div,span,button'));
    const hit = els.find(e => e.innerText && e.innerText.trim() === '小工具' && e.innerText.length < 10 && e.offsetWidth > 0 && e.offsetHeight > 0);
    if (hit) { hit.scrollIntoView({ block: 'center' }); hit.click(); return 'clicked'; }
    return 'not-found';
  }, TOOL_NAME);
  console.log('CLICK_TOOL', clickedTool);
  await sleep(2500);

  // 4. 在选择面板中选择「玄决 · 大六壬决策台」
  const picked = await page.evaluate(name => {
    const els = Array.from(document.querySelectorAll('div,span,button,li'));
    const hit = els.find(e => e.innerText && e.innerText.includes(name) && e.innerText.length < 40 && e.offsetWidth > 0 && e.offsetHeight > 0);
    if (hit) { hit.scrollIntoView({ block: 'center' }); hit.click(); return 'picked'; }
    return 'not-found';
  }, TOOL_NAME);
  console.log('PICK_TOOL', picked);
  await sleep(2000);

  // 5. 确认挂载成功（预览区或正文下方出现工具卡片）
  const mounted = await page.evaluate(name => {
    const t = document.body.innerText;
    return t.includes(name) ? 'mounted' : 'unmounted';
  }, TOOL_NAME);
  console.log('MOUNTED', mounted);
  await page.screenshot({ path: path.join(OUT, 'xhs-mounted.png'), fullPage: false });

  // 6. 滚动到底部，点击「发布」(756,1056)
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(1000);
  await page.mouse.click(756, 1056);
  console.log('PUBLISH_CLICKED');
  await sleep(4000);

  // 7. 处理可能的发布确认弹窗
  const confirmClicked = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('button,div,span'));
    const hit = els.find(e => e.innerText && /确定|确认|发布|同意/.test(e.innerText) && e.innerText.length < 10 && e.offsetWidth > 0 && e.offsetHeight > 0);
    if (hit) { hit.click(); return hit.innerText.trim(); }
    return null;
  }).catch(() => null);
  console.log('CONFIRM', confirmClicked);
  await sleep(5000);

  const after = await page.evaluate(() => ({
    url: location.href,
    txt: document.body.innerText.slice(0, 600).replace(/\n+/g, ' | ')
  })).catch(e => ({ err: e.message }));
  console.log('AFTER', JSON.stringify(after, null, 1));
  await page.screenshot({ path: path.join(OUT, 'xhs-published.png'), fullPage: false });

  await ctx.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
