// 视频理解链路 + 上游错误归类的回归测试
//
// 为什么单独一个文件：
//   1. 视频片段分析是多模态请求（content 是数组），单测里最容易被改坏；
//   2. 404 曾被当成「Key 坏了」，模型名一填错就把整池 Key 熔断 → 永远调不通（线上事故）。
//      这条必须有测试钉死，否则改回去没人会发现。
//
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

const VID_URL = 'https://cdn.example.com/clip.mp4';

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
  process.env.JWT_SECRET = 'test-secret-video-' + Date.now();
  process.env.PORT = String(PORT);
  process.env.LOG_LEVEL = 'fatal';
  process.env.ALLOW_SIGNUP = 'true';
  process.env.CORS_ORIGINS = '*';
  process.env.AI_PROXY_ENABLED = 'true';
  process.env.AI_DAILY_LIMIT = '50';
  process.env.AI_RATE_PER_MINUTE = '100';
  // 故意不配 AI_SITE_KEY：本次只测数据库模型池

  const { build } = await import('../index.js');
  app = await build();
  await app.listen({ port: PORT, host: '127.0.0.1' });

  // 纯文本厂（不支持视频）+ 视频厂（支持视频）
  await pool.query(
    `insert into ai_providers (id, slug, name, protocol, base_url) values
       ('00000000-0000-4000-8000-0000000000c1','text','文本厂','openai','https://mock-text.test/v1'),
       ('00000000-0000-4000-8000-0000000000c2','vid','视频厂','openai','https://mock-vid.test/v1')`
  );
  await pool.query(
    `insert into ai_models (provider_id, model, tier, priority) values
       ('00000000-0000-4000-8000-0000000000c1','text-mini','easy',10),
       ('00000000-0000-4000-8000-0000000000c2','step-5-preview','hard',10)`
  );
  await pool.query(
    `insert into ai_keys (id, provider_id, label, key_plain) values
       ('00000000-0000-4000-8000-0000000000d1','00000000-0000-4000-8000-0000000000c1','文本厂Key','sk-text-11111111'),
       ('00000000-0000-4000-8000-0000000000d2','00000000-0000-4000-8000-0000000000c2','视频厂Key','sk-vid-22222222')`
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

// ---------- 打桩上游 ----------
const MOCK_HOSTS = /mock-(text|vid|anth)\.test/;
let MOCK = null;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  const u = String(url && url.url ? url.url : url);
  if (MOCK && MOCK_HOSTS.test(u)) {
    MOCK.calls.push({ url: u, headers: (opts && opts.headers) || {}, body: (opts && opts.body) || '' });
    const host = u.match(MOCK_HOSTS)[1];
    const rule = MOCK.perHost[host] || {};
    if (rule.status && rule.status >= 400) {
      return {
        ok: false,
        status: rule.status,
        headers: { get: () => '0' },
        text: async () => JSON.stringify({ error: 'mock fail' })
      };
    }
    const text = JSON.stringify({
      choices: [{ message: { role: 'assistant', content: rule.content || 'mock reply' } }]
    });
    return {
      ok: true,
      status: 200,
      headers: { get: () => String(Buffer.byteLength(text)) },
      text: async () => text
    };
  }
  return realFetch(url, opts);
};

async function withMock(perHost, fn) {
  const calls = [];
  MOCK = { calls, perHost };
  try {
    return await fn(calls);
  } finally {
    MOCK = null;
  }
}

let USER_TOKEN = null;

async function ensureUser() {
  if (USER_TOKEN) return USER_TOKEN;
  const reg = await api('/v1/auth/register', {
    method: 'POST',
    body: {
      token: 'video-user-' + Date.now(),
      recovery: 'video-recovery-2026',
      deviceName: 'video-dev'
    }
  });
  assert.equal(reg.status, 200, JSON.stringify(reg.body));
  USER_TOKEN = reg.body.access;
  return USER_TOKEN;
}

/** 视频请求的消息体：视频在前、文字在后（上游对「先媒体后指令」识别更稳） */
function videoBody() {
  return {
    scene: 'video',
    messages: [
      { role: 'system', content: '你是视频片段分析助手' },
      {
        role: 'user',
        content: [
          { type: 'video_url', video_url: { url: VID_URL } },
          { type: 'text', text: '这段视频里发生了什么？' }
        ]
      }
    ]
  };
}

