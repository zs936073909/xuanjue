// 玄决云后端 · 入口
//
// 账号为纯令牌模式：服务端只存令牌 SHA-256 与前 6 位前缀，不存邮箱、不存密码。
// 【2026-10 变更】业务数据明文落库（站长决策，供管理员后台查看与管理），
// 同步协议与 App 隐私文案已同步改为如实描述，不再声称零知识。
// AI 模型池（多厂商/多模型/多 Key + 难度分级路由）由管理员在 /admin 后台配置。
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fs from 'node:fs';
import path from 'node:path';
import { registerAuth } from './routes/auth.js';
import { registerSync } from './routes/sync.js';
import { registerMe } from './routes/me.js';
import { registerAI } from './routes/ai.js';
import { registerAdmin } from './routes/admin.js';
import { getEnv, assertEnv } from './lib/env.js';

const env = getEnv();
assertEnv(env);

export async function build() {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      // 绝不记录 body（含 token / 口令）与敏感头
      serializers: {
        req(req) {
          return { method: req.method, url: req.url, ip: req.ip };
        }
      }
    },
    trustProxy: true,
    bodyLimit: 8 * 1024 * 1024 // 同步 payload 上限 8MB
  });

  await app.register(cors, { origin: env.CORS_ORIGINS, credentials: true });
  await app.register(rateLimit, {
    max: 120,
    timeWindow: '1 minute'
  });

  // 容错的 JSON 解析器：空 body（如 DELETE /v1/me）不再报 400，
  // 非 JSON 内容也能给出干净的 400 而不是 500
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer', bodyLimit: 8 * 1024 * 1024 },
    (req, body, done) => {
      if (!body || !body.length) return done(null, {});
      try {
        done(null, JSON.parse(body.toString('utf8')));
      } catch (err) {
        err.statusCode = 400;
        done(err, undefined);
      }
    }
  );

  app.get('/health', async () => ({ ok: true, ts: Date.now() }));

  // 管理后台单页：同域托管，免 CORS、免单独部署。
  // 页面本身不含任何数据 —— 数据全部走 /v1/admin/*（要管理员登录），搜索引擎也不收录。
  const adminHtml = fs.readFileSync(new URL('./admin/index.html', import.meta.url), 'utf8');
  const serveAdmin = async (req, reply) => reply.type('text/html; charset=utf-8').send(adminHtml);
  app.get('/admin', serveAdmin);
  app.get('/admin/', serveAdmin);

  // 服务入口落地页：对外门面（品牌 + 后台入口 + 实时状态 + 接入说明）。
  // 为什么和 /admin 一样用 readFileSync + send 而不是 @fastify/static：
  // 这里只需要托管两个静态文件（落地页 + 图标），为一个图标引入整个静态插件
  // 会让依赖树多一层、也要重新 npm install；内联 send 与现有模式一致、零新增依赖。
  const landingHtml = fs.readFileSync(new URL('./public/index.html', import.meta.url), 'utf8');
  const serveLanding = async (req, reply) => reply.type('text/html; charset=utf-8').send(landingHtml);
  app.get('/', serveLanding);
  app.get('/index.html', serveLanding);
  // 图标单独一路：SVG 走 text 类型，否则浏览器按 HTML 解析会显示成空白页
  const favicon = fs.readFileSync(new URL('./public/icon.svg', import.meta.url));
  app.get('/favicon.ico', async (req, reply) => reply.type('image/svg+xml').send(favicon));
  app.get('/icon.svg', async (req, reply) => reply.type('image/svg+xml').send(favicon));

  // ============================================================
  // 玄决 App 完整版托管（/app 路径前缀）
  //
  // 为什么必须托管：此前根路径只挂品牌落地页，用户打开服务地址只能"看"不能"用" ——
  // 排盘界面（index.html + css/js/data 共 15MB）从来没上线过。www/ 是 build.mjs 的
  // 正式产物（含 manifest.json 与 service-worker.js，Capacitor Android 也用同一份），
  // 是最该上线的那一份，这里按 www/ 原样发送。
  //
  // 为什么用 /app 而不是把 / 直接换成 App：
  //   1. 落地页承担"这是什么 + 后台入口 + 服务状态探测"，换成 App 就全丢了；
  //   2. /admin 与 / 的文案、路由约定已经上线跑通，不破坏既有地址；
  //   3. 日后要换门面或做 SEO 落地页，App 侧无感。
  // 两者是互补关系：落地页回答"这是什么、怎么进"，/app 回答"现在就排一盘"。
  //
  // 为什么仍然不用 @fastify/static：只为托管一个静态目录引入整个静态插件
  // 会让依赖树多一层、也要重新 npm install；这里只发 5 类 MIME 的只读文件，
  // 用 readFileSync + send 与 /admin、落地页完全同模式，零新增依赖、行为可预测。
  // ============================================================
  // www/ 缺失不能拖垮整个服务：Render 上若漏配 build 命令，账号/同步/AI 路由必须仍然可用。
  // 因此这里容错取 null，路由侧发现 null 就给 App 专属 404，而不是启动即崩。
  // 这也让 server 自己的集成测试不必先跑前端构建。
  //
  // 为什么按两个候选顺序找（2026-10 部署踩坑，别删）：
  //   1) ./www —— server/www。本地开发时它是指向 ../www 的符号链接，realpathSync 会解析到仓库根；
  //   2) 仓库根 www/ —— 生产（Render）上的真实位置。render.yaml 不设 rootDir 时服务根即仓库根，
  //      而 server/www 这个符号链接不入库（.gitignore），所以 Render 上只存在这一份。
  //   只写 1) 会在生产上取不到（符号链接没跟过来），只写 2) 会让本地开发必须真的复制一份。
  //   两个都试、取第一个存在的，本地与云端同代码同行为。
  const WWW_CANDIDATES = [
    new URL('./www', import.meta.url),           // 本地：符号链接（解析后即仓库根 www/）
    new URL('../www', import.meta.url)           // 生产：仓库根实体目录（随 Git 入库）
  ];
  let WWW_ROOT = null;
  for (const cand of WWW_CANDIDATES) {
    try {
      // realpathSync 会解析符号链接，本地两条候选最终都指向同一实体目录，重复取无副作用
      WWW_ROOT = fs.realpathSync(cand);
      break;
    } catch (e) { /* 该候选不存在，试下一个 */ }
  }
  if (!WWW_ROOT) {
    app.log.warn('未找到 www/ 目录（server/www 符号链接与仓库根 www/ 均不存在），/app 将返回 404（账号与 AI 路由不受影响）');
  } else {
    app.log.info({ www: path.relative(process.cwd(), WWW_ROOT) }, '/app 静态目录就绪');
  }
  const APP_PREFIX = '/app';

  // 后缀 → Content-Type。为什么列白名单而不是用 mime 包：
  // www/ 里只有这几类文件，白名单既免依赖又能对未知后缀直接 404，不泄漏目录内容。
  const APP_MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.webmanifest': 'application/manifest+json',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.txt': 'text/plain; charset=utf-8'
  };

  // App 自己的 404：与主站同语言，给出可点击的回去的路，而不是一屏 JSON 错误。
  // 为什么先声明再被路由引用：函数体内引用 const 有 TDZ 风险，按声明顺序排干净。
  const app404 = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>未找到 · 玄决</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#1F1E1D;color:#F5F4EE;
