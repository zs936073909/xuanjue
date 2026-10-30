// 启动期自动迁移 —— 让「部署即开箱即用」成立。
//
// 为什么要有这层：schema.sql 里的迁移（如阶跃星辰模型名换新、复位被误熔断的 Key）
// 需要真正跑在用户的库上才会生效。托管平台的 startCommand 只有 `node index.js`，
// 不会有人记得先执行 `npm run db:init` —— 于是「代码修好了，库里还是脏的」，
// 用户看到的还是「API 都填好了却一直调不通」。
//
// 所以：进程启动时把 schema.sql 整段幂等脚本跑一遍。
//   - 新库：建表 + 迁移一次到位，不需要任何人工命令；
//   - 老库：create table if not exists / alter … if exists / update 全部是幂等的，
//     只把该改的行改掉，其余数据一律不碰。
//
// 失败不阻断启动：数据库连不上或没有 DDL 权限时，记一条明确的错误日志，
// 服务照常起（表现与迁移前一致），避免「迁移失败 = 整个站打不开」。
import fs from 'node:fs';
import { pool } from './db.js';

const SCHEMA_URL = new URL('../schema.sql', import.meta.url);
// 咨询锁的固定 key：同一个库被多个实例同时启动时，只有一个实例在改表，
// 其余实例排队等待 —— 避免并发 DDL 撞锁或撞唯一约束。
const LOCK_KEY = 82746123;

/**
 * 跑一遍幂等 schema + 迁移。
 * @param {object} [log] Fastify 的 logger（可选）
 * @returns {Promise<{ok:boolean, reason?:string}>}
 */
export async function runStartupMigrations(log) {
  if (!process.env.DATABASE_URL) {
    log?.warn?.('未设置 DATABASE_URL，跳过启动期数据库迁移');
    return { ok: false, reason: 'no_database_url' };
  }
  const sql = fs.readFileSync(SCHEMA_URL, 'utf8');
  const client = await pool.connect();
  try {
    // 会话级咨询锁：跨语句有效，能真正挡住并发启动（事务级锁在隐式事务里会立刻释放）
    await client.query('select pg_advisory_lock($1)', [LOCK_KEY]);
    try {
      // simple 协议整段发送：schema.sql 里的 DO $$ 块与多条 DDL 不能走参数化协议
      await client.query({ text: sql, simple: true });
    } finally {
      await client.query('select pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {});
    }
    return { ok: true };
  } finally {
    client.release();
  }
}
