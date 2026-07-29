/**
 * 六爻纳甲（京房筮法）静态数据。
 *
 * 两块内容：
 * 1. 京房纳甲：八卦配干支。装卦时内卦（初二三）取下卦前三支，外卦（四五六）取上卦后三支。
 * 2. 八宫与六神的起法。
 *
 * 卦名不在这里 —— 它是易经的基础数据，见 data/ichingHexagrams.js，本文件只做转出。
 *
 * 八宫六十四卦的归属**不在这里硬编**，而是由 liuyao.service.js 按世卦推衍规则
 * （本宫→一世→…→五世→游魂→归魂）算出来 —— 六十四条手抄表比七条规则更容易抄错。
 */

/**
 * 卦名与八宫数据。
 *
 * HEXAGRAM_NAMES 已移到 data/ichingHexagrams.js —— 它是易经的基础数据，
 * 不是六爻专有的：`/api/iching/hexagrams` 与六爻装卦必须读同一份，
 * 否则会出现「六爻知道乾为天、易经端点却说 Heaven over Heaven」这种自相矛盾。
 */
export { HEXAGRAM_NAMES } from '../data/ichingHexagrams.js';

/** 八卦的中文名与自然象，用于校验卦名与上下卦是否自洽。 */
export const TRIGRAM_CN = {
  Qian: { cn: '乾', image: '天', element: 'Metal' },
  Dui: { cn: '兑', image: '泽', element: 'Metal' },
  Li: { cn: '离', image: '火', element: 'Fire' },
  Zhen: { cn: '震', image: '雷', element: 'Wood' },
  Xun: { cn: '巽', image: '风', element: 'Wood' },
  Kan: { cn: '坎', image: '水', element: 'Water' },
  Gen: { cn: '艮', image: '山', element: 'Earth' },
  Kun: { cn: '坤', image: '地', element: 'Earth' },
};

/**
 * 京房纳甲：八卦配干支。
 *
 * branches 是该卦独立成六爻时自初爻至上爻的六个地支（隔位取支，阳卦顺行、阴卦逆行）。
 * 装卦时只取用其中一半：作下卦取 [0..2]，作上卦取 [3..5]。
 *
 * 天干只有乾坤内外不同（乾内甲外壬、坤内乙外癸），其余六卦内外同干。
 */
export const NAJIA = {
  Qian: { innerStem: '甲', outerStem: '壬', branches: ['子', '寅', '辰', '午', '申', '戌'] },
  Kun: { innerStem: '乙', outerStem: '癸', branches: ['未', '巳', '卯', '丑', '亥', '酉'] },
  Zhen: { innerStem: '庚', outerStem: '庚', branches: ['子', '寅', '辰', '午', '申', '戌'] },
  Xun: { innerStem: '辛', outerStem: '辛', branches: ['丑', '亥', '酉', '未', '巳', '卯'] },
  Kan: { innerStem: '戊', outerStem: '戊', branches: ['寅', '辰', '午', '申', '戌', '子'] },
  Li: { innerStem: '己', outerStem: '己', branches: ['卯', '丑', '亥', '酉', '未', '巳'] },
  Gen: { innerStem: '丙', outerStem: '丙', branches: ['辰', '午', '申', '戌', '子', '寅'] },
  Dui: { innerStem: '丁', outerStem: '丁', branches: ['巳', '卯', '丑', '亥', '酉', '未'] },
};

/** 八宫所属五行，六亲以本宫五行为「我」。 */
export const PALACE_ELEMENTS = {
  Qian: 'Metal',
  Dui: 'Metal',
  Li: 'Fire',
  Zhen: 'Wood',
  Xun: 'Wood',
  Kan: 'Water',
  Gen: 'Earth',
  Kun: 'Earth',
};

/** 八宫排列顺序，本宫卦即八纯卦。 */
export const PALACE_ORDER = ['Qian', 'Kan', 'Gen', 'Zhen', 'Xun', 'Li', 'Kun', 'Dui'];

/**
 * 世卦推衍规则，自本宫卦起依次施加。
 * 每一步给出要变的爻位（1 = 初爻）与该卦的世爻所在。
 */
export const PALACE_DERIVATION = [
  { key: 'benGong', cn: '本宫卦', flip: [], shiYao: 6 },
  { key: 'yiShi', cn: '一世卦', flip: [1], shiYao: 1 },
  { key: 'erShi', cn: '二世卦', flip: [2], shiYao: 2 },
  { key: 'sanShi', cn: '三世卦', flip: [3], shiYao: 3 },
  { key: 'siShi', cn: '四世卦', flip: [4], shiYao: 4 },
  { key: 'wuShi', cn: '五世卦', flip: [5], shiYao: 5 },
  // 游魂：自五世卦再变第四爻（变回原样）
  { key: 'youHun', cn: '游魂卦', flip: [4], shiYao: 4 },
  // 归魂：自游魂卦内卦三爻尽变
  { key: 'guiHun', cn: '归魂卦', flip: [1, 2, 3], shiYao: 3 },
];

export const SIX_RELATIVES = {
  fumu: { key: 'fumu', cn: '父母', name: 'Parent' },
  xiongdi: { key: 'xiongdi', cn: '兄弟', name: 'Sibling' },
  zisun: { key: 'zisun', cn: '子孙', name: 'Offspring' },
  qicai: { key: 'qicai', cn: '妻财', name: 'Wealth' },
  guangui: { key: 'guangui', cn: '官鬼', name: 'Officer' },
};

export const SIX_GODS = [
  { key: 'qinglong', cn: '青龙', name: 'Azure Dragon' },
  { key: 'zhuque', cn: '朱雀', name: 'Vermilion Bird' },
  { key: 'gouchen', cn: '勾陈', name: 'Hook Snake' },
  { key: 'tengshe', cn: '螣蛇', name: 'Serpent' },
  { key: 'baihu', cn: '白虎', name: 'White Tiger' },
  { key: 'xuanwu', cn: '玄武', name: 'Dark Warrior' },
];

/**
 * 六神起爻：按日干定初爻所安之神，其余顺序而上。
 * 甲乙起青龙、丙丁起朱雀、戊起勾陈、己起螣蛇、庚辛起白虎、壬癸起玄武。
 */
export const SIX_GOD_START_BY_DAY_STEM = {
  甲: 0,
  乙: 0,
  丙: 1,
  丁: 1,
  戊: 2,
  己: 3,
  庚: 4,
  辛: 4,
  壬: 5,
  癸: 5,
};
