// 场景契约：客户端知道自己处在哪个栏目，服务端该按哪套规矩接单。
//
// 为什么要有这一层：
//   桌面端「时课」实时问答框、手机端「实时卜筮」、命盘问对、典籍问答，问的是同一件事
//   ——「把结构化术数盘面转成可参考的决策线索」。但四个场景的**默认难度**、
//   **默认采样参数**、**回答体量**各不相同：实时二选一要快要短，全盘详批要慢要长。
//   以前这些默认值散落在各端（手机端在 js/ai.js 里拼，桌面端只给命盘做了一套），
//   服务端对「这是什么场景」一无所知，只能靠文本启发式猜难度 —— 长盘面一律判 hard，
//   白白把简单问题送给大模型。
//   于是把场景收敛成一份**双方都能引用的契约**：客户端传 scene，服务端据此
//   1) 给默认档位（客户端显式给的 difficulty 永远优先，契约只补缺省）；
//   2) 补默认温度与 max_tokens（客户端同样可覆盖）；
//   3) 把场景写进路由留痕，后台能按场景看哪类提问打挂了哪家模型。
//
// 新增场景只需在 SCENES 里加一行，旧客户端不传 scene 时行为与今天完全一致。

/** 全部合法场景。缺省 null = 老客户端 / 通用对话。 */
export const SCENES = {
  // 实时卜筮：当下起课，短周期（数日至数周）决策参考。默认 mid，快而短。
  realtime: { tier: 'mid', temperature: 0.7, maxTokens: 900, desc: '实时卜筮问答' },
  // 终身命理：八字/紫微命盘多轮问对。默认 mid，允许展开到 1200。
  lifetime: { tier: 'mid', temperature: 0.7, maxTokens: 1200, desc: '终身命理问对' },
  // 典籍问答：经典原文检索式问答，最看重确定性，低温短答。
  classics: { tier: 'easy', temperature: 0.4, maxTokens: 800, desc: '典籍问答' },
  // 今日宜忌：每日一次的行动指南，结构化输出，固定体量。
  daily: { tier: 'mid', temperature: 0.7, maxTokens: 900, desc: '今日宜忌' },
  // 决策对比：A/B 结构化对比，需要表格与分点，体量最大。
  decision: { tier: 'hard', temperature: 0.7, maxTokens: 1400, desc: '决策对比' },
  // 后台一键试跑：管理员主动探活，与用户场景无关。
  admin_test: { tier: 'mid', temperature: 0.6, maxTokens: 64, desc: '后台试跑' }
};

/** 场景名 → 契约条目；非法名返回 null（由调用方决定是拒绝还是忽略）。 */
export function sceneSpec(scene) {
  if (typeof scene !== 'string') return null;
  const s = scene.trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(SCENES, s) ? { name: s, ...SCENES[s] } : null;
}

/**
 * 场景默认档位。只在客户端没给 difficulty 时生效 —— 客户端最清楚
 * 「这是用户一键点的快捷问题」还是「让用户自己打了一大段」。
 */
export function sceneTier(scene) {
  return sceneSpec(scene)?.tier ?? null;
}

/**
 * 按场景补默认采样参数：客户端给了就听客户端的，没给才用场景默认。
 * 为什么温度可以按场景定：同一句「我该不该跳槽」，典籍问答要的是原文一致性（低温），
 * 实时顾问要的是贴合用户背景的灵活表达（高温）。让每个场景都有自己的起点，
 * 客户端想覆盖仍然一行字段的事。
 */
export function sceneSampling(scene, temperature, maxTokens) {
  const spec = sceneSpec(scene);
  if (!spec) return { temperature, maxTokens };
  return {
    temperature: temperature === null ? spec.temperature : temperature,
    maxTokens: maxTokens === null ? spec.maxTokens : maxTokens
  };
}
