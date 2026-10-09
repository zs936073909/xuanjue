// AI 代理限流：每分钟窗口（内存）+ 每日配额（数据库计数）
//
// 两道闸门分开的原因：
// - 每分钟：防突发刷接口打爆站长余额，内存滑动窗口即可，重启即清零（可接受）；
// - 每日：防「慢速耗额度」，必须持久化，否则重启进程就重置配额、限制形同虚设。
//
// 单机部署够用（站长自用、用户量小）。多实例横向扩容时，把这里换成 Redis
// （INCR + EXPIRE 天然适合），接口形态不用变。
const hits = new Map(); // `${userId}` -> [ts,...]
const WINDOW_MS = 60_000;

function sweep(now) {
  for (const [k, arr] of hits) {
    const kept = arr.filter(t => now - t < WINDOW_MS);
    if (kept.length === 0) hits.delete(k);
    else if (kept.length !== arr.length) hits.set(k, kept);
    if (hits.size > 50000) break; // 防御：异常流量下主动降级
  }
}

setInterval(() => sweep(Date.now()), 30_000).unref?.();

/**
 * 每分钟限流
 * @param {string} key 限流键（用户维度）
 * @param {number} limit 每分钟允许次数
 * @returns {{ok:boolean, retryAfterSec:number}}
 */
export function ratePerMinute(key, limit) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter(t => now - t < WINDOW_MS);
  if (arr.length >= limit) {
    hits.set(key, arr);
    const oldest = arr[0];
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000)) };
  }
  arr.push(now);
  hits.set(key, arr);
  return { ok: true, retryAfterSec: 0 };
}

/** 测试辅助：清空内存窗口 */
export function resetRateLimits() {
  hits.clear();
}

/** 取今日 UTC 日期字符串（与库表 default current_date 同基准，纯内存计算不依赖 DB） */
export function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}
