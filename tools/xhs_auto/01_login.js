// 小红书创作服务登录：打开登录页，截图二维码供用户扫码，轮询登录状态
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const USER_DATA = path.join(__dirname, '.profile');
const OUT = path.join(__dirname, '..', '..', 'releases');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA, {
    executablePath: CHROME,
    headless: true,
    viewport: { width: 1280, height: 900 },
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  await page.goto('https://creator.xiaohongshu.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);

  // 截取当前页面（二维码通常出现在登录弹窗）
  const shot = path.join(OUT, 'xhs-login.png');
  await page.screenshot({ path: shot });
  const url = page.url();
  const title = await page.title().catch(() => '');
  // 尝试找二维码图片元素
  const qr = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('img'));
    const cand = imgs.filter(i => (i.src && (i.src.includes('qr') || i.src.includes('code') || i.width > 100))).map(i => i.src).slice(0, 5);
    return { imgs: imgs.length, cand };
  }).catch(e => ({ err: e.message }));

  console.log(JSON.stringify({ url, title, shot, qr }, null, 2));
  // 保持浏览器打开等待扫码 —— 由外部脚本轮询
  global.__ctx = ctx; global.__page = page;
  const timeout = parseInt(process.argv[2] || '300', 10); // 秒
  // 每 3 秒检查是否已登录（出现创作中心特征）
  const check = async () => {
    const u = page.url();
    const txt = await page.evaluate(() => document.body ? document.body.innerText.slice(0, 500) : '').catch(() => '');
    const loggedIn = /创作服务|作品管理|内容管理|数据/.test(txt) && !/扫码登录|验证码登录/.test(txt);
    console.log(JSON.stringify({ state: loggedIn ? 'LOGGED_IN' : 'WAITING', url: u, head: txt.slice(0, 80) }));
    if (loggedIn) { await page.screenshot({ path: path.join(OUT, 'xhs-home.png') }); process.exit(0); }
    if (Date.now() - t0 > timeout * 1000) { console.log('TIMEOUT'); process.exit(2); }
    setTimeout(check, 3000);
  };
  const t0 = Date.now();
  check();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
