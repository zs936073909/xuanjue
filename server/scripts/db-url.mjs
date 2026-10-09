// 生成一条可直接粘贴到后台的 DATABASE_URL（Neon / Supabase / Koyeb / Render 均可）。
// 目的：避免手拼连接串时漏掉 sslmode=require —— 那是托管库连接失败最常见的原因。
//
// 用法：node scripts/db-url.mjs
// 不带数据库二进制也能用；不联网，只做本地字符串拼接。
import crypto from 'node:crypto';

const qs = new URLSearchParams(process.argv.slice(2).join(' ').trim() ? JSON.parse(process.argv.slice(2).join(' ')) : {});
const interactive = !Object.keys(qs).length;

function ask(label, def) {
  if (!interactive) return def;
  process.stdout.write(`${label}${def ? ` [${def}]` : ''}: `);
  const chunks = [];
  return new Promise(resolve => {
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', d => {
      const v = String(d).trim();
      resolve(v || def || '');
    });
  });
}

const scheme = qs.scheme || await ask('协议 scheme', 'postgresql');
const user = qs.user || await ask('用户名', 'xuanjue');
const password = qs.password || await ask('密码（不会回显到历史，仅本次拼接）', crypto.randomBytes(18).toString('base64url'));
const host = qs.host || await ask('主机，如 ep-xxx.us-east-2.aws.neon.tech', '');
const port = qs.port || await ask('端口', '5432');
const database = qs.database || await ask('库名', 'xuanjue');
const sslmode = qs.sslmode || await ask('sslmode', 'require');

if (!/^postgres(ql)?$/.test(scheme)) { console.error('scheme 只能是 postgres 或 postgresql'); process.exit(1); }
if (!host) { console.error('缺少主机名'); process.exit(1); }

const enc = encodeURIComponent;
const url = `${scheme}://${enc(user)}:${enc(password)}@${host}:${port}/${enc(database)}?sslmode=${sslmode}`;
console.info('\nDATABASE_URL=\n' + url);
console.info('\n直接设进环境：');
console.info(`  export DATABASE_URL='${url}'`);
console.info('然后执行：node scripts/preflight.mjs 验证连通与 schema。');
