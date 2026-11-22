// liuyao.js — 六爻纳甲排盘（自研，MIT）
// 替换原 iching-shifa（GPL-3.0-or-later）：GPL 与被分发的闭源 APK 存在许可冲突，
// 而本项目只用到其中「纳甲 / 六亲 / 世应 / 伏神 / 卦名」一小部分，故按京房纳甲自建。
// 口径：八宫卦序定世应；纳甲用京房纳甲法；六亲以卦宫五行为「我」；六神由渲染层按日干起。
(function (global) {
  'use strict';

  const GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
  const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  const ZHI_WX = ['水', '土', '木', '木', '土', '火', '火', '土', '金', '金', '土', '水'];
  const GAN_WX = { 甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水' };
  const NA_YIN = ['海中金', '炉中火', '大林木', '路旁土', '剑锋金', '山头火', '涧下水', '城头土', '白蜡金', '杨柳木',
    '泉中水', '屋上土', '霹雳火', '松柏木', '长流水', '沙中金', '山下火', '平地木', '壁上土', '金箔金',
    '覆灯火', '天河水', '大驿土', '钗钏金', '桑柘木', '大溪水', '沙中土', '天上火', '石榴木', '大海水'];
  // 五行生克
  const WX_SHENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
  const WX_KE = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };

  // 三爻（自下而上）→ 八卦
  const TRI = { '111': '乾', '110': '兑', '101': '离', '100': '震', '011': '巽', '010': '坎', '001': '艮', '000': '坤' };
  const TRI_WX = { 乾: '金', 兑: '金', 离: '火', 震: '木', 巽: '木', 坎: '水', 艮: '土', 坤: '土' };

  // 64 卦名：上卦|下卦
  const NAMES = {
    '乾|乾': '乾为天', '乾|兑': '天泽履', '乾|离': '天火同人', '乾|震': '天雷无妄', '乾|巽': '天风姤', '乾|坎': '天水讼', '乾|艮': '天山遁', '乾|坤': '天地否',
    '兑|乾': '泽天夬', '兑|兑': '兑为泽', '兑|离': '泽火革', '兑|震': '泽雷随', '兑|巽': '泽风大过', '兑|坎': '泽水困', '兑|艮': '泽山咸', '兑|坤': '泽地萃',
    '离|乾': '火天大有', '离|兑': '火泽睽', '离|离': '离为火', '离|震': '火雷噬嗑', '离|巽': '火风鼎', '离|坎': '火水未济', '离|艮': '火山旅', '离|坤': '火地晋',
    '震|乾': '雷天大壮', '震|兑': '雷泽归妹', '震|离': '雷火丰', '震|震': '震为雷', '震|巽': '雷风恒', '震|坎': '雷水解', '震|艮': '雷山小过', '震|坤': '雷地豫',
    '巽|乾': '风天小畜', '巽|兑': '风泽中孚', '巽|离': '风火家人', '巽|震': '风雷益', '巽|巽': '巽为风', '巽|坎': '风水涣', '巽|艮': '风山渐', '巽|坤': '风地观',
    '坎|乾': '水天需', '坎|兑': '水泽节', '坎|离': '水火既济', '坎|震': '水雷屯', '坎|巽': '水风井', '坎|坎': '坎为水', '坎|艮': '水山蹇', '坎|坤': '水地比',
    '艮|乾': '山天大畜', '艮|兑': '山泽损', '艮|离': '山火贲', '艮|震': '山雷颐', '艮|巽': '山风蛊', '艮|坎': '山水蒙', '艮|艮': '艮为山', '艮|坤': '山地剥',
    '坤|乾': '地天泰', '坤|兑': '地泽临', '坤|离': '地火明夷', '坤|震': '地雷复', '坤|巽': '地风升', '坤|坎': '地水师', '坤|艮': '地山谦', '坤|坤': '坤为地'
  };

  // 八宫卦序（本宫、一世…五世、游魂、归魂）
  const PALACES = {
    乾: ['乾为天', '天风姤', '天山遁', '天地否', '风地观', '山地剥', '火地晋', '火天大有'],
    坎: ['坎为水', '水泽节', '水雷屯', '水火既济', '泽火革', '雷火丰', '地火明夷', '地水师'],
    艮: ['艮为山', '山火贲', '山天大畜', '山泽损', '火泽睽', '天泽履', '风泽中孚', '风山渐'],
    震: ['震为雷', '雷地豫', '雷水解', '雷风恒', '地风升', '水风井', '泽风大过', '泽雷随'],
    巽: ['巽为风', '风天小畜', '风火家人', '风雷益', '天雷无妄', '火雷噬嗑', '山雷颐', '山风蛊'],
    离: ['离为火', '火山旅', '火风鼎', '火水未济', '山水蒙', '风水涣', '天水讼', '天火同人'],
    坤: ['坤为地', '地雷复', '地泽临', '地天泰', '雷天大壮', '泽天夬', '水天需', '水地比'],
    兑: ['兑为泽', '泽水困', '泽地萃', '泽山咸', '水山蹇', '地山谦', '雷山小过', '雷泽归妹']
  };
  // 宫内序号 → 世爻位（1-6）；应爻 = 世 ±3
  const SHI_POS = [6, 1, 2, 3, 4, 5, 4, 3];

  // 京房纳甲：每卦内卦（初二三）、外卦（四五上），自下而上
  const NAJIA = {
    乾: { inner: ['甲子', '甲寅', '甲辰'], outer: ['壬午', '壬申', '壬戌'] },
    坎: { inner: ['戊寅', '戊辰', '戊午'], outer: ['戊申', '戊戌', '戊子'] },
    艮: { inner: ['丙辰', '丙午', '丙申'], outer: ['丙戌', '丙子', '丙寅'] },
    震: { inner: ['庚子', '庚寅', '庚辰'], outer: ['庚午', '庚申', '庚戌'] },
    巽: { inner: ['辛丑', '辛亥', '辛酉'], outer: ['辛未', '辛巳', '辛卯'] },
    离: { inner: ['己卯', '己丑', '己亥'], outer: ['己酉', '己未', '己巳'] },
    坤: { inner: ['乙未', '乙巳', '乙卯'], outer: ['癸丑', '癸亥', '癸酉'] },
    兑: { inner: ['丁巳', '丁卯', '丁丑'], outer: ['丁亥', '丁酉', '丁未'] }
  };

  // 卦名 → { palace, order }
  const NAME_INDEX = {};
  Object.keys(PALACES).forEach((p) => PALACES[p].forEach((n, i) => { NAME_INDEX[n] = { palace: p, order: i }; }));

  function normYao(v) { return (v % 2) === 1 ? 1 : 0; } // 7/9 为阳，6/8 为阴
  function triOf(bits) { return TRI[bits] || '乾'; }
  function guaName(up, low) { return NAMES[up + '|' + low] || ''; }

  function gzIndex(gz) {
    const g = GAN.indexOf(gz.charAt(0)), z = ZHI.indexOf(gz.charAt(1));
    if (g < 0 || z < 0) return 0;
    let i = g;
    while (i % 12 !== z) i += 10;
    return i % 60;
  }
  function naYinOf(gz) { return NA_YIN[Math.floor(gzIndex(gz) / 2)]; }

  // 六亲：以卦宫五行为「我」
  function liuQinOf(meWx, zhi) {
    const wx = ZHI_WX[ZHI.indexOf(zhi)];
    if (!wx) return '';
    if (wx === meWx) return '兄弟';
    if (WX_SHENG[meWx] === wx) return '子孙';   // 我生者
    if (WX_SHENG[wx] === meWx) return '父母';   // 生我者
    if (WX_KE[meWx] === wx) return '妻财';      // 我克者
    if (WX_KE[wx] === meWx) return '官鬼';      // 克我者
    return '';
  }

  // 由六爻值串（自下而上，6/7/8/9）解出本卦结构
  function decodeGua(yaoString, dayGz) {
    const vals = String(yaoString).split('').map((c) => parseInt(c, 10));
    if (vals.length !== 6 || vals.some((v) => isNaN(v) || v < 6 || v > 9)) return null;
    const bits = vals.map(normYao).join('');            // 自下而上
    const low = triOf(bits.slice(0, 3));
    const up = triOf(bits.slice(3, 6));
    const name = guaName(up, low);
    const info = NAME_INDEX[name] || { palace: up, order: 0 };
    const palace = info.palace;
    const palaceWx = TRI_WX[palace];
    const shiPos = SHI_POS[info.order];
    const yingPos = ((shiPos + 2) % 6) + 1; // 世应相隔三位

    // 纳甲：内卦取本卦下卦，外卦取上卦
    const inner = NAJIA[low].inner, outer = NAJIA[up].outer;
    // 六神：依日干起，自初爻向上顺排（甲乙青龙、丙丁朱雀、戊勾陈、己螣蛇、庚辛白虎、壬癸玄武）
    const LIU_SHEN = ['青龙', '朱雀', '勾陈', '螣蛇', '白虎', '玄武'];
    const dGan = (dayGz || '').charAt(0) || '甲';
    let shenStart = 0;
    if (/[甲乙]/.test(dGan)) shenStart = 0;
    else if (/[丙丁]/.test(dGan)) shenStart = 1;
    else if (dGan === '戊') shenStart = 2;
    else if (dGan === '己') shenStart = 3;
    else if (/[庚辛]/.test(dGan)) shenStart = 4;
    else shenStart = 5;
    const yaoList = [];
    for (let i = 0; i < 6; i++) {
      const gz = i < 3 ? inner[i] : outer[i - 3];
      const zhi = gz.charAt(1);
      yaoList.push({
        position: i + 1,
        yaoValue: vals[i],
        yaovalue: vals[i],
        isMoving: vals[i] === 6 || vals[i] === 9,
        naJia: gz,
        wuXing: ZHI_WX[ZHI.indexOf(zhi)],
        liuQin: liuQinOf(palaceWx, zhi),
        liuShou: LIU_SHEN[(shenStart + i) % 6],
        naYin: naYinOf(gz),
        shiYing: (i + 1) === shiPos ? '世' : ((i + 1) === yingPos ? '应' : '')
      });
    }

    // 伏神：本宫首卦有、本卦缺的六亲，取首卦同爻位伏于本卦同爻位
    const fuShen = [];
    const have = {};
    yaoList.forEach((y) => { have[y.liuQin] = true; });
    const first = PALACES[palace][0];
    const firstBits = hexBitsOfName(first);
    if (firstBits) {
      const fLow = triOf(firstBits.slice(0, 3)), fUp = triOf(firstBits.slice(3, 6));
      const fInner = NAJIA[fLow].inner, fOuter = NAJIA[fUp].outer;
      for (let i = 0; i < 6; i++) {
        const gz = i < 3 ? fInner[i] : fOuter[i - 3];
        const zhi = gz.charAt(1);
        const qin = liuQinOf(palaceWx, zhi);
        if (qin && !have[qin]) {
          fuShen.push({ fuLiuQin: qin, fuNaJia: gz, fuWuXing: ZHI_WX[ZHI.indexOf(zhi)], fuNaYin: naYinOf(gz), hostPosition: i + 1 });
        }
      }
    }

    return {
      yaoString: String(yaoString),
      name,
      guaName: name,
      palace,
      palaceWuXing: palaceWx,
      shiLine: shiPos,
      yingLine: yingPos,
      yaoList,
      fuShen,
      pangFuShen: [],
      // 卦辞/彖辞/爻辞原由 GPL 库提供；此处留空，渲染层据空值自动隐藏该区块
      guaCi: '',
      yaoCi: [],
      tuanCi: '',
      shenYao: null,
      dayGz: dayGz || ''
    };
  }

  // 由卦名反推六爻阴阳位串
  const BITS_OF_NAME = {};
  (function () {
    const rev = {};
    Object.keys(TRI).forEach((b) => { rev[TRI[b]] = b; });
    Object.keys(NAMES).forEach((k) => {
      const [u, l] = k.split('|');
      BITS_OF_NAME[NAMES[k]] = rev[l] + rev[u];
    });
  })();
  function hexBitsOfName(n) { return BITS_OF_NAME[n] || null; }

  // 变卦：老阴 6→阳、老阳 9→阴
  function getZhiGua(yaoString) { return String(yaoString).replace(/9/g, '8').replace(/6/g, '7'); }
  // 互卦：下卦取 2/3/4 爻，上卦取 3/4/5 爻
  function getHuGua(yaoString) {
    const v = String(yaoString).split('');
    if (v.length !== 6) return '';
    return [v[1], v[2], v[3], v[2], v[3], v[4]].join('');
  }
  function getGuaName(yaoString) {
    const vals = String(yaoString).split('').map((c) => parseInt(c, 10));
    if (vals.length !== 6 || vals.some(isNaN)) return '';
    const bits = vals.map(normYao).join('');
    return guaName(triOf(bits.slice(3, 6)), triOf(bits.slice(0, 3)));
  }
  function countMovingYao(yaoString) {
    return (String(yaoString).match(/[69]/g) || []).length;
  }
  // 旬空：由日柱干支推本旬空亡二支
  function calcXunKong(dayGz) {
    const i = gzIndex(dayGz);
    return [ZHI[(i - (i % 10) + 10) % 12], ZHI[(i - (i % 10) + 11) % 12]];
  }

  global.LiuYao = {
    decodeGua, getGuaName, getZhiGua, getHuGua, countMovingYao, calcXunKong,
    naYinOf, liuQinOf, TRI, NAMES, PALACES
  };
})(typeof window !== 'undefined' ? window : globalThis);
