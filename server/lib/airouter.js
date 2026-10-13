// AI 模型池路由器：难度分级 → 档位模型 → 厂商轮询 → Key 轮询 → 自动降级
//
// 站长诉求（原话）：
//   「多做几个接口，不一定连一个，应该是多个厂商换着来，而且不同模型也会换」
//   「主要是魔搭社区你看看能不能按照问题点难易程度调用同一个厂商的不同产数模型」
//
// 第一性原理拆解：
//   1. 问题有难易 → 难问题配大模型、易问题配小模型（省钱 + 快）；
//   2. 任何单厂/单 Key 都会挂 → 必须有换厂商、换 Key 的自动降级；
//   3. 「换着来」不能只靠故障触发 → 正常情况也要轮询分摊，避免总压一家。
//
// 于是三层结构：厂商(provider) → 档位模型(model) → Key(key)。
// 一次提问的候选序列 = 目标档位的模型们（同优先级跨厂商轮转）→ 相邻档位兜底，
// 每个候选配一把该厂商的 Key；打挂了就顺移到下一个候选，直到全试完才报错。
import { q } from './db.js';

const ADJACENT = {
  easy: ['easy', 'mid', 'hard'],
  mid: ['mid', 'easy', 'hard'],
  hard: ['hard', 'mid', 'easy']
};
// 一次请求最多尝试几个候选：既给足降级余地，又不让用户的等待无限拉长
const MAX_ATTEMPTS = 4;

// ---------- 难度判定 ----------

// 深度/复合型问法 → 加难度；简短选择题 → 降难度。
// 词表按「问法」而不是「领域」挑：同一个命理问题，问「帮我全面详批」和「今年能不能换工作」难度天差地别。
const HARD_WORDS = [
  '详批', '深度', '全面', '详细', '综合分析', '逐项', '大运', '流年', '流月',
  '趋势', '长期', '一生', '格局', '喜用神', '分别', '对比', '为什么', '推演', '来龙去脉'
];
const EASY_WORDS = [
  '二选一', '三选一', '是不是', '能不能', '该不该', '好不好', '对不对', '简单', '一句话', '快速', '随便'
];

/**
 * 估问题难度。客户端 hint 优先（它知道这是「一键起课」还是「全盘详批」），
 * 没给 hint 时按文本启发式估。返回 'easy' | 'mid' | 'hard'。
 */
export function estimateTier(messages, hint) {
  if (hint === 'easy' || hint === 'mid' || hint === 'hard') return hint;

  const userText = messages
    .filter(m => m.role === 'user')
    .map(m => m.content)
    .join('\n');
  const totalLen = messages.reduce((n, m) => n + m.content.length, 0);

  let score = 0;
  if (totalLen > 1200) score += 2;
  else if (totalLen > 300) score += 1;

  // 命中的深度词越多越难，封顶 3（避免一篇长文把难度拉爆）
  let hardHits = 0;
  for (const w of HARD_WORDS) if (userText.includes(w)) hardHits++;
  score += Math.min(hardHits, 3);

  let easyHits = 0;
  for (const w of EASY_WORDS) if (userText.includes(w)) easyHits++;
  score -= Math.min(easyHits, 2);

  // 多问句 = 复合问题（「？」多于一个）
  const qs = (userText.match(/[?？]/g) || []).length;
  if (qs >= 2) score += 1;

  // 多轮对话（有历史）说明在做长程分析
  if (messages.length >= 6) score += 1;

  if (score <= 0) return 'easy';
  if (score >= 3) return 'hard';
  return 'mid';
}

// ---------- 候选序列 ----------

// 厂商轮转游标：只在「同 priority 的厂商组」内轮转，正常情况也换着打，分摊各家额度
let rotateCursor = 0;

/** 同优先级组内轮转：按游标换起点，「多个厂商换着来」落到实处 */
function rotate(list) {
  if (list.length <= 1) return list;
  const start = rotateCursor % list.length;
  rotateCursor = (rotateCursor + 1) % list.length;
  return list.slice(start).concat(list.slice(0, start));
}

/**
 * 构造候选序列：目标档位优先，相邻档位兜底。
 * 档位内排序规则（管理员可控且稳定）：
 *   1. priority 小者优先 —— 管理员的显式偏好永远赢；
 *   2. 同 priority 的厂商之间轮转 —— 无偏好时分摊到多家（「换着来」）；
 *   3. 同厂商内按 priority / 创建顺序铺开模型与 Key。
 * 每个候选带一把该厂商的可用 Key；同模型的备用 Key 排在其后（容灾顺移）。
 * @returns {Promise<Array<{tier,providerSlug,protocol,baseUrl,model,modelId,keyId,apiKey}>>}
 */
