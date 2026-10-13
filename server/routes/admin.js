// /v1/admin —— 站长后台：账号管理 / 用量 / 限额 / 明文数据 / AI 模型池与 Key
//
// 与用户 API 完全隔离：这里的一切都要求「管理员 JWT」（typ='admin'），
// 用户的 access token（typ='access'）进不来；后台也不发任何用户侧数据给非管理员。
//
// 能力清单（站长要求「可以控制所有账号，体验全部功能」）：
//   - 账号：列表/搜索/详情/封禁/解封/删除/开测试账号/模拟登录（拿用户会话体验 App）
//   - 数据：直接看明文快照（案例/对话/生辰/重要事项）—— 明文落库就是为这一步
//   - 限额：按用户覆盖每日次数与每分钟限速（null = 用全局默认）
//   - AI 池：厂商/模型/Key 的增删改查，Key 掩码默认、单独操作才显全文；路由日志；一键试跑
import { q } from '../lib/db.js';
import {
  hashPassword,
  verifyPassword,
  assertAdminUsername,
  assertAdminPassword,
  signAdminToken,
  requireAdmin,
  throttleAdminLogin,
  clearAdminLogin
} from '../lib/adminauth.js';
import { signAccessToken, signRefreshToken, hashToken } from '../lib/auth.js';
import { keyHint } from '../lib/aikey.js';
import { buildCandidates, maxAttempts, markKeyResult, logRouting, classifyUpstream } from '../lib/airouter.js';
import {
  assertProvider,
  assertProtocol,
  assertBaseUrl,
  assertModel,
  assertApiKey,
  assertTier
} from '../lib/validate.js';
import crypto from 'node:crypto';

const TOKEN_RE = /^[A-Za-z0-9._-]{16,64}$/;

// 推荐厂商模板：站长点一下就能把池子骨架搭好，之后只需贴 Key。
// base_url 与模型名来自各开放平台公开文档（2026-10 核对）：
//   魔搭免费推理 API 为 OpenAI 兼容协议，日 2000 次免费额度；
//   阶跃星辰按量计费，step-3.5-flash 最便宜、step-5-preview 旗舰；
//   书生（上海 AI 实验室）开放接口 OpenAI 兼容。
// 模型名会随平台更新换代，导入后可在下方表格里随时改；档位缺失时路由器自动向相邻档位兜底。
const AI_PRESETS = [
  {
    slug: 'modelscope',
    name: '魔搭社区',
    protocol: 'openai',
    base_url: 'https://api-inference.modelscope.cn/v1',
    note: '每天 2000 次免费额度；三档模型按难易分流',
    models: [
      { model: 'Qwen/Qwen3.5-0.8B', tier: 'easy', priority: 10, display_name: 'Qwen3.5-0.8B 轻量' },
      { model: 'Qwen/Qwen3.6-35B-A3B', tier: 'mid', priority: 10, display_name: 'Qwen3.6-35B 均衡' },
      { model: 'deepseek-ai/DeepSeek-V4.1-Flash', tier: 'hard', priority: 10, display_name: 'DeepSeek-V4.1 深度' }
    ]
  },
  {
    slug: 'stepfun',
    name: '阶跃星辰',
    protocol: 'openai',
    base_url: 'https://api.stepfun.com/v1',
    note: '按量计费；flash 系便宜快，旗舰系答难题',
    models: [
      { model: 'step-3.5-flash', tier: 'easy', priority: 20, display_name: 'Step-3.5 Flash' },
      { model: 'step-3.7-flash', tier: 'mid', priority: 20, display_name: 'Step-3.7 Flash' },
      { model: 'step-5-preview', tier: 'hard', priority: 20, display_name: 'Step-5 Preview' }
    ]
  },
  {
    slug: 'internlm',
    name: '书生（InternLM）',
    protocol: 'openai',
    base_url: 'https://chat.intern-ai.org.cn/api/v1',
    note: '上海 AI 实验室开放接口',
    models: [
      { model: 'internlm3-latest', tier: 'easy', priority: 30, display_name: '书生3 最新版' },
      { model: 'intern-latest', tier: 'hard', priority: 30, display_name: '书生旗舰版' }
    ]
  }
];

