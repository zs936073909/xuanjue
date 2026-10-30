// 模型能力识别：哪些模型能吃「视频」。
//
// 为什么用模型名匹配而不是在库里加一个 supports_video 字段：
//   1. 能力随厂商版本变化，跟着发版改一份名单最省事，不用「老库没有新列」的迁移包袱；
//   2. 视频理解是「厂商级」属性而非「Key 级」，名单落在代码里更容易随版本校准；
//   3. 前后端各有一份同名名单（js/ai.js 的 VIDEO_MODELS），改一处必须同步另一处，
//      已在两处都写明出处。
//
// 名单依据（2026-10 核对各家公开文档）：
//   阶跃星辰 step-5-preview / step-3.7-flash —— 支持 video_url（可访问 URL 或 base64 内联）
//   阶跃星辰 step-1o-turbo-vision           —— 视觉版，支持 video_url
//   step-3.5-flash                           —— 纯文本，不吃视频，刻意排除
//   OpenAI gpt-4o / gpt-4.1 / gpt-5          —— 支持 video_url
//   通义千问 qwen-vl-* / qwen-vl-max          —— DashScope 兼容模式支持 video
//   豆包 doubao-vision / -video              —— 火山引擎兼容模式支持视频
//   Gemini gemini-2*                          —— 走 OpenAI 兼容层时支持 video_url

const VIDEO_MODEL_PATTERNS = [
  /^step-5(-|$)/,            // step-5-preview / step-5
  /^step-3\.7-flash/,        // step-3.7-flash（多模态）
  /^step-1o-turbo-vision/,   // 阶跃视觉版
  /^gpt-4o/,                // gpt-4o / gpt-4o-mini / gpt-4o-audio
  /^gpt-4\.1/,               // gpt-4.1 系列
  /^gpt-5/,                  // gpt-5 系列
  /^gemini-2/,               // gemini-2.x
  /^qwen-vl/,                // qwen-vl-max / qwen-vl-plus
  /^qwen.*-vl-/,             // qwen2.5-vl-7b 之类
  /^doubao-.*(vision|video)/,// doubao-vision-pro / doubao-1-5-video
  /^kimi-k2/,                // kimi k2 视觉
  /^glm-4v/,                 // 智谱 GLM-4V
  /^minicpm-v/,              // 面壁 MiniCPM-V
  /^internvl/,               // 书生 InternVL
  /^hunyuan-vision/          // 腾讯混元
];

/** 该模型是否支持视频理解 */
export function supportsVideo(model) {
  const m = String(model || '').trim().toLowerCase();
  if (!m) return false;
  return VIDEO_MODEL_PATTERNS.some(re => re.test(m));
}

/** 从候选列表里筛出支持视频的条目（原地返回新数组） */
export function filterVideoModels(list) {
  return (list || []).filter(x => supportsVideo(x.model));
}
