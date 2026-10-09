-- 玄决云 · 初始化 schema
-- 纯令牌账号模式：用户凭一串自选「同步令牌」标识自己，服务端不存邮箱。
--
-- 【重要】2026-10 起改为**明文落库**（站长决策）：
--   原设计是零知识（客户端 AES-256-GCM 加密后上传，服务端只有密文）。
--   现在业务数据（案例/对话/生辰/重要事项）以明文 JSON 落库，
--   目的是让站点管理员能直接查看与管理用户数据（客服/测试/违规处理）。
--   代价：数据库被拖库或平台侧人员都能看到用户内容。**App 内的隐私文案已同步改为如实描述**，
--   不再声称零知识。若日后要恢复加密，需同时改客户端 cloud.js 与本表。

create extension if not exists "pgcrypto";

create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  token_hash    text not null unique,        -- 同步令牌的 SHA-256 哈希（不可逆）
  token_prefix  text not null,               -- 令牌前 6 位，用于「找回」时确认账号存在
  recovery_code text,                        -- 找回口令（服务端可读，仅用于身份确认）
  recovery_hash text,                        -- 找回口令 SHA-256，用于校验
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz,
  -- 账号状态与按用户覆盖的 AI 限额（限额为 null 时走全局默认值）。
  -- 「谁是管理员」不在这里判断 —— 后台走独立的 admins 表（用户名密码），
  -- 避免两套真相。管理员要体验 App 全部功能时，用后台的「模拟登录」拿令牌即可。
  suspended     boolean not null default false,
  suspended_reason text,
  ai_daily_limit int,
  ai_rate_per_min int
);

create table if not exists devices (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  device_name   text not null,
  platform      text,
  last_sync_at  timestamptz,
  unique (user_id, device_name)
);

create table if not exists snapshots (
  user_id       uuid not null references users(id) on delete cascade,
  kind          text not null,               -- cases | chats | profile | important
  data          jsonb not null,              -- 明文 JSON（站长决策：不再加密，供管理员查看）
  rev           bigint not null default 1,    -- 单调递增，冲突检测
  updated_at    timestamptz not null default now(),
  updated_by    uuid references devices(id) on delete set null,
  primary key (user_id, kind)
);

create table if not exists ops (
  id            bigserial primary key,
  user_id       uuid not null references users(id) on delete cascade,
  device_id     uuid references devices(id) on delete set null,
  kind          text not null,
  op            jsonb not null,
  ts            timestamptz not null default now()
);
create index if not exists ops_user_ts on ops(user_id, ts);

-- ============ 迁移：邮箱模式 → 令牌模式；密文模式 → 明文模式 ============
-- 幂等 ALTER：老库升级为新 schema；新库则 create table 已建好，此处基本为空操作。
-- 注意：create table if not exists 在表已存在时整句跳过，故新列必须显式 add column if not exists。
alter table users add column if not exists token_hash    text;
alter table users add column if not exists token_prefix  text;
alter table users add column if not exists recovery_code text;
alter table users add column if not exists recovery_hash text;
alter table users add column if not exists suspended     boolean not null default false;
alter table users add column if not exists suspended_reason text;
alter table users add column if not exists ai_daily_limit int;
alter table users add column if not exists ai_rate_per_min int;
-- 明文落库：老的 kdf_salt / recovery_blob 已无用（数据不再加密），一并清掉
alter table users drop column if exists kdf_salt;
alter table users drop column if exists recovery_blob;
-- 旧版唯一约束与列在新模式中无意义，移除以免阻塞 insert
alter table users drop constraint if exists users_email_key;
alter table users drop column if exists email;
alter table users drop column if exists pwd_hash;
drop index if exists users_email_idx;
-- 令牌哈希新唯一约束（老库可能已因 email unique 占位，这里幂等建立）
DO $$
begin
  if not exists (select 1 from pg_constraint where conname = 'users_token_hash_key') then
    begin
      alter table users add constraint users_token_hash_key unique (token_hash);
    exception when duplicate_object then null;
    end;
  end if;
end $$;

-- 快照：密文列 → 明文 JSON 列。老数据（密文）无法解开，直接丢弃列以免阻塞读写。
alter table snapshots add column if not exists data jsonb;
alter table snapshots drop column if exists ciphertext;
alter table snapshots drop column if exists nonce;