export async function registerAdmin(app) {
  // ---------- 登录 ----------

  app.post('/auth/login', async (req, reply) => {
    const username = assertAdminUsername(req.body?.username);
    const password = String(req.body?.password || '');

    // IP + 账号双维度限速，防爆破
    const key = 'admin:' + req.ip + ':' + username;
    if (!throttleAdminLogin(key)) {
      return reply.code(429).send({ error: 'too_many_attempts' });
    }

    const r = await q(
      `select id, pwd_hash, pwd_salt, failed_count, locked_until, is_superadmin
       from admins where username=$1`,
      [username]
    );
    const row = r.rows[0];
    // 不透露「用户名是否存在」：查不到也跑一次假校验，响应形状一致
    const ok = row
      ? await verifyPassword(password, row.pwd_hash, row.pwd_salt)
      : await verifyPassword(password, 'decoy'.repeat(12), 'decoysaltdecoysalt');

    if (!row || !ok) {
      if (row) {
        const failed = Number(row.failed_count) + 1;
        // 连续 10 次失败锁 15 分钟
        const locked = failed >= 10;
        await q(
          `update admins set failed_count=$1, locked_until = case when $2 then now() + interval '15 minutes' else locked_until end
           where id=$3`,
          [failed, locked, row.id]
        );
      }
      await adminAudit(null, 'admin_login_failed', req);
      return reply.code(401).send({ error: 'bad_credentials' });
    }
    if (row.locked_until && new Date(row.locked_until) > new Date()) {
      return reply.code(423).send({ error: 'account_locked' });
    }

    clearAdminLogin(key);
    await q(
      'update admins set failed_count=0, locked_until=null, last_login_at=now() where id=$1',
      [row.id]
    );
    await adminAudit(row.id, 'admin_login', req);
    return reply.send({
      token: signAdminToken(row.id),
      admin: { id: row.id, username, is_superadmin: row.is_superadmin }
    });
  });

  app.get('/auth/me', { preHandler: requireAdmin }, async (req, reply) => {
    const r = await q('select id, username, name, is_superadmin, last_login_at from admins where id=$1', [
      req.adminId
    ]);
    if (!r.rowCount) return reply.code(401).send({ error: 'invalid_token' });
    return reply.send({ admin: r.rows[0] });
  });

  // ---------- 总览 ----------

  app.get('/stats', { preHandler: requireAdmin }, async (req, reply) => {
    const users = await q(`
      select
        count(*)::int as total,
        count(*) filter (where suspended)::int as suspended,
        count(*) filter (where last_seen_at > now() - interval '1 day')::int as active_today,
        count(*) filter (where created_at > now() - interval '7 days')::int as new_7d
      from users`);
    const calls = await q(`
      select
        count(*) filter (where ts > now() - interval '1 day')::int as last_24h,
        count(*) filter (where ts > now() - interval '1 day' and status='ok')::int as ok_24h
      from ai_routing_log`);
    // 场景分布：近 24h 各栏目的调用量与失败量。
    // 「实时卜筮一直失败、典籍问答从没失败」这种结论，只有按场景拆开才看得出来。
    const scenes = await q(`
      select
        coalesce(scene, 'unknown') as scene,
        count(*)::int as calls,
        count(*) filter (where status='ok')::int as ok
      from ai_routing_log
      where ts > now() - interval '1 day'
      group by scene
      order by calls desc`);
    const pool = await q(`
      select
        (select count(*) from ai_providers where enabled)::int as providers,
        (select count(*) from ai_models where enabled)::int as models,
        (select count(*) from ai_keys where status='active')::int as keys_active,
        (select count(*) from ai_keys where status='suspect')::int as keys_suspect`);
    return reply.send({
      users: users.rows[0],
      ai_calls: calls.rows[0],
      ai_scenes: scenes.rows,
      pool: pool.rows[0]
    });
  });

  // ---------- 用户管理 ----------

  app.get('/users', { preHandler: requireAdmin }, async (req, reply) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.page_size) || 20));
    const query = String(req.query.query || '').trim().slice(0, 64);

    // 查询条件：令牌前缀模糊 / 用户 id 精确 / 恢复口令精确（客服报单号用）
    const whereParams = [];
    let where = '';
    if (query) {
      whereParams.push('%' + query + '%', query);
      where = 'where u.token_prefix like $1 or u.id::text = $2 or u.recovery_code = $2';
    }
    const params = [...whereParams, pageSize, (page - 1) * pageSize];
    const li = whereParams.length + 1; // limit 占位符下标
    const r = await q(
      `select u.id, u.token_prefix, u.created_at, u.last_seen_at,
              u.suspended, u.suspended_reason, u.ai_daily_limit, u.ai_rate_per_min,
              (select count from ai_usage a where a.user_id=u.id and a.day=current_date) as used_today,
              (select count(*) from devices d where d.user_id=u.id)::int as devices
       from users u ${where}
       order by u.created_at desc
       limit $${li} offset $${li + 1}`,
      params
    );
    const total = await q(`select count(*)::int as n from users u ${where}`, whereParams);
    return reply.send({ users: r.rows, page, page_size: pageSize, total: total.rows[0].n });
  });

  app.get('/users/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const user = await loadUser(req.params.id);
    if (!user) return reply.code(404).send({ error: 'user_not_found' });
    const devices = await q(
      `select id, device_name, platform, last_sync_at from devices where user_id=$1 order by last_sync_at desc nulls last`,
      [user.id]
    );
    const usage = await q(
      `select day, count from ai_usage where user_id=$1 order by day desc limit 14`,
      [user.id]
    );
    const snaps = await q(
      `select kind, rev, updated_at, pg_column_size(data)::int as bytes
       from snapshots where user_id=$1`,
      [user.id]
    );
    return reply.send({ user, devices: devices.rows, ai_usage: usage.rows, snapshots: snaps.rows });
  });

  // 明文数据：站长决策的落点。只记审计，不设额外口令 —— 能进后台就能看。
  app.get('/users/:id/data', { preHandler: requireAdmin }, async (req, reply) => {
    const user = await loadUser(req.params.id);
    if (!user) return reply.code(404).send({ error: 'user_not_found' });
    const kind = String(req.query.kind || '').trim();
    const snaps = kind
      ? await q('select kind, rev, data, updated_at from snapshots where user_id=$1 and kind=$2', [user.id, kind])
      : await q('select kind, rev, data, updated_at from snapshots where user_id=$1', [user.id]);
    await adminAudit(req.adminId, 'admin_view_user_data', req, user.id);
    return reply.send({ user_id: user.id, snapshots: snaps.rows });
  });

  // 开测试账号：随机令牌一次回显（服务端只存哈希，之后再也拿不回原文）
  app.post('/users', { preHandler: requireAdmin }, async (req, reply) => {
    const note = String(req.body?.note || '').trim().slice(0, 60);
    const token = 'test-' + crypto.randomBytes(16).toString('hex');
    const recovery = crypto.randomBytes(9).toString('base64url');
    const userId = (
      await q(
        `insert into users (token_hash, token_prefix, recovery_code, recovery_hash)
         values ($1,$2,$3,$4) returning id`,
        [hashToken(token), token.slice(0, 6), recovery, hashToken(recovery)]
      )
    ).rows[0].id;
    await adminAudit(req.adminId, 'admin_create_user', req, userId);
    return reply.send({ user_id: userId, token, recovery, note });
  });

  // 模拟登录：直接给这个用户签发一套会话令牌（体验 App / 排查问题）。
  // 令牌本身只有哈希、拿不回原文，但会话可以代签 —— 这是唯一不留后门的「进去看」方式。
  app.post('/users/:id/impersonate', { preHandler: requireAdmin }, async (req, reply) => {
    const user = await loadUser(req.params.id);
    if (!user) return reply.code(404).send({ error: 'user_not_found' });
    const deviceName = 'admin-console';
    const d = await q(
      `insert into devices (user_id, device_name, platform)
       values ($1,$2,'admin')
       on conflict (user_id, device_name) do update set last_sync_at=now()
       returning id`,
      [user.id, deviceName]
    );
    const deviceId = d.rows[0].id;
    const jti = crypto.randomUUID();
    await adminAudit(req.adminId, 'admin_impersonate', req, user.id);
    return reply.send({
      user_id: user.id,
      access: signAccessToken(user.id),
      refresh: signRefreshToken(user.id, deviceId, jti)
    });
  });

  // 限额：null/空 = 恢复用全局默认
  app.post('/users/:id/quota', { preHandler: requireAdmin }, async (req, reply) => {
    const user = await loadUser(req.params.id);
    if (!user) return reply.code(404).send({ error: 'user_not_found' });
    const daily = clampOrNull(req.body?.ai_daily_limit, 1, 100000);
    const perMin = clampOrNull(req.body?.ai_rate_per_min, 1, 1000);
    await q('update users set ai_daily_limit=$1, ai_rate_per_min=$2 where id=$3', [daily, perMin, user.id]);
    await adminAudit(req.adminId, 'admin_set_quota', req, user.id);
    return reply.send({ ok: true, ai_daily_limit: daily, ai_rate_per_min: perMin });
  });

  app.post('/users/:id/suspend', { preHandler: requireAdmin }, async (req, reply) => {
    const user = await loadUser(req.params.id);
    if (!user) return reply.code(404).send({ error: 'user_not_found' });
    const reason = String(req.body?.reason || '').trim().slice(0, 200) || '该账号已被管理员停用。';
    await q('update users set suspended=true, suspended_reason=$1 where id=$2', [reason, user.id]);
    await adminAudit(req.adminId, 'admin_suspend_user', req, user.id);
    return reply.send({ ok: true });
  });

  app.post('/users/:id/unsuspend', { preHandler: requireAdmin }, async (req, reply) => {
    const user = await loadUser(req.params.id);
    if (!user) return reply.code(404).send({ error: 'user_not_found' });
    await q('update users set suspended=false, suspended_reason=null where id=$1', [user.id]);
    await adminAudit(req.adminId, 'admin_unsuspend_user', req, user.id);
    return reply.send({ ok: true });
  });

  app.delete('/users/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const user = await loadUser(req.params.id);
    if (!user) return reply.code(404).send({ error: 'user_not_found' });
    await q('delete from users where id=$1', [user.id]); // 级联清空快照/设备/用量
    await adminAudit(req.adminId, 'admin_delete_user', req, user.id);
    return reply.send({ ok: true });
  });

  // ---------- AI 模型池 ----------

  // 一键导入推荐模板：把三家厂商 + 档位模型的骨架写进池子（幂等 upsert），
  // 站长之后只需贴 Key。已存在的厂商/模型不覆盖 Key，也不动自定义字段以外的东西。
  app.get('/ai/presets', { preHandler: requireAdmin }, async (req, reply) => {
    return reply.send({ presets: AI_PRESETS });
  });

  app.post('/ai/presets/import', { preHandler: requireAdmin }, async (req, reply) => {
    const slugs = Array.isArray(req.body?.slugs) ? req.body.slugs.map(String) : null;
    const picked = slugs ? AI_PRESETS.filter(p => slugs.includes(p.slug)) : AI_PRESETS;
    if (!picked.length) return reply.code(400).send({ error: 'no_preset_matched' });

    let providers = 0;
    let models = 0;
    for (const p of picked) {
      const pr = await q(
        `insert into ai_providers (slug, name, protocol, base_url, enabled, note)
         values ($1,$2,$3,$4,true,$5)
         on conflict (slug) do update set
           name=excluded.name, protocol=excluded.protocol,
           base_url=excluded.base_url, note=excluded.note
         returning id`,
        [p.slug, p.name, p.protocol, p.base_url, p.note]
      );
      providers += 1;
      const providerId = pr.rows[0].id;
      for (const m of p.models) {
        await q(
          `insert into ai_models (provider_id, model, display_name, tier, priority, enabled)
           values ($1,$2,$3,$4,$5,true)
           on conflict (provider_id, model) do update set
             display_name=excluded.display_name, tier=excluded.tier, priority=excluded.priority`,
          [providerId, m.model, m.display_name, m.tier, m.priority]
        );
        models += 1;
      }
    }
    await adminAudit(req.adminId, 'admin_import_presets', req);
    return reply.send({ ok: true, providers, models });
  });

  app.get('/ai/providers', { preHandler: requireAdmin }, async (req, reply) => {
    const r = await q(`
      select p.*,
        (select count(*) from ai_models m where m.provider_id=p.id)::int as model_count,
        (select count(*) from ai_keys k where k.provider_id=p.id and k.status='active')::int as key_count
      from ai_providers p order by p.created_at`);
    return reply.send({ providers: r.rows });
  });

  app.post('/ai/providers', { preHandler: requireAdmin }, async (req, reply) => {
    const slug = assertProvider(req.body?.slug);
    const name = String(req.body?.name || '').trim().slice(0, 60) || slug;
    const protocol = assertProtocol(req.body?.protocol);
    const baseUrl = assertBaseUrl(req.body?.base_url);
    const enabled = req.body?.enabled !== false;
    const note = String(req.body?.note || '').trim().slice(0, 200);

    const r = await q(
      `insert into ai_providers (slug, name, protocol, base_url, enabled, note)
       values ($1,$2,$3,$4,$5,$6)
       on conflict (slug) do update set
         name=excluded.name, protocol=excluded.protocol, base_url=excluded.base_url,
         enabled=excluded.enabled, note=excluded.note
       returning *`,
      [slug, name, protocol, baseUrl, enabled, note]
    );
    await adminAudit(req.adminId, 'admin_save_provider', req);
    return reply.send({ provider: r.rows[0] });
  });

  app.delete('/ai/providers/:id', { preHandler: requireAdmin }, async (req, reply) => {
    await q('delete from ai_providers where id=$1', [req.params.id]); // 级联删模型与 Key
    await adminAudit(req.adminId, 'admin_delete_provider', req);
    return reply.send({ ok: true });
  });

  app.get('/ai/models', { preHandler: requireAdmin }, async (req, reply) => {
    const r = await q(`
      select m.*, p.slug as provider_slug, p.name as provider_name
      from ai_models m join ai_providers p on p.id=m.provider_id
      order by m.tier, m.priority`);
    return reply.send({ models: r.rows });
  });

  app.post('/ai/models', { preHandler: requireAdmin }, async (req, reply) => {
    const providerId = req.body?.provider_id;
    if (!providerId) return reply.code(400).send({ error: 'provider_id_required' });
    const model = assertModel(req.body?.model);
    const tier = assertTier(req.body?.tier) || 'mid';
    const priority = clampOrNull(req.body?.priority, 0, 100000) ?? 100;
    const displayName = String(req.body?.display_name || '').trim().slice(0, 60);
    const enabled = req.body?.enabled !== false;

    const r = await q(
      `insert into ai_models (provider_id, model, display_name, tier, priority, enabled)
       values ($1,$2,$3,$4,$5,$6)
       on conflict (provider_id, model) do update set
         display_name=excluded.display_name, tier=excluded.tier,
         priority=excluded.priority, enabled=excluded.enabled
       returning *`,
      [providerId, model, displayName, tier, priority, enabled]
    );
    await adminAudit(req.adminId, 'admin_save_model', req);
    return reply.send({ model: r.rows[0] });
  });

  app.delete('/ai/models/:id', { preHandler: requireAdmin }, async (req, reply) => {
    await q('delete from ai_models where id=$1', [req.params.id]);
    await adminAudit(req.adminId, 'admin_delete_model', req);
    return reply.send({ ok: true });
  });

  // Key 列表默认掩码；?reveal=1 才回全文（审计留痕）
  app.get('/ai/keys', { preHandler: requireAdmin }, async (req, reply) => {
    const reveal = String(req.query.reveal || '') === '1';
    const r = await q(`
      select k.*, p.slug as provider_slug
      from ai_keys k join ai_providers p on p.id=k.provider_id
      order by k.created_at`);
    const keys = r.rows.map(k => ({
      id: k.id,
      provider_id: k.provider_id,
      provider_slug: k.provider_slug,
      label: k.label,
      status: k.status,
      fails: k.fails,
      hint: keyHint(k.key_plain),
      key_plain: reveal ? k.key_plain : undefined,
      last_ok_at: k.last_ok_at,
      last_fail_at: k.last_fail_at,
      created_at: k.created_at
    }));
    if (reveal) await adminAudit(req.adminId, 'admin_reveal_keys', req);
    return reply.send({ keys, revealed: reveal });
  });

  app.post('/ai/keys', { preHandler: requireAdmin }, async (req, reply) => {
    const providerId = req.body?.provider_id;
    if (!providerId) return reply.code(400).send({ error: 'provider_id_required' });
    const keyPlain = assertApiKey(req.body?.api_key);
    const label = String(req.body?.label || '').trim().slice(0, 60);
    const r = await q(
      `insert into ai_keys (provider_id, label, key_plain) values ($1,$2,$3) returning *`,
      [providerId, label, keyPlain]
    );
    await adminAudit(req.adminId, 'admin_add_key', req);
    return reply.send({ key: { ...r.rows[0], key_plain: undefined, hint: keyHint(keyPlain) } });
  });

  // 改 Key：换 Key 值 / 启停 / 重置熔断计数（全部可选）
  app.post('/ai/keys/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const cur = await q('select * from ai_keys where id=$1', [req.params.id]);
    if (!cur.rowCount) return reply.code(404).send({ error: 'key_not_found' });
    const row = cur.rows[0];
    const keyPlain = req.body?.api_key ? assertApiKey(req.body.api_key) : row.key_plain;
    const status = ['active', 'disabled', 'suspect'].includes(req.body?.status) ? req.body.status : row.status;
    const label = req.body?.label !== undefined ? String(req.body.label).trim().slice(0, 60) : row.label;
    const resetFails = req.body?.reset_fails === true;
    const r = await q(
      `update ai_keys set key_plain=$1, status=$2, label=$3,
         fails = case when $4 then 0 else fails end
       where id=$5 returning *`,
      [keyPlain, status, label, resetFails, req.params.id]
    );
    await adminAudit(req.adminId, 'admin_update_key', req);
    return reply.send({ key: { ...r.rows[0], key_plain: undefined, hint: keyHint(keyPlain) } });
  });

  app.delete('/ai/keys/:id', { preHandler: requireAdmin }, async (req, reply) => {
    await q('delete from ai_keys where id=$1', [req.params.id]);
    await adminAudit(req.adminId, 'admin_delete_key', req);
    return reply.send({ ok: true });
  });

  // 路由日志：哪次提问走了哪家哪个模型哪把 Key、结果如何（只记元信息，无提问内容）
  app.get('/ai/routing-log', { preHandler: requireAdmin }, async (req, reply) => {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const r = await q(
      `select l.id, l.tier, l.scene, l.provider_slug, l.model, l.status, l.latency_ms,
              l.chars_in, l.chars_out, l.ts, k.label as key_label
       from ai_routing_log l left join ai_keys k on k.id=l.key_id
       order by l.id desc limit $1`,
      [limit]
    );
    return reply.send({ log: r.rows });
  });

  // 一键试跑：按档位打一发真实请求，回来报告走了哪把 Key、是否可用。
  // 配完 Key 最该做的第一件事 —— 不用等用户来当小白鼠。
  app.post('/ai/test', { preHandler: requireAdmin }, async (req, reply) => {
    const tier = assertTier(req.body?.tier) || 'mid';
    const prompt = String(req.body?.prompt || '请回答：1+1=? 只回数字。').slice(0, 500);
    const messages = [{ role: 'user', content: prompt }];

    const candidates = await buildCandidates(tier);
    if (!candidates.length) return reply.code(409).send({ error: 'pool_empty' });

    const tried = [];
    for (let i = 0; i < candidates.length && i < maxAttempts(); i++) {
      const c = candidates[i];
      const started = Date.now();
      try {
        const res = await callUpstream(c, messages);
        tried.push({
          provider: c.providerSlug,
          model: c.model,
          key_hint: keyHint(c.apiKey),
          status: res.ok ? 'ok' : 'http_' + res.status,
          latency_ms: Date.now() - started
        });
        if (res.ok && res.content) {
          await markKeyResult(c.keyId, true);
          await logRouting({
            userId: null,
            tier,
            scene: 'admin_test',
            providerSlug: c.providerSlug,
            model: c.model,
            keyId: c.keyId,
            status: 'ok',
            latencyMs: Date.now() - started,
            charsIn: prompt.length,
            charsOut: res.content.length
          });
          await adminAudit(req.adminId, 'admin_ai_test', req);
          return reply.send({ ok: true, tier, provider: c.providerSlug, model: c.model, sample: res.content, tried });
        }
        await markKeyResult(c.keyId, false);
        await logRouting({
          userId: null,
          tier,
          scene: 'admin_test',
          providerSlug: c.providerSlug,
          model: c.model,
          keyId: c.keyId,
          status: res.ok ? 'upstream_empty' : classifyUpstream(res.status).status,
          latencyMs: Date.now() - started,
          charsIn: prompt.length
        });
      } catch (e) {
        tried.push({
          provider: c.providerSlug,
          model: c.model,
          key_hint: keyHint(c.apiKey),
          status: e.name === 'AbortError' ? 'timeout' : 'unreachable',
          latency_ms: Date.now() - started
        });
        await markKeyResult(c.keyId, false);
        await logRouting({
          userId: null,
          tier,
          scene: 'admin_test',
          providerSlug: c.providerSlug,
          model: c.model,
          keyId: c.keyId,
          status: 'unreachable',
          latencyMs: Date.now() - started,
          charsIn: prompt.length
        });
      }
    }
    return reply.code(502).send({ ok: false, tried, error: 'all_candidates_failed' });
  });
}

