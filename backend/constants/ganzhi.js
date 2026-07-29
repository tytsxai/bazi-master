/**
 * 干支基础数据层。
 *
 * 这里只放「术数界公认、无流派分歧」的静态表：六十甲子纳音、地支藏干、十二长生、
 * 干支之间的合冲刑害破会。八字旺衰、紫微五行局、六爻纳甲、奇门排局全部建在这一层之上，
 * 所以任何一个表错了都会向上污染多个能力模块 —— 改动前先看表末的出处注释。
 *
 * 有流派分歧的地方（藏干权重、刑的成立条件）已就地标注选定口径，不要在调用方各自再定一套。
 */

export const STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];

export const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

/**
 * 六十甲子纳音。
 *
 * 键是干支组合，值是纳音名与其五行。纳音以两个干支为一组（甲子乙丑同为海中金），
 * 因此下表按 30 组展开成 60 条。紫微斗数的五行局直接取命宫干支的纳音五行，
 * 八字里则用于论纳音生克与神煞。
 */
const NAYIN_GROUPS = [
  [['甲子', '乙丑'], '海中金', 'Metal'],
  [['丙寅', '丁卯'], '炉中火', 'Fire'],
  [['戊辰', '己巳'], '大林木', 'Wood'],
  [['庚午', '辛未'], '路旁土', 'Earth'],
  [['壬申', '癸酉'], '剑锋金', 'Metal'],
  [['甲戌', '乙亥'], '山头火', 'Fire'],
  [['丙子', '丁丑'], '涧下水', 'Water'],
  [['戊寅', '己卯'], '城头土', 'Earth'],
  [['庚辰', '辛巳'], '白蜡金', 'Metal'],
  [['壬午', '癸未'], '杨柳木', 'Wood'],
  [['甲申', '乙酉'], '泉中水', 'Water'],
  [['丙戌', '丁亥'], '屋上土', 'Earth'],
  [['戊子', '己丑'], '霹雳火', 'Fire'],
  [['庚寅', '辛卯'], '松柏木', 'Wood'],
  [['壬辰', '癸巳'], '长流水', 'Water'],
  [['甲午', '乙未'], '沙中金', 'Metal'],
  [['丙申', '丁酉'], '山下火', 'Fire'],
  [['戊戌', '己亥'], '平地木', 'Wood'],
  [['庚子', '辛丑'], '壁上土', 'Earth'],
  [['壬寅', '癸卯'], '金箔金', 'Metal'],
  [['甲辰', '乙巳'], '覆灯火', 'Fire'],
  [['丙午', '丁未'], '天河水', 'Water'],
  [['戊申', '己酉'], '大驿土', 'Earth'],
  [['庚戌', '辛亥'], '钗钏金', 'Metal'],
  [['壬子', '癸丑'], '桑柘木', 'Wood'],
  [['甲寅', '乙卯'], '大溪水', 'Water'],
  [['丙辰', '丁巳'], '沙中土', 'Earth'],
  [['戊午', '己未'], '天上火', 'Fire'],
  [['庚申', '辛酉'], '石榴木', 'Wood'],
  [['壬戌', '癸亥'], '大海水', 'Water'],
];

export const NAYIN = NAYIN_GROUPS.reduce((acc, [pair, name, element]) => {
  pair.forEach((ganzhi) => {
    acc[ganzhi] = { name, element };
  });
  return acc;
}, {});

/**
 * 地支藏干。
 *
 * 顺序固定为 [本气, 中气, 余气]，缺位则数组更短。子午卯酉四正只有本气（午另含己土中气），
 * 辰戌丑未四墓库三者俱全，寅申巳亥四生地含本气+中气+余气。
 *
 * weight 是本模块选定的力量口径：本气 0.6 / 中气 0.3 / 余气 0.1。
 * 另有 100:70:30 归一化等流派，若要切换只改这里，不要在调用方另算。
 */
