// /v1/ai —— AI 云代理（站长提供 Key，用户端零配置）
//
// 为什么要有这条链路：
//   客户端直连厂商需要用户自己申请 Key（门槛），且各家 CORS 策略不一（Anthropic 默认禁浏览器直连）。
//   把 Key 交给服务端保管、由服务端转发，用户端零配置即可用，同时绕过 CORS。
//
// Key 保护（对应「我 APIkey 的数据保护」）：
//   1. 落库即加密：AES-256-GCM，主密钥只在 AI_KEY_MASTER 环境变量里；
//   2. 任何接口都不返回 Key 明文，也不返回密文，只给尾号 4 位提示；
//   3. 日志不记录请求体与响应体（index.js 的 req 序列化器只留 method/url/ip）；
//   4. 解密后的 Key 只在本次转发出站请求的内存中使用，不写日志、不缓存、不落库；
//   5. 只允许 https（回环/内网例外，方便自建 Ollama），避免 Key 走明文链路。
//
// 限流与限次（对应「每天的提问次数限制 + 限流」）：
//   - 每分钟：内存滑动窗口，防突发刷接口打爆站长余额；
//   - 每日：数据库计数，重启进程也不重置，防「慢速耗额度」。
//   两条都在调用厂商之前判定，避免「先打钱后计数」。
import { requireAuth } from '../lib/auth.js';
import { q } from '../lib/db.js';
import { getEnv } from '../lib/env.js';
import { encryptKey, decryptKey, keyHint } from '../lib/aikey.js';
import { parseSiteKey, resolveCredential, redactSpec } from '../lib/sitekey.js';
import { ratePerMinute } from '../lib/ailimit.js';
import {
  estimateTier,
  buildCandidates,
  maxAttempts,
  markKeyResult,
  logRouting,
  classifyUpstream
} from '../lib/airouter.js';
import {
  assertProvider,
  assertProtocol,
  assertBaseUrl,
  assertApiKey,
  assertModel,
  assertMessages,
  assertTemperature,
  assertMaxTokens,
  assertTier
} from '../lib/validate.js';

const env = getEnv();
// 站长内置 Key：env 直配、只活在进程内存，配了它就是「用户端零配置」的那条路
const SITE_KEY = parseSiteKey(env.AI_SITE_KEY);
// 全局默认限额（按用户覆盖在 userLimits 里叠加）
const AI_DAILY_LIMIT_DEFAULT = env.AI_DAILY_LIMIT;
const AI_RATE_PER_MIN_DEFAULT = env.AI_RATE_PER_MINUTE;

// 服务端转发超时：比客户端默认 60s 长，长回答（典籍 RAG + 长盘面）需要更多时间
const UPSTREAM_TIMEOUT_MS = 90_000;
// 出站响应体上限，防上游返回异常大的内容把服务端内存吃满
const UPSTREAM_MAX_BYTES = 2 * 1024 * 1024;

