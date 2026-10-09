// /v1/sync —— 云端快照同步（明文落库）
//
// 【2026-10 变更】站长决策：业务数据不再端到端加密，改为明文 JSON 落库，
// 以便站点管理员能直接查看与管理（客服 / 测试 / 违规处理）。
// 代价已在 App 内如实告知用户：数据库被拖库或平台侧人员都能看到内容。
// 同步协议不变：GET 拉取 → 本地合并 → PUT 推送（带 base_rev，落后则 409 需重拉）。
import { requireAuth } from '../lib/auth.js';
import { assertKind, SYNC_KINDS, assertJsonData } from '../lib/validate.js';
import { q } from '../lib/db.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function registerSync(app) {
  app.addHook('preHandler', requireAuth);

  // 拉取：全量快照 + since 之后的增量操作
  app.get('/', async (req, reply) => {
    const kinds = SYNC_KINDS;
    const res = await q(
      `select kind, data, rev, updated_at
       from snapshots where user_id=$1`,
      [req.userId]
    );
    const byKind = {};
    for (const r of res.rows) {
      byKind[r.kind] = {
        data: r.data,
        rev: Number(r.rev),
        updated_at: r.updated_at
      };
    }
    // since 之后的增量操作日志（用于细粒度合并与审计）
    const since = Number(req.query.since || 0) / 1000;
    const ops = await q(
      `select id, kind, op, ts from ops where user_id=$1 and ts>to_timestamp($2) order by id`,
      [req.userId, since]
    );
    return reply.send({
      snapshots: kinds.map(k => ({ kind: k, ...(byKind[k] || { rev: 0 }) })),
      ops: ops.rows
    });
  });

  // 把设备名（或设备 id）解析成设备 id；找不到则该字段留空，不影响同步本身
  async function resolveDeviceId(req, raw) {
    if (!raw) return null;
    const s = String(raw).slice(0, 60);
    if (UUID_RE.test(s)) {
      const r = await q('select id from devices where user_id=$1 and id=$2', [req.userId, s]);
      return r.rows[0] ? r.rows[0].id : null;
    }
    const r = await q('select id from devices where user_id=$1 and device_name=$2', [req.userId, s]);
    if (!r.rowCount) return null;
    await q('update devices set last_sync_at=now() where id=$1', [r.rows[0].id]);
    return r.rows[0].id;
  }

  // 推送：乐观并发。client 带 base_rev，必须等于服务端现值（或 0 = 新建）
  app.put('/:kind', async (req, reply) => {
    const kind = assertKind(req.params.kind);
    const data = assertJsonData(req.body?.data, 'data');
    const baseRev = Number(req.body?.base_rev || 0);
    const deviceId = await resolveDeviceId(req, req.query.device);

    const cur = await q('select rev from snapshots where user_id=$1 and kind=$2', [
      req.userId,
      kind
    ]);
    const serverRev = cur.rows[0] ? Number(cur.rows[0].rev) : 0;
    if (serverRev !== baseRev) {
      return reply.code(409).send({ error: 'rev_conflict', server_rev: serverRev });
    }
    const next = serverRev + 1;

    await q(
      `insert into snapshots (user_id, kind, data, rev, updated_by)
       values ($1,$2,$3,$4,$5)
       on conflict (user_id, kind)
       do update set data=excluded.data,
                     rev=excluded.rev, updated_by=excluded.updated_by,
                     updated_at=now()`,
      [req.userId, kind, JSON.stringify(data), next, deviceId]
    );
    await q('insert into ops (user_id, device_id, kind, op) values ($1,$2,$3,$4)', [
      req.userId,
      deviceId,
      kind,
      JSON.stringify({ action: 'upsert', rev: next })
    ]);
    return reply.send({ kind, rev: next });
  });

  // 删除某类数据（如「清空云端案例」）
  app.delete('/:kind', async (req, reply) => {
    const kind = assertKind(req.params.kind);
    await q('delete from snapshots where user_id=$1 and kind=$2', [req.userId, kind]);
    await q('insert into ops (user_id, kind, op) values ($1,$2,$3)', [
      req.userId,
      kind,
      JSON.stringify({ action: 'delete' })
    ]);
    return reply.send({ kind, deleted: true });
  });
}
