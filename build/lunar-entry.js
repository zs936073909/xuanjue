// lunar-entry.js — 把 6tail/lunar-javascript（MIT）挂到 window.LJ
// 只暴露一个命名空间，避免该库 UMD 默认行为把 Solar/Lunar/EightChar 等 20 多个名字
// 直接写到 window 上，与项目自有的 Lunar 适配层冲突。
import * as LJ from 'lunar-javascript';
window.LJ = LJ;