export async function registerAI(app) {
  const { AI_PROXY_ENABLED, AI_DAILY_LIMIT, AI_RATE_PER_MINUTE } = env;
  app.addHook('preHandler', requireAuth);

  // 代理未开启：明确告知客户端回退到「自带 Key」模式，而不是含糊的 500
  app.addHook('preHandler', async (req, reply) => {
    if (!AI_PROXY_ENABLED) return reply.code(503).send({ error: 'ai_proxy_disabled' });
  });

  // ---------- 配置 ----------

  // 保存/更新配置（含 Key）。幂等 upsert：每个账号一份配置。
  // 需要本人 access token，所以只有云会话持有者能设置；其他人拿不到这把 Key。
  app.post('/config', async (req, reply) => {
    const provider = assertProvider(req.body?.provider);
    const protocol = assertProtocol(req.body?.protocol);
    const baseUrl = assertBaseUrl(req.body?.base_url);
    const model = assertModel(req.body?.model);
    const apiKey = assertApiKey(req.body?.api_key);

    const { cipher, nonce, tag } = encryptKey(apiKey);

    await q(
      `insert into ai_proxy_config (user_id, provider, protocol, base_url, model, key_cipher, key_nonce, key_tag)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       on conflict (user_id) do update set
         provider=excluded.provider, protocol=excluded.protocol, base_url=excluded.base_url,
         model=excluded.model, key_cipher=excluded.key_cipher, key_nonce=excluded.key_nonce,
         key_tag=excluded.key_tag, updated_at=now()`,
      [req.userId, provider, protocol, baseUrl, model, cipher, nonce, tag]
    );

    await audit(req.userId, 'ai_config_save', req);
    return reply.send({
      ok: true,
      hint: keyHint(apiKey),
      daily_limit: AI_DAILY_LIMIT,
      rate_per_minute: AI_RATE_PER_MINUTE
    });
  });

  // 读取配置：只回元信息与限额，绝不含 Key 明文/密文
  // source 说明调用 /chat 时实际会走哪把 Key：site（站长内置）/ user（自己填的）
  app.get('/config', async (req, reply) => {
    const r = await q(
      `select provider, protocol, base_url, model, updated_at
       from ai_proxy_config where user_id=$1`,
      [req.userId]
    );
    const source = SITE_KEY.configured ? 'site' : (r.rowCount ? 'user' : 'none');
    const base = {
      configured: source !== 'none',
      source,
      site_key_available: SITE_KEY.configured,
      // 站长内置 Key 的可见形态：协议 + 地址 + 模型（绝不含 Key）
      site_key_preview: SITE_KEY.configured ? SITE_KEY.keys.map(k => redactSpec(k.protocol, k.baseUrl, k.model)) : [],
      daily_limit: AI_DAILY_LIMIT,
      rate_per_minute: AI_RATE_PER_MINUTE
    };
    if (!r.rowCount) return reply.send(base);
    const row = r.rows[0];
    // 密文长度即可给出稳定尾号？不行——必须解密才能取尾号。这里只回「是否已配置」，
    // 尾号由保存接口在保存当次返回，前端记住展示，避免为拿个尾号反复做解密操作。
    return reply.send(Object.assign(base, {
      provider: row.provider,
      protocol: row.protocol,
      base_url: row.base_url,
      model: row.model,
      updated_at: row.updated_at
    }));
  });

  // 删除配置（连 Key 密文一起删）
  app.delete('/config', async (req, reply) => {
    await q('delete from ai_proxy_config where user_id=$1', [req.userId]);
    await audit(req.userId, 'ai_config_delete', req);
    return reply.send({ ok: true });
  });

  // ---------- 限额查询 ----------

  app.get('/quota', async (req, reply) => {
    const limits = await userLimits(req.userId);
    const r = await q(
      `select count from ai_usage where user_id=$1 and day=current_date`,
      [req.userId]
    );
    const used = r.rowCount ? Number(r.rows[0].count) : 0;
    return reply.send({
      daily_limit: limits.daily,
      used,
      remaining: Math.max(0, limits.daily - used),
      rate_per_minute: limits.perMin
    });
  });

  // ---------- 对话转发（模型池 + 难度分级 + 自动降级） ----------

  app.post('/chat', async (req, reply) => {
    const messages = assertMessages(req.body?.messages);
    const temperature = assertTemperature(req.body?.temperature);
    const maxTokens = assertMaxTokens(req.body?.max_tokens);
    const hint = assertTier(req.body?.difficulty);
    const tier = estimateTier(messages, hint);

    // 限额：按用户覆盖优先（管理员在后台单独调过的人），否则全局默认
    const limits = await userLimits(req.userId);

    // 每分钟限流：先查突发，再落每日计数。
    // 顺序很重要 —— 被限流的请求不该消耗每日额度，否则「一秒内连点」会把当天次数白扣掉。
    const rl = ratePerMinute('ai:' + req.userId, limits.perMin);
    if (!rl.ok) {
      reply.header('retry-after', String(rl.retryAfterSec));
      return reply.code(429).send({ error: 'rate_limited', retry_after: rl.retryAfterSec });
    }

    // 候选序列：模型池（难度分级 + 跨厂商轮转）优先，
    // 池子为空时回落到 env 站长 Key / 用户自存 Key（老路径，行为不变）。
    // 必须在扣每日额度之前确定「有得可试」——没配置就 409，不该吃掉用户配额。
    const pool = await buildCandidates(tier);
    const fallback = await resolveFallbackCredential(req.userId);
    const attempts = [];
    for (const c of pool) {
      attempts.push({
        source: 'pool',
        protocol: c.protocol,
        baseUrl: c.baseUrl,
        model: c.model,
        apiKey: c.apiKey,
        keyId: c.keyId,
        providerSlug: c.providerSlug
      });
    }
    if (fallback) attempts.push(fallback);
    if (!attempts.length) return reply.code(409).send({ error: 'ai_not_configured' });

    // 每日限次：先查后增，超限直接返回 429（不消耗厂商额度）
    const usageR = await q(
      `insert into ai_usage (user_id, day, count) values ($1, current_date, 1)
       on conflict (user_id, day) do update set count = ai_usage.count + 1
       where ai_usage.count < $2
       returning count`,
      [req.userId, limits.daily]
    );
    if (!usageR.rowCount) return reply.code(429).send({ error: 'daily_limit_reached' });
    const used = Number(usageR.rows[0].count);

    const charsIn = messages.reduce((n, m) => n + m.content.length, 0);
    let lastError = null;

    for (let i = 0; i < attempts.length && i < maxAttempts(); i++) {
      const cred = attempts[i];
      const started = Date.now();
      const { url, headers, body } = buildUpstream(cred, messages, temperature, maxTokens);

      let res;
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), UPSTREAM_TIMEOUT_MS);
      try {
        res = await fetch(url, { method: 'POST', headers, body, signal: ac.signal });
      } catch (e) {
        clearTimeout(timer);
        if (e && e.name === 'AbortError') {
          lastError = { status: 504, error: 'upstream_timeout', log: 'timeout' };
        } else {
          lastError = { status: 502, error: 'upstream_unreachable', log: 'unreachable' };
        }
        // 网络层失败：这把 Key/这家厂商可能挂了，换下一个候选
        if (cred.keyId) await markKeyResult(cred.keyId, false);
        await logRouting({
          userId: req.userId,
          tier,
          providerSlug: cred.providerSlug,
          model: cred.model,
          keyId: cred.keyId,
          status: lastError.log,
          latencyMs: Date.now() - started,
          charsIn
        });
        continue;
      }
      clearTimeout(timer);

      if (!res.ok) {
        // 只在服务端日志留状态码与协议，不留上游响应体（可能含 Key 回显或错误详情）
        req.log.warn({ status: res.status, protocol: cred.protocol }, 'ai upstream error');
        const cls = classifyUpstream(res.status);
        if (cred.keyId) await markKeyResult(cred.keyId, false);
        await logRouting({
          userId: req.userId,
          tier,
          providerSlug: cred.providerSlug,
          model: cred.model,
          keyId: cred.keyId,
          status: cls.status,
          latencyMs: Date.now() - started,
          charsIn
        });
        const code = mapUpstreamError(res.status);
        lastError = { status: code.status, error: code.error };
        if (cls.retry) continue; // 换厂商/换模型/换 Key 再试
        break; // 请求本身不合法，换谁都一样
      }

      let text;
      try {
        text = await readUpstreamText(res);
      } catch {
        lastError = { status: 502, error: 'upstream_too_large' };
        continue;
      }
      let content;
      try {
        content = extractContent(JSON.parse(text), cred.protocol);
      } catch {
        lastError = { status: 502, error: 'upstream_bad_shape' };
        continue;
      }
      if (!content) {
        lastError = { status: 502, error: 'upstream_empty' };
        continue;
      }

      if (cred.keyId) await markKeyResult(cred.keyId, true);
      await logRouting({
        userId: req.userId,
        tier,
        providerSlug: cred.providerSlug,
        model: cred.model,
        keyId: cred.keyId,
        status: 'ok',
        latencyMs: Date.now() - started,
        charsIn,
        charsOut: content.length
      });
      await audit(req.userId, 'ai_chat', req);
      return reply.send({
        content,
        used,
        remaining: Math.max(0, limits.daily - used),
        source: cred.source,
        tier,
        model: cred.model,
        provider: cred.providerSlug || null
      });
    }

    // 所有候选都试完了仍失败：把最后一次的归类错误报出去
    const fin = lastError || { status: 502, error: 'upstream_error' };
    return reply.code(fin.status).send({
      error: fin.error,
      used,
      remaining: Math.max(0, limits.daily - used)
    });
  });
}

