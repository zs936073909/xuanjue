// 33_debug5.js — 定位底部操作栏容器（伪元素渲染按钮文字），并验证能否点击
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

  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('div,span,button'));
    const hit = els.find(e => e.innerText && e.innerText.trim() === '上传图文' && e.innerText.length < 20 && e.offsetWidth > 0 && e.offsetHeight > 0);
    if (hit) hit.click();
  });
  await sleep(2500);
  await page.setInputFiles('input[type=file]', ['01-home.png','02-board-summary.png','03-board-plain.png','04-board-pro.png'].map(n => path.join(SHOTS, n)));
  await sleep(6000);

  // 填标题 + 正文
  const ti = page.locator('input[placeholder*="标题"]').first();
  await ti.click();
  await sleep(300);
  await page.keyboard.type('大六壬决策台：纯离线开源隐私优先', { delay: 30 });
  await sleep(500);
  await page.evaluate(b => {
    const ce = document.querySelector('[contenteditable="true"]');
    if (ce) { ce.focus(); document.execCommand('insertText', false, b); }
  }, '测试正文内容，用于定位底部操作栏。');
  await sleep(1000);

  // 找 class 含 publish/submit/action/footer/btn 的可见元素，dump outerHTML
  const candidates = await page.evaluate(() => {
    const out = [];
    const keywords = /publish|submit|save|draft|action|footer|operate|bottom/i;
    document.querySelectorAll('div,button').forEach(el => {
      const cls = (el.className || '').toString();
      if (!keywords.test(cls)) return;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        out.push({ tag: el.tagName, cls: cls.slice(0, 80), top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height), inner: (el.innerText || '').slice(0, 20) });
      }
    });
    return out.slice(0, 50);
  });
  console.log('CANDIDATES', JSON.stringify(candidates, null, 1));

  // 全页截图，从像素确认底部按钮
  await page.screenshot({ path: path.join(OUT, 'xhs-full2.png'), fullPage: true });
  console.log('SHOT_SAVED');

  // 用 Playwright 的 getByRole 尝试 button
  try {
    const pub = page.getByRole('button', { name: '发布', exact: true });
    const cnt = await pub.count();
    console.log('ROLE_BUTTON_PUB_COUNT', cnt);
  } catch (e) {
    console.log('ROLE_ERR', e.message.split('\n')[0]);
  }

  await ctx.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
