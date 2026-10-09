// 为参赛笔记生成真实界面截图：首页/盘面三层/问事起课
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const BASE = 'http://localhost:8899/';
const OUT = path.join(__dirname, '..', '..', 'releases', 'shots');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const ctx = await chromium.launch({ executablePath: CHROME, headless: true,
    viewport: { width: 420, height: 860 }, deviceScaleFactor: 2,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGEERR', e.message));

  const shot = (name) => page.screenshot({ path: path.join(OUT, name) });

  await page.goto(BASE, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(2500);
  // 同意声明进入
  await page.evaluate(() => {
    const cb = document.querySelector('#agreeCheck');
    if (cb) { cb.checked = true; cb.dispatchEvent(new Event('change')); }
    const b = document.querySelector('#btnEnter');
    if (b && !b.disabled) b.click();
  });
  await page.waitForTimeout(1800);
  await shot('01-home.png');

  // 查看完整盘面（默认摘要）
  await page.evaluate(() => {
    const b = document.querySelector('#btnViewBoard');
    if (b) b.click();
  });
  await page.waitForTimeout(1500);
  await shot('02-board-summary.png');

  // 白话解读
  await page.evaluate(() => {
    const b = document.querySelector('.mode-toggle button[data-mode="plain"]');
    if (b) b.click();
  });
  await page.waitForTimeout(900);
  await shot('03-board-plain.png');

  // 专业盘面
  await page.evaluate(() => {
    const b = document.querySelector('.mode-toggle button[data-mode="pro"]');
    if (b) b.click();
  });
  await page.waitForTimeout(900);
  await shot('04-board-pro.png');

  // 回到首页 -> 问事起课（选速喜/朱雀，随机数一键）
  await page.evaluate(() => {
    const t = document.querySelector('.tab[data-tab="ask"]');
    if (t) t.click();
  });
  await page.waitForTimeout(1200);
  const q1 = await page.evaluate(() => document.body.innerText.slice(0, 120));
  await shot('05-ask-step.png');

  // 尝试下一步（起课按钮）
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const next = btns.find(b => /下一步|起课|随机/.test(b.innerText));
    if (next) next.click();
  });
  await page.waitForTimeout(1200);
  await shot('06-ask-ke.png');

  console.log('DONE q1=' + JSON.stringify(q1));
  await ctx.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
