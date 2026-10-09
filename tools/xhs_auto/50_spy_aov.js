// 竞品实地调研：命语 aov.cc —— 排盘 + LLM 提示词（与我们"本地优先 + AI-ish"路线最接近）
const { chromium } = require('/workspace/xuanjue/node_modules/playwright-core');
const OUT = '/workspace/xuanjue/tools/xhs_auto';
const EXE = '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';

(async () => {
  const browser = await chromium.launch({
    executablePath: EXE,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'],
  });
  const ctx = await browser.newContext({
    viewport: { width: 430, height: 932 },
    userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();
  const urls = [];
  page.on('response', (r) => {
    try {
      const u = r.url();
      if (/api|graphql|xhr|\.json/.test(u) && !u.includes('xhscdn') && !u.includes('fe-static')) urls.push(r.status() + ' ' + u.slice(0, 160));
    } catch (e) {}
  });

  const url = process.argv[2] || 'https://aov.cc';
  console.log('URL', url);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch((e) => console.log('GOTO_ERR', e.message.split('\n')[0]));
  await page.waitForTimeout(3000);

  const info = await page.evaluate(() => {
    const t = document.body.innerText || '';
    const btn = Array.from(document.querySelectorAll('button,a,[role=button]')).map((b) => (b.innerText || '').trim()).filter(Boolean);
    return {
      title: document.title,
      len: t.length,
      text: t.slice(0, 2200),
      buttons: Array.from(new Set(btn)).slice(0, 60),
      h1: Array.from(document.querySelectorAll('h1,h2,h3')).map((h) => (h.innerText || '').trim()).slice(0, 20),
      scriptTags: document.scripts.length,
      externalScripts: Array.from(document.querySelectorAll('script[src]')).map((s) => s.src).slice(0, 10),
    };
  });
  console.log('INFO', JSON.stringify(info, null, 1));
  console.log('XHR', JSON.stringify(urls.slice(0, 25), null, 1));
  await page.screenshot({ path: OUT + '/xhs-spy-aov.png', fullPage: false });
  await ctx.close();
})().catch((e) => { console.log('FATAL', e.message); process.exit(1); });
