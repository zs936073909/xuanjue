// AI Key 加密存储（AES-256-GCM）
//
// 威胁模型：数据库被拖库 / 备份泄露 / SQL 注入读到行 —— 都不能还原出 API Key。
// 主密钥 AI_KEY_MASTER 只存在于服务端环境变量，不落库、不进日志、不进任何接口响应。
//
// 落库形态：key_cipher + key_nonce(12) + key_tag(16)。每次保存都重新取随机 nonce，
// 故同一把 Key 两次加密的密文不同，无法用密文比对判断「Key 是否变更过」。
import crypto from 'node:crypto';

const ALGO = 'aes-256-gcm';
const NONCE_LEN = 12;
const TAG_LEN = 16;

function masterKey() {
  const raw = process.env.AI_KEY_MASTER || '';
  if (!raw) throw new Error('AI_KEY_MASTER 未设置，无法加密保存 API Key');
  let key;
  if (/^[0-9a-f]{64}$/i.test(raw.trim())) key = Buffer.from(raw.trim(), 'hex');
  else {
    try {
      key = Buffer.from(raw.trim(), 'base64');
    } catch {
      key = Buffer.alloc(0);
    }
  }
  if (key.length !== 32) {
    throw new Error('AI_KEY_MASTER 必须是 32 字节（base64 44 位或 hex 64 位）');
  }
  return key;
}

/**
 * 加密 API Key
 * @returns {{cipher:Buffer, nonce:Buffer, tag:Buffer}}
 */
export function encryptKey(plain) {
  const s = typeof plain === 'string' ? plain : '';
  if (!s) throw new Error('api_key_empty');
  const nonce = crypto.randomBytes(NONCE_LEN);
  const c = crypto.createCipheriv(ALGO, masterKey(), nonce);
  const cipher = Buffer.concat([c.update(s, 'utf8'), c.final()]);
  return { cipher, nonce, tag: c.getAuthTag() };
}

/** 解密 API Key（主密钥不匹配或密文被篡改时返回 null，由调用方按 400 处理） */
export function decryptKey(cipher, nonce, tag) {
  try {
    const d = crypto.createDecipheriv(ALGO, masterKey(), nonce);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(cipher), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** 主密钥是否可用（ preflight / 启动提示用 ） */
export function aiKeyMasterReady() {
  try {
    masterKey();
    return true;
  } catch {
    return false;
  }
}

/** 对外只给「能确认是这把 Key，但推不回 Key」的尾号提示 */
export function keyHint(plain) {
  const s = String(plain || '');
  if (!s) return '';
  return s.length > 4 ? '****' + s.slice(-4) : '****';
}