export const HIDDEN_STEMS = {
  子: [{ stem: '癸', role: 'primary', weight: 1.0 }],
  丑: [
    { stem: '己', role: 'primary', weight: 0.6 },
    { stem: '癸', role: 'middle', weight: 0.3 },
    { stem: '辛', role: 'residual', weight: 0.1 },
  ],
  寅: [
    { stem: '甲', role: 'primary', weight: 0.6 },
    { stem: '丙', role: 'middle', weight: 0.3 },
    { stem: '戊', role: 'residual', weight: 0.1 },
  ],
  卯: [{ stem: '乙', role: 'primary', weight: 1.0 }],
  辰: [
    { stem: '戊', role: 'primary', weight: 0.6 },
    { stem: '乙', role: 'middle', weight: 0.3 },
    { stem: '癸', role: 'residual', weight: 0.1 },
  ],
  巳: [
    { stem: '丙', role: 'primary', weight: 0.6 },
    { stem: '庚', role: 'middle', weight: 0.3 },
    { stem: '戊', role: 'residual', weight: 0.1 },
  ],
  午: [
    { stem: '丁', role: 'primary', weight: 0.7 },
    { stem: '己', role: 'middle', weight: 0.3 },
  ],
  未: [
    { stem: '己', role: 'primary', weight: 0.6 },
    { stem: '丁', role: 'middle', weight: 0.3 },
    { stem: '乙', role: 'residual', weight: 0.1 },
  ],
  申: [
    { stem: '庚', role: 'primary', weight: 0.6 },
    { stem: '壬', role: 'middle', weight: 0.3 },
    { stem: '戊', role: 'residual', weight: 0.1 },
  ],
  酉: [{ stem: '辛', role: 'primary', weight: 1.0 }],
  戌: [
    { stem: '戊', role: 'primary', weight: 0.6 },
    { stem: '辛', role: 'middle', weight: 0.3 },
    { stem: '丁', role: 'residual', weight: 0.1 },
  ],
  亥: [
    { stem: '壬', role: 'primary', weight: 0.7 },
    { stem: '甲', role: 'middle', weight: 0.3 },
  ],
};

export const TWELVE_STAGE_NAMES = [
  { key: 'changsheng', cn: '长生', name: 'Growth' },
  { key: 'muyu', cn: '沐浴', name: 'Bath' },
  { key: 'guandai', cn: '冠带', name: 'Cap' },
  { key: 'linguan', cn: '临官', name: 'Office' },
  { key: 'diwang', cn: '帝旺', name: 'Peak' },
  { key: 'shuai', cn: '衰', name: 'Decline' },
  { key: 'bing', cn: '病', name: 'Illness' },
  { key: 'si', cn: '死', name: 'Death' },
  { key: 'mu', cn: '墓', name: 'Tomb' },
  { key: 'jue', cn: '绝', name: 'Void' },
  { key: 'tai', cn: '胎', name: 'Conception' },
  { key: 'yang', cn: '养', name: 'Nurture' },
];

/**
 * 十二长生的起点与行度。
 *
 * 阳干顺行、阴干逆行（阴阳同生同死的流派不在此实现）。
 * 戊土寄丙、己土寄丁，是子平法通行口径。
 */
export const TWELVE_STAGE_START = {
  甲: { branch: '亥', forward: true },
  乙: { branch: '午', forward: false },
  丙: { branch: '寅', forward: true },
  丁: { branch: '酉', forward: false },
  戊: { branch: '寅', forward: true },
  己: { branch: '酉', forward: false },
  庚: { branch: '巳', forward: true },
  辛: { branch: '子', forward: false },
  壬: { branch: '申', forward: true },
  癸: { branch: '卯', forward: false },
};

/** 天干五合：合化五行需得月令与化神透干才真化，此表只记合的对象与化神。 */
export const STEM_COMBINATIONS = [
  { pair: ['甲', '己'], transform: 'Earth', cn: '甲己合土' },
  { pair: ['乙', '庚'], transform: 'Metal', cn: '乙庚合金' },
  { pair: ['丙', '辛'], transform: 'Water', cn: '丙辛合水' },
  { pair: ['丁', '壬'], transform: 'Wood', cn: '丁壬合木' },
  { pair: ['戊', '癸'], transform: 'Fire', cn: '戊癸合火' },
];

/** 天干相冲：甲庚、乙辛、丙壬、丁癸（戊己土居中不冲）。 */
export const STEM_CLASHES = [
  ['甲', '庚'],
  ['乙', '辛'],
  ['丙', '壬'],
  ['丁', '癸'],
];

/** 地支六合。午未一组的化神流派分歧较大，此处取通行的「午未合土」。 */
export const BRANCH_SIX_COMBINATIONS = [
  { pair: ['子', '丑'], transform: 'Earth', cn: '子丑合土' },
  { pair: ['寅', '亥'], transform: 'Wood', cn: '寅亥合木' },
  { pair: ['卯', '戌'], transform: 'Fire', cn: '卯戌合火' },
  { pair: ['辰', '酉'], transform: 'Metal', cn: '辰酉合金' },
  { pair: ['巳', '申'], transform: 'Water', cn: '巳申合水' },
  { pair: ['午', '未'], transform: 'Earth', cn: '午未合土' },
];

/** 地支三合局。中神（子午卯酉）为局之主，缺中神只作半合。 */
export const BRANCH_TRIPLE_COMBINATIONS = [
  { branches: ['申', '子', '辰'], center: '子', transform: 'Water', cn: '申子辰合水局' },
  { branches: ['亥', '卯', '未'], center: '卯', transform: 'Wood', cn: '亥卯未合木局' },
  { branches: ['寅', '午', '戌'], center: '午', transform: 'Fire', cn: '寅午戌合火局' },
  { branches: ['巳', '酉', '丑'], center: '酉', transform: 'Metal', cn: '巳酉丑合金局' },
];

