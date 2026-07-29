/**
 * 神煞查法表。
 *
 * 只收录查法明确、各家一致的常用神煞。查法分三类：
 * - 按日干（或年干）查地支：天乙贵人、文昌、禄神、羊刃
 * - 按年支（或日支）三合组查：驿马、桃花、华盖、将星
 * - 按柱查：魁罡、孤辰寡宿
 *
 * 刻意不收阴干羊刃（乙刃在寅还是在辰，各家不一）与十恶大败之类分歧大的条目 ——
 * 宁可少列，也不要给出一个说不清出处的判语。
 */

/** 天乙贵人：日干或年干查，两支皆是。口诀同紫微魁钺。 */
export const TIANYI_NOBLE = {
  甲: ['丑', '未'],
  戊: ['丑', '未'],
  庚: ['丑', '未'],
  乙: ['子', '申'],
  己: ['子', '申'],
  丙: ['亥', '酉'],
  丁: ['亥', '酉'],
  辛: ['午', '寅'],
  壬: ['卯', '巳'],
  癸: ['卯', '巳'],
};

/** 文昌贵人：日干查。 */
export const WENCHANG_NOBLE = {
  甲: '巳',
  乙: '午',
  丙: '申',
  戊: '申',
  丁: '酉',
  己: '酉',
  庚: '亥',
  辛: '子',
  壬: '寅',
  癸: '卯',
};

/** 禄神（建禄）：日干查，即日干的临官之位。 */
export const LUSHEN = {
  甲: '寅',
  乙: '卯',
  丙: '巳',
  戊: '巳',
  丁: '午',
  己: '午',
  庚: '申',
  辛: '酉',
  壬: '亥',
  癸: '子',
};

/**
 * 羊刃：只列阳干（帝旺之位）。阴干羊刃各家取法不一，此处不列，
 * 需要时由调用方自行按所宗流派补，不要在这里塞一份没出处的。
 */
export const YANGREN = {
  甲: '卯',
  丙: '午',
  戊: '午',
  庚: '酉',
  壬: '子',
};

/**
 * 按年支/日支三合组查的四组神煞。
 * 驿马取三合局的绝地，桃花取沐浴之位，华盖取墓库，将星取三合局中神。
 */
export const BRANCH_GROUP_SHENSHA = [
  { branches: ['申', '子', '辰'], yima: '寅', taohua: '酉', huagai: '辰', jiangxing: '子' },
  { branches: ['寅', '午', '戌'], yima: '申', taohua: '卯', huagai: '戌', jiangxing: '午' },
  { branches: ['巳', '酉', '丑'], yima: '亥', taohua: '午', huagai: '丑', jiangxing: '酉' },
  { branches: ['亥', '卯', '未'], yima: '巳', taohua: '子', huagai: '未', jiangxing: '卯' },
];

/** 孤辰寡宿：按年支所属方位查。 */
export const GUCHEN_GUASU = [
  { branches: ['亥', '子', '丑'], guchen: '寅', guasu: '戌' },
  { branches: ['寅', '卯', '辰'], guchen: '巳', guasu: '丑' },
  { branches: ['巳', '午', '未'], guchen: '申', guasu: '辰' },
  { branches: ['申', '酉', '戌'], guchen: '亥', guasu: '未' },
];

/** 魁罡：日柱见者为是。壬戌一柱各家有出入，此处从四柱说不收。 */
export const KUIGANG = ['庚辰', '庚戌', '壬辰', '戊戌'];

export const SHENSHA_META = {
  tianyi: { key: 'tianyi', cn: '天乙贵人', name: 'Noble', auspicious: true },
  wenchang: { key: 'wenchang', cn: '文昌贵人', name: 'Academic', auspicious: true },
  lushen: { key: 'lushen', cn: '禄神', name: 'Prosperity', auspicious: true },
  yangren: { key: 'yangren', cn: '羊刃', name: 'Blade', auspicious: false },
  yima: { key: 'yima', cn: '驿马', name: 'Travel', auspicious: null },
  taohua: { key: 'taohua', cn: '桃花', name: 'Romance', auspicious: null },
  huagai: { key: 'huagai', cn: '华盖', name: 'Canopy', auspicious: null },
  jiangxing: { key: 'jiangxing', cn: '将星', name: 'General', auspicious: true },
  guchen: { key: 'guchen', cn: '孤辰', name: 'Solitary', auspicious: false },
  guasu: { key: 'guasu', cn: '寡宿', name: 'Widow', auspicious: false },
  kuigang: { key: 'kuigang', cn: '魁罡', name: 'Kuigang', auspicious: null },
};
