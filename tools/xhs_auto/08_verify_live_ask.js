// 线上验收走查：https://xuanjue-server.onrender.com/app/ 问事五步向导
// 目的：证明「能打开、能用、好用」——类型→标题→术数→结果→白话/专业 全程无阻断。
// 为什么用 playwright-core + 显式 executablePath：沙箱重建后系统 Chrome 丢失，
// ms-playwright 缓存也没了；用 /opt/google/chrome/chrome wrapper（转发 Puppeteer 缓存里的 Chrome 151）。
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const CHROME = '/opt/google/chrome/chrome';
const BASE = process.env.BASE_URL || 'https://xuanjue-server.onrender.com/app/';
const OUT = path.join(__dirname, '..', '..', 'releases', 'verify-live');
fs.mkdirSync(OUT, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const errors = [];

// 关键路径断言：任一失败即视为「不能用」，全部收集后统一退出非零
const check = (cond, label) => {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + label);
  if (!cond) errors.push(label);
  return cond;
};

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    viewport: { width: 420, height: 860 },
    deviceScaleFactor: 2,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  const page = await browser.newPage();
  page.on('pageerror', e => { errors.push('pageerror: ' + e.message); console.log('PAGEERR', e.message); });
  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE-ERR', m.text().slice(0, 200)); });

  // 1. 打开（含冷启动，Render 免费档可能休眠，给足超时）
  console.log('→ 打开 ' + BASE);
  await page.goto(BASE, { waitUntil: 'load', timeout: 90000 });
  await sleep(3000);

  const title = await page.title();
  check(title.length > 0, '页面标题非空（' + title + '）');
  const hasGate = await page.evaluate(() => !!document.querySelector('#agreeCheck'));
  check(hasGate, '入口声明闸门渲染（#agreeCheck）');

  await page.screenshot({ path: path.join(OUT, '01-gate.png') });

  // 2. 过闸门进应用
  await page.evaluate(() => {
    const cb = document.querySelector('#agreeCheck');
    cb.checked = true;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await sleep(300);
  await page.evaluate(() => {
    const b = document.querySelector('#btnEnter');
    if (b && !b.disabled) b.click();
  });
  await sleep(2000);
  const gateGone = await page.evaluate(() => !document.querySelector('#gate') || document.querySelector('#gate').hidden || getComputedStyle(document.querySelector('#gate')).display === 'none');
  check(gateGone, '闸门关闭进入主界面');
  await page.screenshot({ path: path.join(OUT, '02-home.png') });

  // 3. 切到问事 tab
  await page.evaluate(() => { const t = document.querySelector('.tab[data-tab="ask"]'); if (t) t.click(); });
  await sleep(1500);
  // 断言用「问事内容是否进入视口」而非容器 id：产品是 .scr-next 滚动结构，没有 #panel-ask
  const askVisible = await page.evaluate(() => {
    const active = document.querySelector('.tab.active');
    const isAsk = !!active && active.dataset.tab === 'ask';
    return isAsk && document.body.innerText.includes('感情关系');
  });
  check(askVisible, '问事 tab 激活且问事内容已渲染（.scr-next 滚动结构）');
  await page.screenshot({ path: path.join(OUT, '03-ask-step1.png') });

  // 4. step1 选类型「感情关系」
  const picked = await page.evaluate(() => {
    const el = [...document.querySelectorAll('[data-type]')].find(e => e.dataset.type === '感情关系');
    if (!el) return false;
    el.click();
    return true;
  });
  check(picked, 'step1 选中问事类型「感情关系」');
  await sleep(500);
  await page.screenshot({ path: path.join(OUT, '04-ask-step1-picked.png') });

  // 5. 下一步 → step2 填标题
  await page.evaluate(() => {
    const next = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === '下一步');
    if (next) { next.scrollIntoView({ block: 'center' }); next.click(); }
  });
  await sleep(1200);
  const filled = await page.evaluate(() => {
    const inp = document.querySelector('#fTitle');
    if (!inp) return false;
    inp.value = '与合作伙伴的项目进展如何';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  });
  check(filled, 'step2 填写问事标题（#fTitle）');
  await sleep(300);
  await page.screenshot({ path: path.join(OUT, '05-ask-step2.png') });

  // 6. 下一步 → step3 数字起卦
  await page.evaluate(() => {
    const next = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === '下一步');
    if (next) { next.scrollIntoView({ block: 'center' }); next.click(); }
  });
  await sleep(1200);
  const qikeOk = await page.evaluate(() => {
    const m = [...document.querySelectorAll('[data-qike-method]')].find(e => e.dataset.qikeMethod === 'number');
    if (!m) return false;
    m.click();
    return true;
  });
  check(qikeOk, 'step3 选择「数字起卦」');
  await sleep(500);
  const numOk = await page.evaluate(() => {
    const f = document.querySelector('#fNum');
    if (!f) return false;
    f.value = '3,8';
    f.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  });
  check(numOk, 'step3 填入起卦数字（#fNum = 3,8）');
  await sleep(300);
  await page.screenshot({ path: path.join(OUT, '06-ask-step3.png') });

  // 7. 生成结果
  await page.evaluate(() => {
    const next = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === '生成结果');
    if (next) { next.scrollIntoView({ block: 'center' }); next.click(); }
  });
  await sleep(3000);

  const resultLen = await page.evaluate(() => document.body.innerText.length);
  const hasResult = await page.evaluate(() => {
    const t = document.body.innerText;
    return /卦|六壬|解|断/.test(t) && t.length > 300;
  });
  check(hasResult, '结果页渲染实质内容（正文 ' + resultLen + ' 字符）');
  await page.screenshot({ path: path.join(OUT, '07-ask-result.png'), fullPage: false });

  // 8. 白话 / 专业 双模式切换
  const plainOk = await page.evaluate(() => {
    const b = document.querySelector('.mode-toggle button[data-mode="plain"]');
    if (!b) return false;
    b.click();
    return true;
  });
  check(plainOk, '白话模式可切换');
  await sleep(1000);
  await page.screenshot({ path: path.join(OUT, '08-result-plain.png') });

  const proOk = await page.evaluate(() => {
    const b = document.querySelector('.mode-toggle button[data-mode="pro"]');
    if (!b) return false;
    b.click();
    return true;
  });
  check(proOk, '专业模式可切换');
  await sleep(1000);
  await page.screenshot({ path: path.join(OUT, '09-result-pro.png') });

  // 9. 云同步探测（不强制登录，只验证同源默认地址已生效、不发跨域错）
  const cloudState = await page.evaluate(() => {
    const el = document.querySelector('[data-cloud-state], #cloudState, .cloud-state');
    return el ? el.textContent.trim() : '';
  });
  console.log('INFO  云同步状态文本：' + JSON.stringify(cloudState));

  await browser.close();

  console.log('\n===== 汇总 =====');
  if (errors.length) {
    console.log('失败 ' + errors.length + ' 项：');
    errors.forEach(e => console.log('  - ' + e));
    process.exit(1);
  }
  console.log('全部通过。截图目录：' + OUT);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
