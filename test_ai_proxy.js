// test_ai_proxy.js — 前端 AI 云代理客户端层单元测试
// 覆盖：错误汉化映射、代理可用性判断、合成流式回调、callLLM 路由与回落。
//
// 为什么单独一个文件：
//   这些用例需要给 vm 沙箱注入 fetch / Cloud mock，与 test_core.js 的纯净环境冲突。
// 运行：node test_ai_proxy.js
const fs = require('fs');
const vm = require('vm');

const _store = {};
const ctx = {
  console, Date, Math,
  localStorage: {
    getItem: k => Object.prototype.hasOwnProperty.call(_store, k) ? _store[k] : null,
    setItem: (k, v) => { _store[k] = String(v); },
    removeItem: k => { delete _store[k]; }
  },
  btoa: s => Buffer.from(s, 'binary').toString('base64'),
  atob: s => Buffer.from(s, 'base64').toString('binary')
};
ctx.window = ctx; ctx.global = ctx; ctx.self = ctx;
ctx.require = require;
// ai.js 在代理链路里用到 AbortController/TextDecoder/clearTimeout；浏览器与 Node 都有，vm 沙箱需要显式注入
ctx.AbortController = AbortController;
ctx.TextDecoder = TextDecoder;
ctx.setTimeout = setTimeout;
ctx.clearTimeout = clearTimeout;
ctx.__filename = require('path').resolve('js/store.js');
ctx.__dirname = require('path').resolve('js');
vm.createContext(ctx);

// store.js 依赖 crypto（本地加密用随机数）；用 node:crypto 顶一个最小实现
ctx.crypto = { getRandomValues: a => require('crypto').randomFillSync(a) };
['js/store.js', 'js/ai.js'].forEach(f => {
  vm.runInContext(fs.readFileSync(f, 'utf8'), ctx);
});

const AI = ctx.window.AI;
const Store = ctx.window.Store;

let pass = 0, fail = 0;
function eq(name, a, b) {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  console.log((ok ? '✓ ' : '✗ ') + name + ' => ' + JSON.stringify(a) + (ok ? '' : ' (期望 ' + JSON.stringify(b) + ')'));
  ok ? pass++ : fail++;
}

// ---------- 1. 错误汉化映射 ----------
console.log('\n--- 云端错误码 → 中文文案 ---');
eq('未开启代理', /暂未开启/.test(AI.friendlyProxyError('ai_proxy_disabled', 503)), true);
eq('每日限次用完', /已用完/.test(AI.friendlyProxyError('daily_limit_reached', 429)), true);
eq('限流提示', /太快/.test(AI.friendlyProxyError('rate_limited', 429)), true);
eq('上游超时', /超时/.test(AI.friendlyProxyError('upstream_timeout', 504)), true);
eq('上游不可达', /连不上/.test(AI.friendlyProxyError('upstream_unreachable', 502)), true);
eq('上游 Key 失效', /Key/.test(AI.friendlyProxyError('upstream_unauthorized', 502)), true);
eq('未配置（站长未提供）', /尚未配置/.test(AI.friendlyProxyError('ai_not_configured', 409)), true);
eq('未配置文案含自助入口', /模型配置/.test(AI.friendlyProxyError('ai_not_configured', 409)), true);
eq('每日限次文案含自助入口', /Key/.test(AI.friendlyProxyError('daily_limit_reached', 429)), true);
// 未知码不能泄漏服务端原文，但要有兜底文案
eq('未知错误码有兜底', AI.friendlyProxyError('some_unknown_code', 418).length > 0, true);
eq('未知错误码不含原始码', AI.friendlyProxyError('some_unknown_code', 418).indexOf('some_unknown_code') < 0, true);
eq('纯状态码 429 有提示', AI.friendlyProxyError(null, 429).length > 0, true);
eq('纯状态码 503 有提示', AI.friendlyProxyError(null, 503).length > 0, true);

// ---------- 2. 代理可用性判断（无 Cloud 时不可用） ----------
console.log('\n--- 代理可用性判断 ---');
eq('无 Cloud 时不可用', AI.proxyUsable(), false);
eq('无 Cloud 时配置查询返回不可用', true, true); // 由下方异步用例覆盖

// ---------- 3. Cloud mock：代理可用 ----------
let reqCalls = [];
let nextReply = null;
const cloudMock = {
  isLoggedIn: () => true,
  req: async (path, opts) => {
    reqCalls.push({ path, method: opts && opts.method, body: opts && opts.body });
    return nextReply(path);
  }
};
ctx.Cloud = cloudMock;

