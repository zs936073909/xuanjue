// 管理员身份体系：用户名 + 密码（scrypt 慢哈希）+ 独立 JWT
//
// 为什么和「同步令牌」分开两套：
//   用户进 App 靠令牌（低摩擦、无密码），管理员进后台靠账号密码（要能防爆破、要能审计）。
//   两套真相混在一起会互相削弱 —— 所以「谁是管理员」永远只看 admins 表。
//
// 密码学选型（第一性原理）：
//   scrypt（node 内置）内存硬、无需第三方依赖；每账号随机 salt；
//   校验用 timingSafeEqual，避免逐字符耗时侧信道。
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import jwt from 'jsonwebtoken';
import { getEnv } from './env.js';

const scrypt = promisify(crypto.scrypt);
const SCRYPT_KEYLEN = 64;

const env = getEnv();

/** 生成密码盐 + 慢哈希。返回值直接落库。 */
export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = (await scrypt(String(password), salt, SCRYPT_KEYLEN)).toString('hex');
  return { salt, hash };
}

/** 恒定时间校验密码 */
export async function verifyPassword(password, hash, salt) {
  const calc = await scrypt(String(password), String(salt), SCRYPT_KEYLEN);
  const want = Buffer.from(String(hash || ''), 'hex');
  return calc.length === want.length && crypto.timingSafeEqual(calc, want);
}

/**
 * 管理员密码长度校验。
 * 【2026-10 站长决策】允许中文、且允许较短口令（站长指定「土豆」这类好记口令）。
 * 长度下限降到 2 —— 但请注意：管理员能控制所有账号、看所有明文，
 * 短口令即便有登录限速也有被爆破风险，正式对外建议用 ≥10 位强口令，
 * 之后可 `node scripts/admin-init.mjs --reset` 改强。
 * 防爆破靠登录限速 + 连续失败锁定（见 throttleAdminLogin / 登录路由），不只靠长度。
 */
export function assertAdminPassword(v) {
  const s = typeof v === 'string' ? v : '';
  if (s.length < 2 || s.length > 200) {
    const e = new Error('password_too_weak');
    e.statusCode = 400;
    throw e;
  }
  return s;
}

// 用户名放宽到 Unicode 字母/数字（放行中文，如「洋芋」），保留 ._ - 三个符号。
// 用户名不是秘密，允许中文不影响安全；这里只挡空白/控制字符/过长，并限 2–32 位。
const USERNAME_RE = /^[\p{L}\p{N}._-]{2,32}$/u;
export function assertAdminUsername(v) {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!USERNAME_RE.test(s)) {
    const e = new Error('username_invalid');
    e.statusCode = 400;
    throw e;
  }
  return s;
}

// ---------- 管理员 JWT ----------
// 与用户 access token 同一把签名密钥，但 typ 不同（'admin' vs 'access'），
// 两者的 requireAuth/requireAdmin 互不放行 —— 用户 token 进不了后台，反之亦然。

export function signAdminToken(adminId) {
  return jwt.sign({ sub: adminId, typ: 'admin' }, env.JWT_SECRET, { expiresIn: '12h' });
}

export function verifyAdminToken(token) {
  try {
    const p = jwt.verify(token, env.JWT_SECRET);
    return p && p.typ === 'admin' ? p : null;
  } catch {
    return null;
  }
}

/** Fastify preHandler：要求管理员身份（Authorization: Bearer <admin token>） */
export async function requireAdmin(req, reply) {
  const h = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m) return reply.code(401).send({ error: 'missing_token' });
  const payload = verifyAdminToken(m[1]);
  if (!payload) return reply.code(401).send({ error: 'invalid_token' });
  req.adminId = payload.sub;
}

// ---------- 登录限速（防爆破） ----------
// 与用户登录分开计数：后台被扫不该把普通用户也锁了。
const attempts = new Map(); // key -> [ts,...]
const WINDOW_MS = 60_000;

export function throttleAdminLogin(key) {
  const now = Date.now();
  const arr = (attempts.get(key) || []).filter(t => now - t < WINDOW_MS);
  if (arr.length >= 5) {
    attempts.set(key, arr);
    return false;
  }
  arr.push(now);
  attempts.set(key, arr);
  return true;
}

export function clearAdminLogin(key) {
  attempts.delete(key);
}

setInterval(() => {
  const now = Date.now();
  for (const [k, arr] of attempts) {
    const kept = arr.filter(t => now - t < WINDOW_MS);
    if (kept.length === 0) attempts.delete(k);
    else attempts.set(k, kept);
  }
}, 60_000).unref?.();
