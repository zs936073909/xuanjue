// 验证脚本：模拟 Render 生产环境（server/www 符号链接不存在）
// 确认 /app 走仓库根 www/ 回退命中，且路径穿越防护仍然有效
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SYMLINK = path.join(ROOT, 'server', 'www');
const HIDDEN = path.join(ROOT, 'server', 'www.__hidden_for_test__');
const BASE = 'http://127.0.0.1:8791';

const isSymlink = fs.lstatSync(SYMLINK).isSymbolicLink();
let moved = false;

function curl(p) {
  return new Promise((resolve) => {
    const req = fetch(BASE + p, { redirect: 'manual' });
    req.then(async (r) => {
      const body = await r.text();
      resolve({ status: r.status, loc: r.headers.get('location'), type: r.headers.get('content-type'), len: body.length, head: body.slice(0, 120) });
    }).catch((e) => resolve({ status: 'FETCH_ERR', loc: null, type: null, len: 0, head: String(e.message) }));
  });
}

let out = '';
const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail: detail || '' });
  console.log((cond ? '  ✓ ' : '  ✗ ') + name + (detail ? '  ' + detail : ''));
}

try {
  if (isSymlink) { fs.renameSync(SYMLINK, HIDDEN); moved = true; }
  console.log('已隐藏 server/www 符号链接，模拟 Render 生产环境');

  const child = spawn('node', ['index.js'], {
    cwd: path.join(ROOT, 'server'),
    env: { ...process.env, PORT: '8791', JWT_SECRET: 'test-secret', DATABASE_URL: 'postgres://x:x@127.0.0.1:5432/none', NODE_ENV: 'production', LOG_LEVEL: 'info' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true
  });
  child.stdout.on('data', (d) => { out += d.toString(); });
  child.stderr.on('data', (d) => { out += d.toString(); });

  // 等服务就绪
  let up = false;
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 250));
    const h = await curl('/health');
    if (h.status === 200) { up = true; break; }
  }
  check('服务启动', up);

  if (up) {
    const wwwReady = /www\/ 目录不存在/.test(out) ? 'MISSING' : 'ok';
    check('启动日志：未报 www 缺失', wwwReady === 'ok', wwwReady === 'MISSING' ? '（回退失败）' : '');
    check('启动日志：/app 静态目录就绪', /\/app 静态目录就绪/.test(out));

    const index = await curl('/app/');
    check('GET /app/ → 200', index.status === 200, 'status=' + index.status);
    check('/app/ Content-Type 是 html', /text\/html/.test(index.type || ''), String(index.type));
    check('/app/ index.html 非空', index.len > 500, index.len + 'B');

    const noSlash = await curl('/app');
    check('GET /app → 301', noSlash.status === 301, 'status=' + noSlash.status);
    check('301 目标为 /app/', noSlash.loc === '/app/', String(noSlash.loc));

    const css = await curl('/app/css/style.css');
    check('GET /app/css/style.css → 200', css.status === 200, 'status=' + css.status);
    check('css Content-Type 正确', /text\/css/.test(css.type || ''), String(css.type));

    const js = await curl('/app/js/app.js');
    check('GET /app/js/app.js → 200', js.status === 200, 'status=' + js.status);
    check('js Content-Type 正确', /javascript/.test(js.type || ''), String(js.type));

    const sw = await curl('/app/service-worker.js');
    check('GET /app/service-worker.js → 200', sw.status === 200, 'status=' + sw.status);

    const mf = await curl('/app/manifest.json');
    check('GET /app/manifest.json → 200', mf.status === 200, 'status=' + mf.status);

    const data = await curl('/app/data/classics/index.json');
    check('GET /app/data/classics/index.json → 200', data.status === 200, 'status=' + data.status);

    const traversal = await curl('/app/../server/index.js');
    check('路径穿越 /app/../server/index.js 被拦', traversal.status === 404, 'status=' + traversal.status);

    const enc = await curl('/app/%2e%2e/server/index.js');
    check('编码穿越 %2e%2e 被拦', enc.status === 404, 'status=' + enc.status);

    const ext = await curl('/app/index.html.bak');
    check('白名单外后缀 404', ext.status === 404, 'status=' + ext.status);
  }

  try { process.kill(-child.pid, 'SIGTERM'); } catch (e) { try { child.kill(); } catch (e2) {} }
} finally {
  if (moved) fs.renameSync(HIDDEN, SYMLINK);
  console.log('已还原 server/www 符号链接');
}

const fail = results.filter(r => !r.ok);
console.log('\n结果：' + (results.length - fail.length) + '/' + results.length + ' 通过');
if (fail.length) { console.log('失败项：' + fail.map(f => f.name).join('; ')); process.exit(1); }
console.log('ALL PASS');
