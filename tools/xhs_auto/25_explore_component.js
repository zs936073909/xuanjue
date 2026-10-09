// 25_explore_component.js — 点击「添加组件」，查找小工具挂载入口
const { chromium } = require('playwright-core');
const path = require('path');

const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const USER_DATA = path.join(__dirname, '.profile');
const OUT = path.join(__dirname, '..', '..', 'releases');
const SHOTS = path.join(OUT, 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA, {
    executablePath: CHROME, headless: true, viewport: { width: 1440, height: 1100 },
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  page.on('pageerror', e => console.log('PAGEERR', e.message));
  await page.goto('https://creator.xiaohongshu.com/publish/publish', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  if (page.url().includes('/login')) { console.log('NEED_LOGIN'); process.exit(3); }

  // 切换上传图文并上传图片（确保编辑器完整加载）
  const tabClick = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('div,span,button'));
    const hit = els.find(e => e.innerText && e.innerText.trim() === '上传图文' && e.innerText.length < 20 && e.offsetWidth > 0 && e.offsetHeight > 0);
    if (hit) { hit.click(); return true; }
    return false;
  }).catch(() => false);
  console.log('TAB_IMAGE_CLICKED', tabClick);
  await sleep(2500);
  const hasInput = await page.evaluate(() => !!document.querySelector('input[type=file]'));
  if (hasInput) {
    await page.setInputFiles('input[type=file]', ['01-home.png','02-board-summary.png'].map(n => path.join(SHOTS, n)));
    console.log('FILES_SET');
    await sleep(6000);
  }

  // 点击「添加组件」标题（展开/聚焦）
  const compClick = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('div,span,button'));
    const hit = els.find(e => e.innerText && e.innerText.trim() === '添加组件' && e.offsetWidth > 0 && e.offsetHeight > 0);
    if (hit) { hit.scrollIntoView({ block: 'center' }); hit.click(); return true; }
    return false;
  }).catch(() => false);
  console.log('COMP_CLICKED', compClick);
  await sleep(1500);

  // 再点「更多」看是否展开更多组件
  const moreClick = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('div,span,button'));
    const hit = els.find(e => e.innerText && e.innerText.trim() === '更多' && e.innerText.length < 10 && e.offsetWidth > 0 && e.offsetHeight > 0);
    if (hit) { hit.scrollIntoView({ block: 'center' }); hit.click(); return true; }
    return false;
  }).catch(() => false);
  console.log('MORE_CLICKED', moreClick);
  await sleep(1500);

  // 查找「小工具」「互动组件」「小程序」「组件」相关入口
  const toolEntry = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('div,span,button,a,[class*=item],[class*=card],[class*=menu]'));
    const hits = els
      .filter(e => e.innerText && /小工具|互动组件|小程序|组件|投票|打卡|抽奖/.test(e.innerText) && e.innerText.length < 40 && e.offsetWidth > 0 && e.offsetHeight > 0)
      .map(e => e.innerText.trim())
      .filter((v, i, a) => a.indexOf(v) === i);
    return hits.slice(0, 40);
  }).catch(() => []);
  console.log('TOOL_ENTRIES', JSON.stringify(toolEntry, null, 1));

  // 全文扫描包含「工具」的可见文本
  const allText = await page.evaluate(() => {
    const body = document.body.innerText;
    const lines = body.split('\n').map(s => s.trim()).filter(s => /工具/.test(s) && s.length < 60);
    return [...new Set(lines)].slice(0, 30);
  }).catch(() => []);
  console.log('TOOL_TEXT_LINES', JSON.stringify(allText, null, 1));

  await page.screenshot({ path: path.join(OUT, 'xhs-component-explore.png'), fullPage: false });
  await ctx.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
