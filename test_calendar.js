// test_calendar.js — 历法层（lunar.js 适配器）回归测试
// 重点守两件事：
//   1) 农历换算不再随浏览器时区漂移（旧实现用本地时刻做 1900 历元差，海外用户会起错卦）；
//   2) 已修正的年份农历表错误不回退（1933 / 1996 / 2060 旧表各错一天）。
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { execFileSync } = require('child_process');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? ' => ' + extra : '')); }
}

function loadLunar() {
  const ctx = { console, Date, Math, Error, String, Number, parseInt, parseFloat, isNaN };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'js/vendor/lunar-javascript.min.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'js/lunar.js'), 'utf8'), ctx);
  return ctx.window.Lunar;
}

// —— 子进程模式：输出当前时区下的结果摘要，供父进程比对 ——
if (process.env.XJ_CAL_CHILD === '1') {
  const L = loadLunar();
  const out = [];
  const d = new Date();
  for (const [y, m, day] of [[1933, 7, 28], [1988, 6, 1], [1996, 7, 15], [2020, 6, 15], [2024, 2, 4], [2060, 5, 1]]) {
    d.setFullYear(y, m - 1, day); d.setHours(12, 0, 0, 0);
    const l = L.solarToLunar(d);
    out.push(`${y}-${m}-${day}=${l ? l.year + '/' + (l.isLeap ? 'L' : '') + l.month + '/' + l.day : 'null'}`);
    out.push(`${y}-${m}-${day}bazi=${L.getBaZi(d).year.gz}${L.getBaZi(d).month.gz}${L.getBaZi(d).day.gz}${L.getBaZi(d).hour.gz}`);
  }
  process.stdout.write(out.join('|'));
  process.exit(0);
}

console.log('=== 1. 已知日期农历（对照香港天文台 / 万年历）===');
const L = loadLunar();
function lunarOf(y, m, d, h) {
  const dt = new Date(y, m - 1, d, h === undefined ? 12 : h, 0, 0);
  return L.solarToLunar(dt);
}
let r = lunarOf(1996, 7, 15);
ok('1996-07-15 = 五月三十', r && r.month === 5 && r.day === 30, r && r.month + '/' + r.day);
r = lunarOf(1933, 7, 28);
ok('1933-07-28 = 六月初六', r && r.month === 6 && r.day === 6, r && r.month + '/' + r.day);
r = lunarOf(2060, 5, 1);
ok('2060-05-01 = 四月初二', r && r.month === 4 && r.day === 2, r && r.month + '/' + r.day);
r = lunarOf(2020, 6, 15);
ok('2020-06-15 = 闰四月廿四', r && r.month === 4 && r.isLeap && r.day === 24, r && (r.isLeap ? 'L' : '') + r.month + '/' + r.day);

console.log('\n=== 2. 干支与节气 ===');
function baziOf(y, m, d, h, mi) {
  return L.getBaZi(new Date(y, m - 1, d, h || 12, mi || 0, 0));
}
let bz = baziOf(1949, 10, 1);
ok('1949-10-01 日柱甲子', bz.day.gz === '甲子', bz.day.gz);
bz = baziOf(2000, 1, 1);
ok('2000-01-01 日柱戊午', bz.day.gz === '戊午', bz.day.gz);
// 立春 2024-02-04 16:27:07，前一刻仍属癸卯年、后一刻进甲辰年
bz = baziOf(2024, 2, 4, 16, 0);
ok('立春前属癸卯年', bz.year.gz === '癸卯', bz.year.gz);
bz = baziOf(2024, 2, 4, 17, 0);
ok('立春后属甲辰年', bz.year.gz === '甲辰', bz.year.gz);
const lichun = L.sTermDate(2024, 2);
ok('2024 立春时刻精确到分', lichun && lichun.getMonth() === 1 && lichun.getDate() === 4 && lichun.getHours() === 16 && lichun.getMinutes() === 27,
  lichun && lichun.toLocaleString('zh-CN'));

console.log('\n=== 3. 时区无关性（旧实现在此失败）===');
const zones = ['Asia/Shanghai', 'UTC', 'America/New_York', 'Europe/London'];
const digests = zones.map((tz) => {
  const out = execFileSync(process.execPath, [__filename], {
    env: Object.assign({}, process.env, { TZ: tz, XJ_CAL_CHILD: '1' }),
    encoding: 'utf8'
  });
  return { tz, out };
});
const base = digests[0].out;
zones.forEach((tz, i) => {
  ok('时区 ' + tz + ' 结果一致', digests[i].out === base, digests[i].out.slice(0, 120));
});

console.log('\n=== 4. 晚子时口径 ===');
bz = baziOf(2024, 1, 1, 23, 30);
ok('晚子时日柱算当天（甲子）', bz.day.gz === '甲子', bz.day.gz);
ok('晚子时时干由当日日干五鼠遁（甲子）', bz.hour.gz === '甲子', bz.hour.gz);

console.log('\n=========================');
console.log(`历法测试 通过: ${pass} 失败: ${fail}`);
process.exit(fail ? 1 : 0);
