/**
 * 六爻纳甲（京房筮法）静态数据。
 *
 * 三块内容：
 * 1. 六十四卦的真卦名 —— data/ichingHexagrams.js 里的 name 是 "Heaven over Fire" 这类
 *    程序拼出来的描述，不是卦名，六爻断卦没法用。这里补上中文卦名与《周易》序号。
 * 2. 京房纳甲：八卦配干支。装卦时内卦（初二三）取下卦前三支，外卦（四五六）取上卦后三支。
 * 3. 八宫与六神的起法。
 *
 * 八宫六十四卦的归属**不在这里硬编**，而是由 liuyao.service.js 按世卦推衍规则
 * （本宫→一世→…→五世→游魂→归魂）算出来 —— 六十四条手抄表比七条规则更容易抄错。
 */

/** 卦名键为 `上卦-下卦`，与 data/ichingHexagrams.js 的 TRIGRAMS.name 对齐。 */
export const HEXAGRAM_NAMES = {
  'Qian-Qian': { cn: '乾为天', sequence: 1 },
  'Qian-Dui': { cn: '天泽履', sequence: 10 },
  'Qian-Li': { cn: '天火同人', sequence: 13 },
  'Qian-Zhen': { cn: '天雷无妄', sequence: 25 },
  'Qian-Xun': { cn: '天风姤', sequence: 44 },
  'Qian-Kan': { cn: '天水讼', sequence: 6 },
  'Qian-Gen': { cn: '天山遁', sequence: 33 },
  'Qian-Kun': { cn: '天地否', sequence: 12 },

  'Dui-Qian': { cn: '泽天夬', sequence: 43 },
  'Dui-Dui': { cn: '兑为泽', sequence: 58 },
  'Dui-Li': { cn: '泽火革', sequence: 49 },
  'Dui-Zhen': { cn: '泽雷随', sequence: 17 },
  'Dui-Xun': { cn: '泽风大过', sequence: 28 },
  'Dui-Kan': { cn: '泽水困', sequence: 47 },
  'Dui-Gen': { cn: '泽山咸', sequence: 31 },
  'Dui-Kun': { cn: '泽地萃', sequence: 45 },

  'Li-Qian': { cn: '火天大有', sequence: 14 },
  'Li-Dui': { cn: '火泽睽', sequence: 38 },
  'Li-Li': { cn: '离为火', sequence: 30 },
  'Li-Zhen': { cn: '火雷噬嗑', sequence: 21 },
  'Li-Xun': { cn: '火风鼎', sequence: 50 },
  'Li-Kan': { cn: '火水未济', sequence: 64 },
  'Li-Gen': { cn: '火山旅', sequence: 56 },
  'Li-Kun': { cn: '火地晋', sequence: 35 },

  'Zhen-Qian': { cn: '雷天大壮', sequence: 34 },
  'Zhen-Dui': { cn: '雷泽归妹', sequence: 54 },
  'Zhen-Li': { cn: '雷火丰', sequence: 55 },
  'Zhen-Zhen': { cn: '震为雷', sequence: 51 },
  'Zhen-Xun': { cn: '雷风恒', sequence: 32 },
  'Zhen-Kan': { cn: '雷水解', sequence: 40 },
  'Zhen-Gen': { cn: '雷山小过', sequence: 62 },
  'Zhen-Kun': { cn: '雷地豫', sequence: 16 },

  'Xun-Qian': { cn: '风天小畜', sequence: 9 },
  'Xun-Dui': { cn: '风泽中孚', sequence: 61 },
  'Xun-Li': { cn: '风火家人', sequence: 37 },
  'Xun-Zhen': { cn: '风雷益', sequence: 42 },
  'Xun-Xun': { cn: '巽为风', sequence: 57 },
  'Xun-Kan': { cn: '风水涣', sequence: 59 },
  'Xun-Gen': { cn: '风山渐', sequence: 53 },
  'Xun-Kun': { cn: '风地观', sequence: 20 },

  'Kan-Qian': { cn: '水天需', sequence: 5 },
  'Kan-Dui': { cn: '水泽节', sequence: 60 },
  'Kan-Li': { cn: '水火既济', sequence: 63 },
  'Kan-Zhen': { cn: '水雷屯', sequence: 3 },
  'Kan-Xun': { cn: '水风井', sequence: 48 },
  'Kan-Kan': { cn: '坎为水', sequence: 29 },
  'Kan-Gen': { cn: '水山蹇', sequence: 39 },
  'Kan-Kun': { cn: '水地比', sequence: 8 },

  'Gen-Qian': { cn: '山天大畜', sequence: 26 },
  'Gen-Dui': { cn: '山泽损', sequence: 41 },
  'Gen-Li': { cn: '山火贲', sequence: 22 },
  'Gen-Zhen': { cn: '山雷颐', sequence: 27 },
  'Gen-Xun': { cn: '山风蛊', sequence: 18 },
  'Gen-Kan': { cn: '山水蒙', sequence: 4 },
  'Gen-Gen': { cn: '艮为山', sequence: 52 },
  'Gen-Kun': { cn: '山地剥', sequence: 23 },

  'Kun-Qian': { cn: '地天泰', sequence: 11 },
  'Kun-Dui': { cn: '地泽临', sequence: 19 },
  'Kun-Li': { cn: '地火明夷', sequence: 36 },
  'Kun-Zhen': { cn: '地雷复', sequence: 24 },
  'Kun-Xun': { cn: '地风升', sequence: 46 },
  'Kun-Kan': { cn: '地水师', sequence: 7 },
  'Kun-Gen': { cn: '地山谦', sequence: 15 },
  'Kun-Kun': { cn: '坤为地', sequence: 2 },
};

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
