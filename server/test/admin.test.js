// 管理员后台测试：登录/鉴权隔离/账号管理/明文数据/限额/封禁/模拟登录/AI 池管理
// 独立文件（node --test 每文件一进程）。
// 运行：DATABASE_URL=... npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import pg from 'pg';

const PORT = 18790;
const BASE = 'http://127.0.0.1:' + PORT;
const DB = process.env.DATABASE_URL || 'postgres://xuanjue:xuanjue@127.0.0.1:5432/xuanjue_test';

let app = null;
const pool = new pg.Pool({ connectionString: DB });

const ADMIN_USER = 'boss';
const ADMIN_PASS = 'super-secret-2026';

let ADMIN_TOKEN = null;

before(async () => {
  const client = await pool.connect();
  try {
    await client.query({
      text: fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'),
      simple: true
    });
    await client.query(
      'truncate users, devices, snapshots, ops, audit_log, ai_proxy_config, ai_usage, admins, ai_providers, ai_models, ai_keys, ai_routing_log restart identity cascade'
    );
  } finally {
    client.release();
  }

  process.env.DATABASE_URL = DB;
  process.env.JWT_SECRET = 'test-secret-admin-' + Date.now();
  process.env.PORT = String(PORT);
  process.env.LOG_LEVEL = 'fatal';
  process.env.ALLOW_SIGNUP = 'true';
  process.env.CORS_ORIGINS = '*';
  process.env.AI_PROXY_ENABLED = 'true';
  process.env.AI_DAILY_LIMIT = '10';
  process.env.AI_RATE_PER_MINUTE = '100';

  const { build } = await import('../index.js');
  app = await build();
  await app.listen({ port: PORT, host: '127.0.0.1' });

  // 用官方脚本建管理员（顺带验证脚本本身）
  const { hashPassword } = await import('../lib/adminauth.js');
  const { salt, hash } = await hashPassword(ADMIN_PASS);
  await pool.query(
    `insert into admins (username, pwd_hash, pwd_salt, name, is_superadmin) values ($1,$2,$3,'站长',true)`,
    [ADMIN_USER, hash, salt]
  );
});

after(async () => {
  await app?.close();
  await pool.end();
});

