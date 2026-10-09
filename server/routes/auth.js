// /v1/auth —— 令牌模式的「注册」/解锁 / 刷新 / 登出 / 找回
//
// 账号即令牌：用户自选一串同步令牌（16-64 位）。
// 服务端只存 SHA-256(token) 与前 6 位前缀。
//
// 【2026-10 变更】业务数据改为明文落库，因此不再需要「数据密钥」，
// kdf_salt 与 recovery_blob 已从协议中移除：找回只需「前 6 位 + 恢复口令」即可换发新令牌，
// 云端数据立刻可用（不再有「找回后数据仍解不开」的问题）。
import {
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyToken
} from '../lib/auth.js';
import { assertToken, assertRecovery, assertDeviceName } from '../lib/validate.js';
import { tooManyLoginAttempts, clearLoginAttempts } from '../lib/ratelimit.js';
import { getEnv } from '../lib/env.js';
import crypto from 'node:crypto';
import { q } from '../lib/db.js';

const env = getEnv();

// refresh jti 黑名单（登出/找回后失效）。单机内存实现。
const revokedJti = new Map(); // jti -> exp(ms)
setInterval(() => {
  const now = Date.now();
  for (const [k, exp] of revokedJti) if (exp < now) revokedJti.delete(k);
}, 60_000).unref?.();

export async function registerAuth(app) {
  const { ALLOW_SIGNUP } = env;

  // 创建账号：令牌 + 找回口令。
  app.post('/register', async (req, reply) => {
    if (!ALLOW_SIGNUP) return reply.code(403).send({ error: 'signup_disabled' });
    const token = assertToken(req.body?.token);
    const recovery = assertRecovery(req.body?.recovery);
    const deviceName = assertDeviceName(req.body?.deviceName);

    const tokenHash = hashToken(token);
    const exists = await q('select 1 from users where token_hash=$1', [tokenHash]);
    if (exists.rowCount) return reply.code(409).send({ error: 'token_taken' });

    const userId = (
      await q(
        `insert into users (token_hash, token_prefix, recovery_code, recovery_hash)
         values ($1,$2,$3,$4) returning id`,
        [tokenHash, token.slice(0, 6), recovery, hashToken(recovery)]
      )
    ).rows[0].id;

    const pair = await issueTokens(userId, deviceName, req);
    await audit(userId, 'register', req);
    return reply.send({ userId, recovery_code: recovery, ...pair });
  });

  // 解锁（= 登录）：令牌校验。不透露「令牌是否存在」，恒定时间响应。
  app.post('/unlock', async (req, reply) => {
    const token = assertToken(req.body?.token);
    const deviceName = assertDeviceName(req.body?.deviceName);

    const blocked = tooManyLoginAttempts(req.ip, tokenHash8(token));
    if (blocked) {
      return reply.code(429).send({ error: blocked === 'ip' ? 'too_many_attempts' : 'account_locked' });
    }

    const r = await q('select id, suspended, suspended_reason from users where token_hash=$1', [
      hashToken(token)
    ]);
    const row = r.rows[0];
    if (!row) return reply.code(401).send({ error: 'bad_token' });
    clearLoginAttempts(req.ip, tokenHash8(token));
    // 封禁账号拒绝登录，且明确告知原因（让用户知道找谁、不是静默失败）
    if (row.suspended) {
      return reply.code(403).send({
        error: 'account_suspended',
        reason: row.suspended_reason || '该账号已被管理员停用。'
      });
    }

    const pair = await issueTokens(row.id, deviceName, req);
    await audit(row.id, 'unlock', req);
    await q('update users set last_seen_at=now() where id=$1', [row.id]);
    return reply.send({ userId: row.id, ...pair });
  });

  // 刷新：轮换 refresh（旧的立即进黑名单）
  app.post('/refresh', async (req, reply) => {
    const token = String(req.body?.refresh || '');
    const payload = verifyToken(token);
    if (!payload || payload.typ !== 'refresh' || revokedJti.has(payload.jti)) {
      return reply.code(401).send({ error: 'invalid_refresh' });
    }
    // 每次续期都复查账号状态：封禁后立刻切断已登录会话
    const u = await q('select suspended from users where id=$1', [payload.sub]);
    if (!u.rowCount || u.rows[0].suspended) {
      return reply.code(403).send({ error: 'account_suspended' });
    }
    revokedJti.set(payload.jti, payload.exp * 1000);
    const pair = await issueTokens(payload.sub, `device:${payload.did}`, req, payload.did);
    return reply.send(pair);
  });

  // 登出
  app.post('/logout', async (req, reply) => {
    const token = String(req.body?.refresh || '');
    const payload = verifyToken(token);
    if (payload?.jti) revokedJti.set(payload.jti, payload.exp * 1000);
    return reply.send({ ok: true });
  });

  // 找回：令牌前 6 位 + 恢复口令，换发一套新令牌。
  // 前缀只有 6 位，人手选的令牌很可能撞前缀（如都以 "xuanjue" 开头），
  // 故这里取出全部候选逐个校验恢复口令，只有口令正确的那一个才换发令牌。
  app.post('/recover', async (req, reply) => {
    const prefix = String(req.body?.prefix || '').trim().slice(0, 6);
    const recovery = assertRecovery(req.body?.recovery);
    const deviceName = assertDeviceName(req.body?.deviceName);
    if (!prefix) return reply.code(400).send({ error: 'prefix_invalid' });

    const blocked = tooManyLoginAttempts(req.ip, 'recover:' + prefix);
    if (blocked) {
      return reply.code(429).send({ error: 'too_many_attempts' });
    }

    const r = await q('select id, recovery_hash, suspended, suspended_reason from users where token_prefix=$1', [
      prefix
    ]);
    if (!r.rowCount) {
      // 恒定时间：空跑一次哈希，避免通过耗时探测「账号是否存在」
      hashToken('decoy-recovery-' + Date.now());
      return reply.code(404).send({ error: 'account_not_found' });
    }
    clearLoginAttempts(req.ip, 'recover:' + prefix);

    const want = hashToken(recovery);
    const hit = r.rows.filter((row) => safeEq(row.recovery_hash, want));
    if (!hit.length) return reply.code(401).send({ error: 'bad_recovery' });
    if (hit.length > 1) return reply.code(409).send({ error: 'recovery_ambiguous' });

    const user = hit[0];
    if (user.suspended) {
      return reply.code(403).send({
        error: 'account_suspended',
        reason: user.suspended_reason || '该账号已被管理员停用。'
      });
    }
    const pair = await issueTokens(user.id, deviceName, req);
    await audit(user.id, 'recover', req);
    return reply.send({ userId: user.id, ...pair });
  });

  // 重置恢复口令：需提供令牌与新口令。
  app.post('/reset-recovery', async (req, reply) => {
    const token = assertToken(req.body?.token);
    const newRecovery = assertRecovery(req.body?.recovery);

    const r = await q('select id from users where token_hash=$1', [hashToken(token)]);
    const row = r.rows[0];
    if (!row) return reply.code(401).send({ error: 'bad_token' });

    await q('update users set recovery_code=$1, recovery_hash=$2 where id=$3', [
      newRecovery,
      hashToken(newRecovery),
      row.id
    ]);
    await audit(row.id, 'reset_recovery', req);
    return reply.send({ ok: true });
  });
}

