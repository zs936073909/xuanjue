/* ============================================================
   玄决 · 问事记录数据层（纯数据，不碰 DOM，可在 Node 里直接跑测试）

   立意：这个产品不替用户下判断。它只做四件事——
   帮用户把问题说清、给一个有出处的传统视角、留下自己的判断、到期回来复盘。
   所以一条「案例」不是占卜结果，而是一份"我当时怎么想、后来怎样"的个人档案。

   之所以把数据结构单独拿出来：
   1) 老数据（只有 reviewed/reviewNote）要能平滑升到 v2，迁移逻辑必须可单测；
   2) 「复盘期是否已到」是产品核心状态，不能散落在几个视图里各算一遍；
   3) 导出与本地统计都只依赖这份结构，换渲染层不用动数据。
   ============================================================ */
(function () {
'use strict';

const DAY = 864e5;
const OUTCOMES = ['yes', 'partial', 'no', 'unclear'];
const OUTCOME_LABEL = { yes: '事情发生了', partial: '部分发生', no: '没有发生', unclear: '还看不清' };

function str(v) { return typeof v === 'string' ? v : ''; }
function blankCard() { return { choice: '', deadline: '', control: '', worry: '', unchecked: '' }; }
function blankPlan() { return { judgment: '', action: '', signals: '', reviewAt: '' }; }
function blankReview() { return { happened: '', basis: '', action: '', note: '', at: null }; }

/* 老案例 → v2。老版本只问"应验/未应验"，那恰好是本次改版要弱化的东西：
   把它降级为 note，不再作为「命中与否」的判定字段。 */
function migrate(c) {
  if (!c || typeof c !== 'object') return c;
  if (!c.card || typeof c.card !== 'object') c.card = blankCard();
  if (!c.plan || typeof c.plan !== 'object') c.plan = blankPlan();
  if (!c.review || typeof c.review !== 'object') c.review = blankReview();
  Object.keys(blankCard()).forEach(k => { if (typeof c.card[k] !== 'string') c.card[k] = ''; });
  Object.keys(blankPlan()).forEach(k => { if (typeof c.plan[k] !== 'string') c.plan[k] = ''; });
  Object.keys(blankReview()).forEach(k => { if (k !== 'at' && typeof c.review[k] !== 'string') c.review[k] = ''; });
  // v1 复盘字段并入 v2
  if (c.reviewed && !c.review.at) {
    c.review.at = c.reviewAt || new Date().toISOString();
    const raw = str(c.reviewNote);
    const oc = /^(应验|部分应验|未应验)\s*·?\s*/.exec(raw);
    if (oc) c.review.happened = oc[1] === '应验' ? 'yes' : oc[1] === '未应验' ? 'no' : 'partial';
    c.review.note = raw.replace(/^(应验|部分应验|未应验)\s*·?\s*/, '');
  }
  c.v = 2;
  return c;
}

function isReviewed(c) { return !!(c && c.review && c.review.at); }

/* 问题卡填了几项：用于"问题是否已足够清楚"的温和提示，不做硬门槛 */
function cardFilled(card) {
  if (!card) return 0;
  return Object.keys(blankCard()).filter(k => str(card[k]).trim()).length;
}

/* 模糊问题识别：返回一句改写建议，返回 null 表示不用提示。
   只是建议——用户想直接起课随时可以，产品不替他把关。 */
const MODAL_PAT = /该不该|要不要|好不好|行不行|能不能|可不可以|怎么办|如何(是好|选择)?/;
// 有具体对象：数字、明确选项、时间点、金额、期限。有这些就不必劝人改写
const CONCRETE_PAT = /[0-9]|还是|或者|个月|周|月底|月初|年底|今年|明年|下月|下周|之前|万元|块|天/;
function vagueReason(text) {
  const t = str(text).trim();
  if (t.length < 6) return '还很短——补一句"在什么之间选 / 大概什么时候要定"，盘面才有落点。';
  if (MODAL_PAT.test(t) && (!CONCRETE_PAT.test(t) || t.length <= 10)) {
    return '这句只有情绪没有对象：试试补上"面对的选择 + 想要的结果 + 大约什么时候要定"。';
  }
  return null;
}

/* 重大话题：始终伴随、永不阻断。词表只用于选提示语，不用来决定"能不能问"。 */
const TOPICS = [
  { re: /停药|减药|吃药|用药|手术|化疗|治疗|诊断|病|癌|抑郁|焦虑|自杀|伤害自己/, tag: '健康', text: '涉及健康与医疗：请以医生与专业机构的意见为准。本工具不做诊断，也不提供用药建议。' },
  { re: /投资|股票|基金|期货|买房|房贷|贷款|借钱|担保|理财|比特币|加密|炒币|彩票/, tag: '钱', text: '涉及资金与投资：请以可核实的财务信息、合同条款与专业意见为准。术数不构成投资建议。' },
  { re: /诉讼|起诉|仲裁|报警|合同纠纷|劳动仲裁|维权|离婚|抚养|遗产|继承/, tag: '法律', text: '涉及法律与权益：请咨询律师或相关机构。本工具不提供法律意见，也不能替代正式程序。' }
];
function topicHint(text) {
  const t = str(text);
  for (const x of TOPICS) if (x.re.test(t)) return { tag: x.tag, text: x.text };
  return null;
}

/* 复盘到期：优先用用户自己定的日期，没定就按起课 7 天后轻提醒 */
function reviewAt(c) {
  if (!c) return null;
  const p = str(c.plan && c.plan.reviewAt).trim();
  if (p) { const d = new Date(p + 'T00:00:00'); if (!isNaN(d.getTime())) return d; }
  if (c.createdAt) { const d = new Date(c.createdAt); if (!isNaN(d.getTime())) return new Date(d.getTime() + 7 * DAY); }
  return null;
}
/* state: done（已复盘）/ wait（还没到）/ due（今天或刚过）/ late（过了一周以上） */
function dueState(c) {
  if (isReviewed(c)) return { state: 'done', label: '已复盘', at: reviewAt(c), days: 0 };
  const at = reviewAt(c);
  if (!at) return { state: 'wait', label: '待复盘', at: null, days: 0 };
  const diff = at.getTime() - Date.now();
  if (diff > 0) {
    const d = Math.ceil(diff / DAY);
    return { state: 'wait', label: d <= 3 ? d + ' 天后复盘' : '待复盘', at, days: d };
  }
  const late = Math.floor(-diff / DAY);
  if (late >= 7) return { state: 'late', label: '该回头看了', at, days: late };
  return { state: 'due', label: '复盘期已到', at, days: late };
}

/* 本机行为统计（只用于自己看，不上报、不汇总成"命中率"） */
function stats(cases) {
  const list = (cases || []).map(migrate);
  const total = list.length;
  const withCard = list.filter(c => cardFilled(c.card) >= 2).length;
  const withPlan = list.filter(c => str(c.plan.judgment).trim() || str(c.plan.action).trim()).length;
  const reviewed = list.filter(isReviewed).length;
  const due = list.filter(c => { const s = dueState(c).state; return s === 'due' || s === 'late'; }).length;
  return {
    total, withCard, withPlan, reviewed, due,
    cardRate: total ? Math.round(withCard / total * 100) : 0,
    planRate: total ? Math.round(withPlan / total * 100) : 0,
    reviewRate: total ? Math.round(reviewed / total * 100) : 0
  };
}

/* 导出：这是用户自己的档案，必须能拿走 */
function exportJSON(cases) {
  return JSON.stringify({
    app: '玄决', kind: 'cases', v: 2,
    exportedAt: new Date().toISOString(),
    note: '本文件由用户本机导出，仅含本人问事与复盘记录。',
    cases: (cases || []).map(migrate)
  }, null, 2);
}

/* 信号文本 → 数组（用户用换行/顿号/分号随手写的都能拆开） */
function splitList(s) {
  return str(s).split(/[\n；;、]+/).map(x => x.trim()).filter(Boolean);
}

window.XD = {
  DAY, OUTCOMES, OUTCOME_LABEL,
  blankCard, blankPlan, blankReview,
  migrate, isReviewed, cardFilled, vagueReason, topicHint,
  reviewAt, dueState, stats, exportJSON, splitList
};
})();
