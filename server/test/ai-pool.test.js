// 模型池路由测试：难度分级 → 档位模型 → 跨厂商降级 → Key 自动熔断
// 独立文件（node --test 每文件一进程），不碰 env 里的 AI_SITE_KEY，纯走数据库池。
// 运行：DATABASE_URL=... npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import pg from 'pg';

const PORT = 18789;
const BASE = 'http://127.0.0.1:' + PORT;
const DB = process.env.DATABASE_URL || 'postgres://xuanjue:xuanjue@127.0.0.1:5432/xuanjue_test';

let app = null;
const pool = new pg.Pool({ connectionString: DB });

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
  process.env.JWT_SECRET = 'test-secret-pool-' + Date.now();
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

  // 两家厂商 × 三个档位 × 各一把 Key
  await pool.query(
    `insert into ai_providers (id, slug, name, protocol, base_url) values
       ('00000000-0000-4000-8000-0000000000a1','alpha','甲厂','openai','https://mock-a.test/v1'),
       ('00000000-0000-4000-8000-0000000000a2','beta','乙厂','openai','https://mock-b.test/v1')`
  );
  await pool.query(
    `insert into ai_models (provider_id, model, tier, priority) values
       ('00000000-0000-4000-8000-0000000000a1','a-small','easy',10),
       ('00000000-0000-4000-8000-0000000000a1','a-mid','mid',10),
       ('00000000-0000-4000-8000-0000000000a1','a-big','hard',10),
       ('00000000-0000-4000-8000-0000000000a2','b-small','easy',20),
       ('00000000-0000-4000-8000-0000000000a2','b-mid','mid',20),
       ('00000000-0000-4000-8000-0000000000a2','b-big','hard',20)`
  );
  await pool.query(
    `insert into ai_keys (id, provider_id, label, key_plain) values
       ('00000000-0000-4000-8000-0000000000b1','00000000-0000-4000-8000-0000000000a1','甲厂主Key','sk-alpha-11111111'),
       ('00000000-0000-4000-8000-0000000000b2','00000000-0000-4000-8000-0000000000a2','乙厂主Key','sk-beta-22222222')`
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

// ---------- 打桩上游：可按域名配置不同表现 ----------
let MOCK = null;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  const u = String(url && url.url ? url.url : url);
  if (MOCK && /^https:\/\/mock-[ab]\.test\//.test(u)) {
    MOCK.calls.push({ url: u, headers: (opts && opts.headers) || {}, body: (opts && opts.body) || '' });
    const rule = MOCK.perHost[u.match(/^https:\/\/(mock-[ab]\.test)/)[1]] || {};
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
    await fn(calls);
  } finally {
    MOCK = null;
  }
}

let USER_TOKEN = null;

