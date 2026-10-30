/**
 * 紫微排盘的「时间口径」三件套：真太阳时 + 均时差 + 中国夏令时判定。
 *
 * 移植自开源项目 Renhuai123/ziwei-doushu（MIT License）
 *   源文件：lib/ziwei/true-solar-time.ts、lib/ziwei/dst-cn.ts、lib/ziwei/clock-adjust.ts
 *   改动：TS → ES2019；按本项目习惯挂到 window.ZiweiSolar；逻辑逐字保留，未做「顺手优化」。
 *
 * 为什么这三件套重要：
 *   1. 经度修正：出生地偏离东经 120°，每 1° 差 4 分钟。全国最西（喀什约 76°E）与最东（抚远约 134°E）
 *      相差近 2 小时——足以把时辰整个换掉，命宫身宫大限全变。
 *   2. 均时差：一年之内真太阳时与平太阳时最多差 ±16 分钟，用 NOAA 近似式。
 *   3. 夏令时：中国 1986–1991 年夏天钟表拨快 1 小时。出生时刻落在时辰边界的人，
 *      是否算这一小时会得到两张完全不同的盘。本节只【判定】、不自动扣减——
 *      程序无法知道用户报的是当年钟表读数还是已换算的标准时间，默默减一小时既可能算错，
 *      又会把所有存量命盘悄悄改掉。所以只提示，让用户自己决定。
 */
