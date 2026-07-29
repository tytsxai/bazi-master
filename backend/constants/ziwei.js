/**
 * 紫微斗数星曜与安星规则。
 *
 * 这里的每一条偏移量都是安星口诀的直接编码，不是拟合出来的近似。安星链条是：
 *   命宫 → 命宫干支 → 纳音 → 五行局 → 紫微 → 天府 → 十四主星 → 六吉六煞
 * 五行局是整条链的根，它错则整盘皆错，所以 getFiveElementBureau 走的是
 * ganzhi.service 里那份与 lunar-javascript 逐条对过的纳音表。
 */

export const ZIWEI_BRANCH_ORDER = [
  '子',
  '丑',
  '寅',
  '卯',
  '辰',
  '巳',
  '午',
  '未',
  '申',
  '酉',
  '戌',
  '亥',
];

/** 正月建寅：农历月份序号（正月为 1）到月支的映射。 */
export const ZIWEI_MONTH_BRANCH_ORDER = [
  '寅',
  '卯',
  '辰',
  '巳',
  '午',
  '未',
  '申',
  '酉',
  '戌',
  '亥',
  '子',
  '丑',
];

/** 十二宫，自命宫起逆时针（在地支盘上为顺行下标）排布。 */
export const ZIWEI_PALACES = [
  { key: 'ming', name: 'Ming', cn: '命宫' },
  { key: 'brothers', name: 'Brothers', cn: '兄弟' },
  { key: 'spouse', name: 'Spouse', cn: '夫妻' },
  { key: 'children', name: 'Children', cn: '子女' },
  { key: 'wealth', name: 'Wealth', cn: '财帛' },
  { key: 'health', name: 'Health', cn: '疾厄' },
  { key: 'travel', name: 'Travel', cn: '迁移' },
  { key: 'friends', name: 'Friends', cn: '仆役' },
  { key: 'career', name: 'Career', cn: '官禄' },
  { key: 'property', name: 'Property', cn: '田宅' },
  { key: 'mental', name: 'Mental', cn: '福德' },
  { key: 'parents', name: 'Parents', cn: '父母' },
];

export const ZIWEI_MAJOR_STARS = {
  ziwei: { key: 'ziwei', name: 'Zi Wei', cn: '紫微' },
  tianji: { key: 'tianji', name: 'Tian Ji', cn: '天机' },
  taiyang: { key: 'taiyang', name: 'Tai Yang', cn: '太阳' },
  wuqu: { key: 'wuqu', name: 'Wu Qu', cn: '武曲' },
  tiantong: { key: 'tiantong', name: 'Tian Tong', cn: '天同' },
  lianzhen: { key: 'lianzhen', name: 'Lian Zhen', cn: '廉贞' },
  tianfu: { key: 'tianfu', name: 'Tian Fu', cn: '天府' },
  taiyin: { key: 'taiyin', name: 'Tai Yin', cn: '太阴' },
  tanlang: { key: 'tanlang', name: 'Tan Lang', cn: '贪狼' },
  jumen: { key: 'jumen', name: 'Ju Men', cn: '巨门' },
  tianxiang: { key: 'tianxiang', name: 'Tian Xiang', cn: '天相' },
  tianliang: { key: 'tianliang', name: 'Tian Liang', cn: '天梁' },
  qisha: { key: 'qisha', name: 'Qi Sha', cn: '七杀' },
  pojun: { key: 'pojun', name: 'Po Jun', cn: '破军' },
};

export const ZIWEI_MINOR_STARS = {
  wenchang: { key: 'wenchang', name: 'Wen Chang', cn: '文昌' },
  wenqu: { key: 'wenqu', name: 'Wen Qu', cn: '文曲' },
  zuofu: { key: 'zuofu', name: 'Zuo Fu', cn: '左辅' },
  youbi: { key: 'youbi', name: 'You Bi', cn: '右弼' },
  tiankui: { key: 'tiankui', name: 'Tian Kui', cn: '天魁' },
  tianyue: { key: 'tianyue', name: 'Tian Yue', cn: '天钺' },
  lucun: { key: 'lucun', name: 'Lu Cun', cn: '禄存' },
  tianma: { key: 'tianma', name: 'Tian Ma', cn: '天马' },
};

export const ZIWEI_MALEFIC_STARS = {
  qingyang: { key: 'qingyang', name: 'Qing Yang', cn: '擎羊' },
  tuoluo: { key: 'tuoluo', name: 'Tuo Luo', cn: '陀罗' },
  huoxing: { key: 'huoxing', name: 'Huo Xing', cn: '火星' },
  lingxing: { key: 'lingxing', name: 'Ling Xing', cn: '铃星' },
  dikong: { key: 'dikong', name: 'Di Kong', cn: '地空' },
  dijie: { key: 'dijie', name: 'Di Jie', cn: '地劫' },
};

/**
 * 紫微系六星，自紫微所在宫**逆行**安放。
 * 口诀：紫微天机逆行旁，隔一阳武天同当，又隔二位廉贞地。
 */
export const ZIWEI_GROUP_OFFSETS = [
  { key: 'ziwei', offset: 0 },
  { key: 'tianji', offset: -1 },
  { key: 'taiyang', offset: -3 },
  { key: 'wuqu', offset: -4 },
  { key: 'tiantong', offset: -5 },
  { key: 'lianzhen', offset: -8 },
];

