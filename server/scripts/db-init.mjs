// 初始化数据库 schema。
//
// 为什么不用 psql：托管平台（Render / Koyeb 等）的原生 Node 环境不保证有 psql 客户端，
// 而 schema.sql 里的 DO $$ 块与 ALTER 迁移又不能走参数化协议，
// 所以用 pg 的 simple query 协议整段发送 —— 本地和云端行为完全一致。
//
// 用法：DATABASE_URL=postgres://... node scripts/db-init.mjs
// 幂等：同一段脚本重复执行不会破坏已有数据（见 schema.sql 的 if not exists / add column if not exists）。
import fs from 'node:fs';
import pg from 'pg';

const DEFAULT_LOCAL = 'postgres://xuanjue:xuanjue@127.0.0.1:5432/xuanjue';
const url = process.env.DATABASE_URL || DEFAULT_LOCAL;
const sqlPath = new URL('../schema.sql', import.meta.url);

if (!process.env.DATABASE_URL) {
  console.info('[db:init] 未设置 DATABASE_URL，回落到本地默认库：' + DEFAULT_LOCAL);
}
// 打印目标时脱敏：只保留协议与主机，绝不把密码写进日志
const masked = url.replace(/\/\/([^:]+):[^@]+@/, '//$1:***@');
console.info('[db:init] 目标：' + masked);

const client = new pg.Client({ connectionString: url });
try {
  await client.connect();
  const sql = fs.readFileSync(sqlPath, 'utf8');
  await client.query({ text: sql, simple: true });
  const { rows } = await client.query(
    `select table_name from information_schema.tables
     where table_schema='public' order by table_name`
  );
  console.info('[db:init] 完成，public 表现有表：' + rows.map(r => r.table_name).join(', '));
} catch (err) {
  console.error('[db:init] 失败：' + err.message);
  if (/ssl|SSL|self.signed|certificate/i.test(err.message)) {
    console.error('[db:init] 像是 TLS 问题：托管 Postgres（Neon/Supabase 等）需要连接串带 ?sslmode=require');
  }
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
