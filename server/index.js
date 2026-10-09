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
