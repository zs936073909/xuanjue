// 打开已保存会话：若已登录则直接退出(0)；否则切换到扫码登录并截二维码
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const USER_DATA = path.join(__dirname, '.profile');
const OUT = path.join(__dirname, '..', '..', 'releases');

(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA, {
    executablePath: CHROME, headless: true, viewport: { width: 1280, height: 900 },
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  await page.goto('https://creator.xiaohongshu.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);

  const info = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button, [role=button], .tab, a')).map(b => (b.innerText || '').trim()).filter(t => t && t.length < 20);
    const txt = document.body ? document.body.innerText.slice(0, 300) : '';
    return { url: location.href, btns: [...new Set(btns)].slice(0, 30), txt };
  }).catch(e => ({ err: e.message }));
  console.log('INFO', JSON.stringify(info, null, 1));

  // 已登录特征：出现工作台/数据/创作 而非登录表单
  const isLogin = /短信登录|验证码|扫码登录|登录即同意/.test(info.txt);
  if (!isLogin) {
    await page.screenshot({ path: path.join(OUT, 'xhs-home.png') });
    console.log('ALREADY_LOGGED_IN');
    process.exit(0);
  }

  // 点击「扫码登录」切换二维码
  const clicked = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('button, [role=button], .tab, div, span'));
    const target = els.find(e => e.innerText && e.innerText.trim() === '扫码登录');
    if (target) { target.click(); return true; }
    return false;
  }).catch(() => false);
  console.log('CLICK_QR', clicked);
  await page.waitForTimeout(2500);

  // 截取整页 + 尝试定位二维码图片单独截图
  await page.screenshot({ path: path.join(OUT, 'xhs-login.png') });
  const qrInfo = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('img')).map((i, idx) => ({
      idx, w: i.naturalWidth, h: i.naturalHeight,
      src: i.src && i.src.startsWith('data') ? i.src.slice(0, 60) : (i.src || '').slice(0, 80)
    })).filter(x => x.w > 80 && x.h > 80);
    return qrInfo;
  });
  const shot = path.join(OUT, 'xhs-login.png');
  console.log(JSON.stringify({ shot, qrInfo }, null, 1));
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