function tokenHash8(token) {
  return crypto.createHash('sha256').update(token).digest('hex').slice(0, 16);
}

// 恒定时间比较，避免通过逐字符耗时推断哈希内容
function safeEq(a, b) {
  const x = Buffer.from(String(a || ''), 'utf8');
  const y = Buffer.from(String(b || ''), 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// 平台标识：优先取 deviceName 前缀（客户端约定 deviceName = 平台-随机后缀，
// 如 web-a1b2c3 / android-x9y8z7），其次取 x-platform 头，最后 unknown。
// 之前只读 x-platform 头，而注册/解锁请求并不带这个头，于是设备表清一色 'unknown'。
function platformOf(deviceName, req) {
  const fromName = String(deviceName || '').split('-')[0].trim().toLowerCase();
  if (fromName) return fromName.slice(0, 20);
  return String(req.headers['x-platform'] || 'unknown').slice(0, 20);
}

async function issueTokens(userId, deviceName, req, existingDeviceId) {
  let deviceId = existingDeviceId;
  if (!deviceId) {
    const d = await q(
      `insert into devices (user_id, device_name, platform)
       values ($1,$2,$3)
       on conflict (user_id, device_name)
       do update set last_sync_at=now()
       returning id`,
      [userId, deviceName, platformOf(deviceName, req)]
    );
    deviceId = d.rows[0].id;
  } else {
    await q('update devices set last_sync_at=now() where id=$1', [deviceId]).catch(() => {});
  }
  const jti = crypto.randomUUID();
  return {
    access: signAccessToken(userId),
    refresh: signRefreshToken(userId, deviceId, jti)
  };
}

async function audit(userId, action, req) {
  await q(
    `insert into audit_log (user_id, action, ip, ua) values ($1,$2,$3,$4)`,
    [userId, action, req.ip, String(req.headers['user-agent'] || '').slice(0, 200)]
  ).catch(() => {});
}
