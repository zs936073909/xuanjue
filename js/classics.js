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

    // 若使用 query 检索或按盘面特征检索，先全量加载并建索引
    const hasQuery = !!(opts.query && String(opts.query).trim());
    const hasBoardFeatures = !!(opts.board_features && (Array.isArray(opts.board_features) ? opts.board_features.length : true));
    if ((hasQuery || hasBoardFeatures) && !_allLoaded) {
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

    // 盘面特征加权评分：board_features 命中 +4，tags 命中 +3
    const bfKeys = opts.board_features
      ? (Array.isArray(opts.board_features) ? opts.board_features : [opts.board_features]).filter(Boolean)
      : [];
    const bfScores = {};
    if (bfKeys.length) {
      pool.forEach(p => {
        let s = 0;
        const pf = Array.isArray(p.board_features) ? p.board_features : [];
        const pt = Array.isArray(p.tags) ? p.tags : [];
        bfKeys.forEach(k => {
          const kw = String(k);
          if (pf.some(f => String(f).includes(kw))) s += 4;
          if (pt.some(t => String(t).includes(kw))) s += 3;
        });
        bfScores[p.id] = s;
      });
    }

    // 按 query 倒排评分 + 盘面特征评分排序
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
      // 保留 query 命中或盘面特征命中的段落，盘面特征命中可补足 query 未覆盖处
      pool = pool.filter(p => (scores[p.id] || 0) > 0 || (bfScores[p.id] || 0) > 0);
      pool.sort((a, b) => ((scores[b.id] || 0) + (bfScores[b.id] || 0)) - ((scores[a.id] || 0) + (bfScores[a.id] || 0)));
    } else if (bfKeys.length) {
      // 无 query 时仅按盘面特征评分排序
      pool = pool.filter(p => (bfScores[p.id] || 0) > 0);
      pool.sort((a, b) => (bfScores[b.id] || 0) - (bfScores[a.id] || 0));
    }

    const limit = Number(opts.limit) || 20;
    return pool.slice(0, limit);
  }

  /**
   * 按术数类型从盘面结果中提取特征关键词数组
   * 用于 RAG 检索时对古籍段落做盘面特征加权
   * @param {string} shushu 术数名称（六爻/大六壬/八字/梅花易数/小六壬/塔罗）
   * @param {Object} result 排盘结果对象
   * @returns {string[]} 特征关键词数组
   */
  function extractBoardFeatures(shushu, result){
    if(!result)return [];
    const feats=[];
    try{
      if(shushu==='六爻'){
        // 用神、六亲、世应、空亡、月破、动爻、日辰生克
        if(result.yongShen&&result.yongShen.target)feats.push(result.yongShen.target);
        if(result.yaos)result.yaos.forEach(y=>{if(y.liuQin)feats.push(y.liuQin);if(y.dong)feats.push('动爻');});
        if(result.kongWang)feats.push('空亡','旬空');
        if(result.yuePo&&result.yuePo.zhi)feats.push('月破',result.yuePo.zhi+'破');
        if(result.dayRiRelation)feats.push(result.dayRiRelation);
        if(result.benGua)feats.push(result.benGua);
        if(result.bianGua)feats.push(result.bianGua);
      }else if(shushu==='大六壬'){
        // 初传、中传、末传、天将、空亡、返吟、伏吟、类神
        if(result.sanChuan){
          feats.push('初传','中传','末传');
          if(result.sanChuan.chu&&result.sanChuan.chu.zhi)feats.push(result.sanChuan.chu.zhi);
        }
        if(result.guiRen&&result.guiRen.label)feats.push(result.guiRen.label,'贵人');
        if(result.kongWang)feats.push('空亡','旬空');
        if(result.isFuYin)feats.push('伏吟');
        if(result.isFanYin)feats.push('返吟');
        if(result.leishenName)feats.push(result.leishenName,'类神');
        if(result.geju)result.geju.forEach(g=>feats.push(g));
      }else if(shushu==='八字'){
        // 日主强弱、用神、大运、流年、流月、十神
        if(result.dayStrong!==undefined)feats.push(result.dayStrong?'身强':'身弱');
        if(result.yongShen)feats.push('用神',result.yongShen);
        if(result.dayGan)feats.push('日主'+result.dayGan);
        if(result.pillars)result.pillars.forEach(p=>{if(p.ganShen)feats.push(p.ganShen);});
        if(result.daYun&&result.daYun.length)feats.push('大运','当前大运');
        if(result.liuNian)feats.push('流年');
      }else if(shushu==='梅花易数'){
        // 体卦、用卦、体用关系、互卦、变卦
        if(result.tiGua&&result.tiGua.n)feats.push('体卦',result.tiGua.n);
        if(result.yongGua&&result.yongGua.n)feats.push('用卦',result.yongGua.n);
        if(result.rel)feats.push(result.rel,'体用');
        if(result.huGua&&result.huGua.name)feats.push('互卦',result.huGua.name);
        if(result.bianGua&&result.bianGua.name)feats.push('变卦',result.bianGua.name);
        if(result.guaName)feats.push(result.guaName);
      }else if(shushu==='小六壬'){
        // 月宫、日宫、时宫、三宫生克、问事主题
        if(result.month)feats.push('月宫'+result.month);
        if(result.day)feats.push('日宫'+result.day);
        if(result.time)feats.push('时宫'+result.time);
        if(result.detail){
          feats.push(result.detail.attr,result.detail.wx,result.detail.ji);
          if(result.detail.ji==='吉')feats.push('吉');else if(result.detail.ji==='凶')feats.push('凶');
        }
      }else if(shushu==='塔罗'){
        if(result.cards)result.cards.forEach(c=>{feats.push(c.name);if(c.up)feats.push('正位');else feats.push('逆位');});
      }
    }catch(e){}
    return feats.filter(f=>f&&typeof f==='string');
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

  // ---------- 完整阅读 ----------
  const _fullTexts = {}; // bookId -> fullTextData

  /**
   * 加载某本书的完整文本（按章节）
   * @param {string} bookId
   * @returns {Object|null|Promise} {id,title,dynasty,author,chapters:[{title,text}],total_chars}
   */
  function loadFullText(bookId) {
    if (_fullTexts[bookId]) return _fullTexts[bookId];
    const url = BASE + 'fulltext/' + bookId + '.json';
    const text = _loadTextSync(url);
    if (text) {
      try {
        const data = JSON.parse(text);
        _fullTexts[bookId] = data;
        return data;
      } catch (e) { return null; }
    }
    return _loadTextAsync(url).then(t => {
      if (!t) return null;
      const data = JSON.parse(t);
      _fullTexts[bookId] = data;
      return data;
    }).catch(() => null);
  }

  /**
   * 获取所有书籍列表（含元数据）
   * @returns {Array} books
   */
  function getBookList() {
    if (!_index) loadIndex();
    if (!_index) return [];
    return _index.books || [];
  }

  /**
   * 按术数分类获取书籍列表
   * @param {string} shushu
   * @returns {Array} books
   */
  function getBooksByShushu(shushu) {
    return getBookList().filter(b => b.shushu === shushu);
  }

  /**
   * 在单本书内搜索段落
   * @param {string} bookId
   * @param {string} query
   * @param {number} limit
   * @returns {Array} passages
   */
  function searchInBook(bookId, query, limit) {
    if (!_index) loadIndex();
    if (!_index) return [];
    const meta = _metaById[bookId];
    if (!meta) return [];
    if (!_books[bookId]) loadBook(bookId);
    const book = _books[bookId];
    if (!book || !book.passages) return [];
    const q = String(query || '').trim();
    if (!q) return book.passages.slice(0, limit || 50);
    const qTokens = _tokenize(q);
    const scored = book.passages.map(p => {
      let score = 0;
      qTokens.forEach(tok => {
        const hit = _inverted[tok];
        if (hit && hit[p.id]) score += hit[p.id];
      });
      return { p, score };
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
    return scored.slice(0, limit || 50).map(x => x.p);
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
    loadFullText,
    getBookList,
    getBooksByShushu,
    search,
    searchInBook,
    extractBoardFeatures,
    formatCitation,
    loadedCount,
    reset
  };
})(window);