test('视频请求：只命中支持视频的模型，纯文本模型被排除', async () => {
  const token = await ensureUser();
  await withMock(
    { 'vid': { content: 'video-answer' }, 'text': { content: 'text-answer' } },
    async (calls) => {
      const r = await api('/v1/ai/chat', { method: 'POST', token, body: videoBody() });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.content, 'video-answer');
      assert.equal(r.body.model, 'step-5-preview');
      assert.equal(r.body.provider, 'vid');
      assert.ok(calls.every(c => c.url.includes('mock-vid.test')), '不该把视频发给纯文本模型');
    }
  );
});

test('视频请求：video_url 原样透传给上游，指令在视频之后', async () => {
  const token = await ensureUser();
  await withMock({ 'vid': { content: 'ok' } }, async (calls) => {
    const r = await api('/v1/ai/chat', { method: 'POST', token, body: videoBody() });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const sent = JSON.parse(calls[0].body);
    const userMsg = sent.messages.find(m => m.role === 'user');
    assert.ok(Array.isArray(userMsg.content), '多模态 content 必须保持数组形态');
    assert.equal(userMsg.content[0].type, 'video_url');
    assert.equal(userMsg.content[0].video_url.url, VID_URL);
    assert.equal(userMsg.content[1].type, 'text');
  });
});

test('视频请求：池里没有支持视频的模型 → 409 ai_no_video_model（不白烧上游额度）', async () => {
  const token = await ensureUser();
  await pool.query(`update ai_models set enabled=false where model='step-5-preview'`);
  try {
    await withMock({ 'vid': { content: 'should-not-be-called' }, 'text': { content: 'nope' } }, async (calls) => {
      const r = await api('/v1/ai/chat', { method: 'POST', token, body: videoBody() });
      assert.equal(r.status, 409, JSON.stringify(r.body));
      assert.equal(r.body.error, 'ai_no_video_model');
      assert.equal(calls.length, 0, '没有能看视频的模型就不该打上游');
    });
  } finally {
    await pool.query(`update ai_models set enabled=true where model='step-5-preview'`);
  }
});

test('视频请求：Anthropic 协议接不住视频 → 顺移到下一个候选，不把 video_url 发过去', async () => {
  const token = await ensureUser();
  // gpt-4o 属于「支持视频」的模型名，但这家是 Anthropic 协议 —— 接不住，必须跳过
  await pool.query(
    `insert into ai_providers (id, slug, name, protocol, base_url) values
       ('00000000-0000-4000-8000-0000000000c3','anth','Claude厂','anthropic','https://mock-anth.test/v1')`
  );
  await pool.query(
    `insert into ai_models (provider_id, model, tier, priority) values
       ('00000000-0000-4000-8000-0000000000c3','gpt-4o','hard',5)`
  );
  await pool.query(
    `insert into ai_keys (id, provider_id, label, key_plain) values
       ('00000000-0000-4000-8000-0000000000d3','00000000-0000-4000-8000-0000000000c3','Claude厂Key','sk-anth-33333333')`
  );
  try {
    await withMock({ 'vid': { content: 'video-answer' }, 'anth': { content: 'nope' } }, async (calls) => {
      const r = await api('/v1/ai/chat', { method: 'POST', token, body: videoBody() });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.provider, 'vid');
      assert.equal(calls.length, 1, 'Anthropic 候选应被就地跳过，不该真的发出去');
      assert.ok(calls[0].url.includes('mock-vid.test'));
    });
    const log = await pool.query(
      `select status from ai_routing_log where provider_slug='anth' order by id desc limit 1`
    );
    assert.equal(log.rows[0]?.status, 'anthropic_no_video', '跳过也要留痕，后台才查得到原因');
  } finally {
    await pool.query(`delete from ai_keys where label='Claude厂Key'`);
    await pool.query(`delete from ai_models where model='gpt-4o'`);
    await pool.query(`delete from ai_providers where slug='anth'`);
  }
});

test('404 不算 Key 的锅：模型名填错不会把 Key 熔断（线上事故回归）', async () => {
  const token = await ensureUser();
  await withMock(
    { 'text': { status: 404 }, 'vid': { status: 404 } },
    async () => {
      const r = await api('/v1/ai/chat', {
        method: 'POST',
        token,
        body: { messages: [{ role: 'user', content: '你好' }], difficulty: 'easy' }
      });
      assert.equal(r.status, 502, JSON.stringify(r.body));
      assert.equal(r.body.error, 'upstream_not_found');
    }
  );
  const keys = await pool.query(`select label, status, fails from ai_keys order by label`);
  for (const k of keys.rows) {
    assert.equal(k.status, 'active', `${k.label} 不该因 404 被熔断`);
    assert.equal(Number(k.fails), 0, `${k.label} 不该因 404 记失败`);
  }
});