font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Noto Sans SC",sans-serif;text-align:center;padding:24px}
.m{font-family:"Noto Serif SC","Songti SC",serif;font-size:44px;letter-spacing:.2em;color:#D97757;margin:0 0 10px}
p{color:#8F8B81;font-size:14px;line-height:1.8;margin:0 0 22px}
a{color:#D97757;border:1px solid rgba(217,119,87,.42);border-radius:8px;padding:10px 22px;
font-size:14px;text-decoration:none;display:inline-flex;align-items:center}
a:hover{background:rgba(217,119,87,.12)}</style></head>
<body><div><p class="m">玄决</p>
<p>这里没有对应内容。<br>可能链接已失效，或资源尚未随本次部署发布。</p>
<a href="${APP_PREFIX}">回到玄决 App</a></div></body></html>`;

  /** 把 URL 路径解析成 www/ 内的绝对路径；越界或后缀不在白名单一律返回 null（由调用方 404）。 */
  function resolveAppPath(urlPath) {
    if (!WWW_ROOT) return null;
    let rel = decodeURIComponent(String(urlPath || ''));
    const qi = rel.indexOf('?');
    if (qi >= 0) rel = rel.slice(0, qi);
    // 归一化必须做在解码之后：%2e%2e%2f 解码出来就是 ../，先归一化会被绕过
    rel = rel.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/+/, '');
    const parts = rel.split('/').filter((s) => s !== '' && s !== '.' && s !== '..');
    const abs = path.join(WWW_ROOT, parts.join('/'));
    // 双保险：即使上面漏了，拼接结果仍须以 WWW_ROOT 为界
    if (abs !== WWW_ROOT && !abs.startsWith(WWW_ROOT + path.sep)) return null;
    const ext = path.extname(abs).toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(APP_MIME, ext)) return null;
    return abs;
  }

  /** 读文件并回帖；缺文件/非文件/www 未构建返回 false，由调用方走 App 404。
   *  为什么返回裸布尔而不是 reply：Fastify 的 Reply 是 thenable（实现了 .then）。
   *  把 reply 交出去，调用方一句 `await sendAppFile(...)` 就会触发 reply.then()，
   *  在已 sent 的情况下 fulfilled() 不带参数，结果 ok 变成 undefined，
   *  于是 !ok 成立、又去 send 一次 404 —— 表现是"文件明明 200 了，日志里还报已发送"。
   *  所以这里只回 true/false，把 reply 的 thenable 语义彻底挡在函数内部。 */
  async function sendAppFile(abs, reply) {
    if (!abs) return false;
    let st = null;
    try {
      st = await fs.promises.stat(abs);
    } catch (e) { /* 不存在 */ }
    if (!st || !st.isFile()) return false;
    const ext = path.extname(abs).toLowerCase();
    const body = await fs.promises.readFile(abs);
    // 缓存策略分两档，为什么：
    //   index.html 是 SPA 入口且文件名不带内容指纹，必须 no-store ——
    //     否则发版后老用户仍持旧 index.html，引用的 js/css 名没变就会把旧版锁死；
    //   其余（js/css/字体/图片）内容与文件名绑定，长缓存 + SW 预缓存才对得上。
    const cache = ext === '.html' ? 'no-store' : 'public, max-age=86400, immutable';
    await reply
      .header('cache-control', cache)
      .header('x-content-type-options', 'nosniff')
      .type(APP_MIME[ext])
      .send(body);
    return true;
  }

  // /app（无尾斜杠）必须重定向到 /app/，这不是洁癖，是 App 能不能打开的分水岭：
  //   www/index.html 里所有资源都是相对引用（css/style.css、js/app.js、data/classics/…），
  //   service-worker 也用 './service-worker.js' 注册。相对路径按「文档 URL」解析：
  //     /app  →  基准是 /，于是 /css/style.css 404、SW 注册到 /service-worker.js 也 404
  //     /app/ →  基准是 /app/，全部命中
  //   后果上 /app 会白屏，且 SW 抢不到作用域，PWA 离线直接失效。
  //   用 301 而非 302：这个地址形态是永久约定，浏览器可以放心缓存，省一次往返。
  //   Fastify 的签名是 redirect(url, code)，顺序反了会把 301 当成 URL、把 /app/ 当成状态码。
  app.get(APP_PREFIX, async (req, reply) => {
    if (!WWW_ROOT) return reply.code(404).type('text/html; charset=utf-8').send(app404);
    return reply.redirect(APP_PREFIX + '/', 301);
  });

  /** /app/ 发 index.html（SPA 入口，壳内路由自己走）。 */
  const serveAppIndex = async (req, reply) => {
    const ok = await sendAppFile(WWW_ROOT ? path.join(WWW_ROOT, 'index.html') : null, reply);
    if (!ok) return reply.code(404).type('text/html; charset=utf-8').send(app404);
  };
  app.get(APP_PREFIX + '/', serveAppIndex);

  // /app/* 具体文件。为什么 /app 与 /app/ 要单独接住：Fastify 的 /app/* 不匹配空段，
  // 不单独注册的话根路径会掉到 404。
  app.get(APP_PREFIX + '/*', async (req, reply) => {
    const abs = resolveAppPath(req.url.slice(APP_PREFIX.length));
    if (!abs) return reply.code(404).type('text/html; charset=utf-8').send(app404);
    const ok = await sendAppFile(abs, reply);
    if (!ok) return reply.code(404).type('text/html; charset=utf-8').send(app404);
  });

  // 错误处理器必须先于路由注册：子作用域在注册时绑定错误处理器，
  // 后置 set 会让路由用 Fastify 默认形状（{error:'Bad Request'}）而不是统一的 {error:'具体原因'}。
  app.setErrorHandler((err, req, reply) => {
    req.log.error({ err: err.message }, 'unhandled');
    reply.code(err.statusCode || 500).send({
      error: err.statusCode && err.statusCode < 500 ? err.message : 'internal_error'
    });
  });

  await app.register(registerAuth, { prefix: '/v1/auth' });
  await app.register(registerSync, { prefix: '/v1/sync' });
  await app.register(registerMe, { prefix: '/v1' });
  await app.register(registerAI, { prefix: '/v1/ai' });
  await app.register(registerAdmin, { prefix: '/v1/admin' });

  return app;
}

const isMain = process.argv[1] && process.argv[1].endsWith('index.js');
if (isMain) {
  const app = await build();
  await app.listen({ port: env.PORT, host: '0.0.0.0' }).catch(e => {
    app.log.error(e);
    process.exit(1);
  });
}