// ---------- 小工具 ----------

async function loadUser(id) {
  const r = await q(
    `select id, token_prefix, created_at, last_seen_at, suspended, suspended_reason,
            ai_daily_limit, ai_rate_per_min
     from users where id=$1`,
    [id]
  );
  return r.rows[0] || null;
}

/** 数字或 null：管理员清空该字段 = 恢复全局默认 */
function clampOrNull(v, min, max) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

/** 打一发上游试跑请求（与 routes/ai.js 的构造逻辑同构，仅用于后台自检） */
async function callUpstream(cred, messages) {
  const base = String(cred.baseUrl || '').replace(/\/+$/, '');
  const isAnthropic = cred.protocol === 'anthropic';
  const url = base + (isAnthropic ? '/messages' : '/chat/completions');
  const headers = isAnthropic
    ? {
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': cred.apiKey
      }
    : { 'content-type': 'application/json', authorization: 'Bearer ' + cred.apiKey };
  const body = isAnthropic
    ? JSON.stringify({ model: cred.model, messages, max_tokens: 32, stream: false })
    : JSON.stringify({ model: cred.model, messages, max_tokens: 32, stream: false });

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 30_000);
  try {
    const res = await fetch(url, { method: 'POST', headers, body, signal: ac.signal });
    if (!res.ok) return { ok: false, status: res.status, content: '' };
    const data = await res.json();
    const content = isAnthropic
      ? (data.content?.[0]?.text || '')
      : (data.choices?.[0]?.message?.content || '');
    return { ok: true, status: 200, content };
  } finally {
    clearTimeout(timer);
  }
}

// 管理员审计：与用户审计同一张表，user_id 记「动作作用对象」，动作名带 admin_ 前缀可区分
async function adminAudit(adminId, action, req, targetUserId = null) {
  q(
    `insert into audit_log (user_id, action, ip, ua) values ($1,$2,$3,$4)`,
    [targetUserId || adminId, action, req.ip, String(req.headers['user-agent'] || '').slice(0, 200)]
  ).catch(() => {});
}
