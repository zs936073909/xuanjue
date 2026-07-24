// classics.js — 玄决古籍知识库与前端 RAG 检索模块（v0.2）
// 说明：
//   1. 数据全部来自本地 JSON，不依赖外部 API。
//   2. 优先使用同步 XMLHttpRequest 加载，保证浏览器主流程可用；无 XHR 时降级 fetch。
//   3. 首次加载索引后，对已加载段落建立倒排索引（tags + scenario + board_features + text）。
//   4. 所有加载失败均降级返回空数组/空对象，不影响主流程。
(function(global){
  'use strict';

  const BASE = 'data/classics/';

  // 内部状态
  let _index = null;            // 索引对象
  const _books = {};            // bookId -> bookData
  const _loadedIds = new Set(); // 已加载的 bookId
  let _allLoaded = false;       // 是否已全量加载
  const _inverted = {};         // token -> { passageId -> score }
  const _metaById = {};         // bookId -> meta
  const _metaByTitle = {};      // title -> meta

  // ---------- 环境工具 ----------
  function _env() {
    return (typeof window !== 'undefined' ? window : global) || {};
  }

  // 同步加载文本（浏览器优先 XHR；Node 环境用 fs）
  function _loadTextSync(url) {
    const g = _env();
    if (typeof g.XMLHttpRequest !== 'undefined') {
      try {
        const xhr = new g.XMLHttpRequest();
        xhr.open('GET', url, false);
        xhr.send(null);
        if (xhr.status >= 200 && xhr.status < 300 || xhr.status === 0) {
          return xhr.responseText;
        }
      } catch (e) {
        // 降级
      }
    }
    // Node 环境直接读文件（用于测试）
    if (typeof require !== 'undefined') {
      try {
        const fs = require('fs');
        const path = require('path');
        // url 形如 'data/classics/index.json'，以 classics.js 所在目录 ../ 为基准
        const base = path.dirname(__filename);
        const abs = path.resolve(base, '..', url);
        if (fs.existsSync(abs)) return fs.readFileSync(abs, 'utf8');
      } catch (e) {
        // 降级
      }
    }
    return null;
  }

  // 异步加载文本（fetch 降级）
  async function _loadTextAsync(url) {
    const g = _env();
    if (typeof g.fetch !== 'undefined') {
      try {
        const r = await g.fetch(url);
        if (r.ok) return await r.text();
      } catch (e) {
        // 降级
      }
    }
    return null;
  }

  // ---------- 索引与元数据 ----------
  function _buildMetaMap() {
    if (!_index || !_index.books) return;
    _index.books.forEach(b => {
      _metaById[b.id] = b;
      _metaByTitle[b.title] = b;
    });
  }

  function _metaOfPassage(p) {
    return _metaById[p._bookId] || _metaByTitle[p.book] || null;
  }

  // ---------- 分词 ----------
  function _tokenize(str) {
    if (str === null || str === undefined) return [];
    const s = String(str).toLowerCase();
    const out = [];
    // 中文字符单独成词
    const chinese = s.match(/[\u4e00-\u9fa5]/g);
    if (chinese) out.push(...chinese);
    // 英文/数字连续成词
    const other = s.replace(/[\u4e00-\u9fa5]/g, ' ').split(/[^a-z0-9]+/).filter(Boolean);
    out.push(...other);
    return out;
  }

  // ---------- 倒排索引 ----------
  function _addPassageToIndex(p) {
    const fields = [
      { val: p.tags, weight: 5 },
      { val: p.board_features, weight: 4 },
      { val: p.scenario, weight: 4 },
      { val: p.chapter, weight: 3 },
      { val: p.book, weight: 2 },
      { val: p.text, weight: 1 },
      { val: p.comment, weight: 1 }
    ];
    fields.forEach(f => {
      const arr = Array.isArray(f.val) ? f.val : [f.val];
      arr.forEach(item => {
        _tokenize(item).forEach(tok => {
          if (!_inverted[tok]) _inverted[tok] = {};
          if (!_inverted[tok][p.id]) _inverted[tok][p.id] = 0;
          _inverted[tok][p.id] += f.weight;
        });
      });
    });
  }

  function _addBookToIndex(bookData) {
    if (!bookData || !Array.isArray(bookData.passages)) return;
    bookData.passages.forEach(p => {
      p._bookId = bookData.id;
      _addPassageToIndex(p);
    });
  }

  function _allPassages() {
    const list = [];
    Object.values(_books).forEach(b => {
      if (b.passages) list.push(...b.passages);
    });
    return list;
  }

  function _loadAllBooksSync() {
    if (_allLoaded) return;
    if (!_index || !_index.books) return;
    _index.books.forEach(b => loadBook(b.id));
    _allLoaded = true;
  }

  // ---------- 公共 API ----------

  /**
   * 加载古籍索引 index.json
   * 浏览器环境下优先同步 XHR，立即返回索引对象；
   * 若只能使用 fetch，则返回 Promise。
   */
  function loadIndex() {
    if (_index) return _index;
    const text = _loadTextSync(BASE + 'index.json');
    if (text) {
      try {
        _index = JSON.parse(text);
        _buildMetaMap();
        return _index;
      } catch (e) {
        return null;
      }
    }
    // 异步降级
    return _loadTextAsync(BASE + 'index.json').then(t => {
      if (!t) return null;
      _index = JSON.parse(t);
      _buildMetaMap();
      return _index;
    }).catch(() => null);
  }

  /**
   * 加载某一本古籍全部段落
   * @param {string} bookId
   * @returns {Object|null|Promise}
   */
  function loadBook(bookId) {
    if (_books[bookId]) return _books[bookId];
    const meta = _metaById[bookId];
    if (!meta) return null;
    const url = BASE + meta.shushu + '/' + bookId + '.json';
    const text = _loadTextSync(url);
    if (text) {
      try {
        const data = JSON.parse(text);
        _books[bookId] = data;
        _loadedIds.add(bookId);
        _addBookToIndex(data);
        return data;
      } catch (e) {
        return null;
      }
    }
    // 异步降级
    return _loadTextAsync(url).then(t => {
      if (!t) return null;
      const data = JSON.parse(t);
      _books[bookId] = data;
      _loadedIds.add(bookId);
      _addBookToIndex(data);
      return data;
    }).catch(() => null);
  }

  /**
   * 检索古籍段落
   * @param {Object} opts
   *   shushu: string|string[]  术数分类（六爻/八字/梅花/大六壬/小六壬/塔罗）
   *   scenario: string         场景关键字
   *   board_features: string|string[] 盘面特征关键字
   *   query: string            自由关键词
   *   limit: number            返回条数上限（默认 20）
   * @returns {Array} passages
   */
  function search(opts) {
    opts = opts || {};
    if (!_index) loadIndex();
    if (!_index) return [];

    // 若使用 query 检索，先全量加载并建索引
    const hasQuery = !!(opts.query && String(opts.query).trim());
    if (hasQuery && !_allLoaded) {
      _loadAllBooksSync();
    }

    let pool = _allPassages();
    if (!pool.length) return [];

    // 按术数过滤
    if (opts.shushu) {
      const ss = Array.isArray(opts.shushu) ? opts.shushu : [opts.shushu];
      pool = pool.filter(p => {
        const meta = _metaOfPassage(p);
        if (!meta) return false;
        return ss.some(s => meta.shushu === s || meta.title === s || meta.id === s);
      });
    }

    // 按场景过滤
    if (opts.scenario) {
      const sc = String(opts.scenario);
      pool = pool.filter(p => p.scenario && p.scenario.includes(sc));
    }

    // 按盘面特征过滤
    if (opts.board_features) {
      const bf = Array.isArray(opts.board_features) ? opts.board_features : [opts.board_features];
      pool = pool.filter(p => {
        if (!Array.isArray(p.board_features)) return false;
        return bf.some(k => p.board_features.some(f => f.includes(k)));
      });
    }

    // 按 query 倒排评分排序
    if (hasQuery) {
      const qTokens = _tokenize(opts.query);
      const scores = {};
      qTokens.forEach(tok => {
        const hit = _inverted[tok];
        if (!hit) return;
        Object.keys(hit).forEach(id => {
          scores[id] = (scores[id] || 0) + hit[id];
        });
      });
      pool = pool.filter(p => scores[p.id] > 0);
      pool.sort((a, b) => scores[b.id] - scores[a.id]);
    }

    const limit = Number(opts.limit) || 20;
    return pool.slice(0, limit);
  }

  /**
   * 生成段落引用文本
   * @param {Object} passage
   * @returns {string}
   */
  function formatCitation(passage) {
    if (!passage) return '';
    const text = String(passage.text || '').replace(/\s+/g, ' ');
    return `[${passage.book || ''}·${passage.chapter || ''}] ${text}`;
  }

  /**
   * 获取已加载段落总数（调试用）
   */
  function loadedCount() {
    return _allPassages().length;
  }

  /**
   * 重置内部状态（调试用）
   */
  function reset() {
    _index = null;
    Object.keys(_books).forEach(k => delete _books[k]);
    _loadedIds.clear();
    _allLoaded = false;
    Object.keys(_inverted).forEach(k => delete _inverted[k]);
    Object.keys(_metaById).forEach(k => delete _metaById[k]);
    Object.keys(_metaByTitle).forEach(k => delete _metaByTitle[k]);
  }

  global.ClassicLibrary = {
    loadIndex,
    loadBook,
    search,
    formatCitation,
    loadedCount,
    reset
  };
})(window);
