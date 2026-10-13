// 输入校验：同步令牌 / 恢复口令 / kind 白名单 / 密文体量。纯手写，无额外依赖。
import { SCENES } from './scene.js';

/** 同步令牌：16–64 字符，允许字母数字与 - _  .（用户自选或生成的助记串） */
const TOKEN_RE = /^[A-Za-z0-9._-]{16,64}$/;

export function assertToken(v, field = 'token') {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!TOKEN_RE.test(s)) {
    const e = new Error(field + '_invalid');
    e.statusCode = 400;
    throw e;
  }
  return s;
}

/** 至少 8 位，含字母与数字 —— 兼顾易记与防爆破 */
export function assertRecovery(v, field = 'recovery') {
  const s = typeof v === 'string' ? v : '';
  if (s.length < 8 || s.length > 128) {
    const e = new Error(field + '_invalid');
    e.statusCode = 400;
    throw e;
  }
  return s;
}

/** 同步 kind 白名单 —— 决定允许上传的数据类别 */
const KINDS = new Set(['cases', 'chats', 'profile', 'important']);

export function assertKind(v) {
  const k = typeof v === 'string' ? v : '';
  if (!KINDS.has(k)) {
    const e = new Error('kind_invalid');
    e.statusCode = 400;
    throw e;
  }
  return k;
}

export const SYNC_KINDS = [...KINDS];

/** 密文 base64：限制 4MB，避免超大 payload */
const MAX_BLOB = 4 * 1024 * 1024;
export function assertBlob(v, field) {
  if (typeof v !== 'string' || v.length === 0 || v.length > MAX_BLOB) {
    const e = new Error(field + '_invalid');
    e.statusCode = 400;
    throw e;
  }
  const buf = Buffer.from(v, 'base64');
  if (buf.length === 0 || buf.length > MAX_BLOB) {
    const e = new Error(field + '_invalid');
    e.statusCode = 400;
    throw e;
  }
  return buf;
}

/**
 * 明文 JSON 数据（站长决策：业务数据不再加密，明文落库供管理员查看）。
 * 限制 4MB：既挡住异常大 payload，也给足真实场景（长案例 + 对话历史）的空间。
 * 只接受可 JSON 化的值（对象/数组/字符串等），拒绝函数与循环引用。
 */
const MAX_DATA = 4 * 1024 * 1024;
export function assertJsonData(v, field = 'data') {
  if (v === undefined) {
    const e = new Error(field + '_invalid');
    e.statusCode = 400;
    throw e;
  }
  let encoded;
  try {
    encoded = JSON.stringify(v);
  } catch {
    const e = new Error(field + '_invalid');
    e.statusCode = 400;
    throw e;
  }
  if (typeof encoded !== 'string' || encoded.length > MAX_DATA) {
    const e = new Error(field + '_too_large');
    e.statusCode = 400;
    throw e;
  }
  return v;
}

/**
 * 恢复密钥包裹体：nonce(12) + AES-GCM 密文 + tag(16)，base64。
 * 客户端用「恢复口令派生的密钥」把「数据密钥」包一层，服务端只存这团看不出内容的密文。
 * 找回时原样返回，客户端用恢复口令解包拿到数据密钥，才能解密真正同步的数据。
 * 允许为空（null/undefined）：用户尚未开启云同步时没有可包的内容。
 */
const MIN_WRAP = 12 + 16;
export function assertRecoveryBlob(v, field = 'recovery_blob') {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v !== 'string' || v.length > MAX_BLOB) {
    const e = new Error(field + '_invalid');
    e.statusCode = 400;
    throw e;
  }
  const buf = Buffer.from(v, 'base64');
  // 至少 nonce + 空明文 + tag；base64 解码长度异常（含非法字符会变短）也拒
  if (buf.length < MIN_WRAP || buf.length > MAX_BLOB) {
    const e = new Error(field + '_invalid');
    e.statusCode = 400;
    throw e;
  }
  return buf;
}

/** 设备名：短标识，用于「我的」页展示设备列表 */
export function assertDeviceName(v) {
  const s = typeof v === 'string' ? v.trim() : '未命名设备';
  return s.slice(0, 60) || '未命名设备';
}

// ---------- AI 云代理 ----------

/** 提供商标识：与前端 PROVIDERS 的键对应，custom 表示自定义中转站 */
const PROVIDER_RE = /^[a-z0-9][a-z0-9._-]{0,31}$/;
export function assertProvider(v) {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : 'custom';
  if (!PROVIDER_RE.test(s)) {
    const e = new Error('provider_invalid');
    e.statusCode = 400;
    throw e;
  }
  return s;
}

/** 协议：openai 兼容（/chat/completions）或 anthropic（/messages） */
export function assertProtocol(v) {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : 'openai';
  if (s !== 'openai' && s !== 'anthropic') {
    const e = new Error('protocol_invalid');
    e.statusCode = 400;
    throw e;
  }
  return s;
}

/**
 * BaseUrl 校验 + SSRF 收敛。
 *
 * 这个地址会被服务端带着站长 Key 去请求，所以必须收紧：
 * - 只允许 http/https；禁止 URL 内嵌账号密码（user:pass@）
 * - 禁止指向云元数据等链路本地地址（169.254.0.0/16），那是拖 Key 的经典路径
 * - http（明文）仅允许回环/内网地址：给「自建的本地 Ollama」留口子；
 *   公网地址一律 https，避免 Key 在明文链路上被嗅探
 */