-- ============ AI 云代理（Key 上云） ============
-- 设计：Key 由站长自己提供，用户端无需自带 Key。
-- 保护措施：Key 以 AES-256-GCM 加密后落库（主密钥只在环境变量里），
-- 任何接口都不返回明文或密文，日志从不记录请求体；每日限次与每分钟限流双闸门。
create table if not exists ai_proxy_config (
  user_id    uuid primary key references users(id) on delete cascade,
  provider   text not null default 'custom',
  protocol   text not null default 'openai',   -- openai | anthropic
  base_url   text not null,
  model      text not null,
  key_cipher bytea not null,                   -- AES-256-GCM 密文
  key_nonce  bytea not null,                   -- 12 字节 GCM nonce
  key_tag    bytea not null,                   -- 16 字节 GCM tag
  updated_at timestamptz not null default now()
);

-- 每日限次计数：一行 = 一个用户一天，天然按天滚动，无需清理任务
create table if not exists ai_usage (
  user_id uuid not null references users(id) on delete cascade,
  day     date not null default current_date,
  count   int not null default 1,
  primary key (user_id, day)
);

create table if not exists audit_log (
  id            bigserial primary key,
  user_id       uuid references users(id) on delete cascade,
  action        text not null,
  ip            inet,
  ua            text,
  ts            timestamptz not null default now()
);

-- ============ 管理员账号（独立用户名密码体系） ============
-- 与「同步令牌」是两套独立的体系：管理员进的是后台，用户进的是 App。
-- 密码用 scrypt 慢哈希 + 每账号随机 salt；失败计数 + 临时锁定，防爆破。
create table if not exists admins (
  id            uuid primary key default gen_random_uuid(),
  username      text not null unique,
  pwd_hash      text not null,
  pwd_salt      text not null,
  name          text,
  is_superadmin boolean not null default true,
  failed_count  int not null default 0,
  locked_until  timestamptz,
  created_at    timestamptz not null default now(),
  last_login_at timestamptz
);

-- ============ AI 模型池（多厂商 / 多模型 / 多 Key / 难度分级路由） ============
-- 站长诉求：「多个厂商换着来，不同模型也会换」「按问题难易程度调用同一厂商的不同档位模型」。
-- 所以把「一个 Key 一个模型」升级为三层：
--   厂商(provider) → 档位模型(model) → Key(key)
-- 路由顺序：按问题难度定 tier → 在同 tier 的启用模型里按 priority 选 → 轮询该厂商的可用 Key。
-- 任一环节失败自动降档/换厂商，直到全部试过才报错。

create table if not exists ai_providers (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,          -- modelscope | stepfun | internlm | relay | ...
  name        text not null,                 -- 显示名（魔搭社区 / 阶跃星辰 / 书生 / 中转站）
  protocol    text not null default 'openai', -- openai | anthropic
  base_url    text not null,
  enabled     boolean not null default true,
  note        text,
  created_at  timestamptz not null default now()
);

-- tier: easy(简单问答/二选一) / mid(常规) / hard(复合、长期趋势、深度推理)
create table if not exists ai_models (
  id           uuid primary key default gen_random_uuid(),
  provider_id  uuid not null references ai_providers(id) on delete cascade,
  model        text not null,                -- 送进请求体的模型名
  display_name text,
  tier         text not null default 'mid' check (tier in ('easy','mid','hard')),
  priority     int not null default 100,     -- 同 tier 内越小越优先
  enabled      boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (provider_id, model)
);

-- Key 明文落库（与用户数据一致的决策）。接口默认只回掩码，要看全文需单独请求。
create table if not exists ai_keys (
  id          uuid primary key default gen_random_uuid(),
  provider_id uuid not null references ai_providers(id) on delete cascade,
  label       text,
  key_plain   text not null,
  status      text not null default 'active' check (status in ('active','disabled','suspect')),
  fails       int not null default 0,        -- 连续失败计数，超过阈值自动标 suspect
  last_ok_at  timestamptz,
  last_fail_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists ai_keys_provider on ai_keys(provider_id, status);

-- 路由决策留痕：哪次提问、多难、选了哪个厂商哪个模型哪把 Key、结果如何。
-- 只记元信息（问题长度、耗时、状态），**不记提问内容本身**，避免把用户私事写进日志表。
create table if not exists ai_routing_log (
  id           bigserial primary key,
  user_id      uuid references users(id) on delete cascade,
  tier         text not null,
  provider_slug text,
  model        text,
  key_id       uuid references ai_keys(id) on delete set null,
  status       text not null,                -- ok | upstream_error | rate_limited | ...
  latency_ms   int,
  chars_in     int,
  chars_out    int,
  ts           timestamptz not null default now()
);
create index if not exists ai_routing_log_ts on ai_routing_log(ts desc);
create index if not exists ai_routing_log_user on ai_routing_log(user_id, ts desc);
