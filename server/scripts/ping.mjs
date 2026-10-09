// 快速连通性验证：只打 /health 和一次带 TLS 的数据库连接，用来判断「平台是不是在睡」。
//
// 用法：
//   node scripts/ping.mjs https://your-app.onrender.com
//   node scripts/ping.mjs                      # 只测数据库
// 会打印耗时与结论：正常 / 冷启动偏慢 / 连不上。
const target = process.argv[2];

async function timeIt(label, fn) {
  const t0 = Date.now();
  try {
    await fn();
    console.info(`  ✓ ${label} ${Date.now() - t0} ms`);
    return Date.now() - t0;
  } catch (e) {
    console.info(`  ✗ ${label} 失败：${e.message}`);
    return null;
  }
}

if (target) {
  const url = target.replace(/\/+$/, '') + '/health';
  const ms = await timeIt('GET ' + url, async () => {
    const r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
  });
  if (ms !== null && ms > 5000) console.info('  ! 超过 5 秒，通常是免费档休眠后的冷启动（正常，不代表故障）');
}

if (process.env.DATABASE_URL) {
  const pg = (await import('pg')).default;
  await timeIt('PostgreSQL 连接', async () => {
    const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await c.connect();
    await c.query('select 1');
    await c.end();
  });
}

if (!target && !process.env.DATABASE_URL) {
  console.info('没给参数：可用 node scripts/ping.mjs <服务地址>；或设 DATABASE_URL 后只测数据库');
}
