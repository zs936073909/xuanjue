// 39_wait_publish.js — 轮询小工具审核状态，通过后自动打开草稿、挂载小工具、发布参赛笔记
// 总超时 6 小时（每 3 分钟查一次，120 轮）
const { chromium } = require('playwright-core');
const path = require('path');

const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const USER_DATA = path.join(__dirname, '.profile');
const OUT = path.join(__dirname, '..', '..', 'releases');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TOOL_NAME = '玄决 · 大六壬决策台';
const LOG = path.join(__dirname, 'wait-publish.log');
const log = (...a) => { const s = `[${new Date().toISOString()}] ${a.join(' ')}`; console.log(s); require('fs').appendFileSync(LOG, s + '\n'); };

(async () => {
  require('fs').writeFileSync(LOG, '');
  const ctx = await chromium.launchPersistentContext(USER_DATA, {
    executablePath: CHROME, headless: true, viewport: { width: 1440, height: 1100 },
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  page.on('pageerror', e => log('PAGEERR', e.message));

  // ===== 阶段A：轮询审核状态 =====
  let approved = false;
  for (let i = 0; i < 120; i++) {
    try {
      await page.goto('https://creator.xiaohongshu.com/new/red-app', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(4000);
      if (page.url().includes('/login')) { log('NEED_LOGIN'); process.exit(3); }
      const txt = await page.evaluate(() => document.body.innerText).catch(() => '');
      const state = txt.includes('审核中') ? 'reviewing' : (txt.includes('玄决') ? 'maybe-approved' : 'unknown');
      log('POLL', i, 'state=', state);
      if (state !== 'reviewing' && state === 'maybe-approved') {
        // 进一步确认：无「审核中」字样且工具仍存在
        approved = true;
        log('APPROVED_DETECTED');
        break;
      }
    } catch (e) {
      log('POLL_ERR', e.message.split('\n')[0]);
    }
    if (!approved) await sleep(180000); // 3 分钟
  }
  if (!approved) { log('TIMEOUT_NO_APPROVAL'); await ctx.close(); process.exit(2); }

  // ===== 阶段B：发布流程 =====
  log('PHASE_B_START');
  // B1. 进入发布页，打开草稿箱
  await page.goto('https://creator.xiaohongshu.com/publish/publish', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  // 打开草稿箱（右上角）
  const openedDraft = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('div,span,button'));
    const hit = els.find(e => e.innerText && /草稿箱/.test(e.innerText) && e.innerText.length < 20 && e.offsetWidth > 0 && e.offsetHeight > 0);
    if (hit) { hit.click(); return true; }
    return false;
  }).catch(() => false);
  log('DRAFT_BOX_OPENED', openedDraft);
  await sleep(2500);

  // B2. 点击最新草稿的「编辑」（标题含「大六壬决策台」）
  const editClicked = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('div,span,button'));
    const draft = els.find(e => e.innerText && /大六壬决策台/.test(e.innerText) && e.innerText.length < 40 && e.offsetWidth > 0 && e.offsetHeight > 0);
    if (!draft) return 'no-draft';
    // 找该草稿容器内的「编辑」按钮
    let node = draft;
    for (let d = 0; d < 6 && node; d++) node = node.parentElement;
    if (!node) return 'no-parent';
    const editBtn = Array.from(node.querySelectorAll('*')).find(e => e.innerText && e.innerText.trim() === '编辑' && e.offsetWidth > 0 && e.offsetHeight > 0);
    if (editBtn) { editBtn.click(); return 'edit-clicked'; }
    return 'no-edit-btn';
  });
  log('EDIT_DRAFT', editClicked);
  await sleep(4000);

  // B3. 在编辑器中查找「添加组件-小工具」并挂载
  const toolEntry = await page.evaluate(() => {
    const t = document.body.innerText;
    const idx = t.indexOf('添加组件');
    if (idx < 0) return 'no-component';
    return t.slice(idx, idx + 800).includes('小工具') ? 'has-tool' : 'no-tool';
  });
  log('TOOL_ENTRY', toolEntry);

  const clickedTool = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('div,span,button'));
    const hit = els.find(e => e.innerText && e.innerText.trim() === '小工具' && e.innerText.length < 10 && e.offsetWidth > 0 && e.offsetHeight > 0);
    if (hit) { hit.scrollIntoView({ block: 'center' }); hit.click(); return 'clicked'; }
    return 'not-found';
  });
  log('CLICK_TOOL', clickedTool);
  await sleep(2500);

  const picked = await page.evaluate(name => {
    const els = Array.from(document.querySelectorAll('div,span,button,li'));
    const hit = els.find(e => e.innerText && e.innerText.includes(name) && e.innerText.length < 50 && e.offsetWidth > 0 && e.offsetHeight > 0);
    if (hit) { hit.scrollIntoView({ block: 'center' }); hit.click(); return 'picked'; }
    return 'not-found';
  }, TOOL_NAME);
  log('PICK_TOOL', picked);
  await sleep(2000);
  await page.screenshot({ path: path.join(OUT, 'xhs-mounted.png'), fullPage: false });

  // B4. 滚动到底部点击「发布」(756,1056)
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(1000);
  await page.mouse.click(756, 1056);
  log('PUBLISH_CLICKED');
  await sleep(4000);

  // B5. 确认弹窗
  const confirmClicked = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('button,div,span'));
    const hit = els.find(e => e.innerText && /确定|确认|发布|同意/.test(e.innerText) && e.innerText.length < 10 && e.offsetWidth > 0 && e.offsetHeight > 0);
    if (hit) { hit.click(); return hit.innerText.trim(); }
    return null;
  }).catch(() => null);
  log('CONFIRM', confirmClicked);
  await sleep(6000);

  const after = await page.evaluate(() => ({ url: location.href, txt: document.body.innerText.slice(0, 500).replace(/\n+/g, ' | ') })).catch(e => ({ err: e.message }));
  log('AFTER', JSON.stringify(after));
  await page.screenshot({ path: path.join(OUT, 'xhs-published.png'), fullPage: false });

  await ctx.close();
  log('DONE');
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