const PRIVATE_HOST_RE = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1|\[?fe80:|\[?f[cd][0-9a-f]{2}:)/i;
const METADATA_HOST_RE = /^(169\.254\.|metadata|metadata\.google|100\.100\.100\.200)/i;

export function assertBaseUrl(v, field = 'base_url') {
  const s = typeof v === 'string' ? v.trim().replace(/\/+$/, '') : '';
  if (!/^https?:\/\//i.test(s)) {
    const e = new Error(field + '_invalid');
    e.statusCode = 400;
    throw e;
  }
  let u;
  try {
    u = new URL(s);
  } catch {
    const e = new Error(field + '_invalid');
    e.statusCode = 400;
    throw e;
  }
  if (u.username || u.password || u.hash) {
    const e = new Error(field + '_invalid');
    e.statusCode = 400;
    throw e;
  }
  const host = u.hostname;
  if (METADATA_HOST_RE.test(host)) {
    const e = new Error(field + '_invalid');
    e.statusCode = 400;
    throw e;
  }
  if (u.protocol === 'http:' && !PRIVATE_HOST_RE.test(host)) {
    const e = new Error(field + '_invalid');
    e.statusCode = 400;
    throw e;
  }
  if (s.length > 256) {
    const e = new Error(field + '_invalid');
    e.statusCode = 400;
    throw e;
  }
  return s;
}

/** API Key：8–512 位，不允许空白（首尾空格是最常见的复制失误） */
export function assertApiKey(v, field = 'api_key') {
  const s = typeof v === 'string' ? v.trim() : '';
  if (s.length < 8 || s.length > 512 || /\s/.test(s)) {
    const e = new Error(field + '_invalid');
    e.statusCode = 400;
    throw e;
  }
  return s;
}

/** 模型名：1–64，覆盖各家命名（含点、冒号、斜杠） */
const MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,63}$/;
export function assertModel(v, field = 'model') {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!MODEL_RE.test(s)) {
    const e = new Error(field + '_invalid');
    e.statusCode = 400;
    throw e;
  }
  return s;
}

/**
 * 对话消息数组：1–40 条，role 白名单，内容 1–32000 字符，总量 64KB。
 * 上限既要挡住「塞一整个命盘库刷额度」，又不能砍掉真实场景的长 prompt（盘面 + 典籍 RAG）。
 */
const MAX_MSGS = 40;
const MAX_CONTENT = 32_000;
const MAX_TOTAL = 64 * 1024;
const ROLES = new Set(['system', 'user', 'assistant']);

export function assertMessages(v, field = 'messages') {
  if (!Array.isArray(v) || v.length === 0 || v.length > MAX_MSGS) {
    const e = new Error(field + '_invalid');
    e.statusCode = 400;
    throw e;
  }
  let total = 0;
  const out = [];
  for (const m of v) {
    const role = m && typeof m.role === 'string' ? m.role : '';
    const content = m && typeof m.content === 'string' ? m.content : '';
    if (!ROLES.has(role)) {
      const e = new Error(field + '_invalid');
      e.statusCode = 400;
      throw e;
    }
    if (!content.length || content.length > MAX_CONTENT) {
      const e = new Error(field + '_invalid');
      e.statusCode = 400;
      throw e;
    }
    total += content.length;
    if (total > MAX_TOTAL) {
      const e = new Error(field + '_too_large');
      e.statusCode = 400;
      throw e;
    }
    out.push({ role, content });
  }
  return out;
}

/**
 * 场景标识：realtime | lifetime | classics | daily | decision | admin_test。
 * 允许缺省（老客户端不带 scene，行为与从前一致）。
 * 为什么单独校验而不复用 assertTier：场景名是白名单枚举，写错必须 400 报出来，
 * 否则客户端拼错一个字母，服务端会静默按通用对话处理，排查时毫无线索。
 * 两道关：先查格式（防注入/超长），再查白名单（防拼错）——
 * 只查格式不够，'realtim' 这种拼错能过正则，然后被当成无场景静默放行。
 */
export function assertScene(v) {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).trim().toLowerCase();
  if (!s || s.length > 32 || !/^[a-z][a-z0-9_]*$/.test(s)) {
    const e = new Error('scene_invalid');
    e.statusCode = 400;
    throw e;
  }
  if (!Object.prototype.hasOwnProperty.call(SCENES, s)) {
    const e = new Error('scene_invalid');
    e.statusCode = 400;
    throw e;
  }
  return s;
}

/** 0..2 之间，缺省 0.6（与客户端 store 默认值一致） */
export function assertTemperature(v) {
  if (v === undefined || v === null || v === '') return 0.6;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 2) {
    const e = new Error('temperature_invalid');
    e.statusCode = 400;
    throw e;
  }
  return n;
}

/** 1..32000，缺省 1800 */
export function assertMaxTokens(v) {
  if (v === undefined || v === null || v === '') return 1800;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 1 || n > 32000) {
    const e = new Error('max_tokens_invalid');
    e.statusCode = 400;
    throw e;
  }
  return Math.floor(n);
}

/**
 * 难度档位提示（客户端知道场景：一键起课 = easy，全盘详批 = hard）。
 * 允许缺省：没给就由服务端按文本启发式估。
 */
export function assertTier(v) {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).trim().toLowerCase();
  if (s !== 'easy' && s !== 'mid' && s !== 'hard') {
    const e = new Error('difficulty_invalid');
    e.statusCode = 400;
    throw e;
  }
  return s;
}

