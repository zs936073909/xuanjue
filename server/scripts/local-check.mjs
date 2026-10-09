// 本地一体化部署预演：建 schema → 自检 → 起服务 → 打真实 HTTP 全流程。
//
// 为什么需要它：托管平台的免费档普遍会「休眠 / 挂起计算」，出了问题很难判断是
// 「代码坏了」还是「平台在睡」。这个脚本让你在本地先把整条链路跑通，
// 再上云就只剩「填地址」这一件事。
//
// 用法：
//   node scripts/local-check.mjs                       # 用本地默认库与随机端口
//   DATABASE_URL=... JWT_SECRET=... node scripts/local-check.mjs
// 退出码 0 = 全链路通；非 0 = 中断位置会打印出来
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.CHECK_PORT || 18899);
const BASE = 'http://127.0.0.1:' + PORT;

const step = (msg) => console.info(`\n[local-check] ${msg}`);
const fail = (msg) => { console.error(`[local-check] ✗ ${msg}`); process.exit(1); };

// 跑一个子脚本并继承输出
function run(cmd, args, env) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: ROOT, stdio: 'inherit', env: Object.assign({}, process.env, env) });
    p.on('exit', c => (c === 0 ? resolve() : reject(new Error(cmd + ' ' + args.join(' ') + ' 退出码 ' + c))));
    p.on('error', reject);
  });
}

// 起服务进程，等 /health 通
async function startServer() {
  const child = spawn('node', ['index.js'], {
    cwd: ROOT,
    env: Object.assign({}, process.env, {
      PORT: String(PORT),
      DATABASE_URL: process.env.DATABASE_URL || 'postgres://xuanjue:xuanjue@127.0.0.1:5432/xuanjue',
      JWT_SECRET: process.env.JWT_SECRET || cryptoRandom(),
      LOG_LEVEL: 'warn'
    }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', () => {});
  child.stderr.on('data', d => process.stderr.write('[server] ' + d));
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(BASE + '/health');
      if (r.ok) return child;
    } catch { /* 还没起来 */ }
    await sleep(300);
  }
  child.kill();
  return null;
}
function cryptoRandom() {
  return Array.from({ length: 48 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(p, opts = {}) {
  const r = await fetch(BASE + p, {
    method: opts.method || 'GET',
    headers: Object.assign({ 'content-type': 'application/json' }, opts.headers || {}),
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const t = await r.text();
  let j; try { j = t ? JSON.parse(t) : null; } catch { j = { raw: t }; }
  return { status: r.status, body: j };
}

step('1/4 初始化 schema（幂等）');
try { await run('node', ['scripts/db-init.mjs']); } catch { fail('schema 初始化失败'); }

step('2/4 启动服务 :' + PORT);
const child = await startServer();
if (!child) fail('服务没起来：先确认 DATABASE_URL 指向一个能连上的 PostgreSQL');
try {
  const h = await api('/health');
  if (!h.body || !h.body.ok) fail('/health 返回异常：' + JSON.stringify(h.body));
  console.info('[local-check] ✓ /health 通');

  step('3/4 打一遍真实 HTTP（注册 → 解锁 → 同步 → 拉取 → 注销）');
  const token = 'local-check-' + Math.random().toString(36).slice(2, 14).padEnd(16, 'q');
  const recovery = 'local-recovery-2026';

  const reg = await api('/v1/auth/register', { method: 'POST', body: { token, recovery, deviceName: 'local-check' } });
  if (reg.status !== 200) fail('注册失败：' + JSON.stringify(reg.body));
  if (!reg.body.access || !reg.body.refresh) fail('注册响应缺 access/refresh');
  console.info('[local-check] ✓ 注册（明文协议，无加密材料）');

  const un = await api('/v1/auth/unlock', { method: 'POST', body: { token, deviceName: 'local-check' } });
  if (un.status !== 200) fail('解锁失败：' + JSON.stringify(un.body));
  const auth = { authorization: 'Bearer ' + un.body.access };
  console.info('[local-check] ✓ 解锁');

  const payload = [{ id: 'LC1', title: 'local-check 案例' }];
  const put = await api('/v1/sync/cases?device=local-check', { method: 'PUT', headers: auth, body: { data: payload, base_rev: 0 } });
  if (put.status !== 200 || put.body.rev !== 1) fail('推送失败：' + JSON.stringify(put.body));
  console.info('[local-check] ✓ 推送快照 rev=1');

  const pull = await api('/v1/sync', { headers: auth });
  const snap = (pull.body.snapshots || []).find(s => s.kind === 'cases');
  if (!snap || JSON.stringify(snap.data) !== JSON.stringify(payload)) fail('拉取回来的数据对不上：' + JSON.stringify(pull.body));
  console.info('[local-check] ✓ 拉取数据一致（明文 JSON 原样往返）');

  const rc = await api('/v1/auth/recover', { method: 'POST', body: { prefix: token.slice(0, 6), recovery, deviceName: 'local-check' } });
  if (rc.status !== 200 || !rc.body.access) fail('找回失败：' + JSON.stringify(rc.body));
  console.info('[local-check] ✓ 找回（换发令牌，云端数据随登录可用）');

  const del = await api('/v1/me', { method: 'DELETE', headers: auth });
  if (del.status !== 200) fail('注销失败：' + JSON.stringify(del.body));
  console.info('[local-check] ✓ 注销（级联清库）');
} finally {
  step('4/4 收尾');
  child.kill();
}

if (!fs.existsSync(path.join(ROOT, 'node_modules'))) fail('缺依赖：先在 server 目录 npm install');
console.info('\n[local-check] 全部通过 —— 这条链路在本地是通的，剩下的只是把同一套环境变量搬到平台上。');
console.info('[local-check] 下一步：node scripts/preflight.mjs 核对部署环境，然后照 docs/免费部署方案.md 上线。');
process.exit(0);
