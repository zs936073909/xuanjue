// 点击登录卡片右上角二维码图标，切换到扫码模式并截图二维码
const { chromium } = require('playwright-core');
const path = require('path');

const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const USER_DATA = path.join(__dirname, '.profile');
const OUT = path.join(__dirname, '..', '..', 'releases');

(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA, {
    executablePath: CHROME, headless: true, viewport: { width: 1280, height: 900 },
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  await page.goto('https://creator.xiaohongshu.com/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3500);

  // 定位包含「短信登录」文本的卡片容器，取右上角坐标点击
  const box = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let target = null;
    while (walker.nextNode()) {
      if (walker.currentNode.textContent.trim() === '短信登录') { target = walker.currentNode; break; }
    }
    if (!target) return null;
    let el = target.parentElement;
    // 向上找最近的卡片容器（含 login/card 特征）
    for (let i = 0; i < 6 && el; i++) {
      const cls = el.className || '';
      if (/login|card|form|modal|container/i.test(String(cls)) && el.getBoundingClientRect().width > 200) break;
      el = el.parentElement;
    }
    const r = el ? el.getBoundingClientRect() : null;
    return r ? { x: r.right - 28, y: r.top + 28, w: r.width, h: r.height } : null;
  }).catch(e => ({ err: e.message }));
  console.log('CARD_BOX', JSON.stringify(box));

  if (box && !box.err) {
    await page.mouse.click(box.x, box.y);
    await page.waitForTimeout(3000);
  }
  await page.screenshot({ path: path.join(OUT, 'xhs-qr.png') });
  const info = await page.evaluate(() => {
    const txt = document.body ? document.body.innerText.slice(0, 300) : '';
    const imgs = Array.from(document.querySelectorAll('img')).map(i => ({ w: i.naturalWidth, h: i.naturalHeight })).filter(x => x.w > 100 && x.h > 100);
    return { txt, imgs };
  }).catch(e => ({ err: e.message }));
  console.log('AFTER', JSON.stringify(info, null, 1));
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
