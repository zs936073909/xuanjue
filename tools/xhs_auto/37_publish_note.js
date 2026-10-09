// 37_publish_note.js — 打开最新草稿，通过「添加组件-小工具」挂载小工具并发布参赛笔记
// 前提：小工具已审核通过（发布页「添加组件」出现「小工具」入口）
const { chromium } = require('playwright-core');
const path = require('path');

const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const USER_DATA = path.join(__dirname, '.profile');
const OUT = path.join(__dirname, '..', '..', 'releases');
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

  // 检查「添加组件」区是否有「小工具」入口（审核通过后才出现）
  const hasTool = await page.evaluate(() => {
    const t = document.body.innerText;
    return /添加组件/.test(t) ? null : 'no-editor';
  });
  console.log('EDITOR_STATE', hasTool);

  // 先确认发布页是否有「小工具」组件入口（切到上传图文后）
  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('div,span,button'));
    const hit = els.find(e => e.innerText && e.innerText.trim() === '上传图文' && e.innerText.length < 20 && e.offsetWidth > 0 && e.offsetHeight > 0);
    if (hit) hit.click();
  });
  await sleep(2500);

  const toolEntry = await page.evaluate(() => {
    const t = document.body.innerText;
    // 「添加组件」区域内是否含「小工具」
    const idx = t.indexOf('添加组件');
    if (idx < 0) return 'no-component-section';
    const seg = t.slice(idx, idx + 600);
    return { hasTool: seg.includes('小工具'), seg: seg.slice(0, 300).replace(/\n+/g, '|') };
  });
  console.log('TOOL_ENTRY', JSON.stringify(toolEntry, null, 1));

  // 如果发布页无「小工具」入口，改从草稿箱打开最新草稿，再找入口
  if (toolEntry === 'no-component-section' || toolEntry.hasTool === false) {
    console.log('NO_TOOL_ENTRY_IN_PUBLISH — 需从草稿箱尝试');
    // 进入草稿箱
    await page.goto('https://creator.xiaohongshu.com/draft', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(4000);
    const drafts = await page.evaluate(() => {
      const t = document.body.innerText;
      const lines = t.split('\n').map(s => s.trim()).filter(Boolean);
      return lines.filter(l => /大六壬|玄决|暂无笔记标题/.test(l)).slice(0, 10);
    });
    console.log('DRAFTS', JSON.stringify(drafts, null, 1));
  }

  await page.screenshot({ path: path.join(OUT, 'xhs-tool-entry-check.png'), fullPage: false });
  await ctx.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
