// 40_publish_now.js — 直接发布参赛笔记（不带小工具，先把笔记发出去）
// 流程：草稿箱 → 打开最新「大六壬决策台」草稿 → 确认内容 → 滚动到底 → 发布
const { chromium } = require('playwright-core');
const path = require('path');

const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const USER_DATA = path.join(__dirname, '.profile');
const OUT = path.join(__dirname, '..', '..', 'releases');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LOG = path.join(__dirname, 'publish-now.log');
const log = (...a) => { const s = `[${new Date().toISOString()}] ${a.join(' ')}`; console.log(s); require('fs').appendFileSync(LOG, s + '\n'); };

(async () => {
  require('fs').writeFileSync(LOG, '');
  const ctx = await chromium.launchPersistentContext(USER_DATA, {
    executablePath: CHROME, headless: true, viewport: { width: 1440, height: 1100 },
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  page.on('pageerror', e => log('PAGEERR', e.message));

  // 1. 打开发布页
  await page.goto('https://creator.xiaohongshu.com/publish/publish', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  if (page.url().includes('/login')) { log('NEED_LOGIN'); process.exit(3); }
  log('PUBLISH_PAGE_OPENED');

  // 2. 打开草稿箱（右上角「草稿箱(n)」）
  const draftBox = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('div,span,button,a'));
    const hit = els.find(e => e.innerText && /^草稿箱\(\d+\)$/.test(e.innerText.trim()) && e.offsetWidth > 0 && e.offsetHeight > 0);
    if (hit) { hit.click(); return 'clicked'; }
    return 'not-found';
  });
  log('DRAFT_BOX', draftBox);
  await sleep(3000);

  // 3. 找「大六壬决策台」草稿，点它所在行（进入编辑）
  const draftClicked = await page.evaluate(() => {
    // 草稿列表可能在弹层里：找元素文本=标题且可点击的
    const nodes = Array.from(document.querySelectorAll('div,span,button,a,li'));
    const hit = nodes.find(e => {
      const t = (e.innerText || '').trim();
      return t === '大六壬决策台：纯离线开源隐私优先' && e.offsetWidth > 0 && e.offsetHeight > 0;
    });
    if (!hit) return 'no-draft';
    // 向上找可点击容器，或直接点文本
    hit.scrollIntoView({ block: 'center' });
    const r = hit.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  });
  log('DRAFT_TARGET', JSON.stringify(draftClicked));
  if (draftClicked && draftClicked.x) {
    await page.mouse.click(draftClicked.x, draftClicked.y);
    log('DRAFT_CLICKED');
  }
  await sleep(4000);
  log('URL_AFTER_DRAFT', page.url());

  // 4. 确认编辑器内容（标题、话题）
  const check = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      hasTitle: t.includes('大六壬决策台'),
      hasVibe: t.includes('vibecoding'),
      hasBody: t.includes('开源轮子'),
      sample: t.slice(0, 300).replace(/\n+/g, '|')
    };
  }).catch(() => ({}));
  log('EDITOR_CHECK', JSON.stringify(check));
  await page.screenshot({ path: path.join(OUT, 'xhs-ready-publish.png'), fullPage: false });

  // 5. 滚动到底部，点击「发布」(756,1056)
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(1200);
  await page.mouse.click(756, 1056);
  log('PUBLISH_CLICKED');
  await sleep(4000);

  // 6. 处理发布确认弹窗（可能要求二次确认）
  for (let i = 0; i < 3; i++) {
    const hit = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('button,div,span'));
      const cand = els.find(e => {
        const t = (e.innerText || '').trim();
        return (t === '确定' || t === '确认' || t === '发布' || t === '同意' || /确定发布/.test(t)) && e.offsetWidth > 0 && e.offsetHeight > 0 && e.offsetWidth < 200;
      });
      if (cand) { cand.click(); return cand.innerText.trim(); }
      return null;
    }).catch(() => null);
    log('CONFIRM', i, hit);
    if (!hit) break;
    await sleep(2500);
  }
  await sleep(5000);

  // 7. 结果
  const after = await page.evaluate(() => ({
    url: location.href,
    txt: document.body.innerText.slice(0, 500).replace(/\n+/g, ' | ')
  })).catch(e => ({ err: e.message }));
  log('AFTER', JSON.stringify(after));
  await page.screenshot({ path: path.join(OUT, 'xhs-published.png'), fullPage: false });

  await ctx.close();
  log('DONE');
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });