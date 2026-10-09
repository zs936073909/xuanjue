// 31_full_flow.js — 完整填内容（标题+正文+话题）后，检查「发布/暂存离开」按钮是否出现
const { chromium } = require('playwright-core');
const path = require('path');

const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const USER_DATA = path.join(__dirname, '.profile');
const OUT = path.join(__dirname, '..', '..', 'releases');
const SHOTS = path.join(OUT, 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const TITLE = '大六壬决策台：纯离线开源隐私优先';
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

  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('div,span,button'));
    const hit = els.find(e => e.innerText && e.innerText.trim() === '上传图文' && e.innerText.length < 20 && e.offsetWidth > 0 && e.offsetHeight > 0);
    if (hit) hit.click();
  });
  await sleep(2500);
  await page.setInputFiles('input[type=file]', ['01-home.png','02-board-summary.png','03-board-plain.png','04-board-pro.png'].map(n => path.join(SHOTS, n)));
  await sleep(6000);

  // 标题：点击 + 键入
  const ti = page.locator('input[placeholder*="标题"]').first();
  await ti.click();
  await sleep(300);
  await page.keyboard.type(TITLE, { delay: 30 });
  await sleep(600);
  const titleVal = await page.evaluate(() => {
    const el = document.querySelector('input[placeholder*="标题"]');
    return el ? el.value : 'none';
  });
  console.log('TITLE_VAL', JSON.stringify(titleVal));

  // 正文：contenteditable
  const bodyDone = await page.evaluate(b => {
    const ce = document.querySelector('[contenteditable="true"]');
    if (ce) { ce.focus(); document.execCommand('insertText', false, b); return 'contenteditable'; }
    return 'no-body';
  }, BODY);
  console.log('BODY', bodyDone);
  await sleep(1200);

  // 检查按钮是否出现（内容齐全后）
  const afterBtn = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('*').forEach(el => {
      const t = (el.innerText || '').trim();
      if (t === '暂存离开' || t === '发布') {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) out.push({ tag: el.tagName, cls: (el.className || '').toString().slice(0, 60), top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) });
      }
    });
    return out;
  });
  console.log('BTN_AFTER_FILL', JSON.stringify(afterBtn, null, 1));

  // 页面完整文本里是否含「暂存离开」
  const hasText = await page.evaluate(() => document.body.innerText.includes('暂存离开'));
  console.log('HAS_SAVE_TEXT', hasText);

  await page.screenshot({ path: path.join(OUT, 'xhs-full-filled.png'), fullPage: true });
  await ctx.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
