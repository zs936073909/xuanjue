// AI 每分钟限流集成测试 —— 同样必须独立成一个文件。
//
// 原因与 ai-sitekey.test.js 一致：routes/ai.js 在模块顶层解构 env 里的 AI_RATE_PER_MINUTE，
// import 一次就定死。同文件里改 process.env 再重新 import 拿到的是缓存模块，阈值不会变。
// 本文件用 2 次/分钟的阈值 + 独立端口，专测「先限流、后记每日额度」的顺序。
// 运行：DATABASE_URL=... npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import pg from 'pg';

const PORT = 18789;
const BASE = 'http://127.0.0.1:' + PORT;
const DB = process.env.DATABASE_URL || 'postgres://xuanjue:xuanjue@127.0.0.1:5432/xuanjue_test';

const AI_BASE = 'https://mock-ai.test/v1';
const AI_TEST_KEY = 'sk-test-1234567890';
const AI_MASTER = Buffer.alloc(32, 7).toString('base64');

let app = null;
const pool = new pg.Pool({ connectionString: DB });

before(async () => {
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

  // 关键：阈值必须在 import 之前就位
  process.env.DATABASE_URL = DB;
  process.env.JWT_SECRET = 'test-secret-rl-' + Date.now();
  process.env.PORT = String(PORT);
  process.env.LOG_LEVEL = 'fatal';
  process.env.ALLOW_SIGNUP = 'true';
  process.env.CORS_ORIGINS = '*';
  process.env.AI_PROXY_ENABLED = 'true';
  process.env.AI_KEY_MASTER = AI_MASTER;
  process.env.AI_RATE_PER_MINUTE = '2';
  process.env.AI_DAILY_LIMIT = '30';

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

// ---------- 打桩上游 fetch ----------
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

test('AI 每分钟限流：429 且不消耗每日额度', async () => {
  const raw = await fetch(BASE + '/v1/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      token: 'ai-rl-' + Date.now(),
      recovery: 'ai-rl-recovery-2026',
      deviceName: 'ai-rl-dev'
    })
  });
  const reg = await raw.json();
  assert.equal(raw.status, 200, JSON.stringify(reg));
  const token = reg.access;

  await api('/v1/ai/config', {
    method: 'POST', token, body: {
      provider: 'deepseek', protocol: 'openai',
      base_url: AI_BASE, model: 'mock-model', api_key: AI_TEST_KEY
    }
  });

  await withMockUpstream(async (calls) => {
    // 第 1、2 次放行
    for (let i = 1; i <= 2; i++) {
      const r = await api('/v1/ai/chat', {
        method: 'POST', token,
        body: { messages: [{ role: 'user', content: '第' + i + '问' }] }
      });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.used, i);
    }
    // 第 3 次被限流：连上游都不该打
    const over = await api('/v1/ai/chat', {
      method: 'POST', token,
      body: { messages: [{ role: 'user', content: '太快了' }] }
    });
    assert.equal(over.status, 429);
    assert.equal(over.body.error, 'rate_limited');
    assert.ok(over.body.retry_after >= 1);
    assert.equal(calls.length, 2, '被限流的请求不应打到上游');
  });

  // 限流那次不得扣每日额度（顺序：先限流后计数）
  const qq = await api('/v1/ai/quota', { token });
  assert.equal(qq.body.used, 2, '被限流的请求不应消耗每日额度');
  assert.equal(qq.body.remaining, 28);
  assert.equal(qq.body.rate_per_minute, 2);
});