async function api(path, opts = {}) {
  const r = await fetch(BASE + path, {
    method: opts.method || 'GET',
    headers: {
      'content-type': 'application/json',
      ...(opts.token ? { authorization: 'Bearer ' + opts.token } : {})
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const text = await r.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  return { status: r.status, body: json };
}

// ---------- 用例 ----------

test('管理员登录：密码错 401，密码对发 admin token', async () => {
  const bad = await api('/v1/admin/auth/login', {
    method: 'POST',
    body: { username: ADMIN_USER, password: 'wrong-password-x' }
  });
  assert.equal(bad.status, 401);
  assert.equal(bad.body.error, 'bad_credentials');

  const ok = await api('/v1/admin/auth/login', {
    method: 'POST',
    body: { username: ADMIN_USER, password: ADMIN_PASS }
  });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.ok(ok.body.token, '应返回管理员 token');
  ADMIN_TOKEN = ok.body.token;

  const me = await api('/v1/admin/auth/me', { token: ADMIN_TOKEN });
  assert.equal(me.status, 200);
  assert.equal(me.body.admin.username, ADMIN_USER);
});

test('鉴权隔离：用户 access token 进不了后台，admin token 也进不了用户接口', async () => {
  // 普通用户
  const reg = await api('/v1/auth/register', {
    method: 'POST',
    body: { token: 'plain-user-' + Date.now(), recovery: 'plain-recovery-2026', deviceName: 'dev' }
  });
  assert.equal(reg.status, 200);
  const userToken = reg.body.access;

  // 用户 token 打后台 → 401
  const a = await api('/v1/admin/users', { token: userToken });
  assert.equal(a.status, 401);

  // admin token 打用户接口 → 401（typ 不同互不放行）
  const b = await api('/v1/me', { token: ADMIN_TOKEN });
  assert.equal(b.status, 401);

  // 无 token → 401
  const c = await api('/v1/admin/users');
  assert.equal(c.status, 401);
});

test('账号管理：列表/搜索/详情/开测试账号', async () => {
  const list = await api('/v1/admin/users', { token: ADMIN_TOKEN });
  assert.equal(list.status, 200);
  assert.ok(list.body.total >= 1);
  assert.ok(list.body.users[0].token_prefix);

  // 开测试账号：令牌只回显一次
  const created = await api('/v1/admin/users', {
    method: 'POST',
    token: ADMIN_TOKEN,
    body: { note: '测试用' }
  });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  assert.ok(created.body.token.length >= 16);
  assert.ok(created.body.recovery.length >= 8);

  // 新账号能登录（令牌真实可用）
  const unlock = await api('/v1/auth/unlock', {
    method: 'POST',
    body: { token: created.body.token, deviceName: 'test-dev' }
  });
  assert.equal(unlock.status, 200, JSON.stringify(unlock.body));

  // 搜索能按前缀找到它
  const q = await api('/v1/admin/users?query=' + created.body.token.slice(0, 6), { token: ADMIN_TOKEN });
  assert.equal(q.status, 200);
  assert.ok(q.body.users.some(u => u.id === created.body.user_id), '前缀搜索应命中新账号');

  const detail = await api('/v1/admin/users/' + created.body.user_id, { token: ADMIN_TOKEN });
  assert.equal(detail.status, 200);
  assert.ok(Array.isArray(detail.body.devices));
  assert.ok(detail.body.devices.length >= 1);
});

test('明文数据：管理员能看用户快照内容', async () => {
  // 用户上传一份数据
  const reg = await api('/v1/auth/register', {
    method: 'POST',
    body: { token: 'dataview-' + Date.now(), recovery: 'dataview-recovery', deviceName: 'dev' }
  });
  const userToken = reg.body.access;
  const userId = reg.body.userId;
  const secretContent = '案例内容-仅供管理员查看测试';

  const put = await api('/v1/sync/cases', {
    method: 'PUT',
    token: userToken,
    body: { base_rev: 0, data: { items: [{ title: '测试案例', note: secretContent }] } }
  });
  assert.equal(put.status, 200, JSON.stringify(put.body));

  const view = await api('/v1/admin/users/' + userId + '/data', { token: ADMIN_TOKEN });
  assert.equal(view.status, 200);
  const cases = view.body.snapshots.find(s => s.kind === 'cases');
  assert.ok(cases, '应能读到 cases 快照');
  assert.ok(JSON.stringify(cases.data).includes(secretContent), '明文内容应完整可见');
});

test('限额：按用户覆盖，chat 端真实生效', async () => {
  const reg = await api('/v1/auth/register', {
    method: 'POST',
    body: { token: 'quota-user-' + Date.now(), recovery: 'quota-recovery-x', deviceName: 'dev' }
  });
  const userToken = reg.body.access;
  const userId = reg.body.userId;

  // 默认全局 10
  const q0 = await api('/v1/ai/quota', { token: userToken });
  assert.equal(q0.body.daily_limit, 10);

  // 管理员压到 1
  const set = await api('/v1/admin/users/' + userId + '/quota', {
    method: 'POST',
    token: ADMIN_TOKEN,
    body: { ai_daily_limit: 1, ai_rate_per_min: 30 }
  });
  assert.equal(set.status, 200);

  const q1 = await api('/v1/ai/quota', { token: userToken });
  assert.equal(q1.body.daily_limit, 1);
  assert.equal(q1.body.rate_per_minute, 30);

  // 清空覆盖 = 回到全局默认
  const clear = await api('/v1/admin/users/' + userId + '/quota', {
    method: 'POST',
    token: ADMIN_TOKEN,
    body: { ai_daily_limit: null, ai_rate_per_min: null }
  });
  assert.equal(clear.status, 200);
  const q2 = await api('/v1/ai/quota', { token: userToken });
  assert.equal(q2.body.daily_limit, 10);
});

test('封禁：被封账号登录被拒且告知原因，解封后恢复', async () => {
  const token = 'suspend-me-' + Date.now();
  const reg = await api('/v1/auth/register', {
    method: 'POST',
    body: { token, recovery: 'suspend-recovery', deviceName: 'dev' }
  });
  assert.equal(reg.status, 200);
  const userId = reg.body.userId;

  // 封禁
  const sus = await api('/v1/admin/users/' + userId + '/suspend', {
    method: 'POST',
    token: ADMIN_TOKEN,
    body: { reason: '测试封禁原因' }
  });
  assert.equal(sus.status, 200);

  // 已登录会话刷新即被切断
  const refreshed = await api('/v1/auth/refresh', {
    method: 'POST',
    body: { refresh: reg.body.refresh }
  });
  assert.equal(refreshed.status, 403);
  assert.equal(refreshed.body.error, 'account_suspended');

  // 重新登录被拒，且明确告知原因（不是静默失败）
  const unlock = await api('/v1/auth/unlock', {
    method: 'POST',
    body: { token, deviceName: 'dev' }
  });
  assert.equal(unlock.status, 403);
  assert.equal(unlock.body.error, 'account_suspended');
  assert.equal(unlock.body.reason, '测试封禁原因');

  // 解封后恢复
  await api('/v1/admin/users/' + userId + '/unsuspend', { method: 'POST', token: ADMIN_TOKEN });
  const unlock2 = await api('/v1/auth/unlock', {
    method: 'POST',
    body: { token, deviceName: 'dev' }
  });
  assert.equal(unlock2.status, 200, JSON.stringify(unlock2.body));
});

test('模拟登录：管理员拿到的用户会话真实可用', async () => {
  const created = await api('/v1/admin/users', {
    method: 'POST',
    token: ADMIN_TOKEN,
    body: { note: 'impersonate-target' }
  });
  const userId = created.body.user_id;

  const imp = await api('/v1/admin/users/' + userId + '/impersonate', {
    method: 'POST',
    token: ADMIN_TOKEN
  });
  assert.equal(imp.status, 200, JSON.stringify(imp.body));
  assert.ok(imp.body.access);
  assert.ok(imp.body.refresh);

  // 拿模拟会话读该用户的接口 —— 应当畅通
  const me = await api('/v1/me', { token: imp.body.access });
  assert.equal(me.status, 200);
  assert.equal(me.body.user.id, userId);

  // 甚至能替用户写数据（体验全部功能）
  const put = await api('/v1/sync/profile', {
    method: 'PUT',
    token: imp.body.access,
    body: { base_rev: 0, data: { name: '模拟登录写入' } }
  });
  assert.equal(put.status, 200, JSON.stringify(put.body));
});

test('AI 池管理：厂商/模型/Key 增删改查，Key 默认掩码', async () => {
  // 厂商
  const p = await api('/v1/admin/ai/providers', {
    method: 'POST',
    token: ADMIN_TOKEN,
    body: {
      slug: 'modelscope',
      name: '魔搭社区',
      protocol: 'openai',
      base_url: 'https://api-inference.modelscope.cn/v1'
    }
  });
  assert.equal(p.status, 200, JSON.stringify(p.body));
  const providerId = p.body.provider.id;

  // 模型（easy/mid/hard 三档）
  for (const [model, tier, priority] of [
    ['Qwen/Qwen3-4B', 'easy', 10],
    ['Qwen/Qwen3-30B', 'mid', 10],
    ['Qwen/Qwen3-235B', 'hard', 10]
  ]) {
    const m = await api('/v1/admin/ai/models', {
      method: 'POST',
      token: ADMIN_TOKEN,
      body: { provider_id: providerId, model, tier, priority }
    });
    assert.equal(m.status, 200, JSON.stringify(m.body));
  }

  // Key
  const k = await api('/v1/admin/ai/keys', {
    method: 'POST',
    token: ADMIN_TOKEN,
    body: { provider_id: providerId, label: '魔搭主Key', api_key: 'sk-modelscope-test-1234' }
  });
  assert.equal(k.status, 200, JSON.stringify(k.body));
  assert.equal(k.body.key.hint, '****1234');
  assert.equal(k.body.key.key_plain, undefined, '创建响应不得回显全文');

  // 列表默认掩码
  const keys = await api('/v1/admin/ai/keys', { token: ADMIN_TOKEN });
  assert.equal(keys.status, 200);
  assert.ok(keys.body.keys.every(x => x.key_plain === undefined), '默认列表不得含 Key 明文');
  assert.ok(!JSON.stringify(keys.body).includes('sk-modelscope-test-1234'));

  // reveal=1 才给全文
  const revealed = await api('/v1/admin/ai/keys?reveal=1', { token: ADMIN_TOKEN });
  assert.equal(revealed.body.revealed, true);
  assert.ok(revealed.body.keys.some(x => x.key_plain === 'sk-modelscope-test-1234'));

  // 改 Key：停用 + 重置熔断计数
  const kid = k.body.key.id;
  const upd = await api('/v1/admin/ai/keys/' + kid, {
    method: 'POST',
    token: ADMIN_TOKEN,
    body: { status: 'disabled', reset_fails: true }
  });
  assert.equal(upd.status, 200);
  assert.equal(upd.body.key.status, 'disabled');

  // 删除
  const del = await api('/v1/admin/ai/keys/' + kid, { method: 'DELETE', token: ADMIN_TOKEN });
  assert.equal(del.status, 200);
});

test('AI 试跑：池子为空 409，配好后试跑成功并留路由日志', async () => {
  // 先清空池子确认 409
  await pool.query('truncate ai_providers, ai_models, ai_keys restart identity cascade');
  const empty = await api('/v1/admin/ai/test', { method: 'POST', token: ADMIN_TOKEN, body: {} });
  assert.equal(empty.status, 409);
  assert.equal(empty.body.error, 'pool_empty');

  // 重新配一套，打桩上游试跑
  const p = await api('/v1/admin/ai/providers', {
    method: 'POST',
    token: ADMIN_TOKEN,
    body: { slug: 'mock', name: '测试厂', protocol: 'openai', base_url: 'https://mock-admin.test/v1' }
  });
  await api('/v1/admin/ai/models', {
    method: 'POST',
    token: ADMIN_TOKEN,
    body: { provider_id: p.body.provider.id, model: 'mock-mid', tier: 'mid', priority: 10 }
  });
  await api('/v1/admin/ai/keys', {
    method: 'POST',
    token: ADMIN_TOKEN,
    body: { provider_id: p.body.provider.id, api_key: 'sk-mock-admin-9999' }
  });

  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    const u = String(url && url.url ? url.url : url);
    if (u.startsWith('https://mock-admin.test/')) {
      const text = JSON.stringify({ choices: [{ message: { content: '4' } }] });
      return {
        ok: true,
        status: 200,
        headers: { get: () => '10' },
        text: async () => text,
        json: async () => JSON.parse(text)
      };
    }
    return realFetch(url, opts);
  };
  try {
    const t = await api('/v1/admin/ai/test', {
      method: 'POST',
      token: ADMIN_TOKEN,
      body: { tier: 'mid', prompt: '1+1=?' }
    });
    assert.equal(t.status, 200, JSON.stringify(t.body));
    assert.equal(t.body.ok, true);
    assert.equal(t.body.provider, 'mock');
    assert.equal(t.body.sample, '4');
  } finally {
    globalThis.fetch = realFetch;
  }

  // 路由日志可查
  const log = await api('/v1/admin/ai/routing-log', { token: ADMIN_TOKEN });
  assert.equal(log.status, 200);
  assert.ok(log.body.log.length >= 1);
  assert.equal(log.body.log[0].status, 'ok');
});

test('AI 池导入预置模板：一次建好三家厂商与三档模型，且幂等', async () => {
  await pool.query('truncate ai_providers, ai_models, ai_keys restart identity cascade');

  const first = await api('/v1/admin/ai/presets/import', { method: 'POST', token: ADMIN_TOKEN, body: {} });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.providers, 3, '预置三家厂商');
  assert.ok(first.body.models >= 6, '每家至少两档模型');

  const list = await api('/v1/admin/ai/providers', { token: ADMIN_TOKEN });
  const slugs = list.body.providers.map(p => p.slug).sort();
  assert.deepEqual(slugs, ['internlm', 'modelscope', 'stepfun']);

  // 每家都配齐 easy/mid/hard 覆盖（书生可缺 mid，由路由器兜底，但 hard/easy 必须有）
  const models = await api('/v1/admin/ai/models', { token: ADMIN_TOKEN });
  for (const slug of ['modelscope', 'stepfun', 'internlm']) {
    const tiers = new Set(models.body.models.filter(m => m.provider_slug === slug).map(m => m.tier));
    assert.ok(tiers.has('easy') && tiers.has('hard'), `${slug} 应有 easy 与 hard 档`);
  }

  // 幂等：再导一次不重复建
  const again = await api('/v1/admin/ai/presets/import', { method: 'POST', token: ADMIN_TOKEN, body: {} });
  assert.equal(again.status, 200);
  const after = await api('/v1/admin/ai/providers', { token: ADMIN_TOKEN });
  assert.equal(after.body.providers.length, 3, '重复导入不新增厂商');
});

test('设备平台：从 deviceName 前缀推导，不再记 unknown', async () => {
  const reg = await api('/v1/auth/register', {
    method: 'POST',
    body: {
      token: 'platform-' + Date.now(),
      recovery: 'platform-recovery-2026',
      deviceName: 'android-x9y8z7'
    }
  });
  assert.equal(reg.status, 200);

  const rows = await pool.query(
    'select platform from devices where device_name=$1',
    ['android-x9y8z7']
  );
  assert.equal(rows.rows[0].platform, 'android', 'platform 应取自 deviceName 前缀');

  // 无前缀的旧式设备名回退到 x-platform 头，再退到 unknown
  const reg2 = await api('/v1/auth/register', {
    method: 'POST',
    body: { token: 'platform2-' + Date.now(), recovery: 'platform-recovery-2026', deviceName: 'plainname' }
  });
  assert.equal(reg2.status, 200);
  const rows2 = await pool.query('select platform from devices where device_name=$1', ['plainname']);
  assert.equal(rows2.rows[0].platform, 'plainname', '无连字符时整段当平台名');
});

test('删除账号：级联清空数据', async () => {
  const created = await api('/v1/admin/users', {
    method: 'POST',
    token: ADMIN_TOKEN,
    body: { note: 'to-delete' }
  });
  const userId = created.body.user_id;

  const del = await api('/v1/admin/users/' + userId, { method: 'DELETE', token: ADMIN_TOKEN });
  assert.equal(del.status, 200);

  const gone = await api('/v1/admin/users/' + userId, { token: ADMIN_TOKEN });
  assert.equal(gone.status, 404);

  const rows = await pool.query('select count(*)::int as n from devices where user_id=$1', [userId]);
  assert.equal(rows.rows[0].n, 0, '级联删除设备');
});

test('总览：统计接口回数字', async () => {
  const s = await api('/v1/admin/stats', { token: ADMIN_TOKEN });
  assert.equal(s.status, 200);
  assert.ok(typeof s.body.users.total === 'number');
  assert.ok(typeof s.body.ai_calls.last_24h === 'number');
  assert.ok(typeof s.body.pool.providers === 'number');
});
