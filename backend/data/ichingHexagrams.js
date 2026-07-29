/**
 * 六十四卦的中文卦名与《周易》序号，键为 `上卦-下卦`。
 *
 * 这是本仓库唯一的一份卦名数据：易经端点与六爻装卦都读它。
 * 早先这里只有程序拼出来的 `Heaven over Fire` 这类描述，不是卦名，断卦无从谈起。
 */
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

const TRIGRAMS = [
  { id: 1, name: 'Qian', element: 'Heaven', lines: [1, 1, 1] },
  { id: 2, name: 'Dui', element: 'Lake', lines: [1, 1, 0] },
  { id: 3, name: 'Li', element: 'Fire', lines: [1, 0, 1] },
  { id: 4, name: 'Zhen', element: 'Thunder', lines: [1, 0, 0] },
  { id: 5, name: 'Xun', element: 'Wind', lines: [0, 1, 1] },
  { id: 6, name: 'Kan', element: 'Water', lines: [0, 1, 0] },
  { id: 7, name: 'Gen', element: 'Mountain', lines: [0, 0, 1] },
  { id: 8, name: 'Kun', element: 'Earth', lines: [0, 0, 0] },
];

const hexagrams = [];
const hexagramByTrigrams = new Map();
const hexagramByLines = new Map();

TRIGRAMS.forEach((upper) => {
  TRIGRAMS.forEach((lower) => {
    const lines = [...lower.lines, ...upper.lines];
    const id = hexagrams.length + 1;
    const named = HEXAGRAM_NAMES[`${upper.name}-${lower.name}`] || {};
    // name 现在是真卦名；旧的方位描述保留在 nameEn，调用方要对照时还能拿到
    const name = named.cn || `${upper.element} over ${lower.element}`;
    const nameEn = `${upper.element} over ${lower.element}`;
    const title = `${upper.name} / ${lower.name}`;
    const summary = `${named.cn || nameEn}：上${upper.element}下${lower.element}。`;
    const hexagram = {
      id,
      sequence: named.sequence ?? null,
      name,
      nameEn,
      title,
      summary,
      upperTrigram: upper,
      lowerTrigram: lower,
      lines,
    };
    hexagrams.push(hexagram);
    hexagramByTrigrams.set(`${upper.id}-${lower.id}`, hexagram);
    hexagramByLines.set(lines.join(''), hexagram);
  });
});

export { TRIGRAMS, hexagrams, hexagramByTrigrams, hexagramByLines };
export default hexagrams;
