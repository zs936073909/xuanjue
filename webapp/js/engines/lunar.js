// lunar.js — 历法层适配器（历法与节气计算由 6tail/lunar-javascript v1.7.8 提供，MIT）
// 为什么要换：旧实现是 1900 年基准的近似表，有两个实锤问题——
//   1) 农历换算用 `new Date(1900,0,31)` 本地时刻做历元差，会被历史时区（LMT / 1986-91 夏令时）
//      污染，同一公历日期在不同浏览器时区会算出不同农历（小六壬、梅花易数据此起卦 → 起错卦）。
//   2) 节气是分钟级近似，远端年份误差可达分钟乃至更久，节交前后出生者的月柱可能判错。
// 本文件保留项目原有的 Lunar API（getBaZi / solarToLunar / sTermDate / getYueJiang / getShiChen /
// currentNextJieQi 等），调用方无需改动；内部改为：以「本地钟面」构造公历 → 交给 lunar-javascript
// 计算，因此结果只取决于用户输入的时刻，不再取决于浏览器所在时区。
(function (global) {
  'use strict';

  const LJ = global.LJ;
  if (!LJ || !LJ.Solar) {
    throw new Error('lunar-javascript 未加载：请确认 js/vendor/lunar-javascript.min.js 先于 js/lunar.js 引入');
  }

  const GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
  const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  const SX = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'];
  const MONTHS = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
  const DATE = ['初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十', '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'];
  const JIEQI = ['小寒', '大寒', '立春', '雨水', '惊蛰', '春分', '清明', '谷雨', '立夏', '小满', '芒种', '夏至', '小暑', '大暑', '立秋', '处暑', '白露', '秋分', '寒露', '霜降', '立冬', '小雪', '大雪', '冬至'];

  // 以「本地钟面」构造，避免 Date → 公历时经过 UTC 往返
  function solarOf(date) {
    return LJ.Solar.fromYmdHms(
      date.getFullYear(), date.getMonth() + 1, date.getDate(),
      date.getHours(), date.getMinutes(), date.getSeconds()
    );
  }

  function gzFromIndex(i) { i = ((i % 60) + 60) % 60; return GAN[i % 10] + ZHI[i % 12]; }
  function ganzhiOf(i) {
    i = ((i % 60) + 60) % 60;
    return { gz: GAN[i % 10] + ZHI[i % 12], gan: GAN[i % 10], ganIdx: i % 10, zhi: ZHI[i % 12], zhiIdx: i % 12, index: i };
  }
  // 「庚午」→ 60 甲子序号
  function gz60(gz) {
    const g = GAN.indexOf(gz.charAt(0)), z = ZHI.indexOf(gz.charAt(1));
    if (g < 0 || z < 0) return 0;
    let i = g;
    while (i % 12 !== z) i += 10;
    return i % 60;
  }

  // 干支四柱。年柱以立春为界、月柱以节为界，均由轮子按真实节气时刻判定。
  // 晚子时（23:00-23:59）沿用项目既有口径：日柱算当天（sect=2），与旧实现一致。
  function getBaZi(date) {
    const ec = solarOf(date).getLunar().getEightChar();
    ec.setSect(2);
    const y = ec.getYear(), mo = ec.getMonth(), d = ec.getDay(), h = ec.getTime();
    const mGan = GAN.indexOf(mo.charAt(0)), mZhi = ZHI.indexOf(mo.charAt(1));
    // 时干用「日柱日干 + 五鼠遁」推，而不是直接取轮子给出的时柱：
    // 轮子在晚子时（23:00-23:59）会返回「日柱不换、时干按次日」的组合，与五鼠遁自相矛盾；
    // 本项目沿用既有口径（日柱当天 + 时干从当天日干起），两者只在 23 点这一小时有差别。
    const dIdx = gz60(d);
    const hZhi = ZHI.indexOf(h.charAt(1));
    const sGan = ((dIdx % 10) % 5 * 2 + hZhi) % 10;
    const sZhi = hZhi;
    return {
      year: ganzhiOf(gz60(y)),
      month: { gz: mo, gan: mo.charAt(0), ganIdx: mGan, zhi: mo.charAt(1), zhiIdx: mZhi, index: mGan * 12 + mZhi },
      day: ganzhiOf(dIdx),
      hour: { gz: GAN[sGan] + ZHI[sZhi], gan: GAN[sGan], ganIdx: sGan, zhi: ZHI[sZhi], zhiIdx: sZhi, index: sGan * 12 + sZhi }
    };
  }

  // 公历 → 农历。月份为负数表示闰月，这里还原成 {month, isLeap}。
  function solarToLunar(date) {
    const l = solarOf(date).getLunar();
    const rawMonth = l.getMonth();
    const isLeap = rawMonth < 0;
    const month = Math.abs(rawMonth);
    const day = l.getDay();
    return {
      year: l.getYear(), month, day, isLeap,
      lunarMonth: MONTHS[month - 1], lunarDay: DATE[day - 1],
      monthStr: (isLeap ? '闰' : '') + MONTHS[month - 1] + '月', dayStr: DATE[day - 1]
    };
  }

  // 某公历年 24 节气（小寒=0）。轮子按天文算法给出秒级时刻，这里转成本地 Date。
  const _jqCache = {};
  function _jieqiDates(solarYear) {
    if (_jqCache[solarYear]) return _jqCache[solarYear];
    // lunarYear 的节气表：索引 0=上年大雪、1=上年冬至、2=当年小寒 …… 25=当年冬至
    const rows = LJ.LunarYear.fromYear(solarYear).getJieQiJulianDays();
    const out = rows.map((jd) => {
      const s = LJ.Solar.fromJulianDay(jd);
      return new Date(s.getYear(), s.getMonth() - 1, s.getDay(), s.getHour(), s.getMinute(), s.getSecond());
    });
    return (_jqCache[solarYear] = out);
  }
  function sTermDate(y, n) {
    const arr = _jieqiDates(y);
    const d = arr[n + 2];
    return d ? new Date(d.getTime()) : null;
  }

  function currentNextJieQi(date) {
    const y = date.getFullYear();
    const list = [];
    for (let n = 0; n < 24; n++) list.push({ name: JIEQI[n], date: sTermDate(y, n) });
    for (let n = 0; n < 24; n++) list.push({ name: JIEQI[n], date: sTermDate(y + 1, n) });
    let cur = null, next = null;
    for (let i = 0; i < list.length; i++) {
      if (list[i].date && date >= list[i].date) { cur = list[i]; next = list[i + 1] || null; }
    }
    return { cur, next };
  }

  const SHICHEN = ['子时', '丑时', '寅时', '卯时', '辰时', '巳时', '午时', '未时', '申时', '酉时', '戌时', '亥时'];
  const SHICHEN_RANGE = ['23:00-01:00', '01:00-03:00', '03:00-05:00', '05:00-07:00', '07:00-09:00', '09:00-11:00', '11:00-13:00', '13:00-15:00', '15:00-17:00', '17:00-19:00', '19:00-21:00', '21:00-23:00'];
  function getShiChen(date) {
    const h = date.getHours();
    const idx = Math.floor(((h + 1) % 24) / 2);
    return { name: SHICHEN[idx], range: SHICHEN_RANGE[idx], index: idx };
  }

  // 月将（中气定将 / 节气定将）：口径不变，节气时刻改用轮子的真实值
  function getYueJiang(date, mode) {
    mode = mode || '中气定将';
    const y = date.getFullYear();
    const cands = [];
    if (mode === '节气定将') {
      const qi = [[0, 0], [2, 11], [4, 10], [6, 9], [8, 8], [10, 7], [12, 6], [14, 5], [16, 4], [18, 3], [20, 2], [22, 1]];
      [y - 1, y, y + 1].forEach((yy) => qi.forEach(([n, mj]) => { const dt = sTermDate(yy, n); if (dt) cands.push({ dt, mj, name: JIEQI[n] }); }));
      cands.sort((a, b) => a.dt - b.dt);
      let cur = { zhiIdx: 1, zhi: ZHI[1], jieqi: '冬至' };
      for (const c of cands) { if (date >= c.dt) cur = { zhiIdx: c.mj, zhi: ZHI[c.mj], jieqi: c.name }; else break; }
      return cur;
    }
    const qi = [[1, 0], [3, 11], [5, 10], [7, 9], [9, 8], [11, 7], [13, 6], [15, 5], [17, 4], [19, 3], [21, 2], [23, 1]];
    [y - 1, y, y + 1].forEach((yy) => qi.forEach(([n, mj]) => { const dt = sTermDate(yy, n); if (dt) cands.push({ dt, mj, name: JIEQI[n] }); }));
    cands.sort((a, b) => a.dt - b.dt);
    let cur = { zhiIdx: 1, zhi: ZHI[1], jieqi: '冬至' };
    for (const c of cands) { if (date >= c.dt) cur = { zhiIdx: c.mj, zhi: ZHI[c.mj], jieqi: c.name }; else break; }
    return cur;
  }

  // 旧 API 保留：农历年长度 / 闰月 / 某月天数（内部已无调用，外部脚本或插件可能引用）
  function leapMonth(y) { return LJ.LunarYear.fromYear(y).getLeapMonth(); }
  function leapDays(y) {
    const lm = leapMonth(y);
    return lm > 0 ? LJ.LunarYear.fromYear(y).getMonth(lm) .getDayCount() : 0;
  }
  function monthDays(y, m) { return LJ.LunarYear.fromYear(y).getMonth(m).getDayCount(); }
  function lYearDays(y) {
    let s = 0;
    LJ.LunarYear.fromYear(y).getMonths().forEach((mo) => { s += mo.getDayCount(); });
    return s;
  }

  global.Lunar = {
    GAN, ZHI, SX, MONTHS, DATE, JIEQI,
    ganzhiOf, gzFromIndex, getBaZi, solarToLunar,
    sTermDate, currentNextJieQi, getShiChen, getYueJiang,
    lYearDays, leapMonth, leapDays, monthDays
  };
})(typeof window !== 'undefined' ? window : globalThis);