/** 地支三会方局，力量强于三合。 */
export const BRANCH_DIRECTIONAL_COMBINATIONS = [
  { branches: ['寅', '卯', '辰'], transform: 'Wood', cn: '寅卯辰会东方木' },
  { branches: ['巳', '午', '未'], transform: 'Fire', cn: '巳午未会南方火' },
  { branches: ['申', '酉', '戌'], transform: 'Metal', cn: '申酉戌会西方金' },
  { branches: ['亥', '子', '丑'], transform: 'Water', cn: '亥子丑会北方水' },
];

/** 地支六冲。 */
export const BRANCH_CLASHES = [
  ['子', '午'],
  ['丑', '未'],
  ['寅', '申'],
  ['卯', '酉'],
  ['辰', '戌'],
  ['巳', '亥'],
];

/**
 * 地支相刑，分四类：
 * - 三刑：寅巳申（无恩之刑）、丑戌未（恃势之刑），三支全见方为三刑，两支见为半刑
 * - 互刑：子卯（无礼之刑）
 * - 自刑：辰辰、午午、酉酉、亥亥，同支重见方成立
 */
export const BRANCH_PUNISHMENTS = {
  triple: [
    { branches: ['寅', '巳', '申'], cn: '寅巳申三刑（无恩之刑）' },
    { branches: ['丑', '戌', '未'], cn: '丑戌未三刑（恃势之刑）' },
  ],
  mutual: [{ pair: ['子', '卯'], cn: '子卯相刑（无礼之刑）' }],
  self: ['辰', '午', '酉', '亥'],
};

/**
 * 有向的刑：键刑值。六壬伏吟课的中末传要「取初传之刑」，需要方向，
 * 上面 BRANCH_PUNISHMENTS 的分组形式判定得了成立与否，取不出被刑之支。
 * 辰午酉亥为自刑，刑其自身。
 */
export const BRANCH_PUNISH_TARGET = {
  子: '卯',
  卯: '子',
  寅: '巳',
  巳: '申',
  申: '寅',
  丑: '戌',
  戌: '未',
  未: '丑',
  辰: '辰',
  午: '午',
  酉: '酉',
  亥: '亥',
};

/** 自刑之支。 */
export const SELF_PUNISH_BRANCHES = ['辰', '午', '酉', '亥'];

/** 四孟（四生）、四仲（四正）、四季（四墓）。六壬涉害法取舍时按孟仲季分先后。 */
export const MENG_BRANCHES = ['寅', '申', '巳', '亥'];
export const ZHONG_BRANCHES = ['子', '午', '卯', '酉'];
export const JI_BRANCHES = ['辰', '戌', '丑', '未'];

/** 驿马：按三合局取，恒落四孟。 */
export const YIMA_BY_GROUP = [
  { branches: ['申', '子', '辰'], yima: '寅' },
  { branches: ['寅', '午', '戌'], yima: '申' },
  { branches: ['巳', '酉', '丑'], yima: '亥' },
  { branches: ['亥', '卯', '未'], yima: '巳' },
];

/** 地支六害（相穿）。 */
export const BRANCH_HARMS = [
  ['子', '未'],
  ['丑', '午'],
  ['寅', '巳'],
  ['卯', '辰'],
  ['申', '亥'],
  ['酉', '戌'],
];

/** 地支相破。 */
export const BRANCH_DESTRUCTIONS = [
  ['子', '酉'],
  ['午', '卯'],
  ['辰', '丑'],
  ['戌', '未'],
  ['寅', '亥'],
  ['申', '巳'],
];

/**
 * 五行局：紫微斗数由命宫干支的纳音五行取局，局数决定紫微星落宫与大限步长。
 */
export const FIVE_ELEMENT_BUREAU = {
  Water: { value: 2, cn: '水二局', key: 'water2' },
  Wood: { value: 3, cn: '木三局', key: 'wood3' },
  Metal: { value: 4, cn: '金四局', key: 'metal4' },
  Earth: { value: 5, cn: '土五局', key: 'earth5' },
  Fire: { value: 6, cn: '火六局', key: 'fire6' },
};

/** 六十甲子顺序表，索引即甲子数（甲子为 0）。 */
export const SEXAGENARY_CYCLE = Array.from({ length: 60 }, (_, index) => {
  return `${STEMS[index % 10]}${BRANCHES[index % 12]}`;
});

/** 旬空（空亡）：按甲子旬分十旬，每旬两个空亡地支。 */
export const XUNKONG_BY_DECADE = {
  甲子: ['戌', '亥'],
  甲戌: ['申', '酉'],
  甲申: ['午', '未'],
  甲午: ['辰', '巳'],
  甲辰: ['寅', '卯'],
  甲寅: ['子', '丑'],
};
