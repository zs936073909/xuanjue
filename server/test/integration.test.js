// 后端集成测试：真实起 PostgreSQL + 真实 HTTP
// 覆盖令牌注册/解锁/找回/同步/冲突/限速/注销
// 运行：DATABASE_URL=... npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import pg from 'pg';
import crypto from 'node:crypto';

const BASE = 'http://127.0.0.1:18787';
const DB = process.env.DATABASE_URL || 'postgres://xuanjue:xuanjue@127.0.0.1:5432/xuanjue_test';

let app;
const pool = new pg.Pool({ connectionString: DB });

const TOKEN = 'xuanjue-demo-2026-tk7k9m2p';
const RECOVERY = 'recovery-pass-2026';
// 前缀故意与 TOKEN 不同（6 位前缀极易撞车，见「找回：同前缀多账号」用例）
const TOKEN2 = 'otherusr-2026-z4w8q1r6';

// AI 云代理开关：默认 false。测试里显式打开（需要先于 index.js 导入）。
// 每日限次设成 3，方便用少量请求验证「打满后 429」。
const AI_MASTER = Buffer.alloc(32, 7).toString('base64');
// 站长内置 Key 测试常量：env 格式 protocol://key@base-url/model
const SITE_TEST_KEY = 'sk-site-master-key-1234';
const SITE_SPEC = 'openai://' + SITE_TEST_KEY + '@https://mock-ai.test/v1/mock-model';

