// cloud.js 端到端校验：真 HTTP 形状（mock fetch），不走真实网络。
// 【2026-10 变更】业务数据改为明文落库，本文件已随协议更新：
//   覆盖：注册 → 推送（明文 data）→ 令牌登录 → 找回 → HTTP 头/查询参数格式。
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { JSDOM } from 'jsdom';

// ---- btoa / atob 垫片（Node 20+ 自带 webcrypto；明文协议已不需要 WebCrypto） ----
const { webcrypto } = crypto;

function domEnv(extra) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://local.test/' });
  const w = dom.window;
  // window.crypto 在 JSDOM 里是只读 getter，用 defineProperty 垫 WebCrypto（randomBytes 用得到）
  Object.defineProperty(w, 'crypto', { value: webcrypto, configurable: true });
  w.btoa = s => Buffer.from(s, 'binary').toString('base64');
  w.atob = s => Buffer.from(s, 'base64').toString('binary');
  // JSDOM 默认没有持久化 localStorage，垫一个内存版（语义与浏览器一致）
  const bag = new Map();
  Object.defineProperty(w, 'localStorage', {
    configurable: true,
    value: {
      getItem: k => (bag.has(String(k)) ? bag.get(String(k)) : null),
      setItem: (k, v) => { bag.set(String(k), String(v)); },
      removeItem: k => { bag.delete(String(k)); },
      clear: () => { bag.clear(); },
      key: i => Array.from(bag.keys())[i] || null,
      get length() { return bag.size; }
    }
  });
  if (extra) for (const k of Object.keys(extra)) w[k] = extra[k];
  return w;
}

// 把「status + body」补成 cloud.js 预期的 Response 形状（必须带 text()）
function reply(r) {
  const status = r.status || 200;
  const body = r.body === undefined ? {} : r.body;
  return {
    ok: status >= 200 && status < 300,
    status: status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body))
  };
}

function mockRouter(routes) {
  const calls = [];
  const fetch = async (url, opts) => {
    const u = new URL(String(url));
    const entry = routes[u.pathname] && routes[u.pathname][(opts.method || 'GET').toUpperCase()];
    calls.push({ url: u.toString(), method: opts.method || 'GET', opts });
    if (!entry) return reply({ status: 404, body: { error: 'not_found' } });
    const fn = typeof entry === 'function' ? entry : (n => (n === 1 ? entry : {}));
    return reply(await fn(calls.length, calls[calls.length - 1]) || { status: 200 });
  };
  return { calls, fetch };
}

async function loadCloud(w, routes) {
  const { calls, fetch } = mockRouter(routes);
  w.fetch = fetch;
  global.window = w;
  // cloud.js 里的 _ls 探测的是自由变量 localStorage（浏览器里就是 window.localStorage）。
  // 这里用 new Function 在 Node 作用域执行，必须把同一份 localStorage 挂到 Node 全局，
  // 否则它解析不到、永远走内存降级，setServer 写一份、断言读另一份。
  Object.defineProperty(globalThis, 'localStorage', { value: w.localStorage, configurable: true });
  // cloud.js 挂在传入的 global 上。路径按仓库根解析，不依赖测试文件的相对位置。
  const root = process.cwd().replace(/\/server$/, '');
  const src = await (await import('node:fs/promises')).readFile(root + '/js/cloud.js', 'utf8');
  new Function('window', 'globalThis', 'self', src).call(w, w, w, w);
  return { Cloud: w.Cloud, calls };
}

// 读取 localStorage 的辅助
function store(w) {
  return {
    get: k => JSON.parse(w.localStorage.getItem(k)),
    raw: k => w.localStorage.getItem(k)
  };
}

test('注册：只发 token/recovery/deviceName，不再带任何加密材料', async () => {
  const w = domEnv();
  const TOKEN = 'xj-7f3k-9m2q-4p8r-t6wn';
  const RECOVERY = 'xj-recovery-2026-code';

  let sentBody = null;
  const { Cloud, calls } = await loadCloud(w, {
    '/v1/auth/register': {
      POST: () => {
        sentBody = JSON.parse(calls[calls.length - 1].opts.body);
        return { status: 200, body: { userId: 'u1', access: 'a1', refresh: 'r1' } };
      }
    }
  });
  Cloud.setServer('https://srv.test');

  await Cloud.register(TOKEN, RECOVERY);
  assert.equal(sentBody.token, TOKEN);
  assert.equal(sentBody.recovery, RECOVERY);
  assert.ok(sentBody.deviceName);
  assert.ok(!('recovery_blob' in sentBody), '明文协议不再上传恢复包裹体');
  assert.ok(!('kdf_salt' in sentBody), '明文协议不再有 kdf_salt');
  assert.equal(Cloud.status(), 'ready', '注册后应直接就绪');
  assert.equal(store(w).get('xuanjue_cloud_session').prefix, 'xj-7f3');
});

test('找回：前缀 + 恢复口令换发令牌，明文云端数据随登录可用', async () => {
  const w = domEnv();
  const { Cloud, calls } = await loadCloud(w, {
    '/v1/auth/recover': {
      POST: () => ({ status: 200, body: { userId: 'u1', access: 'a2', refresh: 'r2' } })
    }
  });
  Cloud.setServer('https://srv.test');
  await Cloud.recover('xj-7f3', 'xj-recovery-2026-code');
  const sent = JSON.parse(calls[calls.length - 1].opts.body);
  assert.equal(sent.prefix, 'xj-7f3');
  assert.equal(sent.recovery, 'xj-recovery-2026-code');
  assert.equal(Cloud.status(), 'ready');
  assert.equal(Cloud.state.access, 'a2');
});

