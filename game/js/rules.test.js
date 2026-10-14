import {
  relation, overcomeBy, overcomes, judge, pickWispWx, grade, palaceOf, dirName, gateNeed, difficultyById,
} from './rules.js';

let failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) {
    failed++;
    console.error('FAIL', name, '\n  got ', got, '\n  want', want);
  }
}

eq('金克木', relation('金', '木'), '克');
eq('木被金克', relation('木', '金'), '被克');
eq('水生木', relation('水', '木'), '生');
eq('木被水生', relation('木', '水'), '被生');
eq('同', relation('火', '火'), '同');
eq('克火者水', overcomeBy('火'), '水');
eq('火克金', overcomes('火'), '金');
eq('链闭合', WX_CYCLE(), true);

function WX_CYCLE() {
  const order = ['金', '木', '土', '水', '火'];
  return order.every((w, i) => overcomes(w) === order[(i + 1) % order.length]);
}

const ke = judge({ playerWx: '水', wispWx: '火', timing: 0.9, embodied: true, kong: false, kongRoll: 0.9, shengCounts: false });
eq('正克有进度', ke.progress, 1);
eq('正克文案', ke.text, '正克');
if (ke.score < 30) { failed++; console.error('FAIL score too low', ke.score); }

const late = judge({ playerWx: '水', wispWx: '火', timing: 0.2, embodied: false, kong: false, kongRoll: 0.9, shengCounts: false });
eq('克中', late.text, '克中');
eq('早克分低于正克', late.score < ke.score, true);

const kong = judge({ playerWx: '水', wispWx: '火', timing: 1, embodied: false, kong: true, kongRoll: 0.1, shengCounts: false });
eq('落空无进度', kong.progress, 0);
eq('落空文案', kong.text, '落空亡');

const shengJi = judge({ playerWx: '木', wispWx: '火', timing: 0.5, embodied: false, kong: false, kongRoll: 0.9, shengCounts: true });
eq('吉将相生可过', shengJi.progress, 1);

const shengXiong = judge({ playerWx: '木', wispWx: '火', timing: 0.5, embodied: false, kong: false, kongRoll: 0.9, shengCounts: false });
eq('凶将相生不破', shengXiong.progress, 0);

const back = judge({ playerWx: '木', wispWx: '金', timing: 0.5, embodied: false, kong: false, kongRoll: 0.9, shengCounts: false });
eq('被克受伤', back.damage, 1);

eq('主气', pickWispWx('火', '金', 0.1, 0), '火');
eq('克我之气', pickWispWx('火', '金', 0.7, 0), overcomeBy('金'));
eq('吉将三破', gateNeed(1), 3);
eq('凶将四破', gateNeed(-1), 4);

eq('课破', grade({ defeated: true, score: 300, hearts: 0, kongGates: 0 }).id, '破');
eq('课吉', grade({ defeated: false, score: 220, hearts: 4, kongGates: 0 }).id, '吉');
eq('课空', grade({ defeated: false, score: 80, hearts: 5, kongGates: 2 }).id, '空');
eq('课成', grade({ defeated: false, score: 130, hearts: 2, kongGates: 0 }).id, '成');

eq('宫位', palaceOf([11, 0, 1, 2], 1), 2);
eq('方向北', dirName({ x: 0, z: 0 }, { x: 0, z: -5 }), '北');
eq('方向东', dirName({ x: 0, z: 0 }, { x: 5, z: 0 }), '东');
eq('从容六心神', difficultyById('ease').hearts, 6);
eq('急课加分', difficultyById('rush').score > 1, true);
eq('未知难度回寻常', difficultyById('nope').id, 'normal');

if (failed) {
  console.error(failed + ' failed');
  process.exit(1);
}
console.log('rules ok');
