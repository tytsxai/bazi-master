export const STEMS_MAP = {
  '甲': { name: 'Jia', element: 'Wood', polarity: '+' },
  '乙': { name: 'Yi', element: 'Wood', polarity: '-' },
  '丙': { name: 'Bing', element: 'Fire', polarity: '+' },
  '丁': { name: 'Ding', element: 'Fire', polarity: '-' },
  '戊': { name: 'Wu', element: 'Earth', polarity: '+' },
  '己': { name: 'Ji', element: 'Earth', polarity: '-' },
  '庚': { name: 'Geng', element: 'Metal', polarity: '+' },
  '辛': { name: 'Xin', element: 'Metal', polarity: '-' },
  '壬': { name: 'Ren', element: 'Water', polarity: '+' },
  '癸': { name: 'Gui', element: 'Water', polarity: '-' },
};

export const BRANCHES_MAP = {
  '子': { name: 'Zi', element: 'Water', polarity: '+' },
  '丑': { name: 'Chou', element: 'Earth', polarity: '-' },
  '寅': { name: 'Yin', element: 'Wood', polarity: '+' },
  '卯': { name: 'Mao', element: 'Wood', polarity: '-' },
  '辰': { name: 'Chen', element: 'Earth', polarity: '+' },
  '巳': { name: 'Si', element: 'Fire', polarity: '-' },
  '午': { name: 'Wu', element: 'Fire', polarity: '+' },
  '未': { name: 'Wei', element: 'Earth', polarity: '-' },
  '申': { name: 'Shen', element: 'Metal', polarity: '+' },
  '酉': { name: 'You', element: 'Metal', polarity: '-' },
  '戌': { name: 'Xu', element: 'Earth', polarity: '+' },
  '亥': { name: 'Hai', element: 'Water', polarity: '-' },
};

export const ELEMENTS = ['Wood', 'Fire', 'Earth', 'Metal', 'Water'];

export const STEM_ELEMENTS = Object.fromEntries(
  Object.entries(STEMS_MAP).map(([stem, meta]) => [stem, meta.element]),
);

export const BRANCH_ELEMENTS = Object.fromEntries(
  Object.entries(BRANCHES_MAP).map(([branch, meta]) => [branch, meta.element]),
);

export const STEM_POLARITY = Object.fromEntries(
  Object.entries(STEMS_MAP).map(([stem, meta]) => [stem, meta.polarity]),
);

export const BRANCH_POLARITY = Object.fromEntries(
  Object.entries(BRANCHES_MAP).map(([branch, meta]) => [branch, meta.polarity]),
);
