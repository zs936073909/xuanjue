// 问事向导全流程截图：类型→标题→术数→结果页
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const BASE = 'http://localhost:8899/';
const OUT = path.join(__dirname, '..', '..', 'releases', 'shots');
fs.mkdirSync(OUT, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const ctx = await chromium.launch({ executablePath: CHROME, headless: true,
    viewport: { width: 420, height: 860 }, deviceScaleFactor: 2,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGEERR', e.message));
  const shot = (n) => page.screenshot({ path: path.join(OUT, n) });

  await page.goto(BASE, { waitUntil: 'load', timeout: 60000 });
  await sleep(2500);
  await page.evaluate(() => {
    const cb = document.querySelector('#agreeCheck');
    if (cb) { cb.checked = true; cb.dispatchEvent(new Event('change')); }
    const b = document.querySelector('#btnEnter');
    if (b && !b.disabled) b.click();
  });
  await sleep(1600);

  // 进入问事
  await page.evaluate(() => { const t = document.querySelector('.tab[data-tab="ask"]'); if (t) t.click(); });
  await sleep(1200);

  // step1: 选「感情关系」
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('[data-type]')].find(e => e.dataset.type === '感情关系');
    if (el) el.click();
  });
  await sleep(400);
  await page.evaluate(() => {
    const next = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === '下一步');
    if (next) next.click();
  });
  await sleep(1200);
  await shot('06-ask-step2.png');

  // step2: 填标题
  await page.evaluate(() => {
    const inp = document.querySelector('#fTitle');
    if (inp) { inp.value = '与合作伙伴的项目进展如何'; inp.dispatchEvent(new Event('input', { bubbles: true })); }
    const next = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === '下一步');
    if (next) next.click();
  });
  await sleep(1200);

  // step3: 确认术数（默认已含大六壬），用「数字起卦」填 3,8
  await page.evaluate(() => {
    const m = [...document.querySelectorAll('[data-qike-method]')].find(e => e.dataset.qikeMethod === 'number');
    if (m) m.click();
  });
  await sleep(400);
  await page.evaluate(() => {
    const f = document.querySelector('#fNum');
    if (f) { f.value = '3,8'; f.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  await sleep(300);
  await shot('07-ask-step3.png');
  await page.evaluate(() => {
    const next = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === '生成结果');
    if (next) { next.scrollIntoView({ block: 'center' }); next.click(); }
  });
  await sleep(2000);

  // 结果页
  await shot('08-ask-result.png');
  const txt = await page.evaluate(() => document.body.innerText.slice(0, 150)).catch(() => '');
  console.log('RESULT=' + JSON.stringify(txt.slice(0, 100)));

  // 切白话/专业看结果盘面
  await page.evaluate(() => {
    const b = document.querySelector('.mode-toggle button[data-mode="plain"]');
    if (b) b.click();
  });
  await sleep(900);
  await shot('09-ask-result-plain.png');
  await page.evaluate(() => {
    const b = document.querySelector('.mode-toggle button[data-mode="pro"]');
    if (b) b.click();
  });
  await sleep(900);
  await shot('10-ask-result-pro.png');

  console.log('DONE');
  await ctx.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
