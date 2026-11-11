// 玄决云后端 · 入口
//
// 账号为纯令牌模式：服务端只存令牌 SHA-256 与前 6 位前缀，不存邮箱、不存密码。
// 【2026-10 变更】业务数据明文落库（站长决策，供管理员后台查看与管理），
// 同步协议与 App 隐私文案已同步改为如实描述，不再声称零知识。
// AI 模型池（多厂商/多模型/多 Key + 难度分级路由）由管理员在 /admin 后台配置。
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import compress from '@fastify/compress';
import fs from 'node:fs';
import path from 'node:path';
import { registerAuth } from './routes/auth.js';
import { registerSync } from './routes/sync.js';
import { registerMe } from './routes/me.js';
import { registerAI } from './routes/ai.js';
import { registerAdmin } from './routes/admin.js';
import { getEnv, assertEnv } from './lib/env.js';
import { runStartupMigrations } from './lib/migrate.js';

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
  // 文本资源压缩：br 优先、gzip 兜底。首屏 JS/CSS 实测 533KB → 175KB（-68%）。
  // jpg/png/woff2 已自带压缩，compressible 不会重复压；阈值 1KB 避免压小响应反而更慢。
  await app.register(compress, { encodings: ['br', 'gzip'], threshold: 1024 });
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

  // 服务门面落地页（品牌介绍 + 后台入口 + 实时状态 + 接入说明）。
  // 2026-10 起根路径 / 已让给桌面网页端（打开主域名即进 App），门面页移到 /portal：
  //   - 用户访问主域名直接落地产品，不再多一次点击；
  //   - 门面页不删除，后台入口与服务状态探测仍有固定地址。
  // 为什么和 /admin 一样用 readFileSync + send 而不是 @fastify/static：
  // 这里只需要托管一个 HTML 文件，为它引入整个静态插件会让依赖树多一层、
  // 也要重新 npm install；内联 send 与现有模式一致、零新增依赖。
  const landingHtml = fs.readFileSync(new URL('./public/index.html', import.meta.url), 'utf8');
  const serveLanding = async (req, reply) => reply.type('text/html; charset=utf-8').send(landingHtml);
  app.get('/portal', serveLanding);
  app.get('/portal/', serveLanding);
  // 图标单独一路：SVG 走 text 类型，否则浏览器按 HTML 解析会显示成空白页
  const favicon = fs.readFileSync(new URL('./public/icon.svg', import.meta.url));
  app.get('/favicon.ico', async (req, reply) => reply.type('image/svg+xml').send(favicon));
  app.get('/icon.svg', async (req, reply) => reply.type('image/svg+xml').send(favicon));

  // ============================================================
  // 玄决网页端托管：全端统一进桌面版 webapp/
  //
  // 2026-11 起手机端网页（www/ 那套 PWA）下线：它和桌面版是两套界面，
  // 维护两份样式反而更难统一视觉。现在不分 UA，手机也直接打开桌面版，
  // 由 webapp 的窄屏样式（左导航抽屉 + 盘面浮层）自适应。
  //   - / 与 /* 一律取 webapp/；
  //   - www/ 仍保留在仓库，作为 Capacitor 打 APK 的构建源，只是不再对外提供页面；
  //   - /game 的根绝对引用（/js/lunar.js 等）仍从 www/ 取，游戏页不受影响。
  // 两端资源全部相对引用、API 都走绝对 /v1/*，同域托管无需改一行前端代码。
  // /app 前缀固定指向桌面版（历史链接、书签、落地页旧按钮继续可用）；
  // 服务门面落地页在 /portal；/admin 不受影响。
  //
  // 为什么仍然不用 @fastify/static：只为托管静态目录引入整个静态插件
  // 会让依赖树多一层、也要重新 npm install；这里只发几类 MIME 的只读文件，
  // 用 readFileSync + send 与 /admin、落地页完全同模式，零新增依赖、行为可预测。
  // ============================================================
  // 静态目录缺失不能拖垮整个服务：Render 上若漏配 build，账号/同步/AI 路由仍须可用。
  // realpathSync 会解析符号链接；每个端取自己候选列表里第一个存在的。
  function pickFirstDir(candidates) {
    for (const cand of candidates) {
      try { return fs.realpathSync(cand); } catch (e) { /* 试下一个 */ }
    }
    return null;
  }
  // 桌面根：webapp 优先；极端情况下旧部署漏发 webapp 才兜底 www，避免白屏 404。
  const DESKTOP_ROOT = pickFirstDir([
    new URL('../webapp', import.meta.url),
    new URL('./webapp', import.meta.url),
    new URL('../www', import.meta.url),
    new URL('./www', import.meta.url)
  ]);
  // 旧手机端产物 www/：不再对外提供页面，只服务 /game 的根绝对引用与资源兜底。
  const MOBILE_ROOT = pickFirstDir([
    new URL('../www', import.meta.url),
    new URL('./www', import.meta.url)
  ]);
  // 夜盘·三传试炼：游戏是独立静态目录 game/，不参与 UA 双端分发。
  // 缺目录时（旧部署漏发）仅游戏入口 404，不影响决策台两端与 API。
  const GAME_ROOT = pickFirstDir([
    new URL('../game', import.meta.url),
    new URL('./game', import.meta.url)
  ]);
  if (!DESKTOP_ROOT) {
    app.log.warn('未找到 webapp/ 目录，网页端入口将返回 404（账号与 AI 路由不受影响）');
  } else {
    app.log.info({
      desktop: path.relative(process.cwd(), DESKTOP_ROOT),
      legacyMobile: MOBILE_ROOT ? path.relative(process.cwd(), MOBILE_ROOT) : null,
      game: GAME_ROOT ? path.relative(process.cwd(), GAME_ROOT) : null
    }, '网页端静态目录就绪（全端桌面版 + 夜盘游戏）');
  }
  // 名称保留历史叫法：WWW_ROOT = /app 固定指向的桌面根
  const WWW_ROOT = DESKTOP_ROOT;
  const APP_PREFIX = '/app';

  /** 不分 UA：始终返回桌面版根。手机与桌面看到同一套界面，只是布局自适应。 */
  function rootForUA() {
    return DESKTOP_ROOT || MOBILE_ROOT;
  }

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

  /** 把 URL 路径解析成指定静态根内的绝对路径；越界或后缀不在白名单一律返回 null（由调用方 404）。 */
  function resolveAppPath(root, urlPath) {
    if (!root) return null;
    let rel = decodeURIComponent(String(urlPath || ''));
    const qi = rel.indexOf('?');
    if (qi >= 0) rel = rel.slice(0, qi);
    // 归一化必须做在解码之后：%2e%2e%2f 解码出来就是 ../，先归一化会被绕过
    rel = rel.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/+/, '');
    const parts = rel.split('/').filter((s) => s !== '' && s !== '.' && s !== '..');
    const abs = path.join(root, parts.join('/'));
    // 双保险：即使上面漏了，拼接结果仍须以该静态根为界
    if (abs !== root && !abs.startsWith(root + path.sep)) return null;
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
    // 缓存策略：
    //   index.html 是 SPA 入口且文件名不带内容指纹，必须 no-store ——
    //     否则发版后老用户仍持旧 index.html，引用的 js/css 名没变就会把旧版锁死；
    //   js/css 同样不带内容指纹（webapp/js/ui.js 这类文件名是稳定的），
    //     早期给过 max-age=86400 immutable，结果发版后用户 24 小时内仍跑旧代码，
    //     还会出现「index 是新的、ui.js 是旧的」这种半新旧错配。改为 no-cache：
    //     每次都向服务端复验，命中 ETag 只回 304，代价很小，换来发版即时生效。
    //   图片/字体变化少，且体积大、复验成本高，仍可长缓存。
    //   service-worker.js 无指纹且要能及时更新，显式 no-cache。
    const noStore = ext === '.html';
    const revalidate = noStore
      || ext === '.js' || ext === '.css'
      || path.basename(abs) === 'service-worker.js';
    const cache = noStore ? 'no-store' : revalidate ? 'no-cache' : 'public, max-age=86400';
    await reply
      .header('cache-control', cache)
      .header('x-content-type-options', 'nosniff')
      .type(APP_MIME[ext])
      .send(body);
    return true;
  }

  // /app（无尾斜杠）必须重定向到 /app/，这不是洁癖，是 App 能不能打开的分水岭：
  //   webapp/index.html 里所有资源都是相对引用（css/app.css、js/ui.js、js/engines/…），
  //   相对路径按「文档 URL」解析：
  //     /app  →  基准是 /，于是 /css/app.css 404
  //     /app/ →  基准是 /app/，全部命中
  //   后果上 /app 会白屏。
  //   用 301 而非 302：这个地址形态是永久约定，浏览器可以放心缓存，省一次往返。
  //   Fastify 的签名是 redirect(url, code)，顺序反了会把 301 当成 URL、把 /app/ 当成状态码。
  app.get(APP_PREFIX, async (req, reply) => {
    if (!WWW_ROOT) return reply.code(404).type('text/html; charset=utf-8').send(app404);
    return reply.redirect(APP_PREFIX + '/', 301);
  });

  /** 发某个静态根的 index.html（SPA 入口，壳内路由自己走）。 */
  const serveRootIndex = (root) => async (req, reply) => {
    const ok = await sendAppFile(root ? path.join(root, 'index.html') : null, reply);
    if (!ok) return reply.code(404).type('text/html; charset=utf-8').send(app404);
  };
  app.get(APP_PREFIX + '/', serveRootIndex(WWW_ROOT));

  // /app/* 具体文件。为什么 /app 与 /app/ 要单独接住：Fastify 的 /app/* 不匹配空段，
  // 不单独注册的话根路径会掉到 404。
  app.get(APP_PREFIX + '/*', async (req, reply) => {
    const abs = resolveAppPath(WWW_ROOT, req.url.slice(APP_PREFIX.length));
    if (!abs) return reply.code(404).type('text/html; charset=utf-8').send(app404);
    const ok = await sendAppFile(abs, reply);
    if (!ok) return reply.code(404).type('text/html; charset=utf-8').send(app404);
  });

  // ============================================================
  // /game —— 夜盘·三传试炼（Three.js 3D 游戏，独立目录 game/）
  //
  // 游戏页 game/index.html 里有几处站根绝对引用（开发时 devserver.py 以仓库根为根）：
  //   /js/lunar.js、/js/daliuren.js、/img/hero-seal.jpg、/icon-192.png
  // 桌面 UA 的静态根是 webapp/（引擎在 js/engines/ 下），这些路径会 404。
  // 因此对这几条共享路径做「不区分 UA、一律取手机端根 www/」的显式路由：
  // www/js/*.js 是同源 globals 构建产物，游戏依赖的 Lunar/DaLiuRen 全局一致。
  // ============================================================
  if (GAME_ROOT) {
    const GAME_PREFIX = '/game';
    app.get(GAME_PREFIX, async (req, reply) => reply.redirect(GAME_PREFIX + '/', 301));
    app.get(GAME_PREFIX + '/', serveRootIndex(GAME_ROOT));
    app.get(GAME_PREFIX + '/*', async (req, reply) => {
      const abs = resolveAppPath(GAME_ROOT, req.url.slice(GAME_PREFIX.length));
      if (!abs) return reply.code(404).type('text/html; charset=utf-8').send(app404);
      const ok = await sendAppFile(abs, reply);
      if (!ok) return reply.code(404).type('text/html; charset=utf-8').send(app404);
    });
  }

  // 站根绝对路径：不分 UA，一律从旧手机端根 www/ 取。
  // 只剩游戏页 game/index.html 的开发期根绝对引用（/js/lunar.js、/js/daliuren.js、
  // /img/hero-seal.jpg、/icon-192.png）——桌面 UA 的静态根是 webapp/，直接解析会 404。
  // 必须显式注册在根通配之前 —— find-my-way 静态路径本就优先于通配，
  // 这里写清楚也让意图可查。缺手机端根时由 sendAppFile 统一回 404。
  const SHARED_FROM_MOBILE = [
    '/js/lunar.js',
    '/js/daliuren.js',
    '/img/hero-seal.jpg',
    '/icon-192.png'
  ];
  for (const shared of SHARED_FROM_MOBILE) {
    app.get(shared, async (req, reply) => {
      if (!MOBILE_ROOT) return reply.code(404).type('text/html; charset=utf-8').send(app404);
      const abs = resolveAppPath(MOBILE_ROOT, shared);
      const ok = await sendAppFile(abs, reply);
      if (!ok) return reply.code(404).type('text/html; charset=utf-8').send(app404);
    });
  }

  // ============================================================
  // /service-worker.js —— 旧手机网页端的注销哨兵
  //
  // 手机网页端下线后，老访客的浏览器里可能还留着一份作用域为「/」的
  // 手机版 SW：它是缓存优先，会把缓存里的旧手机页面一直发回来，
  // 换 UA 分发也救不了（请求根本没出浏览器）。
  // 这里对同一个 /service-worker.js 地址返回一个「清理型 SW」：
  // 接管后删掉全部缓存 → 注销自己 → 刷新受控页面。
  // 之后页面不再受 SW 控制，直接走网络拿到新的桌面版。
  // 旧手机页每次加载都会 register 一次，正好触发这次更新检查。
  // ============================================================
  const KILL_SW = `/* 手机网页端已下线：本 SW 只清理旧缓存并注销自己 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (e) {}
    const list = await self.clients.matchAll({ type: 'window' });
    try { await self.registration.unregister(); } catch (e) {}
    list.forEach((c) => { try { c.navigate(c.url); } catch (e) {} });
  })());
});
`;
  app.get('/service-worker.js', async (req, reply) => reply
    .header('cache-control', 'no-store')
    .header('x-content-type-options', 'nosniff')
    .type('text/javascript; charset=utf-8')
    .send(KILL_SW));

  // ============================================================
  // 根路径入口：/ 与 /* 一律走桌面版 webapp/（不再按 UA 分发）。
  //
  // 桌面与手机共用同一套前端，窄屏由 webapp/css/app.css 的 900px 断点
  // 把左导航改成抽屉、盘面改成浮层。资源全部相对引用，同一次访问内
  // 所有后续请求都会落到同一个静态根，天然对得上；API 走绝对 /v1/*。
  //
  // 优先级安全性：Fastify(find-my-way) 中静态/参数段永远优先于根通配，
  //   /health、/admin、/portal、/favicon.ico、/icon.svg 以及 /v1/*、/app/*
  //   都不会被这个通配吞掉；通配只接住没有更具体路由的根级路径。
  // 和 /app/* 一样，根通配不匹配空段，所以 / 与 /index.html 要显式注册。
  // ============================================================
  app.get('/', (req, reply) => serveRootIndex(rootForUA(req))(req, reply));
  app.get('/index.html', (req, reply) => serveRootIndex(rootForUA(req))(req, reply));
  app.get('/*', async (req, reply) => {
    const root = rootForUA(req);
    const abs = resolveAppPath(root, req.url);
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
  // 启动期跑一遍幂等 schema + 迁移：库里残留的旧模型名、被误熔断的 Key 会在启动时
  // 就地修好，用户不必再手动执行 npm run db:init（托管平台也不会替你执行）。
  // 失败不阻断启动：数据库不可用时服务照常起，只是 AI 相关功能会报错。
  try {
    const r = await runStartupMigrations(app.log);
    if (r.ok) app.log.info('数据库结构自检与迁移完成');
    else app.log.warn({ reason: r.reason }, '跳过启动期数据库迁移');
  } catch (err) {
    app.log.error({ err: err.message }, '启动期数据库迁移失败：请检查 DATABASE_URL，或手动执行 npm run db:init');
  }
  await app.listen({ port: env.PORT, host: '0.0.0.0' }).catch(e => {
    app.log.error(e);
    process.exit(1);
  });
}
