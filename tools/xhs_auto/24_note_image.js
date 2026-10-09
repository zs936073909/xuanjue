// 24_note_image.js — 切换到「上传图文」，上传截图，探索编辑器中挂载小工具的入口
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

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
  await page.goto('https://creator.xiaohongshu.com/new/red-app', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  if (page.url().includes('/login')) { console.log('NEED_LOGIN'); process.exit(3); }
  // 直接导航到发布笔记页
  await page.goto('https://creator.xiaohongshu.com/publish/publish', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);

  // 点击「上传图文」标签
  const tabClick = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('div,span,button'));
    const hit = els.find(e => e.innerText && e.innerText.trim() === '上传图文' && e.innerText.length < 20 && e.offsetWidth > 0 && e.offsetHeight > 0);
    if (hit) { hit.click(); return true; }
    return false;
  }).catch(() => false);
  console.log('TAB_IMAGE_CLICKED', tabClick);
  await sleep(3000);

  // 上传截图（多个文件，input[type=file] 多选）
  const shots = ['01-home.png','02-board-summary.png','03-board-plain.png','04-board-pro.png'].map(n => path.join(SHOTS, n));
  const uploaded = await page.evaluate(() => {
    const inp = document.querySelector('input[type=file]');
    return inp ? 'found' : 'none';
  });
  console.log('FILE_INPUT', uploaded);
  if (uploaded === 'found') {
    await page.setInputFiles('input[type=file]', shots);
    console.log('FILES_SET');
    await sleep(8000);
  }

  console.log('URL', page.url());
  await page.screenshot({ path: path.join(OUT, 'xhs-image-editor.png'), fullPage: false });

  // 探索编辑器页面：工具栏按钮、右侧面板，查找小工具/互动组件入口
  const info = await page.evaluate(() => {
    const txt = document.body.innerText.slice(0, 1500);
    // 收集可见按钮文案
    const btns = Array.from(document.querySelectorAll('button,div[role=button],[class*=btn]'))
      .filter(e => e.innerText && e.innerText.trim().length < 30 && e.offsetWidth > 0 && e.offsetHeight > 0)
      .map(e => e.innerText.trim())
      .filter((v, i, a) => a.indexOf(v) === i);
    return { url: location.href, txt: txt.replace(/\n+/g, ' | '), btns: btns.slice(0, 60) };
  }).catch(e => ({ err: e.message }));
  console.log('INFO', JSON.stringify(info, null, 1));

  await ctx.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
