// 27_draft_note.js — 填写参赛笔记完整内容并保存为草稿（标题/正文/话题/图片）
// 待小工具审核通过后，从草稿继续挂载小工具并发布
const { chromium } = require('playwright-core');
const path = require('path');

const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const USER_DATA = path.join(__dirname, '.profile');
const OUT = path.join(__dirname, '..', '..', 'releases');
const SHOTS = path.join(OUT, 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const TITLE = '大六壬决策台：纯离线、开源、隐私优先';
const BODY = [
  '用开源轮子攒了个「玄决 · 大六壬决策台」，纯前端 PWA，数据全在本机，离线也能用，不绑任何账号。',
  '',
  '盘面做成三层渐进披露：先看摘要，再白话，最后专业课体。本地规则解读，不是套壳 AI。',
  '',
  '这一版还加了生物识别解锁、分钟级课缓存、IndexedDB 本地持久镜像，隐私优先。',
  '',
  '参赛作品，用到的都是开源组件：六壬/黄历/干支历/紫微/奇门/塔罗，全离线可跑。',
  '',
  '#vibecoding #小红书vibecoding大赛 #大六壬 #开源 #前端开发 #离线应用 #PWA #个人开发'
].join('\n');

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

  // 切「上传图文」
  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('div,span,button'));
    const hit = els.find(e => e.innerText && e.innerText.trim() === '上传图文' && e.innerText.length < 20 && e.offsetWidth > 0 && e.offsetHeight > 0);
    if (hit) hit.click();
  });
  await sleep(2500);

  // 上传图片
  await page.setInputFiles('input[type=file]', [
    '01-home.png','02-board-summary.png','03-board-plain.png','04-board-pro.png'
  ].map(n => path.join(SHOTS, n)));
  console.log('FILES_SET');
  await sleep(6000);

  // 填标题（Playwright fill：focus + 模拟键入，兼容 React 受控组件）
  const titleInput = page.locator('input[placeholder*="标题"]').first();
  await titleInput.scrollIntoViewIfNeeded();
  await titleInput.fill(TITLE);
  console.log('TITLE_FILLED');
  await sleep(800);

  // 填正文（contenteditable 或 textarea）
  const bodyDone = await page.evaluate(b => {
    const ce = document.querySelector('[contenteditable="true"]');
    if (ce) {
      ce.focus();
      document.execCommand('insertText', false, b);
      return 'contenteditable';
    }
    const ta = document.querySelector('textarea[placeholder*="正文"]') || document.querySelector('textarea');
    if (ta) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(ta, b);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      return 'textarea';
    }
    return 'no-body';
  }, BODY);
  console.log('BODY', bodyDone);
  await sleep(1200);

  // 记录当前状态（字数/预览）
  const info = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      hasTitle: /我把大六壬做成了纯离线小工具/.test(t),
      hasTopic: /vibecoding/.test(t),
      count: (t.match(/\d+ \/ 1000/) || [null])[0],
      txt: t.slice(-600).replace(/\n+/g, ' | ')
    };
  }).catch(e => ({ err: e.message }));
  console.log('INFO', JSON.stringify(info, null, 1));
  await page.screenshot({ path: path.join(OUT, 'xhs-draft-filled.png'), fullPage: false });

  // 点「暂存离开」保存草稿（Playwright 文本定位器，穿透深层结构）
  const saveBtn = page.locator('text=暂存离开').first();
  try {
    await saveBtn.scrollIntoViewIfNeeded();
    await saveBtn.click();
    console.log('SAVE_CLICKED');
    await sleep(2500);
  } catch (e) {
    console.log('SAVE_ERR', e.message.split('\n')[0]);
  }
  // 若有确认弹窗，点击确认
  const confirmClicked = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('button,div,span'));
    const hit = els.find(e => e.innerText && /确定|保存|暂存|离开|继续编辑/.test(e.innerText) && e.innerText.length < 10 && e.offsetWidth > 0 && e.offsetHeight > 0);
    if (hit) { hit.click(); return hit.innerText.trim(); }
    return null;
  }).catch(() => null);
  console.log('CONFIRM', confirmClicked);
  await sleep(2000);
  console.log('AFTER_SAVE_URL', page.url());
  const after = await page.evaluate(() => ({ txt: document.body.innerText.slice(0, 500) })).catch(() => ({}));
  console.log('AFTER', JSON.stringify(after, null, 1));
  await page.screenshot({ path: path.join(OUT, 'xhs-draft-saved.png'), fullPage: false });

  await ctx.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