(function (global) {
  'use strict';

  const MINUTES_PER_DAY = 1440;
  const SECONDS_PER_DAY = 86400;
  const mod = (v, base) => ((v % base) + base) % base;

  /** 通行口径 XLS_CN：[年, 起月, 起日, 止月, 止日]，起止日都含。逐字照抄。 */
  const XLS_CN = [
    [1935, 5, 1, 9, 30], [1936, 5, 1, 9, 30], [1937, 5, 1, 9, 30], [1938, 5, 1, 9, 30],
    [1939, 5, 1, 9, 30], [1940, 5, 1, 9, 30], [1941, 5, 1, 9, 30], [1942, 5, 1, 9, 30],
    [1943, 5, 1, 9, 30], [1944, 5, 1, 9, 30], [1945, 5, 1, 9, 30], [1946, 5, 1, 9, 30],
    [1947, 5, 1, 9, 30], [1948, 5, 1, 9, 30], [1949, 5, 1, 9, 30], [1950, 5, 1, 9, 30],
    [1951, 5, 1, 9, 30], [1952, 3, 1, 10, 31], [1953, 4, 1, 10, 31], [1954, 4, 1, 10, 31],
    [1955, 5, 1, 9, 30], [1956, 5, 1, 9, 30], [1957, 4, 1, 9, 30], [1958, 4, 1, 9, 30],
    [1959, 4, 1, 9, 30], [1960, 6, 1, 9, 30], [1961, 6, 1, 9, 30], [1974, 4, 1, 10, 31],
    [1975, 4, 1, 10, 31], [1979, 7, 1, 9, 30], [1986, 5, 4, 9, 14], [1987, 4, 12, 9, 13],
    [1988, 4, 10, 9, 11], [1989, 4, 16, 9, 17], [1990, 4, 15, 9, 16], [1991, 4, 14, 9, 15]
  ];

  function isValidGregorianDate(year, month, day) {
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
    const d = new Date(Date.UTC(year, month - 1, day));
    return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
  }

  function isLeapYear(y) { return y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0); }

  function dayOfYear(year, month, day) {
    return Math.floor((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 0)) / 86400000);
  }

  /** NOAA 均时差近似值，单位分钟；正值表示真太阳时快于平太阳时。 */
  function equationOfTimeMinutes(year, month, day, clockHour, clockMinute) {
    if (clockHour === undefined) clockHour = 12;
    if (clockMinute === undefined) clockMinute = 0;
    if (!isValidGregorianDate(year, month, day)) return 0;
    const daysInYear = isLeapYear(year) ? 366 : 365;
    const fractionalHour = clockHour + clockMinute / 60;
    const gamma = (2 * Math.PI / daysInYear) * (dayOfYear(year, month, day) - 1 + (fractionalHour - 12) / 24);
    return 229.18 * (
      0.000075
      + 0.001868 * Math.cos(gamma)
      - 0.032077 * Math.sin(gamma)
      - 0.014615 * Math.cos(2 * gamma)
      - 0.040849 * Math.sin(2 * gamma)
    );
  }

  /** 一日分钟数 → 时辰地支索引（0=子 … 11=亥）。1380 分 = 23:00，归晚子。 */
  function branchFromSolarMinutes(normalizedMinutes) {
    if (normalizedMinutes >= 1380 || normalizedMinutes < 60) return 0;
    return Math.floor((normalizedMinutes - 60) / 120) + 1;
  }

  /**
   * 真太阳时计算。
   * @param {object} input {year,month,day,clockHour,clockMinute,longitude?,utcOffsetMinutes?}
   */
  function calculateTrueSolarTime(input) {
    const dateValid = isValidGregorianDate(input.year, input.month, input.day);
    const corrected = input.longitude !== undefined && Number.isFinite(input.longitude);
    // 中央经线 = 时区偏移 / 4（480 分钟 → 120°）；国内仍是 (经度 − 120) × 4，结果逐位不变
    const meridian = (input.utcOffsetMinutes !== undefined && Number.isFinite(input.utcOffsetMinutes))
      ? input.utcOffsetMinutes / 4 : 120;
    const longitudeCorrectionMinutes = corrected ? (input.longitude - meridian) * 4 : 0;
    const eot = (corrected && dateValid)
      ? equationOfTimeMinutes(input.year, input.month, input.day, input.clockHour, input.clockMinute)
      : 0;
    const totalCorrectionMinutes = longitudeCorrectionMinutes + eot;
    const rawMinutes = input.clockHour * 60 + input.clockMinute + totalCorrectionMinutes;

    // 页面输入精度为分钟；时辰边界按最近一秒取整，避免浮点毛刺
    const roundedTotalSeconds = Math.round(rawMinutes * 60);
    const dayOffset = Math.floor(roundedTotalSeconds / SECONDS_PER_DAY);
    const secondOfDay = mod(roundedTotalSeconds, SECONDS_PER_DAY);
    const hour = Math.floor(secondOfDay / 3600);
    const minute = Math.floor((secondOfDay % 3600) / 60);
    const second = secondOfDay % 60;
    const normalizedMinutes = secondOfDay / 60;

    return {
      dateValid, corrected, longitudeCorrectionMinutes,
      equationOfTimeMinutes: eot, totalCorrectionMinutes,
      rawMinutes, normalizedMinutes, dayOffset,
      hour, minute, second,
      branch: branchFromSolarMinutes(normalizedMinutes)
    };
  }

  /**
   * 真太阳日偏移 + 晚子时换日规则 → 排盘日相对输入日的偏移。
   * rule: 'next-day'（默认，23:00 后算次日）| 'current-day' | 'all-current' | 'day-cur-time-next'
   */
  function resolveZiweiDayOffset(solar, rule) {
    if (!rule) rule = 'next-day';
    const nextDayRule = rule === 'next-day';
    const isLateZishi = solar.branch === 0 && solar.normalizedMinutes >= 1380;
    if (solar.dayOffset < 0 && isLateZishi) return nextDayRule ? solar.dayOffset + 1 : solar.dayOffset;
    if (solar.dayOffset !== 0) return solar.dayOffset;
    if (isLateZishi) return nextDayRule ? 1 : 0;
    return 0;
  }

  /** 该公历日期是否处于中国大陆夏令时期间（纯按日期，不看小时） */
  function isChinaDST(year, month, day) {
    for (let i = 0; i < XLS_CN.length; i++) {
      const r = XLS_CN[i];
      if (year !== r[0]) continue;
      const m1 = r[1], d1 = r[2], m2 = r[3], d2 = r[4];
      if (month > m1 && month < m2) return true;
      // 注意这里必须是 else if：month == m1 且 day < d1 时不再比 m2 分支，与通行口径一致
      if (month === m1) {
        if (day >= d1) return true;
      } else if (month === m2) {
        if (day <= d2) return true;
      }
    }
    return false;
  }

  function isChinaDSTYear(year) { return XLS_CN.some(r => r[0] === year); }

  function chinaDSTSpan(year) {
    const hit = XLS_CN.find(r => r[0] === year);
    if (!hit) return null;
    return { startMonth: hit[1], startDay: hit[2], endMonth: hit[3], endDay: hit[4] };
  }

  function chinaDSTRange(year) {
    const s = chinaDSTSpan(year);
    return s ? { start: s.startMonth + ' 月 ' + s.startDay + ' 日', end: s.endMonth + ' 月 ' + s.endDay + ' 日' } : null;
  }

  /** 钟表读数 → 标准时间要平移的分钟数（东正西负） */
  function clockToStandardDelta(actualOffsetMin, stdOffsetMin) { return stdOffsetMin - actualOffsetMin; }

  /** 钟表时间平移 deltaMin 分钟；跨日一律返回 null，不替用户改日期 */
  function shiftClock(t, deltaMin) {
    if (!t || t.clockHour === '' || t.clockMinute === '' || t.clockHour === undefined || t.clockMinute === undefined) return null;
    const h = Number(t.clockHour), m = Number(t.clockMinute);
    if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
    if (!Number.isInteger(deltaMin) || deltaMin === 0) return null;
    const total = h * 60 + m + deltaMin;
    if (total < 0 || total >= 1440) return null;
    return { clockHour: String(Math.floor(total / 60)), clockMinute: String(total % 60) };
  }

  function formatSignedMinutes(v) { const r = Math.round(v); return (r > 0 ? '+' : '') + r; }

  // 城市经度表体积约 19KB，按需加载：只有用户打开出生地表单时才取
  let _citiesPromise = null;
  function loadCities() {
    if (_citiesPromise) return _citiesPromise;
    if (typeof fetch !== 'function') return Promise.reject(new Error('fetch 不可用'));
    const url = (global.APP_BASE || '') + 'data/ziwei/cities.json';
    _citiesPromise = fetch(url).then(r => {
      if (!r.ok) throw new Error('城市表加载失败 ' + r.status);
      return r.json();
    }).catch(e => { _citiesPromise = null; throw e; });
    return _citiesPromise;
  }

  global.ZiweiSolar = {
    calculateTrueSolarTime, equationOfTimeMinutes, branchFromSolarMinutes,
    resolveZiweiDayOffset, isValidGregorianDate,
    isChinaDST, isChinaDSTYear, chinaDSTSpan, chinaDSTRange,
    clockToStandardDelta, shiftClock, formatSignedMinutes,
    loadCities
  };
})(typeof window !== 'undefined' ? window : globalThis);
