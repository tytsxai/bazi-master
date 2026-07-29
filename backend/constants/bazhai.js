/**
 * 八宅风水静态数据。
 *
 * 游年九星**不硬编 8×8 的六十四格表**，而是由变爻法算出：
 * 自本命卦起依次变「上、中、下、中、上、中、下、中」爻，顺次得
 * 生气、五鬼、延年、六煞、祸害、天医、绝命、伏位，八步归位。
 * 一条变爻序列比六十四格表可靠得多，且测试能验证八步必回本卦。
 */

/** 八卦三爻，自下而上，1 为阳。与 data/ichingHexagrams.js 的约定一致。 */
export const TRIGRAM_LINES = {
  坎: [0, 1, 0],
  坤: [0, 0, 0],
  震: [1, 0, 0],
  巽: [0, 1, 1],
  乾: [1, 1, 1],
  兑: [1, 1, 0],
  艮: [0, 0, 1],
  离: [1, 0, 1],
};

/** 卦数（洛书）与方位。中五宫无卦，男寄坤、女寄艮。 */
export const TRIGRAM_BY_NUMBER = {
  1: { cn: '坎', direction: '北', element: 'Water', group: 'east' },
  2: { cn: '坤', direction: '西南', element: 'Earth', group: 'west' },
  3: { cn: '震', direction: '东', element: 'Wood', group: 'east' },
  4: { cn: '巽', direction: '东南', element: 'Wood', group: 'east' },
  6: { cn: '乾', direction: '西北', element: 'Metal', group: 'west' },
  7: { cn: '兑', direction: '西', element: 'Metal', group: 'west' },
  8: { cn: '艮', direction: '东北', element: 'Earth', group: 'west' },
  9: { cn: '离', direction: '南', element: 'Fire', group: 'east' },
};

/**
 * 游年变爻序列。position 为所变之爻（1 = 下爻，3 = 上爻）。
 * 八步之后必回本卦，故末位即伏位。
 */
export const YOUNIAN_SEQUENCE = [
  { flip: 3, star: { key: 'shengqi', cn: '生气', auspicious: true } },
  { flip: 2, star: { key: 'wugui', cn: '五鬼', auspicious: false } },
  { flip: 1, star: { key: 'yannian', cn: '延年', auspicious: true } },
  { flip: 2, star: { key: 'liusha', cn: '六煞', auspicious: false } },
  { flip: 3, star: { key: 'huohai', cn: '祸害', auspicious: false } },
  { flip: 2, star: { key: 'tianyi', cn: '天医', auspicious: true } },
  { flip: 1, star: { key: 'jueming', cn: '绝命', auspicious: false } },
  { flip: 2, star: { key: 'fuwei', cn: '伏位', auspicious: true } },
];

/** 东四命宜居东四宅，西四命宜居西四宅。 */
export const GROUP_NAMES = {
  east: { key: 'east', cn: '东四命', trigrams: ['坎', '离', '震', '巽'] },
  west: { key: 'west', cn: '西四命', trigrams: ['乾', '坤', '艮', '兑'] },
};

/** 姓名学五格中，数字个位对应的五行。 */
export const NUMBER_ELEMENTS = {
  1: 'Wood',
  2: 'Wood',
  3: 'Fire',
  4: 'Fire',
  5: 'Earth',
  6: 'Earth',
  7: 'Metal',
  8: 'Metal',
  9: 'Water',
  0: 'Water',
};
