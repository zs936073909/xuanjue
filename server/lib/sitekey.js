// 站长内置 Key 解析（AI_SITE_KEY）
//
// 设计动机：用户明确说「AIkey 我提供」，即站长掏一把 Key 给所有注册用户共用，
// 用户端应当是真正的零配置——不需要人人自己再填一遍。
// 因此除「每用户自存 Key（加密落库）」外，再提供一条 env 直配的共享通道。
//
// Key 保护（与 lib/aikey.js 的分工）：
//   - 这里根本不需要数据库，Key 只以明文形式活在进程内存中，任何接口都拿不到；
//   - 生态上比落库更安全（无密文可偷、无主密钥可爆破），但换 Key 必须重启进程；
//   - 出于同样的理由，日志绝不打印 AI_SITE_KEY 的值。
import { assertProtocol, assertBaseUrl, assertModel, assertApiKey } from './validate.js';

/** 从进程环境变量读入并解析；启动时调用一次，结果缓存 */
export function parseSiteKey(raw) {
  const out = { configured: false, keys: [], problem: '' };
  if (!raw || !String(raw).trim()) return out;
  const parts = String(raw)
    .split('|')
    .map(s => s.trim())
    .filter(Boolean);
  for (const p of parts) {
    try {
      out.keys.push(parseOne(p));
    } catch (e) {
      // 单把坏了不影响其他把可用，但要把原因暴露出来（preflight 会读）
      out.problem = e.message;
    }
  }
  out.configured = out.keys.length > 0;
  return out;
}

/** 形如 openai://sk-xxx@https://api.deepseek.com/v1/deepseek-chat */
function parseOne(spec) {
  const m = /^(openai|anthropic):\/\/([^@]+)@(.+)$/i.exec(spec);
  if (!m) {
    throw new Error(
      'AI_SITE_KEY 格式应为 protocol://key@base-url/model，例如 openai://sk-xxx@https://api.deepseek.com/v1/deepseek-chat'
    );
  }
  const protocol = assertProtocol(m[1]);
  const apiKey = assertApiKey(m[2]);
  const target = m[3].trim();

  // 拆 baseUrl 与 model：模型名可能带斜杠（魔搭 Qwen/Qwen3.5、deepseek-ai/DeepSeek-V4.1 等），
  // 所以不能简单按「最后一个斜杠」切。约定 baseUrl 以版本段（/v1 /v4 …）结尾，
  // 其后全部是模型名；无版本段时才退回「最后一个斜杠」的旧约定。
  //   @https://api-inference.modelscope.cn/v1/Qwen/Qwen3.5-0.8B
  //     → baseUrl=…/v1           model=Qwen/Qwen3.5-0.8B
  //   @https://api.stepfun.com/v1/step-3.5-flash
  //     → baseUrl=…/v1           model=step-3.5-flash
  const verSplit = /^(.*?\/v\d+)(?:\/(.+))?$/i.exec(target);
  let baseUrl;
  let model;
  if (verSplit && verSplit[2]) {
    baseUrl = verSplit[1];
    model = verSplit[2];
  } else {
    const lastSlash = target.lastIndexOf('/');
    if (lastSlash <= 'https:/'.length || lastSlash === -1) {
      throw new Error('AI_SITE_KEY 末尾需带模型名，如 @https://api.deepseek.com/v1/deepseek-chat');
    }
    baseUrl = target.slice(0, lastSlash);
    model = target.slice(lastSlash + 1);
  }
  return {
    protocol,
    apiKey,
    baseUrl: assertBaseUrl(baseUrl),
    model: assertModel(model),
    spec: redactSpec(protocol, baseUrl, model)
  };
}

/** 用于日志/接口回显的安全形态：协议 + 地址 + 模型，绝不含 Key */
export function redactSpec(protocol, baseUrl, model) {
  return protocol + '://' + baseUrl + '/' + model;
}

/** 轮询取一把：多把 Key 时按调用次数均摊，避免只压第一把 */
export function pickSiteKey(siteKey) {
  if (!siteKey || !siteKey.configured || !siteKey.keys.length) return null;
  const list = siteKey.keys;
  const i = siteKey._rr || 0;
  siteKey._rr = (i + 1) % list.length;
  return list[i];
}

/** 该用哪把 Key：优先站长内置，其次用户自存 */
export function resolveCredential(siteKey, userCfg, decryptedUserKey) {
  const site = pickSiteKey(siteKey);
  if (site) {
    return {
      source: 'site',
      protocol: site.protocol,
      baseUrl: site.baseUrl,
      model: site.model,
      apiKey: site.apiKey
    };
  }
  if (userCfg && decryptedUserKey) {
    return {
      source: 'user',
      protocol: userCfg.protocol,
      baseUrl: userCfg.baseUrl,
      model: userCfg.model,
      apiKey: decryptedUserKey
    };
  }
  return null;
}