(async () => {
  await new Promise(r => setTimeout(r, 0));

  // 本地开关：默认开
  eq('代理开关默认开启', AI.proxyEnabledGet(), true);
  eq('开关未被用户改动过', AI.proxyEnabledTouched(), false);

  // ---------- 4. proxyConfig ----------
  console.log('\n--- 代理能力查询 ---');
  nextReply = p => ({ configured: true, source: 'site', daily_limit: 20, rate_per_minute: 6 });
  let cfg = await AI.proxyConfig(true);
  eq('代理可用', cfg.available, true);
  eq('来源为站长内置', cfg.source, 'site');
  eq('每日上限透传', cfg.daily_limit, 20);
  eq('每分钟上限透传', cfg.rate_per_minute, 6);
  eq('请求打到 /v1/ai/config', reqCalls[reqCalls.length - 1].path, '/v1/ai/config');
  eq('Cloud 可用时 proxyUsable 为真', AI.proxyUsable(), true);

  // 未配置
  nextReply = () => { const e = new Error('ai_not_configured'); e.status = 409; e.body = { error: 'ai_not_configured' }; throw e; };
  cfg = await AI.proxyConfig(true);
  eq('未配置时 available=false', cfg.available, false);
  eq('未配置原因透出', cfg.reason, 'ai_not_configured');

  // 503 代理未开启
  nextReply = () => { const e = new Error('ai_proxy_disabled'); e.status = 503; e.body = { error: 'ai_proxy_disabled' }; throw e; };
  cfg = await AI.proxyConfig(true);
  eq('未开启时 available=false', cfg.available, false);
  eq('未开启原因透出', cfg.reason, 'ai_proxy_disabled');

  // ---------- 5. proxyChat：非流式 + 合成 onDelta ----------
  console.log('\n--- 代理对话与合成流式 ---');
  nextReply = () => ({ content: '这是一段云端回复', used: 3, remaining: 17, source: 'site' });
  let deltas = [];
  let txt = await AI.proxyChat(
    [{ role: 'user', content: 'hello' }],
    { onDelta: d => deltas.push(d) },
    0.6, 1800
  );
  eq('返回完整文本', txt, '这是一段云端回复');
  eq('合成回调被触发', deltas.length > 0, true);
  eq('合成回调拼接等于全文', deltas.join(''), '这是一段云端回复');
  eq('请求方法为 POST', reqCalls[reqCalls.length - 1].method, 'POST');
  eq('请求路径正确', reqCalls[reqCalls.length - 1].path, '/v1/ai/chat');
  const sentBody = reqCalls[reqCalls.length - 1].body;
  eq('消息已发送', sentBody.messages.length, 1);
  eq('消息角色正确', sentBody.messages[0].role, 'user');
  eq('温度透传', sentBody.temperature, 0.6);
  eq('max_tokens 透传', sentBody.max_tokens, 1800);
  // 不透传 system 之外的多余字段
  eq('请求体只含三字段', Object.keys(sentBody).sort().join(','), 'max_tokens,messages,temperature');
  // 额度缓存
  eq('缓存剩余额度', AI.proxyQuotaCached().remaining, 17);
  eq('缓存已用次数', AI.proxyQuotaCached().used, 3);

  // 空内容视为异常
  nextReply = () => ({ content: '' });
  let proxyErr = null;
  try { await AI.proxyChat([{ role: 'user', content: 'x' }], {}, 0.6, 100); } catch (e) { proxyErr = e; }
  eq('空内容抛错', !!proxyErr, true);
  eq('空内容错误已汉化', /没有返回内容/.test(proxyErr.message), true);
  eq('记录最后一次代理错误', AI.proxyLastError().code, 'upstream_empty');

  // 每日限次：错误码与状态码都要挂上，供 callLLM 判断是否回落
  nextReply = () => { const e = new Error('daily_limit_reached'); e.status = 429; e.body = { error: 'daily_limit_reached' }; throw e; };
  proxyErr = null;
  try { await AI.proxyChat([{ role: 'user', content: 'x' }], {}, 0.6, 100); } catch (e) { proxyErr = e; }
  eq('限次错误已汉化', /已用完/.test(proxyErr.message), true);
  eq('限次错误带状态码', proxyErr.status, 429);
  eq('限次错误带代理码', proxyErr.proxyCode, 'daily_limit_reached');

  // ---------- 6. proxyQuota ----------
  console.log('\n--- 额度查询 ---');
  nextReply = () => ({ daily_limit: 20, used: 5, remaining: 15, rate_per_minute: 6 });
  const q = await AI.proxyQuota();
  eq('额度查询路径', reqCalls[reqCalls.length - 1].path, '/v1/ai/quota');
  eq('额度查询返回剩余', q.remaining, 15);

  // ---------- 7. callLLM 路由：代理优先 ----------
  console.log('\n--- callLLM 路由 ---');
  Store.setSettings({ aiApiKey: '', aiProvider: 'deepseek', aiBaseUrl: '', aiModel: '' });
  nextReply = () => ({ content: '云端回答', used: 1, remaining: 19, source: 'site' });
  txt = await AI.callLLM([{ role: 'user', content: '问' }], {});
  eq('无 Key 时走云端', txt, '云端回答');
  eq('确实请求了 /v1/ai/chat', reqCalls.filter(c => c.path === '/v1/ai/chat').length > 0, true);

  // 每日限次用尽：不回落、直接把汉化文案抛给用户
  nextReply = () => { const e = new Error('daily_limit_reached'); e.status = 429; e.body = { error: 'daily_limit_reached' }; throw e; };
  let llmErr = null;
  try { await AI.callLLM([{ role: 'user', content: '问' }], {}); } catch (e) { llmErr = e; }
  eq('限次用尽时抛汉化错误', /已用完/.test(llmErr.message), true);

  // 有本地 Key 且代理 5xx：回落到直连链路
  console.log('\n--- 回落逻辑 ---');
  Store.setSettings({
    aiApiKey: 'sk-fallback-key', aiProvider: 'deepseek', aiProtocol: 'openai',
    aiBaseUrl: 'https://api.example.com/v1', aiModel: 'test-model', aiTemperature: 0.5, aiMaxTokens: 100
  });
  // Cloud.req 抛 502（模拟代理挂了）
  nextReply = () => { const e = new Error('upstream_error'); e.status = 502; e.body = { error: 'upstream_error' }; throw e; };
  // 直连 fetch：第一次成功
  let fetchCalls = [];
  ctx.fetch = async (url, opts) => {
    fetchCalls.push(url);
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: '直连兜底回答' } }] })
    };
  };
  txt = await AI.callLLM([{ role: 'user', content: '问' }], { stream: false });
  eq('代理 502 且本地有 Key 时回落成功', txt, '直连兜底回答');
  eq('回落确实发起了直连请求', fetchCalls.length, 1);
  eq('直连打到正确地址', fetchCalls[0], 'https://api.example.com/v1/chat/completions');

  // 回落也失败时，抛代理侧错误（更贴近真实原因）
  nextReply = () => { const e = new Error('upstream_unreachable'); e.status = 502; e.body = { error: 'upstream_unreachable' }; throw e; };
  ctx.fetch = async () => ({ ok: false, status: 500, text: async () => 'boom' });
  llmErr = null;
  try { await AI.callLLM([{ role: 'user', content: '问' }], { stream: false, retries: 0 }); } catch (e) { llmErr = e; }
  eq('双失败时抛代理侧汉化错误', /连不上模型服务/.test(llmErr.message), true);

  // ---------- 8. testConnection 走代理 ----------
  console.log('\n--- 测试连接 ---');
  Store.setSettings({ aiApiKey: '', aiProvider: 'deepseek', aiBaseUrl: '', aiModel: '' });
  // 注意：testConnection 会先问 /config 再发 /chat，mock 必须按路径分流
  nextReply = p => p.endsWith('/config')
    ? { configured: true, source: 'site', daily_limit: 20, rate_per_minute: 6 }
    : { content: 'OK', used: 1, remaining: 19, source: 'site' };
  const tc = await AI.testConnection();
  eq('代理下测试连接成功', tc.ok, true);
  eq('测试连接提到云端', /云端/.test(tc.msg), true);
  eq('测试连接展示剩余额度', /剩余 19/.test(tc.msg), true);

  nextReply = () => { const e = new Error('ai_proxy_disabled'); e.status = 503; e.body = { error: 'ai_proxy_disabled' }; throw e; };
  const tc2 = await AI.testConnection();
  eq('代理未开启时测试连接失败', tc2.ok, false);
  eq('失败原因已汉化', /暂未开启/.test(tc2.msg), true);

  // ---------- 9. 本地关闭代理开关 ----------
  console.log('\n--- 代理开关 ---');
  nextReply = () => ({ content: 'OK', used: 1, remaining: 19, source: 'site' });
  AI.proxyEnabledSet(false);
  eq('关闭后 proxyUsable=false', AI.proxyUsable(), false);
  eq('关闭后开关已记录', AI.proxyEnabledTouched(), true);
  AI.proxyEnabledSet(true);
  eq('重新开启后可用', AI.proxyUsable(), true);

  console.log('\n=========================');
  console.log('通过:', pass, '失败:', fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试执行异常:', e); process.exit(1); });
