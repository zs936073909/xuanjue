// 45_publish_final.js — 发布参赛笔记：草稿箱 → 编辑最新草稿 → 确认内容 → 滚动到底 → 点「发布」
const { chromium } = require('playwright-core');
const path = require('path');

const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const USER_DATA = path.join(__dirname, '.profile');
const OUT = path.join(__dirname, '..', '..', 'releases');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LOG = path.join(__dirname, 'publish-final.log');
const log = (...a) => { const s = `[${new Date().toISOString()}] ${a.join(' ')}`; console.log(s); require('fs').appendFileSync(LOG, s + '\n'); };

(async () => {
  require('fs').writeFileSync(LOG, '');
  const ctx = await chromium.launchPersistentContext(USER_DATA, {
    executablePath: CHROME, headless: true, viewport: { width: 1440, height: 1100 },
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  page.on('pageerror', e => log('PAGEERR', e.message));

  await page.goto('https://creator.xiaohongshu.com/publish/publish', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  if (page.url().includes('/login')) { log('NEED_LOGIN'); process.exit(3); }

  // 1. 打开草稿箱
  const boxPos = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('div,span,button,a'));
    const hit = els.find(e => e.innerText && /^草稿箱\(\d+\)$/.test(e.innerText.trim()) && e.offsetWidth > 0 && e.offsetHeight > 0);
    if (!hit) return null;
    const r = hit.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  });
  log('DRAFT_BOX_POS', JSON.stringify(boxPos));
  if (boxPos) { await page.mouse.click(boxPos.x, boxPos.y); await sleep(4000); }
  await page.screenshot({ path: path.join(OUT, 'xhs-final-box.png'), fullPage: false });

  // 2. 点「图文笔记(n)」tab（弹层默认可能在视频 tab，需切换）
  const tabPos = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('div,span,button,a'));
    const hit = els.find(e => e.innerText && /^图文笔记\(\d+\)$/.test(e.innerText.trim()) && e.offsetWidth > 0 && e.offsetHeight > 0);
    if (!hit) return null;
    const r = hit.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  });
  log('IMAGE_TAB_POS', JSON.stringify(tabPos));
  if (tabPos) { await page.mouse.click(tabPos.x, tabPos.y); await sleep(3500); }
  await page.screenshot({ path: path.join(OUT, 'xhs-final-tab.png'), fullPage: false });

  // 3. 找到最新草稿（标题含「大六壬决策台」、保存时间最新）的「编辑」按钮
  const editPos = await page.evaluate(() => {
    // 找所有 draft-item 容器，选包含最新时间且标题匹配的
    const items = Array.from(document.querySelectorAll('[class*="draft-item"],[class*="draft_info"],[class*="draft-info"]'));
    let best = null, bestTime = '';
    for (const it of items) {
      const txt = (it.innerText || '');
      if (!txt.includes('大六壬决策台')) continue;
      const m = txt.match(/保存于([\d\-: ]+)/);
      if (!m) continue;
      if (m[1] > bestTime) { bestTime = m[1]; best = it; }
    }
    if (!best) return 'no-draft';
    // 在容器内找「编辑」按钮
    const btns = Array.from(best.querySelectorAll('*'));
    const edit = btns.find(b => (b.innerText || '').trim() === '编辑' && b.offsetWidth > 0 && b.offsetHeight > 0);
    if (!edit) return 'no-edit';
    const r = edit.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), time: bestTime };
  });
  log('EDIT_POS', JSON.stringify(editPos));
  if (editPos && editPos.x) {
    await page.mouse.click(editPos.x, editPos.y);
    log('EDIT_CLICKED');
    await sleep(6000);
  } else {
    // 兜底：直接点最新草稿文本
    const fallback = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('div,span'));
      const hits = els.filter(e => {
        const t = (e.innerText || '').trim();
        return t.startsWith('大六壬决策台') && t.length < 60 && e.offsetWidth > 0 && e.offsetHeight > 0;
      });
      if (!hits.length) return null;
      const r = hits[0].getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    });
    log('FALLBACK', JSON.stringify(fallback));
    if (fallback) { await page.mouse.click(fallback.x, fallback.y); await sleep(6000); }
  }
  log('URL_AFTER_EDIT', page.url());
  await page.screenshot({ path: path.join(OUT, 'xhs-final-editor.png'), fullPage: false });

  // 4. 确认编辑器内容
  const check = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      hasTitle: t.includes('大六壬决策台'),
      hasVibe: t.includes('vibecoding'),
      hasBody: t.includes('开源轮子'),
      hasImg: t.includes('图片编辑'),
      sample: t.slice(0, 200).replace(/\n+/g, '|')
    };
  }).catch(() => ({}));
  log('EDITOR_CHECK', JSON.stringify(check));

  // 5. 滚动到底，点「发布」(756,1056)；若按钮位置有偏移则尝试多组坐标
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(1500);
  const clickPoints = [[756, 1056], [756, 1050], [720, 1048], [790, 1044]];
  let published = false;
  for (const [x, y] of clickPoints) {
    // 点发布前先确认当前点是否有红色发布按钮（截图验证略，直接点）
    await page.mouse.click(x, y);
    await sleep(2500);
    const st = await page.evaluate(() => document.body.innerText);
    // 发布成功通常会有 toast 或页面跳转
    if (st.includes('发布成功') || st.includes('已发布') || /\/note\//.test(location.href) || st.includes('审核')) {
      published = true;
      log('PUBLISHED_AT', `${x},${y}`);
      break;
    }
    log('TRY', `${x},${y}`, st.includes('发布成功'), location.href);
  }

  // 6. 处理确认弹窗（若发布按钮点出弹窗）
  if (!published) {
    for (let i = 0; i < 3; i++) {
      const hit = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('button,div,span'));
        const cand = els.find(e => {
          const t = (e.innerText || '').trim();
          return (t === '确定' || t === '确认发布' || t === '发布' || t === '同意') && e.offsetWidth > 0 && e.offsetHeight > 0 && e.offsetWidth < 200;
        });
        if (cand) { cand.click(); return cand.innerText.trim(); }
        return null;
      }).catch(() => null);
      log('DIALOG', i, hit);
      if (!hit) break;
      await sleep(3000);
    }
    await sleep(4000);
  }

  const after = await page.evaluate(() => ({
    url: location.href,
    txt: document.body.innerText.slice(0, 400).replace(/\n+/g, ' | ')
  })).catch(e => ({ err: e.message }));
  log('AFTER', JSON.stringify(after));
  await page.screenshot({ path: path.join(OUT, 'xhs-final-result.png'), fullPage: false });

  await ctx.close();
  log('DONE');
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });