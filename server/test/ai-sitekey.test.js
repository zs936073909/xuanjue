// 站长内置 Key（AI_SITE_KEY）集成测试 —— 必须独立成一个文件。
//
// 为什么单独放：routes/ai.js 在模块顶层执行 `const SITE_KEY = parseSiteKey(env.AI_SITE_KEY)`，
// 值在首次 import 时就被定死。同一个文件里再改 process.env 后重新 import 拿到的是缓存模块，
// 读到的一直是空值，所以「env → 生效」这条路只能在独立进程里验证（node --test 每文件一进程）。
// 运行：DATABASE_URL=... npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import pg from 'pg';

const PORT = 18788;
const BASE = 'http://127.0.0.1:' + PORT;
const DB = process.env.DATABASE_URL || 'postgres://xuanjue:xuanjue@127.0.0.1:5432/xuanjue_test';

// 站长内置 Key 测试常量：env 格式 protocol://key@base-url/model
const SITE_TEST_KEY = 'sk-site-master-key-1234';
const SITE_SPEC = 'openai://' + SITE_TEST_KEY + '@https://mock-ai.test/v1/mock-model';
const AI_MASTER = Buffer.alloc(32, 7).toString('base64');

let app = null;
const pool = new pg.Pool({ connectionString: DB });

before(async () => {
  // 独立建 schema 前先重建，避免与集成测试文件并发跑时缺表（各文件是独立进程）
  const client = await pool.connect();
  try {
    await client.query({
      text: fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'),
      simple: true
    });
    await client.query('truncate users, devices, snapshots, ops, audit_log, ai_proxy_config, ai_usage, admins, ai_providers, ai_models, ai_keys, ai_routing_log restart identity cascade');
  } finally {
    client.release();
  }

  // 关键：必须在 import index.js 之前把 env 摆好，模块顶层才会读到
  process.env.DATABASE_URL = DB;
  process.env.JWT_SECRET = 'test-secret-site-' + Date.now();
  process.env.PORT = String(PORT);
  process.env.LOG_LEVEL = 'fatal';
  process.env.ALLOW_SIGNUP = 'true';
  process.env.CORS_ORIGINS = '*';
  process.env.AI_PROXY_ENABLED = 'true';
  process.env.AI_KEY_MASTER = AI_MASTER;
  process.env.AI_SITE_KEY = SITE_SPEC;
  process.env.AI_DAILY_LIMIT = '3';
  process.env.AI_RATE_PER_MINUTE = '100';

  const { build } = await import('../index.js');
  app = await build();
  await app.listen({ port: PORT, host: '127.0.0.1' });
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

// ---------- 打桩上游 fetch（与 integration.test.js 同一套形状） ----------
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

// ---------- 用例 ----------

test('AI 站长内置 Key：用户零配置即可对话，且不暴露 Key', async () => {
  const raw = await fetch(BASE + '/v1/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      token: 'site-key-user-' + Date.now(),
      recovery: 'site-recovery-2026',
      deviceName: 'site-dev'
    })
  });
  const reg = await raw.json();
  assert.equal(raw.status, 200, JSON.stringify(reg));
  const token = reg.access;

  // 完全不配用户 Key
  const cfg = await api('/v1/ai/config', { token });
  assert.equal(cfg.status, 200);
  assert.equal(cfg.body.configured, true);
  assert.equal(cfg.body.source, 'site');
  assert.equal(cfg.body.site_key_available, true);
  assert.deepEqual(cfg.body.site_key_preview, ['openai://https://mock-ai.test/v1/mock-model']);
  assert.ok(!JSON.stringify(cfg.body).includes(SITE_TEST_KEY), '不得回显站长 Key 明文');

  await withMockUpstream(async (calls) => {
    const chat = await api('/v1/ai/chat', {
      method: 'POST',
      token,
      body: { messages: [{ role: 'user', content: '你好' }] }
    });
    assert.equal(chat.status, 200, JSON.stringify(chat.body));
    assert.equal(chat.body.source, 'site');
    assert.equal(chat.body.content, 'mock reply');
    assert.equal(chat.body.used, 1);
    assert.equal(calls.length, 1, '一次对话只应打一次上游');
    // 出站请求确实带上了站长 Key
    assert.equal(calls[0].headers.authorization, 'Bearer ' + SITE_TEST_KEY);
    assert.equal(calls[0].url, 'https://mock-ai.test/v1/chat/completions');
    assert.equal(JSON.parse(calls[0].body).model, 'mock-model');
  });

  // 仍然占用每日额度
  const q = await api('/v1/ai/quota', { token });
  assert.equal(q.body.used, 1);
  assert.equal(q.body.remaining, 2);
});

test('AI 站长内置 Key：用户自存 Key 不会抢在内置 Key 之前', async () => {
  const raw = await fetch(BASE + '/v1/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      token: 'site-vs-user-' + Date.now(),
      recovery: 'site-vs-user-2026',
      deviceName: 'site-dev-2'
    })
  });
  const reg = await raw.json();
  assert.equal(raw.status, 200, JSON.stringify(reg));
  const token = reg.access;

  const save = await api('/v1/ai/config', {
    method: 'POST',
    token,
    body: {
      provider: 'deepseek',
      protocol: 'openai',
      base_url: 'https://mock-anthropic.test/v1',
      model: 'user-own-model',
      api_key: 'sk-user-own-key-8888'
    }
  });
  assert.equal(save.status, 200, JSON.stringify(save.body));
  // 保存成功只回尾号提示（推不回整把 Key）
  assert.equal(save.body.hint, '****8888');

  const cfg = await api('/v1/ai/config', { token });
  assert.equal(cfg.body.source, 'site');

  await withMockUpstream(async (calls) => {
    const chat = await api('/v1/ai/chat', {
      method: 'POST',
      token,
      body: { messages: [{ role: 'user', content: '用谁的 Key' }] }
    });
    assert.equal(chat.status, 200, JSON.stringify(chat.body));
    assert.equal(chat.body.source, 'site', '站长内置优先');
    assert.equal(calls[0].url, 'https://mock-ai.test/v1/chat/completions');
  });
});
