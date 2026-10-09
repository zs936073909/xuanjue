// 生成小红书参赛笔记封面拼图（3:4 竖版 1080x1440）—— 固定布局 v2
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const SHOTS = path.join(__dirname, '..', '..', 'releases', 'shots');
const OUT = path.join(__dirname, '..', '..', 'releases');
const S = 'file://' + SHOTS;

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:1080px; height:1440px; background:linear-gradient(165deg,#15100b 0%,#241b12 50%,#33261a 100%); font-family:'PingFang SC','Microsoft YaHei',sans-serif; overflow:hidden; }
  .wrap { width:1080px; height:1440px; padding:50px 54px 44px; display:flex; flex-direction:column; }
  .head { display:flex; align-items:baseline; justify-content:space-between; }
  .logo { font-size:46px; font-weight:800; color:#e8d5a3; letter-spacing:8px; }
  .logo em { font-style:normal; color:#d4af37; }
  .tag { font-size:24px; color:#c9b98a; letter-spacing:3px; border:1px solid rgba(212,175,55,.5); border-radius:999px; padding:6px 18px; }
  .title { font-size:52px; font-weight:800; color:#f5efe0; margin:16px 0 4px; line-height:1.3; }
  .sub { font-size:24px; color:#c9b98a; letter-spacing:1px; margin-bottom:24px; }
  .shots { display:flex; gap:18px; flex:1; min-height:0; }
  .col { flex:1; display:flex; flex-direction:column; gap:18px; min-width:0; }
  .maincol { flex:1.2; }
  .card { border-radius:20px; overflow:hidden; background:#f5f0e8; box-shadow:0 16px 44px rgba(0,0,0,.5); position:relative; flex:1; min-height:0; display:flex; flex-direction:column; }
  .imgbox { flex:1; min-height:0; overflow:hidden; display:flex; align-items:center; justify-content:center; background:#efe9dd; }
  .card img { width:100%; height:100%; object-fit:contain; display:block; }
  .cap { background:#f5f0e8; color:#6b5d45; font-size:22px; text-align:center; padding:10px 0 11px; font-weight:600; letter-spacing:2px; flex:none; }
  .foot { display:flex; align-items:center; justify-content:space-between; margin-top:26px; }
  .foot .l { font-size:28px; color:#d4af37; font-weight:700; letter-spacing:1px; }
  .foot .r { font-size:22px; color:#9a8a68; letter-spacing:1px; }
</style></head><body><div class="wrap">
  <div class="head"><div class="logo">玄<em>决</em></div><div class="tag">大六壬决策台</div></div>
  <div class="title">离线 · 隐私 · 无 Key 也可用<br>的大六壬决策台</div>
  <div class="sub">实时时课 · 三层解读 · 多法门对比 · 纯前端离线</div>
  <div class="shots">
    <div class="maincol"><div class="card"><div class="imgbox"><img src="${S}/08-ask-result.png"></div><div class="cap">问事 · 结果 · 摘要</div></div></div>
    <div class="col">
      <div class="card"><div class="imgbox"><img src="${S}/01-home.png"></div><div class="cap">首页 · 实时时课</div></div>
      <div class="card"><div class="imgbox"><img src="${S}/04-board-pro.png"></div><div class="cap">专业盘面 · 四课</div></div>
    </div>
  </div>
  <div class="foot"><div class="l">#小红书vibecoding大赛 #vibetool</div><div class="r">本地优先 · 隐私优先</div></div>
</div></body></html>`;

(async () => {
  fs.writeFileSync(path.join(__dirname, 'cover.html'), html);
  const ctx = await chromium.launch({ executablePath: CHROME, headless: true,
    viewport: { width: 1080, height: 1440 }, deviceScaleFactor: 1,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
  const page = await ctx.newPage();
  await page.goto('file://' + path.join(__dirname, 'cover.html'), { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(1500);
  const broken = await page.evaluate(() => Array.from(document.images).map(i => ({ src: i.src.split('/').pop(), ok: i.complete && i.naturalWidth > 0 })));
  console.log('IMGS', JSON.stringify(broken));
  await page.screenshot({ path: path.join(OUT, 'xhs-cover.png') });
  console.log('COVER_DONE');
  await ctx.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