/**
 * 天府系八星，自天府所在宫**顺行**安放。
 * 破军独隔三位（+10），不是紧接七杀的 +7。
 */
export const TIANFU_GROUP_OFFSETS = [
  { key: 'tianfu', offset: 0 },
  { key: 'taiyin', offset: 1 },
  { key: 'tanlang', offset: 2 },
  { key: 'jumen', offset: 3 },
  { key: 'tianxiang', offset: 4 },
  { key: 'tianliang', offset: 5 },
  { key: 'qisha', offset: 6 },
  { key: 'pojun', offset: 10 },
];

/**
 * 五虎遁：由年干定寅宫天干，其余各宫顺排。命宫天干靠它推出，进而取纳音定五行局。
 */
export const YEAR_STEM_TO_YIN_PALACE_STEM = {
  甲: '丙',
  己: '丙',
  乙: '戊',
  庚: '戊',
  丙: '庚',
  辛: '庚',
  丁: '壬',
  壬: '壬',
  戊: '甲',
  癸: '甲',
};

/**
 * 天魁天钺，由年干定。
 * 口诀：甲戊庚牛羊，乙己鼠猴乡，丙丁猪鸡位，壬癸兔蛇藏，庚辛逢马虎。
 * 「庚」在首句与末句都出现，此处从通行取法归入甲戊庚一组，辛独取午寅。
 */
export const KUIYUE_BY_YEAR_STEM = {
  甲: { kui: '丑', yue: '未' },
  戊: { kui: '丑', yue: '未' },
  庚: { kui: '丑', yue: '未' },
  乙: { kui: '子', yue: '申' },
  己: { kui: '子', yue: '申' },
  丙: { kui: '亥', yue: '酉' },
  丁: { kui: '亥', yue: '酉' },
  辛: { kui: '午', yue: '寅' },
  壬: { kui: '卯', yue: '巳' },
  癸: { kui: '卯', yue: '巳' },
};

/** 禄存由年干定；擎羊在禄存前一位、陀罗在后一位。 */
export const LUCUN_BY_YEAR_STEM = {
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
 * 火星铃星起点，由年支三合组决定，再自起点顺行数至生时。
 * 口诀：寅午戌人丑卯方，申子辰人寅戌扬，巳酉丑人卯戌位，亥卯未人酉戌房。
 */
export const HUOLING_START_BY_YEAR_GROUP = [
  { branches: ['寅', '午', '戌'], huo: '丑', ling: '卯' },
  { branches: ['申', '子', '辰'], huo: '寅', ling: '戌' },
  { branches: ['巳', '酉', '丑'], huo: '卯', ling: '戌' },
  { branches: ['亥', '卯', '未'], huo: '酉', ling: '戌' },
];

/** 天马（驿马）由年支三合组定，恒落四生地寅申巳亥。 */
export const TIANMA_BY_YEAR_GROUP = [
  { branches: ['申', '子', '辰'], branch: '寅' },
  { branches: ['寅', '午', '戌'], branch: '申' },
  { branches: ['巳', '酉', '丑'], branch: '亥' },
  { branches: ['亥', '卯', '未'], branch: '巳' },
];

/**
 * 小限起宫，由年支三合组定，男顺女逆，一岁一宫。
 * 口诀：寅午戌人辰上起，申子辰人自戌出，巳酉丑人未宫始，亥卯未人丑上行。
 */
export const XIAOXIAN_START_BY_YEAR_GROUP = [
  { branches: ['寅', '午', '戌'], branch: '辰' },
  { branches: ['申', '子', '辰'], branch: '戌' },
  { branches: ['巳', '酉', '丑'], branch: '未' },
  { branches: ['亥', '卯', '未'], branch: '丑' },
];

/** 阳干，用于定大限顺逆（阳男阴女顺行，阴男阳女逆行）。 */
export const YANG_STEMS = ['甲', '丙', '戊', '庚', '壬'];

export const ZIWEI_SIHUA_BY_STEM = {
  甲: { lu: 'lianzhen', quan: 'pojun', ke: 'wuqu', ji: 'taiyang' },
  乙: { lu: 'tianji', quan: 'tianliang', ke: 'ziwei', ji: 'taiyin' },
  丙: { lu: 'tiantong', quan: 'tianji', ke: 'wenchang', ji: 'lianzhen' },
  丁: { lu: 'taiyin', quan: 'tiantong', ke: 'tianji', ji: 'jumen' },
  戊: { lu: 'tanlang', quan: 'taiyin', ke: 'youbi', ji: 'tianji' },
  己: { lu: 'wuqu', quan: 'tanlang', ke: 'tianliang', ji: 'wenqu' },
  庚: { lu: 'taiyang', quan: 'wuqu', ke: 'taiyin', ji: 'tiantong' },
  辛: { lu: 'jumen', quan: 'taiyang', ke: 'wenqu', ji: 'wenchang' },
  壬: { lu: 'tianliang', quan: 'ziwei', ke: 'tianji', ji: 'pojun' },
  癸: { lu: 'pojun', quan: 'jumen', ke: 'taiyin', ji: 'tanlang' },
};

export const ZIWEI_SIHUA_TYPES = {
  lu: { key: 'lu', cn: '化禄', name: 'Wealth' },
  quan: { key: 'quan', cn: '化权', name: 'Power' },
  ke: { key: 'ke', cn: '化科', name: 'Fame' },
  ji: { key: 'ji', cn: '化忌', name: 'Adversity' },
};
