// 智能轮询：保持二维码最新（过期自动刷新）+ 检测登录成功退出
const { chromium } = require('playwright-core');
const path = require('path');

const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const USER_DATA = path.join(__dirname, '.profile');
const OUT = path.join(__dirname, '..', '..', 'releases');
const TIMEOUT = parseInt(process.argv[2] || '1800', 10) * 1000;
const REFRESH_MS = 55 * 1000; // 每 55 秒强制刷新一次二维码（小红书扫码码约 1 分钟有效）

(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA, {
    executablePath: CHROME, headless: true, viewport: { width: 1280, height: 900 },
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  if (!page.url().includes('creator.xiaohongshu.com')) {
    await page.goto('https://creator.xiaohongshu.com/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  }
  await page.waitForTimeout(3500);

  // 确保处于扫码模式（若检测到「短信登录」文案，点卡片右上角切换）
  const box = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let target = null;
    while (walker.nextNode()) {
      if (walker.currentNode.textContent.trim() === '短信登录') { target = walker.currentNode; break; }
    }
    if (!target) return null;
    let el = target.parentElement;
    for (let i = 0; i < 6 && el; i++) {
      const cls = el.className || '';
      if (/login|card|form|modal|container/i.test(String(cls)) && el.getBoundingClientRect().width > 200) break;
      el = el.parentElement;
    }
    const r = el ? el.getBoundingClientRect() : null;
    return r ? { x: r.right - 28, y: r.top + 28 } : null;
  }).catch(() => null);
  if (box) { await page.mouse.click(box.x, box.y); await page.waitForTimeout(2500); }

  const snapQr = async () => {
    await page.screenshot({ path: path.join(OUT, 'xhs-qr.png') });
    console.log('QR_REFRESHED ' + new Date().toLocaleTimeString());
  };
  await snapQr();

  const t0 = Date.now();
  let lastRefresh = Date.now();
  const poll = async () => {
    const url = page.url();
    const txt = await page.evaluate(() => document.body ? document.body.innerText.slice(0, 400) : '').catch(() => '');
    const onLoginPage = url.includes('/login') || /短信登录|扫码登录|APP扫一扫|二维码/.test(txt);
    if (!onLoginPage) {
      await page.screenshot({ path: path.join(OUT, 'xhs-home.png'), fullPage: false });
      console.log('LOGGED_IN url=' + url);
      // 等待 cookie 落盘再正常关闭浏览器，确保登录态持久化
      await page.waitForTimeout(2000);
      await ctx.close();
      process.exit(0);
    }
    // 二维码接近过期：整页刷新获取新码并截图（保持文件最新）
    if (Date.now() - lastRefresh > REFRESH_MS) {
      lastRefresh = Date.now();
      try {
        await page.goto('https://creator.xiaohongshu.com/login', { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForTimeout(3500);
        const b2 = await page.evaluate(() => {
          const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          let t = null;
          while (w.nextNode()) { if (w.currentNode.textContent.trim() === '短信登录') { t = w.currentNode; break; } }
          if (!t) return null;
          let el = t.parentElement;
          for (let i = 0; i < 6 && el; i++) {
            const cls = el.className || '';
            if (/login|card|form|modal|container/i.test(String(cls)) && el.getBoundingClientRect().width > 200) break;
            el = el.parentElement;
          }
          const r = el ? el.getBoundingClientRect() : null;
          return r ? { x: r.right - 28, y: r.top + 28 } : null;
        }).catch(() => null);
        if (b2) { await page.mouse.click(b2.x, b2.y); await page.waitForTimeout(2500); }
      } catch (e) { console.log('REFRESH_ERR ' + e.message); }
      await snapQr();
    }
    if (Date.now() - t0 > TIMEOUT) { console.log('TIMEOUT'); process.exit(3); }
    setTimeout(poll, 3500);
  };
  poll();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
