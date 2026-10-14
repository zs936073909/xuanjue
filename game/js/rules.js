// 夜盘规则：五行生克、应答判定、评分。纯函数，不碰画面。
// 生克与玄决 daliuren.js 一致：金克木、木克土、土克水、水克火、火克金。

export const WX = ['金', '木', '水', '火', '土'];

export const WX_COLOR = {
  金: '#d4d4d4',
  木: '#6a9a6a',
  水: '#6a8aaa',
  火: '#c45a4a',
  土: '#c9a86a',
};

// a 克 b
export const KE = { 金: '木', 木: '土', 土: '水', 水: '火', 火: '金' };
// a 生 b
export const SHENG = { 金: '水', 水: '木', 木: '火', 火: '土', 土: '金' };

export const DIFFICULTIES = [
  { id: 'ease', label: '从容', hearts: 6, speed: 0.74, hover: 1.4, score: 0.85, hint: '光来得慢，心神多一盏' },
  { id: 'normal', label: '寻常', hearts: 5, speed: 1, hover: 1, score: 1, hint: '按课体来' },
  { id: 'rush', label: '急课', hearts: 4, speed: 1.24, hover: 0.76, score: 1.35, hint: '来得快，应验也高' },
];

export function difficultyById(id) {
  return DIFFICULTIES.find((d) => d.id === id) || DIFFICULTIES[1];
}

export const QUESTIONS = [
  { id: '感情关系', label: '问感情', lei: '六合' },
  { id: '事业合作', label: '问事业', lei: '青龙' },
  { id: '学习考试', label: '问学业', lei: '朱雀' },
  { id: '财务决策', label: '问财', lei: '太常' },
  { id: '失物寻找', label: '问失物', lei: '玄武' },
  { id: '其他', label: '随意走走', lei: '贵人' },
];

export const LINES = {
  贵人: '贵人在此。先把气站稳，再应。',
  螣蛇: '螣蛇主惊。心若乱，光也乱。',
  朱雀: '朱雀主文书口舌。应明，不必争。',
  六合: '六合主和合。这一关，相生也能过。',
  勾陈: '勾陈主迟滞。硬拖会缠住。',
  青龙: '青龙主喜气。气顺，门就开。',
  天空: '天空主虚。看见的，未必落得下。',
  白虎: '白虎主迅疾。宜速克，不宜久停。',
  太常: '太常主宴乐。可以从容。',
  玄武: '玄武主隐失。防它暗里来。',
  太阴: '太阴主遮蔽。雾里也能应。',
  天后: '天后主阴助。柔一点，也过得去。',
};

export const BOONS = {
  贵人: { text: '贵人扶了一把，心神 +1', hearts: 1, score: 0 },
  青龙: { text: '青龙点额，应验 +28', hearts: 0, score: 28 },
  六合: { text: '六合通关。下一关，相生亦能破', hearts: 0, score: 8, flag: 'sheng' },
  太常: { text: '太常赐宴。心神 +1，下一关稍缓', hearts: 1, score: 6, flag: 'slow' },
  太阴: { text: '太阴披雾，可避一次来袭', hearts: 0, score: 4, flag: 'veil' },
  天后: { text: '天后留恩，心神 +1', hearts: 1, score: 8 },
};

export const SHA = {
  驿马: { text: '驿马加身，步履见快', flag: 'haste' },
  桃花: { text: '桃花临宫，应验 +16', score: 16 },
  华盖: { text: '华盖遮蔽，可避一次来袭', flag: 'veil' },
};

const COUNTER = {};
for (const [a, b] of Object.entries(KE)) COUNTER[b] = a;

export function overcomes(wx) { return KE[wx]; }
export function overcomeBy(wx) { return COUNTER[wx]; }

export function relation(a, b) {
  if (!a || !b) return '无';
  if (a === b) return '同';
  if (KE[a] === b) return '克';
  if (KE[b] === a) return '被克';
  if (SHENG[a] === b) return '生';
  if (SHENG[b] === a) return '被生';
  return '无';
}

export function relLabel(rel) {
  return { 克: '我克之', 被克: '克我', 生: '我生之', 被生: '生我', 同: '比和', 无: '无涉' }[rel] || rel;
}

function clamp01(n) { return Math.max(0, Math.min(1, n)); }

// 应答判定。kongRoll 为 0..1，由调用方传入，便于测试。
export function judge(o) {
  const rel = relation(o.playerWx, o.wispWx);
  const out = { rel, progress: 0, damage: 0, score: 0, text: '', kind: rel };
  const hollow = !!o.kong && o.kongRoll < 0.4;
  if (rel === '克') {
    if (hollow) {
      out.kind = '空';
      out.score = 4;
      out.text = '落空亡';
      return out;
    }
    out.progress = 1;
    out.score = 16 + Math.round(18 * clamp01(o.timing)) + (o.embodied ? 8 : 0);
    out.text = o.timing > 0.66 ? '正克' : '克中';
    out.kind = '克';
    return out;
  }
  if (rel === '生') {
    if (o.shengCounts) {
      if (hollow) {
        out.kind = '空';
        out.score = 3;
        out.text = '相生亦落空';
        return out;
      }
      out.progress = 1;
      out.score = 12 + Math.round(8 * clamp01(o.timing)) + (o.embodied ? 4 : 0);
      out.text = '相生而过';
      out.kind = '生';
      return out;
    }
    out.score = 6;
    out.text = '相生，未破此门';
    return out;
  }
  if (rel === '同') {
    out.score = 3;
    out.text = '比和相持';
    return out;
  }
  if (rel === '被生') {
    out.score = 2;
    out.text = '受生，未破门';
    return out;
  }
  out.damage = 1;
  out.text = '被克反噬';
  out.kind = '被克';
  return out;
}

export function pickWispWx(generalWx, playerWx, roll, mixRoll) {
  if (roll < 0.62) return generalWx;
  if (roll < 0.86) return overcomeBy(playerWx);
  return WX[Math.floor(mixRoll * 5) % 5];
}

export function gateNeed(ji) { return ji > 0 ? 3 : 4; }

export function gateClearBonus(noDamage) { return 36 + (noDamage ? 20 : 0); }

export function grade(o) {
  if (o.defeated) return { id: '破', name: '课破', line: '心神耗尽，这一课没有走完。' };
  if (o.kongGates >= 2 && o.score < 150) return { id: '空', name: '课空', line: '多传落空。盘面有应答，事情却发虚。' };
  if (o.score >= 200 && o.hearts >= 3) return { id: '吉', name: '课吉', line: '三传走通，这一局应验干净。' };
  if (o.score >= 110) return { id: '成', name: '课成', line: '三传已应，事情有了着落。' };
  return { id: '平', name: '课平', line: '三传走完了，应验平平。' };
}

export function dirName(from, to) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  if (dx * dx + dz * dz < 0.36) return '脚下';
  const deg = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360;
  return ['北', '东北', '东', '东南', '南', '西南', '西', '西北'][Math.round(deg / 45) % 8];
}

export function palaceOf(tianPan, spiritIdx) {
  const i = tianPan.indexOf(spiritIdx);
  return i < 0 ? 0 : i;
}