/**
 * 该用户实际生效的限额：管理员按用户覆盖优先，其次全局默认（env）。
 * 覆盖值允许为 null = 「用全局」，所以用 ?? 而不是 ||。
 */
async function userLimits(userId) {
  const r = await q('select ai_daily_limit, ai_rate_per_min from users where id=$1', [userId]);
  const row = r.rows[0] || {};
  return {
    daily: row.ai_daily_limit ?? AI_DAILY_LIMIT_DEFAULT,
    perMin: row.ai_rate_per_min ?? AI_RATE_PER_MIN_DEFAULT
  };
}

/** 模型池为空时的兜底凭证：env 站长 Key 优先，其次用户自存 Key */
async function resolveFallbackCredential(userId) {
  const site = resolveCredential(SITE_KEY, null, null);
  if (site) return { ...site, keyId: null, providerSlug: null };

  const cfgR = await q(
    `select protocol, base_url, model, key_cipher, key_nonce, key_tag
     from ai_proxy_config where user_id=$1`,
    [userId]
  );
  if (!cfgR.rowCount) return null;
  const row = cfgR.rows[0];
  const apiKey = decryptKey(row.key_cipher, row.key_nonce, row.key_tag);
  // 解不开说明主密钥被换过或行被外部改动，该配置视为不可用
  if (!apiKey) return null;
  return {
    source: 'user',
    protocol: row.protocol,
    baseUrl: row.base_url,
    model: row.model,
    apiKey,
    keyId: null,
    providerSlug: null
  };
}

