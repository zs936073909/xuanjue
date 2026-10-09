// 登录限速：同 IP 5 次/分钟，同账号 10 次/10 分钟。
// 进程内实现（单机部署够用）；多实例时换 Redis。
const ipHits = new Map(); // ip -> [ts,...]
const emailHits = new Map(); // email -> [ts,...]

function sweep(map, now, windowMs, max) {
  for (const [k, arr] of map) {
    const kept = arr.filter(t => now - t < windowMs);
    if (kept.length === 0) map.delete(k);
    else map.set(k, kept);
    if (map.size > 50000) break; // 防御：异常流量下主动降级
  }
}

export function tooManyLoginAttempts(ip, email) {
  const now = Date.now();
  const ipArr = (ipHits.get(ip) || []).filter(t => now - t < 60_000);
  const emailArr = (emailHits.get(email) || []).filter(t => now - t < 600_000);
  ipHits.set(ip, ipArr);
  emailHits.set(email, emailArr);
  if (ipArr.length >= 5) return 'ip';
  if (emailArr.length >= 10) return 'email';
  ipArr.push(now);
  emailArr.push(now);
  return null;
}

export function clearLoginAttempts(ip, email) {
  ipHits.delete(ip);
  emailHits.delete(email);
}

// 定时清理，防止 Map 无限增长
const timer = setInterval(() => {
  sweep(ipHits, Date.now(), 60_000, 5);
  sweep(emailHits, Date.now(), 600_000, 10);
}, 60_000);
timer.unref?.();
