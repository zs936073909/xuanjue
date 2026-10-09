// PostgreSQL 连接池（原生 pg，避免引入 ORM 的抽象成本）
import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000
});

pool.on('error', err => {
  console.error('[pg] idle client error', err.message);
});

/** 执行单条查询 */
export async function q(text, params) {
  const r = await pool.query(text, params);
  return r;
}

/** 事务包装：cb 内所有查询共享一个 client */
export async function tx(cb) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await cb(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* noop */ }
    throw e;
  } finally {
    client.release();
  }
}