before(async () => {
  // 重建 schema（测试库），保证幂等。
  // 用 simple query 执行整段 SQL（含 DO 块与 ALTER，不能走参数化协议）。
  const client = await pool.connect();
  try {
    // simple query 协议：整段 SQL 一次交给服务端解析（DO 块 / 多条 DDL 均可）
    await client.query({ text: fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'), simple: true });
    await client.query('truncate users, devices, snapshots, ops, audit_log, ai_proxy_config, ai_usage, admins, ai_providers, ai_models, ai_keys, ai_routing_log restart identity cascade');
  } finally {
    client.release();
  }
  process.env.DATABASE_URL = DB;
  process.env.JWT_SECRET = 'test-secret-' + Date.now();
  process.env.PORT = '18787';
  process.env.LOG_LEVEL = 'fatal';
  process.env.ALLOW_SIGNUP = 'true';
  process.env.CORS_ORIGINS = '*';
  process.env.AI_PROXY_ENABLED = 'true';
  process.env.AI_KEY_MASTER = AI_MASTER;
  process.env.AI_DAILY_LIMIT = '3';
  process.env.AI_RATE_PER_MINUTE = '100';
  const { build } = await import('../index.js');
  app = await build();
  await app.listen({ port: 18787, host: '127.0.0.1' });
});

after(async () => {
  await app?.close();
  await pool.end();
});

async function api(path, opts = {}) {
  const url = new URL(BASE + path);
  if (opts.query) for (const [k, v] of Object.entries(opts.query)) url.searchParams.set(k, v);
  const r = await fetch(url, {
    method: opts.method || 'GET',
    headers: {
      'content-type': 'application/json',
      ...(opts.token ? { authorization: 'Bearer ' + opts.token } : {}),
      ...(opts.headers || {})
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const text = await r.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  return { status: r.status, body: json };
}

async function unlock(tok = TOKEN) {
  const r = await api('/v1/auth/unlock', {
    method: 'POST',
    body: { token: tok, deviceName: 'test-device' }
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.access;
}

// 按令牌哈希查库拿到 userId（测试断言用）。
// 注意：不能按 token_prefix 查 —— 6 位前缀人手选的令牌极易撞车，那正是「找回」要处理的场景。
async function userIdOf(tok = TOKEN) {
  const r = await pool.query('select id from users where token_hash=$1', [tokenHash(tok)]);
  assert.equal(r.rowCount, 1, '令牌应唯一对应用户');
  return r.rows[0].id;
}

function tokenHash(tok) {
  return crypto.createHash('sha256').update(String(tok), 'utf8').digest('hex');
}

// ---------- 账号 ----------

test('health', async () => {
  const r = await api('/health');
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
});

test('令牌注册：成功，返回恢复口令', async () => {
  const r = await api('/v1/auth/register', {
    method: 'POST',
    body: { token: TOKEN, recovery: RECOVERY, deviceName: 'test-device' }
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.access);
  assert.ok(r.body.refresh);
  assert.equal(r.body.recovery_code, RECOVERY);
  // 服务端绝不返回令牌明文或哈希
  const row = await pool.query('select token_hash, token_prefix from users where id=$1', [r.body.userId]);
  assert.equal(row.rows[0].token_prefix, TOKEN.slice(0, 6));
  assert.ok(!row.rows[0].token_hash.includes('xuanjue'), 'token_hash 不得包含令牌明文片段');
});

test('令牌注册：非法令牌与短恢复口令被拒', async () => {
  const bads = [
    { token: 'short', recovery: RECOVERY },
    { token: 'has space and more chars ok', recovery: RECOVERY },
    { token: '中文中文中文中文中文中文', recovery: RECOVERY },
    { token: TOKEN, recovery: 'short' },
    { token: TOKEN, recovery: '' }
  ];
  for (const body of bads) {
    const r = await api('/v1/auth/register', { method: 'POST', body });
    assert.equal(r.status, 400, JSON.stringify({ body, res: r.body }));
  }
});

test('令牌重复：409 token_taken', async () => {
  const r = await api('/v1/auth/register', {
    method: 'POST',
    body: { token: TOKEN, recovery: RECOVERY, deviceName: 'another' }
  });
  assert.equal(r.status, 409);
  assert.equal(r.body.error, 'token_taken');
});

test('解锁：错误令牌 401 且不泄露存在性', async () => {
  const r = await api('/v1/auth/unlock', {
    method: 'POST',
    body: { token: 'nope-nope-nope-nope', deviceName: 'test-device' }
  });
  assert.equal(r.status, 401);
  assert.equal(r.body.error, 'bad_token');
});

test('解锁：成功后 refresh 可轮换，旧 refresh 作废', async () => {
  const r = await api('/v1/auth/unlock', { method: 'POST', body: { token: TOKEN, deviceName: 'test-device' } });
  assert.equal(r.status, 200);
  const r2 = await api('/v1/auth/refresh', { method: 'POST', body: { refresh: r.body.refresh } });
  assert.equal(r2.status, 200);
  const r3 = await api('/v1/auth/refresh', { method: 'POST', body: { refresh: r.body.refresh } });
  assert.equal(r3.status, 401);
});

test('找回：前缀 + 恢复口令正确 → 换发令牌', async () => {
  const r = await api('/v1/auth/recover', {
    method: 'POST',
    body: { prefix: TOKEN.slice(0, 6), recovery: RECOVERY, deviceName: 'recovered-device' }
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.access);
  const me = await api('/v1/me', { token: r.body.access });
  assert.equal(me.status, 200);
});

test('找回：恢复口令错误 401，前缀不存在 404', async () => {
  const bad = await api('/v1/auth/recover', {
    method: 'POST',
    body: { prefix: TOKEN.slice(0, 6), recovery: 'wrong-recovery' }
  });
  assert.equal(bad.status, 401);
  assert.equal(bad.body.error, 'bad_recovery');
  const nf = await api('/v1/auth/recover', {
    method: 'POST',
    body: { prefix: 'zzzzzz', recovery: RECOVERY }
  });
  assert.equal(nf.status, 404);
  assert.equal(nf.body.error, 'account_not_found');
});

test('找回：同前缀多账号，只认自己那条', async () => {
  // 令牌前缀相同（前 6 位都是 "xuanju"），但恢复口令不同：
  // 服务端必须逐条比对恢复口令，既不许串号，也不许因「多条候选」误报 ambiguous
  const twin = await api('/v1/auth/register', {
    method: 'POST',
    body: { token: 'xuanjue-twin-2026-9p3k7w', recovery: 'twin-recovery-77', deviceName: 'twin-device' }
  });
  assert.equal(twin.status, 200, JSON.stringify(twin.body));

  const mainId = await userIdOf(TOKEN);

  // 用「别人」的恢复口令：能登进去，但登进去的必须是那个人自己的号
  const other = await api('/v1/auth/recover', {
    method: 'POST',
    body: { prefix: TOKEN.slice(0, 6), recovery: 'twin-recovery-77' }
  });
  assert.equal(other.status, 200, JSON.stringify(other.body));
  assert.equal(other.body.userId, twin.body.userId, '不得串到别的账号');
  assert.notEqual(other.body.userId, mainId, '不得串到别的账号');

  // 自己的恢复口令：必须登回自己
  const ok = await api('/v1/auth/recover', {
    method: 'POST',
    body: { prefix: TOKEN.slice(0, 6), recovery: RECOVERY }
  });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.userId, mainId, '必须找回的是令牌主人');
  await pool.query('delete from users where id=$1', [twin.body.userId]);
});

test('重置恢复口令：旧口令失效，新口令生效', async () => {
  const NEW = 'brand-new-recovery-9';
  const r = await api('/v1/auth/reset-recovery', {
    method: 'POST',
    body: { token: TOKEN, recovery: NEW }
  });
  assert.equal(r.status, 200);
  const old = await api('/v1/auth/recover', {
    method: 'POST',
    body: { prefix: TOKEN.slice(0, 6), recovery: RECOVERY }
  });
  assert.equal(old.status, 401);
  const ok = await api('/v1/auth/recover', {
    method: 'POST',
    body: { prefix: TOKEN.slice(0, 6), recovery: NEW }
  });
  assert.equal(ok.status, 200);
  // 复位，供后续用例使用
  await api('/v1/auth/reset-recovery', { method: 'POST', body: { token: TOKEN, recovery: RECOVERY } });
});

test('me：账号信息与设备列表，不回传令牌哈希', async () => {
  const r = await api('/v1/me', { token: await unlock() });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.token_prefix, TOKEN.slice(0, 6));
  assert.ok(Array.isArray(r.body.devices));
  assert.ok(!('token_hash' in r.body.user), '不得返回令牌哈希');
  assert.ok(!('token_prefix' in r.body.user) === false);
});

// ---------- 同步 ----------

test('同步：无 token 401', async () => {
  const r = await api('/v1/sync');
  assert.equal(r.status, 401);
});

test('同步：上传/拉取/乐观并发冲突', async () => {
  const token = await unlock();

  const g0 = await api('/v1/sync', { token });
  assert.equal(g0.status, 200);
  assert.equal(g0.body.snapshots.length, 4);
  const cases = g0.body.snapshots.find(s => s.kind === 'cases');
  assert.equal(cases.rev, 0);

  const payload = [{ id: 'C1', title: '测试案例' }];
  const p1 = await api('/v1/sync/cases', {
    method: 'PUT',
    token,
    query: { device: 'test-device' },
    body: { data: payload, base_rev: 0 }
  });
  assert.equal(p1.status, 200, JSON.stringify(p1.body));
  assert.equal(p1.body.rev, 1);

  const p2 = await api('/v1/sync/cases', {
    method: 'PUT',
    token,
    body: { data: payload, base_rev: 0 }
  });
  assert.equal(p2.status, 409);
  assert.equal(p2.body.server_rev, 1);

  const g1 = await api('/v1/sync', { token });
  const back = g1.body.snapshots.find(s => s.kind === 'cases');
  assert.equal(back.rev, 1);
  assert.deepEqual(back.data, [{ id: 'C1', title: '测试案例' }]);
  assert.ok(g1.body.ops.some(o => o.kind === 'cases'));
});

test('同步：非法 kind 与超大 payload 被拒', async () => {
  const token = await unlock();
  const bad = await api('/v1/sync/nope', { method: 'PUT', token, body: { data: [1], base_rev: 0 } });
  assert.equal(bad.status, 400);
  const big = await api('/v1/sync/cases', {
    method: 'PUT',
    token,
    body: { data: { blob: 'x'.repeat(5 * 1024 * 1024) }, base_rev: 99 }
  });
  assert.equal(big.status, 400);
});

test('同步：删除某类数据', async () => {
  const token = await unlock();
  const r = await api('/v1/sync/chats', { method: 'DELETE', token });
  assert.equal(r.status, 200);
  const g = await api('/v1/sync', { token });
  assert.equal(g.body.snapshots.find(s => s.kind === 'chats').rev, 0);
});

test('数据隔离：另一账号看不到别人的快照', async () => {
  const other = await api('/v1/auth/register', {
    method: 'POST',
    body: { token: TOKEN2, recovery: 'other-recovery-1', deviceName: 'other-device' }
  });
  assert.equal(other.status, 200);
  const g = await api('/v1/sync', { token: other.body.access });
  assert.equal(g.status, 200);
  for (const s of g.body.snapshots) assert.equal(s.rev, 0, '新账号不应看到任何他人快照');
});

test('登出后 refresh 失效', async () => {
  const login = await api('/v1/auth/unlock', { method: 'POST', body: { token: TOKEN, deviceName: 'test-device' } });
  await api('/v1/auth/logout', { method: 'POST', body: { refresh: login.body.refresh } });
  const r = await api('/v1/auth/refresh', { method: 'POST', body: { refresh: login.body.refresh } });
  assert.equal(r.status, 401);
});

test('注销：级联清空云端数据', async () => {
  // 用一个干净的令牌，避免受其他用例遗留数据影响
  const TOK = 'delete-me-2026-token-88';
  const reg = await api('/v1/auth/register', {
    method: 'POST',
    body: { token: TOK, recovery: 'delete-recovery-1', deviceName: 'del-device' }
  });
  assert.equal(reg.status, 200, JSON.stringify(reg.body));
  const del = await api('/v1/me', { method: 'DELETE', token: reg.body.access });
  assert.equal(del.status, 200, JSON.stringify(del.body));

  const row = await pool.query('select 1 from users where token_hash=$1', [tokenHash(TOK)]);
  assert.equal(row.rowCount, 0, '注销后用户必须物理删除');
  const snaps = await pool.query('select 1 from snapshots where user_id=$1', [reg.body.userId]);
  assert.equal(snaps.rowCount, 0, '快照必须级联删除');
  const devs = await pool.query('select 1 from devices where user_id=$1', [reg.body.userId]);
  assert.equal(devs.rowCount, 0, '设备必须级联删除');
});

// ---------- AI 云代理 ----------
// 覆盖四件事：Key 加密落库 / 接口不泄露 Key / 每日限次 / 每分钟限流。
// 上游请求用 node:test 的 mock fetch 打桩，不在测试里真调厂商。

const AI_TEST_KEY = 'sk-test-abcdef1234567890';
const AI_BASE = 'https://mock-ai.test/v1';

// 每个用例用独立账号：当日额度是全账号共享的，共用 TOKEN 会出现
// 「前面的用例把额度用光，后面的用例莫名 429」的假失败。
let AI_SEQ = 0;
async function freshAiToken() {
  const r = await api('/v1/auth/register', {
    method: 'POST',
    body: {
      token: 'ai-' + (++AI_SEQ) + '-2026-token-' + Math.random().toString(36).slice(2, 8),
      recovery: 'ai-recovery-' + AI_SEQ + '-2026',
      deviceName: 'ai-dev-' + AI_SEQ
    }
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.access;
}

async function saveAIConfig(token, over = {}) {
  const r = await api('/v1/ai/config', {
    method: 'POST',
    token,
    body: {
      provider: 'custom',
      protocol: 'openai',
      base_url: AI_BASE,
      model: 'mock-model',
      api_key: AI_TEST_KEY,
      ...over
    }
  });
  return r;
}

test('AI 配置：保存后密文落库，接口不返回 Key 明文与密文', async () => {
  const token = await unlock();
  const r = await saveAIConfig(token);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.hint, '****7890');
  assert.equal(r.body.daily_limit, 3);

  // 明文不出现在任何响应里（body 全文检索）
  const raw = JSON.stringify(r);
  assert.ok(!raw.includes(AI_TEST_KEY), '保存响应不得包含 Key 明文');

  const row = await pool.query(
    'select key_cipher, key_nonce, key_tag, base_url, model, protocol from ai_proxy_config where user_id=$1',
    [await userIdOf()]
  );
  assert.equal(row.rowCount, 1);
  // 密文、nonce、tag 长度符合 AES-256-GCM
  assert.equal(row.rows[0].key_cipher.length, Buffer.byteLength(AI_TEST_KEY));
  assert.equal(row.rows[0].key_nonce.length, 12);
  assert.equal(row.rows[0].key_tag.length, 16);
  // 密文不得含明文片段（防"看着像加密其实存了原文"）
  assert.ok(!row.rows[0].key_cipher.toString('latin1').includes(AI_TEST_KEY), '密文不得含 Key 明文片段');

  const g = await api('/v1/ai/config', { token });
  assert.equal(g.status, 200);
  assert.equal(g.body.configured, true);
  assert.equal(g.body.model, 'mock-model');
  assert.ok(!JSON.stringify(g.body).includes(AI_TEST_KEY), '读取响应不得包含 Key');
  assert.ok(!JSON.stringify(g.body).includes('key_cipher'), '读取响应不得包含密文字段');
});

test('AI 配置：非法输入被拒（Key 太短/含空格、BaseUrl 非 https、模型名为空）', async () => {
  const token = await unlock();
  const bads = [
    { api_key: 'short' },
    { api_key: 'sk-has space inside key 123' },
    { base_url: 'http://evil.example.com/v1' },
    { base_url: 'ftp://x.example.com' },
    { base_url: 'http://169.254.169.254/latest/meta-data' },
    { base_url: 'https://user:pass@x.example.com/v1' },
    { model: '' },
    { model: 'has space' },
    { protocol: 'gemini' }
  ];
  for (const over of bads) {
    const r = await saveAIConfig(token, over);
    assert.equal(r.status, 400, JSON.stringify({ over, res: r.body }));
  }
  // 内网/回环地址允许 http（给自建 Ollama 留口子）
  const ok = await saveAIConfig(token, { base_url: 'http://127.0.0.1:11434/v1' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
});

test('AI 配额查询：未配置时为满额，用过后递减', async () => {
  const token = await freshAiToken();
  let q0 = await api('/v1/ai/quota', { token });
  assert.equal(q0.status, 200);
  assert.equal(q0.body.used, 0);
  assert.equal(q0.body.remaining, 3);
  assert.equal(q0.body.daily_limit, 3);

  await saveAIConfig(token);
  await withMockUpstream(async (calls) => {
    const r = await api('/v1/ai/chat', {
      method: 'POST',
      token,
      body: { messages: [{ role: 'user', content: '你好' }] }
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.content, 'mock reply');
    assert.equal(r.body.used, 1);
    assert.equal(r.body.remaining, 2);
  });

  q0 = await api('/v1/ai/quota', { token });
  assert.equal(q0.body.used, 1);
  assert.equal(q0.body.remaining, 2);
});

test('AI 转发：请求体按 OpenAI 协议构造，带 Authorization 头', async () => {
  const token = await freshAiToken();
  await saveAIConfig(token);
  await withMockUpstream(async (calls) => {
    const r = await api('/v1/ai/chat', {
      method: 'POST',
      token,
      body: {
        messages: [
          { role: 'system', content: '你是助手' },
          { role: 'user', content: '问一件事' }
        ],
        temperature: 0.5,
        max_tokens: 900
      }
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(calls.length, 1);
    const c = calls[0];
    assert.equal(c.url, AI_BASE + '/chat/completions');
    assert.equal(c.headers.authorization, 'Bearer ' + AI_TEST_KEY);
    const sent = JSON.parse(c.body);
    assert.equal(sent.model, 'mock-model');
    assert.equal(sent.temperature, 0.5);
    assert.equal(sent.max_tokens, 900);
    assert.equal(sent.stream, false);
    assert.equal(sent.messages.length, 2);
    assert.equal(sent.messages[1].content, '问一件事');
  });
});

test('AI 转发：Anthropic 协议走 /messages 与 x-api-key', async () => {
  const token = await freshAiToken();
  await saveAIConfig(token, {
    protocol: 'anthropic',
    base_url: 'https://mock-anthropic.test/v1'
  });
  await withMockUpstream(async (calls) => {
    const r = await api('/v1/ai/chat', {
      method: 'POST',
      token,
      body: { messages: [{ role: 'system', content: 'sys' }, { role: 'user', content: 'hi' }] }
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(calls[0].url, 'https://mock-anthropic.test/v1/messages');
    assert.equal(calls[0].headers['x-api-key'], AI_TEST_KEY);
    assert.equal(calls[0].headers['anthropic-version'], '2023-06-01');
    const sent = JSON.parse(calls[0].body);
    assert.equal(sent.system, 'sys');
    assert.equal(sent.messages.length, 1);
    assert.equal(sent.messages[0].role, 'user');
  });
});

test('AI 每日限次：打满后 429，且额度不被额外扣减', async () => {
  const token = await freshAiToken();
  await saveAIConfig(token);
  await withMockUpstream(async () => {
    for (let i = 1; i <= 3; i++) {
      const r = await api('/v1/ai/chat', {
        method: 'POST',
        token,
        body: { messages: [{ role: 'user', content: '第' + i + '问' }] }
      });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.used, i);
      assert.equal(r.body.remaining, 3 - i);
    }
    const over = await api('/v1/ai/chat', {
      method: 'POST',
      token,
      body: { messages: [{ role: 'user', content: '超额' }] }
    });
    assert.equal(over.status, 429);
    assert.equal(over.body.error, 'daily_limit_reached');
  });
  // 计数停在 3，不因超额请求继续涨（先判定后调用）
  const q = await api('/v1/ai/quota', { token });
  assert.equal(q.body.used, 3);
});

test('AI 未配置时 409，不消耗额度', async () => {
  const token = await freshAiToken();
  const r = await api('/v1/ai/chat', {
    method: 'POST',
    token,
    body: { messages: [{ role: 'user', content: 'hi' }] }
  });
  assert.equal(r.status, 409);
  assert.equal(r.body.error, 'ai_not_configured');
  const q = await api('/v1/ai/quota', { token });
  assert.equal(q.body.used, 0, '未配置不得扣额度');
});

test('AI 上游报错：不透传上游原文，只给归类错误码', async () => {
  const token = await freshAiToken();
  await saveAIConfig(token);
  await withMockUpstream(async () => {
    const r = await api('/v1/ai/chat', {
      method: 'POST',
      token,
      body: { messages: [{ role: 'user', content: 'hi' }] }
    });
    assert.equal(r.status, 502);
    assert.equal(r.body.error, 'upstream_error');
    assert.ok(!JSON.stringify(r.body).includes('sk-secret-999'), '不得回显上游响应体');
  }, { status: 500, body: '内部错误，账号 sk-secret-999 异常' });
});

test('AI 越权：另一个账号读不到配置，也调不了对话', async () => {
  // 用一个全新令牌：TOKEN 已在其他用例保存过 AI 配置，这里必须是"没配过"的账号
  const OTHER = 'ai-other-2026-token-77';
  const other = await api('/v1/auth/register', {
    method: 'POST',
    body: { token: OTHER, recovery: 'other-recovery-2', deviceName: 'other-device' }
  });
  assert.equal(other.status, 200, JSON.stringify(other.body));
  // 先给 owner 配一份，再确认 other 读不到
  const owner = await freshAiToken();
  await saveAIConfig(owner);
  const g = await api('/v1/ai/config', { token: other.body.access });
  assert.equal(g.status, 200);
  assert.equal(g.body.configured, false, '新账号看不到他人的 AI 配置');

  const c = await api('/v1/ai/chat', {
    method: 'POST',
    token: other.body.access,
    body: { messages: [{ role: 'user', content: '借我用一下' }] }
  });
  assert.equal(c.status, 409);
  assert.equal(c.body.error, 'ai_not_configured');

  // owner 删掉自己的配置，仍不影响 other
  await api('/v1/ai/config', { method: 'DELETE', token: owner });
  const g2 = await api('/v1/ai/config', { token: other.body.access });
  assert.equal(g2.body.configured, false);
  // owner 侧确认已删除
  const g3 = await api('/v1/ai/config', { token: owner });
  assert.equal(g3.body.configured, false);
});

test('AI 需登录：无 token 401', async () => {
  const r = await api('/v1/ai/quota');
  assert.equal(r.status, 401);
});

test('AI 消息体校验：空数组、超长、非法 role 被拒', async () => {
  const token = await freshAiToken();
  await saveAIConfig(token);
  const bads = [
    { messages: [] },
    { messages: [{ role: 'tool', content: 'x' }] },
    { messages: [{ role: 'user', content: '' }] },
    { messages: [{ role: 'user', content: 'x'.repeat(33_000) }] }
  ];
  for (const body of bads) {
    const r = await api('/v1/ai/chat', { method: 'POST', token, body });
    assert.equal(r.status, 400, JSON.stringify({ body, res: r.body }));
  }
});

// ---------- 测试辅助：打桩上游 fetch ----------
// 全局替换 fetch，只对 mock-*.test 域名生效；其余请求（本地 HTTP 测试）照常放行。
let MOCK_UPSTREAM = null;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  const u = String(url && url.url ? url.url : url);
  if (MOCK_UPSTREAM && /^https?:\/\/(mock-ai|mock-anthropic)\.test\//.test(u)) {
    MOCK_UPSTREAM.calls.push({
      url: u,
      headers: (opts && opts.headers) || {},
      body: (opts && opts.body) || ''
    });
    const text = MOCK_UPSTREAM.body ||
      JSON.stringify({
        choices: [{ message: { role: 'assistant', content: 'mock reply' } }],
        content: [{ type: 'text', text: 'mock reply' }]
      });
    return {
      ok: MOCK_UPSTREAM.status < 400,
      status: MOCK_UPSTREAM.status,
      headers: { get: () => String(Buffer.byteLength(text)) },
      text: async () => text
    };
  }
  return realFetch(url, opts);
};

async function withMockUpstream(fn, upstream = { status: 200, body: '' }) {
  const calls = [];
  MOCK_UPSTREAM = { calls, status: upstream.status, body: upstream.body };
  try {
    await fn(calls);
  } finally {
    MOCK_UPSTREAM = null;
  }
}