test('难度分级：简单问题走 easy 档模型', async () => {
  if (!USER_TOKEN) {
    const reg = await api('/v1/auth/register', {
      method: 'POST',
      body: {
        token: 'pool-user-' + Date.now(),
        recovery: 'pool-recovery-2026',
        deviceName: 'pool-dev'
      }
    });
    assert.equal(reg.status, 200, JSON.stringify(reg.body));
    USER_TOKEN = reg.body.access;
  }

  await withMock({ 'mock-a.test': { content: 'easy-answer' } }, async (calls) => {
    const r = await api('/v1/ai/chat', {
      method: 'POST',
      token: USER_TOKEN,
      body: { messages: [{ role: 'user', content: '明天适合搬家吗？' }], difficulty: 'easy' }
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.source, 'pool');
    assert.equal(r.body.tier, 'easy');
    assert.equal(r.body.model, 'a-small', 'easy 档应命中甲厂 a-small（priority 更小）');
    assert.equal(r.body.provider, 'alpha');
    assert.equal(calls[0].headers.authorization, 'Bearer sk-alpha-11111111');
    assert.equal(JSON.parse(calls[0].body).model, 'a-small');
  });
});

test('难度分级：hard 档走大模型；客户端 hint 优先于启发式', async () => {
  await withMock({ 'mock-a.test': {} }, async (calls) => {
    const r = await api('/v1/ai/chat', {
      method: 'POST',
      token: USER_TOKEN,
      body: {
        messages: [{ role: 'user', content: '请对我的八字做全面详批，分析大运流年趋势' }],
        difficulty: 'hard'
      }
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.tier, 'hard');
    assert.equal(r.body.model, 'a-big');
    assert.equal(JSON.parse(calls[0].body).model, 'a-big');
  });
});

test('难度分级：不给 hint 时按问法启发式估（详批→hard）', async () => {
  await withMock({ 'mock-a.test': {} }, async () => {
    const r = await api('/v1/ai/chat', {
      method: 'POST',
      token: USER_TOKEN,
      body: {
        messages: [
          { role: 'user', content: '帮我全面详批这个命盘，事业和感情分别分析，再看大运流年的长期趋势，为什么会有这样的格局？' }
        ]
      }
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.tier, 'hard', '复合 + 详批关键词应判 hard');
  });
});

test('跨厂商降级：甲厂全挂时自动换乙厂，用户无感拿到回答', async () => {
  await withMock(
    { 'mock-a.test': { status: 500 }, 'mock-b.test': { content: 'beta-answer' } },
    async (calls) => {
      const r = await api('/v1/ai/chat', {
        method: 'POST',
        token: USER_TOKEN,
        body: { messages: [{ role: 'user', content: '你好' }], difficulty: 'easy' }
      });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.content, 'beta-answer');
      assert.equal(r.body.provider, 'beta');
      assert.equal(calls.length, 2, '先打甲厂失败后换乙厂');
      assert.ok(calls[0].url.includes('mock-a.test'));
      assert.ok(calls[1].url.includes('mock-b.test'));
    }
  );

  // 路由留痕：两次尝试都记了，且不含提问内容
  const log = await pool.query(
    `select tier, provider_slug, model, status from ai_routing_log order by id desc limit 2`
  );
  assert.equal(log.rowCount, 2);
  assert.equal(log.rows[0].provider_slug, 'beta');
  assert.equal(log.rows[0].status, 'ok');
  assert.equal(log.rows[1].provider_slug, 'alpha');
  assert.equal(log.rows[1].status, 'upstream_error');
});

test('Key 熔断：连续失败自动标 suspect，不再进候选', async () => {
  // 让甲厂连续失败 3 次（easy/mid/hard 各一次都打甲厂 priority 最小）
  for (let i = 0; i < 3; i++) {
    await withMock(
      { 'mock-a.test': { status: 500 }, 'mock-b.test': { content: 'ok' } },
      async () => {
        await api('/v1/ai/chat', {
          method: 'POST',
          token: USER_TOKEN,
          body: { messages: [{ role: 'user', content: '测试' }], difficulty: 'easy' }
        });
      }
    );
  }
  const k = await pool.query(`select status, fails from ai_keys where label='甲厂主Key'`);
  assert.equal(k.rows[0].status, 'suspect', '连续失败 3 次应自动标 suspect');
  assert.ok(Number(k.rows[0].fails) >= 3);

  // suspect 后不再被选中：即使甲厂恢复，也只打乙厂
  await withMock(
    { 'mock-a.test': { content: 'should-not-be-called' }, 'mock-b.test': { content: 'beta-only' } },
    async (calls) => {
      const r = await api('/v1/ai/chat', {
        method: 'POST',
        token: USER_TOKEN,
        body: { messages: [{ role: 'user', content: '再试' }], difficulty: 'easy' }
      });
      assert.equal(r.status, 200);
      assert.equal(r.body.content, 'beta-only');
      assert.ok(calls.every(c => c.url.includes('mock-b.test')), 'suspect Key 不该再被用');
    }
  );
});

test('全挂时返回归类错误，且不透传上游原文', async () => {
  await withMock(
    { 'mock-b.test': { status: 500 } },
    async () => {
      const r = await api('/v1/ai/chat', {
        method: 'POST',
        token: USER_TOKEN,
        body: { messages: [{ role: 'user', content: '最后一个问题' }], difficulty: 'easy' }
      });
      assert.equal(r.status, 502);
      assert.equal(r.body.error, 'upstream_error');
      assert.ok(!JSON.stringify(r.body).includes('mock fail'), '不得透传上游响应体');
    }
  );
});

test('难度档位校验：非法 difficulty 被拒', async () => {
  const r = await api('/v1/ai/chat', {
    method: 'POST',
    token: USER_TOKEN,
    body: { messages: [{ role: 'user', content: '你好' }], difficulty: 'impossible' }
  });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'difficulty_invalid');
});

// ---------- 场景契约 ----------
// 前置的熔断/全挂测试已把两厂 Key 打到 suspect（池子空 → 409 ai_not_configured），
// 这里先复位，让场景测试自包含：只验「scene → 档位/留痕」这一件事，不依赖前序副作用。
async function resetKeys() {
  await pool.query(`update ai_keys set status='active', fails=0`);
}

test('场景契约：realtime 缺省档位为 mid，并把 scene 写进路由留痕', async () => {
  await resetKeys();
  await withMock({ 'mock-a.test': { content: 'rt-answer' } }, async () => {
    // 不给 difficulty：让场景默认档位生效（realtime → mid）
    const r = await api('/v1/ai/chat', {
      method: 'POST',
      token: USER_TOKEN,
      body: { messages: [{ role: 'user', content: '现在适合签约吗' }], scene: 'realtime' }
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.scene, 'realtime');
    assert.equal(r.body.tier, 'mid', 'realtime 场景缺省档位应为 mid');
    assert.equal(r.body.model, 'a-mid', 'mid 档应命中甲厂 a-mid');
  });
  // logRouting 是 fire-and-forget（留痕失败不该拖垮用户响应），
  // 所以不能靠「order by id desc」赌竞态：轮询等它落库，查到为止。
  let log = null;
  for (let i = 0; i < 40 && !log; i++) {
    const r = await pool.query(
      `select tier, scene from ai_routing_log where scene='realtime' order by id desc limit 1`
    );
    if (r.rowCount) log = r.rows[0];
    else await new Promise(res => setTimeout(res, 25));
  }
  assert.ok(log, 'scene 必须落库，后台才能按场景统计');
  assert.equal(log.scene, 'realtime');
  assert.equal(log.tier, 'mid');
});

test('场景契约：客户端显式 difficulty 优先于场景默认', async () => {
  await resetKeys();
  await withMock({ 'mock-a.test': {} }, async () => {
    const r = await api('/v1/ai/chat', {
      method: 'POST',
      token: USER_TOKEN,
      body: {
        messages: [{ role: 'user', content: '帮我全面详批这个命盘' }],
        scene: 'realtime',
        difficulty: 'hard'
      }
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.tier, 'hard', '客户端最清楚难易，hint 必须赢过场景默认');
    assert.equal(r.body.model, 'a-big');
  });
});

test('场景契约：非法 scene 被拒（拼错字母要报错，不能静默按通用处理）', async () => {
  const r = await api('/v1/ai/chat', {
    method: 'POST',
    token: USER_TOKEN,
    body: { messages: [{ role: 'user', content: '你好' }], scene: 'realtim' }
  });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'scene_invalid');
});

test('场景契约：不传 scene 的老客户端行为不变（启发式照旧）', async () => {
  await resetKeys();
  await withMock({ 'mock-a.test': {} }, async () => {
    const r = await api('/v1/ai/chat', {
      method: 'POST',
      token: USER_TOKEN,
      body: { messages: [{ role: 'user', content: '明天适合搬家吗？' }] }
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.scene, null, '老客户端 scene 回 null');
    assert.equal(r.body.tier, 'easy', '短问句仍按启发式判 easy');
  });
});
