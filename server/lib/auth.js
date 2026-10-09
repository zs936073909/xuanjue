// 令牌哈希（SHA-256）与 JWT 签发/校验
//
// 纯令牌模式：服务端永不存储「同步令牌」明文，只存 SHA-256 哈希。
// 令牌是账号标识。业务数据为明文落库（站长决策，供管理员查看），
// 因此令牌不再兼作加密口令。
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { getEnv } from './env.js';
import { q } from './db.js';

const env = getEnv();

/** 令牌 →  SHA-256 十六进制摘要（不可逆，撞库成本高于明文存储） */
export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token), 'utf8').digest('hex');
}

export function signAccessToken(userId) {
  return jwt.sign({ sub: userId, typ: 'access' }, env.JWT_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL
  });
}

export function signRefreshToken(userId, deviceId, jti) {
  return jwt.sign({ sub: userId, did: deviceId, jti, typ: 'refresh' }, env.JWT_SECRET, {
    expiresIn: env.JWT_REFRESH_TTL
  });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, env.JWT_SECRET);
  } catch {
    return null;
  }
}

/** 高熵恢复口令：恢复时用它重加密全部快照（旧的立即失效） */
export function newRecoveryCode() {
  return crypto.randomBytes(18).toString('base64url'); // 24 字符
}

/** Fastify preHandler：校验 Authorization: Bearer <access> */
export async function requireAuth(req, reply) {
  const h = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m) {
    return reply.code(401).send({ error: 'missing_token' });
  }
  const payload = verifyToken(m[1]);
  if (!payload || payload.typ !== 'access') {
    return reply.code(401).send({ error: 'invalid_token' });
  }
  // 每请求复查账号状态：封禁/注销即时生效，不等令牌过期。
  // 「控制所有账号」的前提就是这一条 —— 否则封禁只是纸面动作。
  const u = await q('select suspended, suspended_reason from users where id=$1', [payload.sub]);
  if (!u.rowCount) return reply.code(401).send({ error: 'invalid_token' });
  if (u.rows[0].suspended) {
    return reply.code(403).send({
      error: 'account_suspended',
      reason: u.rows[0].suspended_reason || '该账号已被管理员停用。'
    });
  }
  req.userId = payload.sub;
}
