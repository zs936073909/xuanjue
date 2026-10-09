// 环境变量读取与启动校验
export function getEnv() {
  const env = process.env;
  return {
    PORT: Number(env.PORT || 8787),
    LOG_LEVEL: env.LOG_LEVEL || 'info',
    DATABASE_URL: env.DATABASE_URL || 'postgres://xuanjue:xuanjue@127.0.0.1:5432/xuanjue',
    JWT_SECRET: env.JWT_SECRET || '',
    JWT_ACCESS_TTL: env.JWT_ACCESS_TTL || '15m',
    JWT_REFRESH_TTL: env.JWT_REFRESH_TTL || '30d',
    CORS_ORIGINS: (env.CORS_ORIGINS || 'http://localhost:8765')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean),
    // 是否允许「注册」（压测/私有部署时可关）
    ALLOW_SIGNUP: env.ALLOW_SIGNUP !== 'false',
    // ---- AI 云代理（站长提供 Key，用户端免 Key）----
    // 关了就走「用户自带 Key 直连厂商」的老路，行为与之前完全一致
    AI_PROXY_ENABLED: env.AI_PROXY_ENABLED === 'true',
    // Key 加密主密钥：32 字节，base64 或十六进制均可；只在服务端环境变量里，绝不入库/绝不打日志
    AI_KEY_MASTER: env.AI_KEY_MASTER || '',
    AI_DAILY_LIMIT: clampInt(env.AI_DAILY_LIMIT, 30, 1, 100000),
    AI_RATE_PER_MINUTE: clampInt(env.AI_RATE_PER_MINUTE, 6, 1, 1000),
    // 站长内置 Key（可选）：env 单行约定 protocol://key@base-url/model，支持 | 分隔多把轮询。
    // 全部只活在进程内存，不落库、不打日志；配了它用户端就是真正的「零配置」。
    AI_SITE_KEY: env.AI_SITE_KEY || ''
  };
}

function clampInt(v, def, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

export function assertEnv(env) {
  const missing = [];
  if (!env.JWT_SECRET) missing.push('JWT_SECRET');
  if (!env.DATABASE_URL) missing.push('DATABASE_URL');
  if (missing.length) {
    throw new Error('缺少环境变量: ' + missing.join(', ') + ' —— 请参考 server/.env.example');
  }
}
