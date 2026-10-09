// 部署前自检：把「上线后才发现没配好」的问题前移到本地一键检查。
// 只读、不改任何东西：检查环境变量、数据库连通性、schema 是否就绪、CORS 是否覆盖 Capacitor 源。
//
// 用法：
//   DATABASE_URL=... JWT_SECRET=... CORS_ORIGINS=... node scripts/preflight.mjs
// 退出码：0 = 可以上线；1 = 有阻断项（每一项都给出了改法）
import pg from 'pg';

const problems = [];
const warnings = [];
const caps = [];

function ok(msg) { caps.push('  ✓ ' + msg); }
function bad(msg) { problems.push('  ✗ ' + msg); }
function warn(msg) { warnings.push('  ! ' + msg); }

const isProd = process.env.NODE_ENV === 'production';

// ---- 1. 必需环境变量 ----
const jwt = process.env.JWT_SECRET || '';
if (!jwt) bad('JWT_SECRET 未设置 —— 生成：openssl rand -base64 48');
else if (jwt.length < 32) bad(`JWT_SECRET 只有 ${jwt.length} 位，至少 32 位`);
else ok('JWT_SECRET 已设置（' + jwt.length + ' 位）');

const db = process.env.DATABASE_URL || '';
if (!db) bad('DATABASE_URL 未设置');
else {
  if (!/^postgres(ql)?:\/\//.test(db)) bad('DATABASE_URL 不是 postgres:// 协议');
  else ok('DATABASE_URL 已设置');
  if (/^postgres:\/\//i.test(db) && !/sslmode=/.test(db)) {
    warn('DATABASE_URL 未指定 sslmode。托管 Postgres（Neon/Supabase/Render）通常要求 ?sslmode=require');
  }
  if (/127\.0\.0\.1|localhost/.test(db) && isProd) {
    warn('生产环境指向了本地数据库（127.0.0.1）—— 确认这是有意为之');
  }
}

// ---- 2. CORS（Capacitor App 的源固定是 https://localhost）----
const origins = (process.env.CORS_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);
if (!origins.length) bad('CORS_ORIGINS 未设置');
else {
  const hasAppOrigin = origins.some(o => /^https:\/\/localhost$/.test(o));
  if (!hasAppOrigin) bad('CORS_ORIGINS 缺少 https://localhost —— 打包出的 App 取不到数据就是这个原因');
  else ok('CORS_ORIGINS 含 https://localhost（Capacitor App 源）');
  if (origins.includes('*')) warn('CORS_ORIGINS = * 允许任意站点调用你的后端，正式环境别这么配');
}

if (process.env.ALLOW_SIGNUP === 'false') warn('ALLOW_SIGNUP=false —— 新用户无法注册，只能老令牌登录');

// ---- 2.5 AI 云代理 ----
const aiOn = process.env.AI_PROXY_ENABLED === 'true';
if (aiOn) {
  const master = (process.env.AI_KEY_MASTER || '').trim();
  if (!master) bad('AI_PROXY_ENABLED=true 但 AI_KEY_MASTER 未设置 —— 没有主密钥就无法加密保存 API Key');
  else {
    let len = 0;
    try {
      const b = /^[0-9a-f]{64}$/i.test(master) ? Buffer.from(master, 'hex') : Buffer.from(master, 'base64');
      len = b.length;
    } catch { len = 0; }
    if (len !== 32) bad(`AI_KEY_MASTER 解出来是 ${len} 字节，必须是 32（生成：openssl rand -base64 32）`);
    else ok('AI_KEY_MASTER 有效（32 字节）');
  }
  const dl = Number(process.env.AI_DAILY_LIMIT || 30);
  const rpm = Number(process.env.AI_RATE_PER_MINUTE || 6);
  ok(`AI 云代理已开启：每用户每天 ${dl} 次、每分钟 ${rpm} 次`);
  if (dl > 200) warn(`AI_DAILY_LIMIT=${dl} 偏大 —— 这决定单个账号最多能烧掉你多少额度`);

  // 站长内置 Key：配了就是「用户端零配置」，格式错则全部用户都用不了，必须拦在启动前
  const siteRaw = (process.env.AI_SITE_KEY || '').trim();
  if (siteRaw) {
    const { parseSiteKey } = await import('../lib/sitekey.js');
    const sk = parseSiteKey(siteRaw);
    if (!sk.configured) bad('AI_SITE_KEY 解析失败：' + (sk.problem || '格式应为 protocol://key@base-url/model'));
    else {
      ok(`AI_SITE_KEY 解析成功（${sk.keys.length} 把）：` + sk.keys.map(k => k.spec).join(' | '));
      if (sk.problem) warn('AI_SITE_KEY 有部分条目解析失败（已跳过）：' + sk.problem);
      if (!master) warn('AI_SITE_KEY 已配但 AI_KEY_MASTER 没配 —— 用户自填 Key 的那条路会不可用');
    }
  } else {
    ok('AI_SITE_KEY 未配置 —— 走「用户自带 Key」模式，客户端需各自填写');
  }
} else {
  ok('AI 云代理未开启（AI_PROXY_ENABLED!=true）—— 用户需自带 Key 直连厂商');
}

// ---- 3. 数据库连通 + schema ----
if (db) {
  const client = new pg.Client({ connectionString: db });
  try {
    await client.connect();
    ok('数据库连接成功');
    const need = ['users', 'devices', 'snapshots', 'ops', 'audit_log', 'ai_proxy_config', 'ai_usage'];
    const { rows } = await client.query(
      `select table_name from information_schema.tables where table_schema='public'`
    );
    const have = new Set(rows.map(r => r.table_name));
    const miss = need.filter(t => !have.has(t));
    if (miss.length) bad('缺少数据表：' + miss.join(', ') + ' —— 先执行 node scripts/db-init.mjs');
    else ok('数据表齐全（' + need.join(', ') + '）');

    // 令牌模式关键列。明文落库后 recovery_blob / kdf_salt 已废弃（schema 会 drop），
    // 只校验现役列；缺了说明 schema 没跑最新 db-init。
    const cols = await client.query(
      `select column_name from information_schema.columns
       where table_schema='public' and table_name='users'`
    );
    const haveCols = new Set(cols.rows.map(r => r.column_name));
    const needCols = ['token_hash', 'token_prefix', 'recovery_hash', 'suspended', 'ai_daily_limit'];
    for (const c of needCols) {
      if (!haveCols.has(c)) bad('users 表缺列 ' + c + ' —— 执行 node scripts/db-init.mjs 完成迁移');
    }
    if (!miss.length && needCols.every(c => haveCols.has(c))) {
      ok('users 表为令牌模式 + 明文落库（token_hash / token_prefix / recovery_hash 齐备）');
    }

    const ext = await client.query(`select 1 from pg_extension where extname='pgcrypto'`);
    if (!ext.rowCount) warn('pgcrypto 扩展未启用 —— 执行 node scripts/db-init.mjs 会自动建');

    const { rows: cnt } = await client.query('select count(*)::int as n from users');
    console.info('  · 当前用户数：' + cnt[0].n);
  } catch (err) {
    bad('数据库连接失败：' + err.message);
    if (/ssl|self.signed|certificate/i.test(err.message)) {
      warn('TLS 报错的话，把 ?sslmode=require 加到 DATABASE_URL 末尾再试');
    }
  } finally {
    await client.end().catch(() => {});
  }
}

console.info('\n部署前自检');
for (const l of caps) console.info(l);
for (const l of warnings) console.info(l);
for (const l of problems) console.info(l);

if (problems.length) {
  console.info(`\n结论：有 ${problems.length} 项阻断，修完再上线。`);
  process.exit(1);
}
console.info('\n结论：环境就绪，可以部署（HTTPS 由平台自动签发，务必确认最终域名是 https）。');
process.exit(0);
