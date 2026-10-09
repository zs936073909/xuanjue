// 初始化 / 重置管理员账号。
//
// 用法：
//   ADMIN_USERNAME=admin ADMIN_PASSWORD='你的强密码' node scripts/admin-init.mjs
//   node scripts/admin-init.mjs --username admin --password '你的强密码'
//   node scripts/admin-init.mjs --username admin --password '新密码' --reset   # 重置已存在账号的密码
//   node scripts/admin-init.mjs --random                                      # 随机密码并打印一次
//
// 幂等：默认「已存在就跳过」，避免误覆盖线上密码；要改密码显式加 --reset。
// 密码只在创建那一刻用于哈希，不落日志、不落盘。
import { q, pool } from '../lib/db.js';
import { hashPassword, assertAdminUsername, assertAdminPassword } from '../lib/adminauth.js';
import crypto from 'node:crypto';

const args = process.argv.slice(2);
function argOf(name) {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : undefined;
}
const has = (name) => args.includes('--' + name);

const username = assertAdminUsername(argOf('username') || process.env.ADMIN_USERNAME || 'admin');
let password = argOf('password') || process.env.ADMIN_PASSWORD || '';

if (has('random') || !password) {
  if (!has('random') && !password) {
    console.error('[admin:init] 未提供密码。用 --password / ADMIN_PASSWORD 传入，或加 --random 自动生成。');
    process.exit(1);
  }
  password = crypto.randomBytes(15).toString('base64url'); // 20 字符，够强且可复制
  console.info('[admin:init] 已生成随机密码（只显示这一次，请立即保存）：');
  console.info('  ' + password);
}
assertAdminPassword(password);

const existing = await q('select id from admins where username=$1', [username]);
if (existing.rowCount && !has('reset')) {
  console.info(`[admin:init] 管理员「${username}」已存在，未做改动。要改密码请加 --reset。`);
  process.exit(0);
}

const { salt, hash } = await hashPassword(password);
if (existing.rowCount) {
  await q('update admins set pwd_hash=$1, pwd_salt=$2, failed_count=0, locked_until=null where id=$3', [
    hash,
    salt,
    existing.rows[0].id
  ]);
  console.info(`[admin:init] 管理员「${username}」密码已重置。`);
} else {
  await q(
    'insert into admins (username, pwd_hash, pwd_salt, name, is_superadmin) values ($1,$2,$3,$4,true)',
    [username, hash, salt, '站长']
  );
  console.info(`[admin:init] 管理员「${username}」创建完成（superadmin）。`);
}

await pool.end();
