// /v1/me —— 账号信息、设备列表、注销
import { requireAuth } from '../lib/auth.js';
import { q } from '../lib/db.js';

export async function registerMe(app) {
  app.addHook('preHandler', requireAuth);

  app.get('/me', async (req, reply) => {
    const u = await q(
      'select id, token_prefix, created_at, last_seen_at from users where id=$1',
      [req.userId]
    );
    if (!u.rowCount) return reply.code(404).send({ error: 'user_not_found' });
    const dev = await q(
      'select id, device_name, platform, last_sync_at from devices where user_id=$1 order by last_sync_at desc nulls last',
      [req.userId]
    );
    const snap = await q('select kind, rev, updated_at from snapshots where user_id=$1', [
      req.userId]
    );
    return reply.send({ user: u.rows[0], devices: dev.rows, snapshots: snap.rows });
  });

  app.delete('/devices/:id', async (req, reply) => {
    await q('delete from devices where user_id=$1 and id=$2', [req.userId, req.params.id]);
    return reply.send({ ok: true });
  });

  // 注销账号：级联删除 users → devices/snapshots/ops/audit_log
  app.delete('/me', async (req, reply) => {
    await q('delete from users where id=$1', [req.userId]);
    return reply.send({ ok: true, note: '所有云端数据已删除' });
  });
}
