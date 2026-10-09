// 诊断「我已阅读并同意」与权限控件的真实 DOM 结构
const { chromium } = require('playwright-core');
const path = require('path');

const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const USER_DATA = path.join(__dirname, '.profile');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA, {
    executablePath: CHROME, headless: true, viewport: { width: 1440, height: 1200 },
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  await page.goto('https://creator.xiaohongshu.com/new/red-app', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('button,div,span,a'));
    const hit = els.find(e => e.innerText && /上传小工具/.test(e.innerText) && e.innerText.length < 20 && e.offsetWidth > 0 && e.offsetHeight > 0);
    if (hit) hit.click();
  });
  await sleep(4000);

  // 找到「我已阅读并同意」的祖先链 HTML（截取关键结构）
  const dom = await page.evaluate(() => {
    const findText = (txt) => {
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (w.nextNode()) {
        if (w.currentNode.textContent.trim() === txt) return w.currentNode;
      }
      return null;
    };
    const node = findText('我已阅读并同意') || findText('我已阅读并同意') || (() => {
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (w.nextNode()) { if (/我已阅读并同意/.test(w.currentNode.textContent)) return w.currentNode; }
      return null;
    })();
    if (!node) return { found: false };
    let el = node.parentElement;
    // 向上找容器并收集 HTML
    let chain = [];
    for (let i = 0; i < 6 && el; i++) {
      const html = el.outerHTML;
      chain.push({ tag: el.tagName, cls: (el.className || '').toString().slice(0, 60), html: html.length < 600 ? html : html.slice(0, 600) });
      el = el.parentElement;
    }
    // 权限区域：找「不需要权限」
    const permNode = (() => {
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (w.nextNode()) { if (w.currentNode.textContent.trim() === '不需要权限') return w.currentNode; }
      return null;
    })();
    let permChain = [];
    if (permNode) {
      let el2 = permNode.parentElement;
      for (let i = 0; i < 4 && el2; i++) {
        permChain.push({ tag: el2.tagName, cls: (el2.className || '').toString().slice(0, 60), html: el2.outerHTML.slice(0, 400) });
        el2 = el2.parentElement;
      }
    }
    return { found: !!node, chain, permChain };
  }).catch(e => ({ err: e.message }));
  console.log(JSON.stringify(dom, null, 1));
  await ctx.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