// ---------- 上游请求构造 ----------

// cred: {protocol, baseUrl, model, apiKey} —— 已按「站长内置优先」解析好
function buildUpstream(cred, messages, temperature, maxTokens) {
  let url;
  let headers;
  let body;
  const base = String(cred.baseUrl || '').trim().replace(/\/+$/, '');

  if (cred.protocol === 'anthropic') {
    url = base + '/messages';
    headers = {
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': cred.apiKey
    };
    const sys = messages.find(m => m.role === 'system');
    body = JSON.stringify({
      model: cred.model,
      system: sys ? sys.content : '',
      messages: messages
        .filter(m => m.role !== 'system')
        .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
      max_tokens: maxTokens,
      temperature,
      stream: false
    });
  } else {
    url = base + '/chat/completions';
    headers = {
      'content-type': 'application/json',
      authorization: 'Bearer ' + cred.apiKey
    };
    body = JSON.stringify({
      model: cred.model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: false
    });
  }
  return { url, headers, body };
}

/** 带体积上限地读上游响应体：超限即中止读取，防异常大的响应把服务端内存吃满 */
async function readUpstreamText(res) {
  const declared = Number(res.headers?.get?.('content-length') || 0);
  if (declared > UPSTREAM_MAX_BYTES) throw new Error('upstream_too_large');
  let buf = '';
  const reader = res.body?.getReader?.();
  if (!reader) {
    const t = await res.text();
    if (Buffer.byteLength(t) > UPSTREAM_MAX_BYTES) throw new Error('upstream_too_large');
    return t;
  }
  const dec = new TextDecoder();
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > UPSTREAM_MAX_BYTES) throw new Error('upstream_too_large');
    buf += dec.decode(value, { stream: true });
  }
  return buf;
}

/** 从上游响应取正文：兼容 OpenAI / Anthropic / 部分中转站的非标准结构 */
function extractContent(data, protocol) {
  if (protocol === 'anthropic') {
    if (Array.isArray(data.content) && typeof data.content[0]?.text === 'string') {
      return data.content[0].text;
    }
    return '';
  }
  const c = data.choices?.[0]?.message?.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map(x => (typeof x?.text === 'string' ? x.text : '')).join('');
  if (typeof data.content === 'string') return data.content;
  if (typeof data.text === 'string') return data.text;
  return '';
}

/** 上游错误码 → 客户端错误码（不把上游原文透传，避免泄露账号与 Key 信息） */
function mapUpstreamError(status) {
  if (status === 401 || status === 403) return { status: 502, error: 'upstream_unauthorized' };
  if (status === 404) return { status: 502, error: 'upstream_not_found' };
  if (status === 429) return { status: 429, error: 'upstream_rate_limited' };
  if (status >= 500) return { status: 502, error: 'upstream_error' };
  return { status: 502, error: 'upstream_rejected' };
}

// 审计：只记「谁在何时做了什么」，绝不记内容与 Key
async function audit(userId, action, req) {
  q(
    `insert into audit_log (user_id, action, ip, ua) values ($1,$2,$3,$4)`,
    [userId, action, req.ip, String(req.headers['user-agent'] || '').slice(0, 200)]
  ).catch(() => {});
}
