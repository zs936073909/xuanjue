// 32_debug4.js — 穿透 shadow DOM / iframe 查找「暂存离开」「发布」按钮
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
  }, '测试正文内容，用于定位底部按钮。');
  await sleep(1000);

  // 递归穿透 shadow DOM 查找「暂存」文本
  const shadowHit = await page.evaluate(() => {
    const results = [];
    function walk(root, depth) {
      if (depth > 8 || results.length > 5) return;
      let els;
      try { els = root.querySelectorAll ? Array.from(root.querySelectorAll('*')) : []; } catch (e) { return; }
      for (const el of els) {
        const t = (el.innerText || '').trim();
        if (t && (t === '暂存离开' || t === '发布' || (t.includes('暂存') && t.length < 10))) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) {
            results.push({ depth, tag: el.tagName, t, cls: (el.className || '').toString().slice(0, 60), top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height), inShadow: !!el.getRootNode().host });
            return; // 找到就停
          }
        }
        if (el.shadowRoot) walk(el.shadowRoot, depth + 1);
      }
    }
    walk(document, 0);
    return results;
  });
  console.log('SHADOW_HIT', JSON.stringify(shadowHit, null, 1));

  // 检查 iframe 内容
  const iframeInfo = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('iframe').forEach((f, i) => {
      let doc = null;
      try { doc = f.contentDocument; } catch (e) {}
      if (doc && doc.body) {
        const t = (doc.body.innerText || '').slice(0, 200);
        out.push({ i, hasText: t.includes('暂存') || t.includes('发布'), sample: t.replace(/\n+/g, '|').slice(0, 150) });
      } else {
        out.push({ i, noAccess: true });
      }
    });
    return out;
  });
  console.log('IFRAME_INFO', JSON.stringify(iframeInfo, null, 1));

  // 页面 body 的 lastChild 结构（底部操作栏可能的挂载点）
  const lastEl = await page.evaluate(() => {
    const all = document.querySelectorAll('div');
    let max = null, maxTop = -1;
    all.forEach(d => {
      const r = d.getBoundingClientRect();
      if (r.width > 0 && r.top > maxTop && r.top < 5000) { maxTop = r.top; max = d; }
    });
    if (!max) return 'none';
    return { cls: max.className, tag: max.tagName, txt: (max.innerText || '').slice(0, 100) };
  });
  console.log('LAST_DIV', JSON.stringify(lastEl, null, 1));

  await ctx.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
