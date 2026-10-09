// cloud.js — 云端同步（明文落库，纯令牌账号）
//
// 【2026-10 变更】站长决策：业务数据不再端到端加密，改为**明文 JSON 落库**，
// 以便站点管理员能直接查看与管理（客服 / 测试 / 违规处理）。
// 代价已如实告知用户：数据库管理员与平台侧人员都能看到同步内容。
// 因此本文件已移除全部加解密链路（PBKDF2 / AES-GCM / 恢复包裹体）：
//   - 同步令牌只用于身份认证（服务端存 SHA-256 与前 6 位前缀）；
//   - 恢复口令只用于找回时确认身份；
//   - 同步 payload 就是明文 JSON（{kind 数据本体}），服务端直接落 jsonb。
//
// 账号即「同步令牌」：用户自选一串 16-64 位口令，不收邮箱、不存密码、不接第三方 OAuth ——
// 「注册」本身完全免费，没有任何外部依赖。
//
// 协议：GET 拉取 → 本地合并 → PUT 推送（带 base_rev，落后则 409，重拉后重试）。
// 不同步的本地数据：settings 里的 aiApiKey/aiBaseUrl/aiProvider/aiProtocol/aiModel、
// lock.*（应用锁 PIN、生物识别）、offlineMode —— 这些只属于本机，不进任何同步类别。
(function (global) {
  'use strict';

  // 同步的数据类别，须与服务端 SYNC_KINDS 一致
  const KINDS = ['cases', 'chats', 'profile', 'important'];

  const KEY_SESSION = 'xuanjue_cloud_session'; // access/refresh/userId/prefix/各 kind 的 rev
  const KEY_CONFIG = 'xuanjue_cloud_config';  // 服务器地址
  const KEY_DIRTY = 'xuanjue_cloud_dirty';    // 本机有改动的时刻
  const KEY_DEVICE = 'xuanjue_cloud_device';  // 本机设备名，生成后固定不变

  // ---------- 存储（localStorage，缺省降级内存，与 store.js 同策略） ----------
  const _mem = new Map();
  const _ls = (function () {
    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem) return localStorage;
    } catch (e) { /* 隐私模式等场景 */ }
    return {
      getItem(k) { return _mem.has(k) ? _mem.get(k) : null; },
      setItem(k, v) { _mem.set(String(k), String(v)); },
      removeItem(k) { _mem.delete(k); }
    };
  })();
  function lsGet(k) { try { return _ls.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { _ls.setItem(k, v); return true; } catch (e) { return false; } }
  function lsDel(k) { try { _ls.removeItem(k); } catch (e) { /* 忽略 */ } }
  function lsJson(k, dft) {
    const raw = lsGet(k);
    if (!raw) return dft;
    try {
      const v = JSON.parse(raw);
      return v === null || v === undefined ? dft : v;
    } catch (e) { return dft; }
  }
  function lsSaveJson(k, v) { return lsSet(k, JSON.stringify(v)); }

  // ---------- 运行时状态 ----------
  const state = {
    server: '',       // 后端地址，空 = 未配置
    userId: null,
    prefix: '',       // 令牌前 6 位，找回时要填
    deviceName: 'web',
    access: null,     // 15 分钟有效
    refresh: null,     // 30 天有效，用于换发 access
    status: 'idle',   // idle | busy | ready
    lastSyncAt: 0,
    revs: {},         // kind -> 本机已知的服务端 rev，PUT 时作 base_rev
    recoverNote: ''   // 找回后的附加说明
  };

  // ---------- 工具 ----------
  function b64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }
  function randomBytes(n) {
    const c = global.crypto || global.msCrypto;
    if (!c || !c.getRandomValues) throw new Error('当前环境无法生成安全随机数');
    const a = new Uint8Array(n);
    c.getRandomValues(a);
    return a;
  }

  // 环境能力探测：无 fetch 时云同步整体不可用（本地功能不受影响）
  function fetchOk() { return typeof global.fetch === 'function'; }
  // 兼容旧调用点：不再需要 WebCrypto（没有加解密了），恒为 true
  function cryptoOk() { return true; }

  // ---------- 后端地址与会话持久化 ----------
  function getServer() { return String(lsGet(KEY_CONFIG) || '').trim(); }
  function setServer(url) {
    const u = String(url || '').trim().replace(/\/+$/, '');
    if (u && !/^https?:\/\//i.test(u)) throw new Error('服务器地址需以 http:// 或 https:// 开头');
    lsSet(KEY_CONFIG, u);
    state.server = u;
    return u;
  }

  function saveSession() {
    if (!state.refresh) { lsDel(KEY_SESSION); return; }
    lsSaveJson(KEY_SESSION, {
      server: state.server, userId: state.userId, prefix: state.prefix,
      access: state.access, refresh: state.refresh, deviceName: state.deviceName,
      revs: state.revs, at: Date.now()
    });
  }

  async function loadSession() {
    const s = lsJson(KEY_SESSION, null);
    if (!s || !s.server || !s.refresh) return false;
    state.server = s.server;
    state.userId = s.userId || null;
    state.prefix = s.prefix || '';
    state.refresh = s.refresh;
    state.access = s.access || null;
    state.deviceName = s.deviceName || state.deviceName;
    state.revs = s.revs && typeof s.revs === 'object' ? s.revs : {};
    // 用 refresh 换一枚新 access（旧的很可能已过期），失败说明会话彻底失效
    try {
      await refresh();
      return true;
    } catch (e) {
      clearSession();
      return false;
    }
  }
  function clearSession() {
    state.access = null;
    state.refresh = null;
    state.userId = null;
    state.prefix = '';
    state.revs = {};
    lsDel(KEY_SESSION);
  }

  // ---------- HTTP ----------
  async function req(path, opts, retry) {
    if (!fetchOk()) throw new Error('当前环境不支持联网同步');
    opts = opts || {};
    if (retry === undefined) retry = true;
    const base = state.server || getServer();
    if (!base) throw new Error('请先填写服务器地址');

    let url = base + path;
    const qs = typeof opts.query === 'string'
      ? opts.query.replace(/^\?/, '')
      : Object.keys(opts.query || {})
        .filter(k => opts.query[k] !== undefined && opts.query[k] !== null)
        .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(opts.query[k]))
        .join('&');
    if (qs) url += (path.indexOf('?') >= 0 ? '&' : '?') + qs;

    const headers = Object.assign({}, opts.headers || {});
    if (state.access) headers.authorization = 'Bearer ' + state.access;
    let body = opts.body;
    if (body && typeof body === 'object') {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(body);
    }

    const r = await global.fetch(url, { method: opts.method || 'GET', headers: headers, body: body, signal: opts.signal });
    const text = await r.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch (e) { json = { raw: text }; }

    // access 过期：用 refresh 换一枚再原样重试一次（只重试一次，避免打转）
    if (r.status === 401 && retry && state.refresh) {
      await refresh();
      return req(path, opts, false);
    }
    if (!r.ok) {
      const err = new Error((json && json.error) || ('HTTP ' + r.status));
      err.status = r.status;
      err.body = json;
      throw err;
    }
    return json;
  }

  async function refresh() {
    const r = await req('/v1/auth/refresh', { method: 'POST', body: { refresh: state.refresh } }, false);
    state.access = r.access;
    state.refresh = r.refresh;
    saveSession();
    return r;
  }

  // ---------- 账号操作 ----------
  // 令牌与恢复口令的规则必须与服务端 assertToken/assertRecovery 一致，避免来回 400
  function checkToken(t) {
    const s = String(t || '').trim();
    if (!/^[A-Za-z0-9._-]{16,64}$/.test(s)) {
      return '同步令牌需 16-64 位，只能用字母、数字、- _ .';
    }
    return null;
  }
  function checkRecovery(v) {
    const s = String(v || '');
    if (s.length < 8 || s.length > 128) return '恢复口令至少 8 位';
    return null;
  }

  // 生成一串人类可读、又足够随机的同步令牌（形如 xj-7f3k-9m2q-…，便于手抄）
  function genToken() {
    const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
    const bytes = randomBytes(24);
    let out = '';
    for (let i = 0; i < 24; i++) {
      out += alphabet[bytes[i] % alphabet.length];
      if ((i + 1) % 4 === 0 && i !== 23) out += '-';
    }
    return out;
  }
  // 恢复口令默认由系统生成（用户可改）：够长、含字母数字，且不依赖记忆
  function genRecovery() {
    return 'xj-' + b64(randomBytes(15)).replace(/[^a-zA-Z0-9]/g, '').slice(0, 20);
  }
  // 前缀就是找回时要填的那 6 位，注册成功后在界面上明示给用户抄走
  function prefixOf(token) { return String(token || '').trim().slice(0, 6); }

  // 注册 = 创建账号
  async function register(token, recovery) {
    const e1 = checkToken(token); if (e1) throw new Error(e1);
    const e2 = checkRecovery(recovery); if (e2) throw new Error(e2);
    if (!getServer()) throw new Error('请先填写服务器地址');
    state.status = 'busy';
    try {
      const r = await req('/v1/auth/register', {
        method: 'POST',
        body: { token: token.trim(), recovery: recovery, deviceName: state.deviceName }
      }, false);
      state.userId = r.userId;
      state.access = r.access;
      state.refresh = r.refresh;
      state.prefix = prefixOf(token);
      state.revs = {};
      state.recoverNote = '';
      saveSession();
      state.status = 'ready';
      return r;
    } catch (e) {
      state.status = 'idle';
      throw e;
    }
  }

  // 解锁 = 已有令牌登录
  async function unlock(token) {
    const e1 = checkToken(token); if (e1) throw new Error(e1);
    if (!getServer()) throw new Error('请先填写服务器地址');
    state.status = 'busy';
    try {
      const r = await req('/v1/auth/unlock', {
        method: 'POST',
        body: { token: token.trim(), deviceName: state.deviceName }
      }, false);
      state.userId = r.userId;
      state.access = r.access;
      state.refresh = r.refresh;
      state.prefix = prefixOf(token);
      state.recoverNote = '';
      saveSession();
      state.status = 'ready';
      return r;
    } catch (e) {
      state.status = 'idle';
      throw e;
    }
  }

  // 找回：令牌前 6 位 + 恢复口令 → 换发新令牌。明文架构下云端数据立刻可用。
  async function recover(prefix, recovery) {
    const e2 = checkRecovery(recovery); if (e2) throw new Error(e2);
    if (!getServer()) throw new Error('请先填写服务器地址');
    state.status = 'busy';
    try {
      const r = await req('/v1/auth/recover', {
        method: 'POST',
        body: {
          prefix: String(prefix || '').trim().slice(0, 6),
          recovery: recovery,
          deviceName: state.deviceName
        }
      }, false);
      state.userId = r.userId;
      state.access = r.access;
      state.refresh = r.refresh;
      state.prefix = String(prefix || '').trim().slice(0, 6);
      state.revs = state.revs || {};
      state.recoverNote = '';
      saveSession();
      state.status = 'ready';
      return r;
    } catch (e) {
      state.status = 'idle';
      throw e;
    }
  }

  async function logout() {
    if (state.refresh) {
      await req('/v1/auth/logout', { method: 'POST', body: { refresh: state.refresh } }, false).catch(() => {});
    }
    clearSession();
    state.status = 'idle';
    return true;
  }

  // ---------- 同步 ----------
  // 组装本机可同步的数据；settings / lock / offlineMode 一律不进来
  function localPayload() {
    const S = global.Store;
    const out = { cases: [], chats: {}, profile: null, important: [] };
    if (!S) return out;
    out.cases = S.listCases() || [];
    if (typeof S.listChats === 'function') {
      S.listChats().forEach(t => { out.chats[t] = S.getChat(t) || []; });
    }
    if (typeof S.getProfile === 'function') out.profile = S.getProfile() || null;
    if (typeof S.listImportant === 'function') out.important = S.listImportant() || [];
    return out;
  }

  // 拉取合并期间写进 Store 是「云端数据落地」，不算本机改动，别打脏标记 ——
  // 否则每次同步都把自己标脏，30 秒冷却被无限续期，5 分钟节流完全失效。
  let merging = false;
  function quiet(fn) {
    const prev = merging;
    merging = true;
    try { return fn(); } finally { merging = prev; }
  }

  // 把云端数据并回本机。四类各自的最简合并策略：
  // cases / important 按 id 比 updatedAt，谁新用谁；chats 整线比较，条数多的赢；
  // profile 远端正键覆盖本端。合并后由下次推送把结果写回云端，最终一致。
  function mergeIntoLocal(kind, remote) {
    const S = global.Store;
    if (!S || remote === null || remote === undefined) return 0;
    let n = 0;
    if (kind === 'cases' && Array.isArray(remote)) {
      const byId = {};
      (S.listCases() || []).forEach(c => { if (c && c.id) byId[c.id] = c; });
      remote.forEach(c => {
        if (!c || !c.id) return;
        const cur = byId[c.id];
        if (!cur || (cur.updatedAt || 0) <= (c.updatedAt || 0)) { byId[c.id] = c; n++; }
      });
      Object.keys(byId).forEach(id => S.saveCase(byId[id]));
    } else if (kind === 'chats' && remote && typeof remote === 'object') {
      Object.keys(remote).forEach(t => {
        if (!Array.isArray(remote[t])) return;
        const local = S.getChat(t) || [];
        if (remote[t].length > local.length) { S.saveChat(t, remote[t]); n++; }
      });
    } else if (kind === 'profile' && remote && typeof remote === 'object') {
      S.setProfile(remote);
      n++;
    } else if (kind === 'important' && Array.isArray(remote)) {
      const cur = {};
      (S.listImportant() || []).forEach(i => { if (i && i.date) cur[i.date] = i; });
      remote.forEach(i => {
        if (!i || !i.date) return;
        const c = cur[i.date];
        if (!c || (c.updatedAt || 0) <= (i.updatedAt || 0)) { cur[i.date] = i; n++; }
      });
      Object.keys(cur).forEach(d => S.saveImportant(cur[d]));
    }
    return n;
  }

  function markDirty() {
    if (merging) return; // 合并过程中不标脏
    lsSet(KEY_DIRTY, String(Date.now()));
  }
  function dirtySince() { return Number(lsGet(KEY_DIRTY) || 0); }
  function clearDirty() { lsDel(KEY_DIRTY); }

  // 把 Store 的写入入口包一层，自动打脏标记 —— 否则「本地改了但同步冷却未到」永远发现不了
  function hookStore() {
    const S = global.Store;
    if (!S || S.__cloudHooked) return;
    const names = ['saveCase', 'deleteCase', 'saveChat', 'clearChat', 'setProfile', 'saveImportant', 'deleteImportant'];
    names.forEach(name => {
      const fn = S[name];
      if (typeof fn !== 'function') return;
      S[name] = function () {
        const r = fn.apply(S, arguments);
        markDirty();
        return r;
      };
    });
    S.__cloudHooked = true;
  }

  async function pull() {
    if (!state.refresh) throw new Error('请先登录云同步');
    const r = await req('/v1/sync');
    const snapshots = (r && r.snapshots) || [];
    let n = 0;
    for (const k of KINDS) {
      const s = snapshots.find(x => x.kind === k);
      // rev 记下来，推送时作 base_rev —— 不记就永远是 0，第二次推必被 409 打回
      state.revs[k] = s && s.rev ? s.rev : 0;
      if (!s || !s.rev || s.data === undefined || s.data === null) continue;
      n += quiet(() => mergeIntoLocal(k, s.data));
    }
    saveSession();
    state.lastSyncAt = Date.now();
    return n;
  }

  async function push(kind, payload) {
    if (!state.refresh) throw new Error('请先登录云同步');
    const data = payload || localPayload();
    const body = { base_rev: state.revs[kind] || 0, data: data[kind] === undefined ? null : data[kind] };
    const q = { device: state.deviceName };
    // 乐观并发：先用已知 rev 试一次；409 说明服务端被别人改过，重拉后带新 rev 再试
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await req('/v1/sync/' + kind, {
          method: 'PUT',
          headers: { 'x-platform': state.deviceName },
          query: q,
          body: body
        });
        state.revs[kind] = r.rev;
        return r.rev;
      } catch (e) {
        if (e.status === 409 && attempt === 0) { await pull(); continue; }
        throw e;
      }
    }
    return null;
  }

  async function syncAll() {
    if (!state.refresh) throw new Error('请先登录云同步');
    state.status = 'busy';
    try {
      await pull();
      // 必须在 pull 之后重新组装：拉取可能把远端的新卦例/对话并进本机，
      // 用拉取前的快照推送会把远端刚更新的条目用旧值覆盖回去。
      const data = localPayload();
      for (const k of KINDS) await push(k, data);
      clearDirty();
      saveSession();
      state.status = 'ready';
      return state.lastSyncAt;
    } catch (e) {
      state.status = state.refresh ? 'ready' : 'idle';
      throw e;
    }
  }

  // 节流同步：5 分钟内不重复全量同步；本机有改动时冷却缩到 30 秒
  const THROTTLE = 5 * 60 * 1000;
  async function maybeSync() {
    if (!isReady() || !getServer()) return null;
    if (global.navigator && navigator.onLine === false) return null;
    const cool = dirtySince() ? 30 * 1000 : THROTTLE;
    if (state.lastSyncAt && Date.now() - state.lastSyncAt < cool) return null;
    return syncAll().catch(() => null);
  }

  function isReady() { return !!(state.access && state.server); }
  function isLoggedIn() { return !!state.refresh; }
  function status() {
    if (!state.server) return 'noconfig';
    if (!state.refresh) return 'idle';
    return 'ready';
  }

  // 启动：恢复会话。返回 noconfig | idle | ready
  async function init() {
    setServer(getServer() || '');
    state.deviceName = deviceName();
    if (!isLoggedIn()) return status();
    await loadSession();
    hookStore();
    return status();
  }

  // 设备名：同步记录与设备列表用。不能只写平台名 —— 否则所有安卓用户在服务端
  // 会互相挤成同一个设备名（devices 的唯一键是 user_id + device_name，同用户撞名会串），
  // 故加一段本机随机后缀，同一个人也不会把两台手机记成一个。
  function deviceName() {
    let platform = 'web';
    try {
      const cap = global.Capacitor;
      if (cap && typeof cap.getPlatform === 'function') {
        platform = String(cap.getPlatform()).slice(0, 12) || 'app';
      }
    } catch (e) { /* 非 Capacitor 环境 */ }
    try {
      const ua = String((global.navigator && global.navigator.userAgent) || '');
      if (/android/i.test(ua)) platform = 'android';
      else if (/iphone|ipad|ipod/i.test(ua)) platform = 'ios';
    } catch (e) { /* 忽略 */ }
    const saved = lsGet(KEY_DEVICE);
    if (saved && saved.indexOf(platform + '-') === 0) return saved;
    const name = platform + '-' + b64(randomBytes(6)).replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
    lsSet(KEY_DEVICE, name);
    return name;
  }

  const Cloud = {
    KINDS, state, THROTTLE,
    init, status, getServer, setServer, deviceName,
    genToken, genRecovery, prefixOf, checkToken, checkRecovery,
    register, unlock, recover, logout,
    pull, push, syncAll, maybeSync, markDirty, clearDirty, dirtySince, hookStore,
    isReady, isLoggedIn,
    cryptoOk, fetchOk,
    req
  };
  global.Cloud = Cloud;
})(typeof window !== 'undefined' ? window : globalThis);
