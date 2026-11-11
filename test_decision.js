// test_decision.js — 问事档案数据层（js/decision.js）
// 这层不做算法，但它是"复盘"能不能成立的地基：迁移、到期、统计、导出都必须可复现。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, 'webapp/js/decision.js'), 'utf8');
const sandbox = { window: {}, Date, JSON, console };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const XD = sandbox.window.XD;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log('✗ ' + name); }
}

// 1) 默认结构
ok('blankCard 五问齐全', Object.keys(XD.blankCard()).length === 5);
ok('blankPlan 有复盘日期', 'reviewAt' in XD.blankPlan());
ok('blankReview 无时间戳', XD.blankReview().at === null);

// 2) 老数据迁移：v1 的"应验 + 备注"降级为 note，不再作为命中判定
const oldCase = {
  id: 'c1', desc: '要不要接这个 offer', createdAt: '2026-01-01T10:00:00.000Z',
  reviewed: true, reviewNote: '部分应验 · 对方两周后才回复', reviewAt: '2026-01-10T10:00:00.000Z'
};
const m = XD.migrate(oldCase);
ok('迁移版本号为 2', m.v === 2);
ok('迁移补齐 card', !!m.card && typeof m.card.choice === 'string');
ok('迁移补齐 plan', !!m.plan && typeof m.plan.judgment === 'string');
ok('旧"部分应验"归入 happened=partial', m.review.happened === 'partial');
ok('备注去掉判定前缀', m.review.note === '对方两周后才回复');
ok('迁移后视为已复盘', XD.isReviewed(m));
ok('重复迁移幂等', JSON.stringify(XD.migrate(m)) === JSON.stringify(m));

// 3) 问题卡填充度
ok('空卡计 0', XD.cardFilled(XD.blankCard()) === 0);
ok('填两项计 2', XD.cardFilled(Object.assign(XD.blankCard(), { choice: 'A/B', deadline: '月底' })) === 2);

// 4) 模糊问题：只建议，不拦截
ok('超短句给改写建议', !!XD.vagueReason('怎么办'));
ok('空泛句给改写建议', !!XD.vagueReason('我该不该跳槽'));
ok('具体句不打扰', XD.vagueReason('这个 offer 要不要接，月底前要给答复') === null);

// 5) 重大话题：只取提示语，永不阻断
ok('识别健康', XD.topicHint('要不要停药').tag === '健康');
ok('识别资金', XD.topicHint('这笔钱该不该投股票').tag === '钱');
ok('识别法律', XD.topicHint('要不要起诉对方').tag === '法律');
ok('普通问题不误伤', XD.topicHint('周末去爬山还是在家') === null);

// 6) 到期判定
const now = Date.now();
const mk = (over) => XD.migrate(Object.assign({
  id: 'x', desc: 'q', qType: '其他', createdAt: new Date(now - 30 * XD.DAY).toISOString()
}, over));
ok('没留日期时默认 7 天到期', XD.dueState(mk({})).state === 'late');
ok('未到期是 wait', XD.dueState(mk({
  plan: { reviewAt: new Date(now + 5 * XD.DAY).toISOString().slice(0, 10) }
})).state === 'wait');
ok('刚到期是 due', XD.dueState(mk({
  plan: { reviewAt: new Date(now - 1 * XD.DAY).toISOString().slice(0, 10) }
})).state === 'due');
ok('已复盘是 done', XD.dueState(mk({
  review: { happened: 'yes', basis: '帮上了', action: '行动了', note: '', at: new Date().toISOString() }
})).state === 'done');

// 7) 统计：不做命中率，只看"用没用起来"
const cases = [
  mk({ id: 'a', card: { choice: 'x', deadline: 'y' }, plan: { judgment: '我倾向接' } }),
  mk({ id: 'b' }),
  mk({ id: 'c', review: { happened: 'yes', basis: '帮上了', action: '行动了', note: '', at: new Date().toISOString() } })
];
const st = XD.stats(cases);
ok('统计总数', st.total === 3);
ok('留判断比例', st.planRate === 33);
ok('复盘比例', st.reviewRate === 33);
ok('没有命中率字段', !('hitRate' in st) && !('accuracy' in st));

// 8) 导出可解析且含迁移后结构
const exp = JSON.parse(XD.exportJSON(cases));
ok('导出 kind', exp.kind === 'cases');
ok('导出全部条数', exp.cases.length === 3);
ok('导出含问题卡', !!exp.cases[0].card);
ok('导出不含命中率', !JSON.stringify(exp).includes('hitRate'));

// 9) 信号拆分
ok('顿号/换行都能拆', XD.splitList('对方回信\n价格谈拢；第三周有答复').length === 3);

console.log('\n=========================');
console.log('决策数据层 通过: ' + pass + ' 失败: ' + fail);
process.exit(fail ? 1 : 0);