test('推送：URL 形如 /v1/sync/cases?device=xxx，body 带明文 data 与 base_rev，409 会重拉重试', async () => {
  const w = domEnv({ Store: { listCases: () => [{ id: 'c1', updatedAt: 1 }], listChats: () => [], getChat: () => [], getProfile: () => ({}), listImportant: () => [], saveCase: () => {} } });
  let tries = 0;
  const { Cloud, calls } = await loadCloud(w, {
    '/v1/sync': {
      GET: () => ({ status: 200, body: { snapshots: [{ kind: 'cases', data: [], rev: 7 }] } })
    },
    '/v1/sync/cases': {
      PUT: () => {
        tries++;
        return tries === 1
          ? { status: 409, body: { error: 'rev_conflict', server_rev: 7 } }
          : { status: 200, body: { kind: 'cases', rev: 8 } };
      }
    }
  });
  Cloud.setServer('https://srv.test');

  Cloud.state.access = 'a';
  Cloud.state.refresh = 'r';
  Cloud.state.revs = {};

  await Cloud.pull();
  assert.equal(Cloud.state.revs.cases, 7, 'pull 后应记住服务端 rev');
  const n = await Cloud.push('cases');
  assert.equal(n, 8, 'push 成功应返回新 rev');
  const put = calls.filter(c => c.method === 'PUT' && c.url.includes('/v1/sync/cases'));
  assert.equal(put.length, 2, '应发生 一次 409 → 一次成功');
  assert.match(put[0].url, /\/v1\/sync\/cases\?device=/);
  assert.equal(put[0].opts.headers.authorization, 'Bearer a', '必须带 access token');
  assert.equal(put[0].opts.headers['x-platform'], 'web');
  const b0 = JSON.parse(put[0].opts.body);
  assert.equal(b0.base_rev, 7, '首次推送应带上刚 pull 到的 rev（不是 0，因为已拉过）');
  assert.deepEqual(b0.data, [{ id: 'c1', updatedAt: 1 }], '推送体应含明文数据本体');
  assert.ok(!('ciphertext' in b0), '明文协议不再有密文字段');
  assert.equal(put[1].opts.headers.authorization, 'Bearer a');
  assert.equal(JSON.parse(put[1].opts.body).base_rev, 7, '重试必须带上刚拉到的 rev');
  assert.equal(Cloud.state.revs.cases, 8, '成功后要记住新 rev');
});

test('拉取合并：远端新卦例并进本机，且不触发脏标记', async () => {
  const w = domEnv({
    Store: {
      listCases: () => [{ id: 'old', updatedAt: 1 }],
      listChats: () => [], getChat: () => [],
      getProfile: () => ({}), listImportant: () => [],
      saveCase: c => (w.__saved = c)
    }
  });

  const { Cloud } = await loadCloud(w, {
    '/v1/sync': {
      GET: () => ({ status: 200, body: { snapshots: [{ kind: 'cases', rev: 1, data: [{ id: 'new', updatedAt: 99 }] }] } })
    }
  });
  Cloud.setServer('https://srv.test');
  Cloud.state.access = 'a';
  Cloud.state.refresh = 'r';
  w.__saved = null;

  const n = await Cloud.pull();
  assert.equal(n, 1, '应并回 1 条');
  assert.deepEqual(w.__saved, { id: 'new', updatedAt: 99 });
  assert.equal(Cloud.dirtySince(), 0, '合并不得把自己标脏');
});

test('登录：unlock 只发令牌，会话就绪（无需派生密钥）', async () => {
  const w = domEnv();
  let sentToken = null;
  const { Cloud, calls } = await loadCloud(w, {
    '/v1/auth/unlock': {
      POST: () => {
        sentToken = JSON.parse(calls[calls.length - 1].opts.body).token;
        return { status: 200, body: { userId: 'u9', access: 'a9', refresh: 'r9' } };
      }
    }
  });
  Cloud.setServer('https://srv.test');
  const TOKEN = 'xj-1a2b-3c4d-5e6f-7g8h';
  await Cloud.unlock(TOKEN);
  assert.equal(sentToken, TOKEN);
  assert.equal(Cloud.state.userId, 'u9');
  assert.equal(Cloud.status(), 'ready');
  assert.equal(store(w).get('xuanjue_cloud_session').prefix, 'xj-1a2');
});

test('unlock 遇到 401 bad_token 时如实抛出，不伪造会话', async () => {
  const w = domEnv();
  const { Cloud } = await loadCloud(w, {
    '/v1/auth/unlock': { POST: () => ({ status: 401, body: { error: 'bad_token' } }) }
  });
  Cloud.setServer('https://srv.test');
  await assert.rejects(() => Cloud.unlock('xj-zzzz-zzzz-zzzz'), /bad_token/);
  assert.equal(Cloud.status(), 'idle');
  assert.equal(Cloud.state.access, null);
});

test('令牌格式校验在客户端就挡住，不发请求', async () => {
  const w = domEnv();
  const { Cloud, calls } = await loadCloud(w, {});
  Cloud.setServer('https://srv.test');
  await assert.rejects(() => Cloud.register('短令牌', 'xj-r-2026-code'), /16-64/);
  await assert.rejects(() => Cloud.unlock('含有中文的令牌xxxxxxxx'), /16-64/);
  assert.equal(calls.length, 0, '非法输入不该产生任何请求');
});