export async function buildCandidates(tier) {
  const want = ADJACENT[tier] || ADJACENT.mid;
  const r = await q(
    `select m.id as model_id, m.model, m.tier, m.priority,
            p.slug, p.name as provider_name, p.protocol, p.base_url,
            k.id as key_id, k.key_plain
     from ai_models m
     join ai_providers p on p.id = m.provider_id
     join ai_keys k on k.provider_id = p.id and k.status = 'active'
     where m.enabled and p.enabled
     order by m.priority asc, k.created_at asc`
  );
  if (!r.rowCount) return [];

  // 1) 按档位分组
  const byTier = new Map();
  for (const row of r.rows) {
    if (!byTier.has(row.tier)) byTier.set(row.tier, []);
    byTier.get(row.tier).push(row);
  }

  const out = [];
  for (const t of want) {
    const rows = byTier.get(t);
    if (!rows || !rows.length) continue;

    // 2) 厂商维度聚合：每个厂商在本档位的最小 priority 决定它的批次
    const bySlug = new Map();
    for (const row of rows) {
      if (!bySlug.has(row.slug)) bySlug.set(row.slug, []);
      bySlug.get(row.slug).push(row);
    }
    const provs = [...bySlug.entries()].map(([slug, list]) => ({
      slug,
      best: Math.min(...list.map(x => Number(x.priority))),
      list
    }));
    provs.sort((a, b) => a.best - b.best || (a.slug < b.slug ? -1 : 1));

    // 3) 同 best priority 的厂商一组，组内轮转；不同 priority 严格按 priority
    const ordered = [];
    for (let i = 0; i < provs.length; ) {
      let j = i;
      while (j < provs.length && provs[j].best === provs[i].best) j++;
      const group = provs.slice(i, j);
      ordered.push(...(group.length > 1 ? rotate(group) : group));
      i = j;
    }

    // 4) 每个厂商：priority 小的模型在前；每模型先主 Key 后备用 Key（容灾顺移）
    for (const prov of ordered) {
      const perModel = new Map();
      const sorted = [...prov.list].sort((a, b) => Number(a.priority) - Number(b.priority));
      for (const row of sorted) {
        if (!perModel.has(row.model_id)) perModel.set(row.model_id, []);
        perModel.get(row.model_id).push(row);
      }
      for (const [modelId, list] of perModel) {
        for (const row of list) {
          out.push({
            tier: row.tier,
            providerSlug: row.slug,
            protocol: row.protocol,
            baseUrl: row.base_url,
            model: row.model,
            modelId,
            keyId: row.key_id,
            apiKey: row.key_plain
          });
        }
      }
    }
  }

  // 只保留前 MAX_ATTEMPTS*2 个（够降级用，也避免一次查询返回巨量 Key 明文驻留内存）
  return out.slice(0, MAX_ATTEMPTS * 2);
}

export function maxAttempts() {
  return MAX_ATTEMPTS;
}

// ---------- Key 健康 ----------

const SUSPECT_AFTER_FAILS = 3;

/** 记录一次结果：成功清零失败计数，连续失败若干次自动标 suspect 并停用 */
export async function markKeyResult(keyId, ok) {
  if (!keyId) return;
  if (ok) {
    await q(`update ai_keys set fails=0, last_ok_at=now() where id=$1`, [keyId]).catch(() => {});
    return;
  }
  await q(
    `update ai_keys set fails=fails+1, last_fail_at=now(),
       status = case when fails + 1 >= $2 then 'suspect' else status end
     where id=$1`,
    [keyId, SUSPECT_AFTER_FAILS]
  ).catch(() => {});
}

// ---------- 路由留痕 ----------

/**
 * 记录一次路由决策：只记元信息（难度/场景/厂商/模型/状态/耗时/字数），
 * 不记提问内容 —— 用户的私事不该因为运维留痕进日志表。
 * scene 说明这次提问来自哪个栏目（实时卜筮/命盘问对/典籍问答…），
 * 后台据此能看出「哪类提问在哪家模型上总失败」，比只看 tier 更可操作。
 */
export async function logRouting(entry) {
  q(
    `insert into ai_routing_log
       (user_id, tier, scene, provider_slug, model, key_id, status, latency_ms, chars_in, chars_out)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      entry.userId || null,
      entry.tier,
      entry.scene || null,
      entry.providerSlug || null,
      entry.model || null,
      entry.keyId || null,
      entry.status,
      entry.latencyMs || null,
      entry.charsIn || 0,
      entry.charsOut || 0
    ]
  ).catch(() => {});
}

/** 上游错误 → 路由日志状态 + 是否值得换下一个候选 */
export function classifyUpstream(status) {
  if (status === 401 || status === 403) return { status: 'upstream_unauthorized', retry: true, keyBad: true };
  if (status === 429) return { status: 'rate_limited', retry: true, keyBad: false };
  if (status === 404) return { status: 'upstream_not_found', retry: true, keyBad: true };
  if (status >= 500) return { status: 'upstream_error', retry: true, keyBad: false };
  return { status: 'upstream_rejected', retry: false, keyBad: true };
}
