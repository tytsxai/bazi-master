/**
 * 奇门遁甲静态数据。
 *
 * 覆盖排盘所需的全部固定表：洛书九宫、三奇六仪、九星八门八神、旬首遁仪、
 * 二十四节气三元局数。
 *
 * 口径声明（奇门流派分歧最大，本模块选定如下）：
 * - 定局用**拆补法**（按符头定上中下元），非置闰法、非茅山法
 * - 天盘用**转盘法**（值符随时干转，九星整体随之），非飞盘法
 * - 格局判定（青龙返首、飞鸟跌穴之类）**不实现** —— 那属于断语层，
 *   各家取名与成立条件出入极大，由调用方按所宗流派叠加
 */

/** 洛书九宫。中五宫寄坤二，排盘时九星八门于中宫的处理见 service。 */
export const PALACES = [
  { index: 1, cn: '坎一宫', direction: '北', element: 'Water' },
  { index: 2, cn: '坤二宫', direction: '西南', element: 'Earth' },
  { index: 3, cn: '震三宫', direction: '东', element: 'Wood' },
  { index: 4, cn: '巽四宫', direction: '东南', element: 'Wood' },
  { index: 5, cn: '中五宫', direction: '中', element: 'Earth' },
  { index: 6, cn: '乾六宫', direction: '西北', element: 'Metal' },
  { index: 7, cn: '兑七宫', direction: '西', element: 'Metal' },
  { index: 8, cn: '艮八宫', direction: '东北', element: 'Earth' },
  { index: 9, cn: '离九宫', direction: '南', element: 'Fire' },
];

/**
 * 三奇六仪的排布次序：戊己庚辛壬癸丁丙乙。
 * 六仪在前（戊己庚辛壬癸），三奇在后且为**丁丙乙**的逆序 —— 这一点最易写错。
 */
export const YIQI_ORDER = ['戊', '己', '庚', '辛', '壬', '癸', '丁', '丙', '乙'];

/** 九星，键为所居的地盘宫位。 */
export const NINE_STARS = {
  1: { key: 'tianpeng', cn: '天蓬' },
  2: { key: 'tianrui', cn: '天芮' },
  3: { key: 'tianchong', cn: '天冲' },
  4: { key: 'tianfu', cn: '天辅' },
  5: { key: 'tianqin', cn: '天禽' },
  6: { key: 'tianxin', cn: '天心' },
  7: { key: 'tianzhu', cn: '天柱' },
  8: { key: 'tianren', cn: '天任' },
  9: { key: 'tianying', cn: '天英' },
};

/** 八门，中五宫无门。 */
export const EIGHT_GATES = {
  1: { key: 'xiu', cn: '休门' },
  2: { key: 'si', cn: '死门' },
  3: { key: 'shang', cn: '伤门' },
  4: { key: 'du', cn: '杜门' },
  6: { key: 'kai', cn: '开门' },
  7: { key: 'jing', cn: '惊门' },
  8: { key: 'sheng', cn: '生门' },
  9: { key: 'jingView', cn: '景门' },
};

/** 八神，自值符起。阳遁顺布、阴遁逆布。 */
export const EIGHT_GODS = [
  { key: 'zhifu', cn: '值符' },
  { key: 'tengshe', cn: '螣蛇' },
  { key: 'taiyin', cn: '太阴' },
  { key: 'liuhe', cn: '六合' },
  { key: 'baihu', cn: '白虎' },
  { key: 'xuanwu', cn: '玄武' },
  { key: 'jiudi', cn: '九地' },
  { key: 'jiutian', cn: '九天' },
];

/**
 * 旬首所遁之仪：甲不亲自上盘，遁于六仪之下。
 * 甲子遁戊、甲戌遁己、甲申遁庚、甲午遁辛、甲辰遁壬、甲寅遁癸。
 */
export const XUNSHOU_TO_YI = {
  甲子: '戊',
  甲戌: '己',
  甲申: '庚',
  甲午: '辛',
  甲辰: '壬',
  甲寅: '癸',
};

/**
 * 二十四节气三元局数（拆补法）。
 *
 * 每个节气管十五日，分上中下三元各五日，数组即 [上元, 中元, 下元] 的局数。
 * 冬至至芒种为阳遁，夏至至大雪为阴遁。
 *
 * 出自通行的三元定局口诀：
 *   冬至惊蛰一七四，小寒二八五，大寒春分三九六，
 *   雨水九六三，立春八五二，清明立夏四一七，
 *   谷雨小满五二八，芒种六三九，
 *   夏至白露九三六，小暑八二五，大暑秋分七一四，
 *   立秋二五八，处暑一四七，寒露立冬六九三，
 *   霜降小雪五八二，大雪四七一。
 */
export const JIEQI_JU = {
  冬至: { yang: true, ju: [1, 7, 4] },
  小寒: { yang: true, ju: [2, 8, 5] },
  大寒: { yang: true, ju: [3, 9, 6] },
  立春: { yang: true, ju: [8, 5, 2] },
  雨水: { yang: true, ju: [9, 6, 3] },
  惊蛰: { yang: true, ju: [1, 7, 4] },
  春分: { yang: true, ju: [3, 9, 6] },
  清明: { yang: true, ju: [4, 1, 7] },
  谷雨: { yang: true, ju: [5, 2, 8] },
  立夏: { yang: true, ju: [4, 1, 7] },
  小满: { yang: true, ju: [5, 2, 8] },
  芒种: { yang: true, ju: [6, 3, 9] },
  夏至: { yang: false, ju: [9, 3, 6] },
  小暑: { yang: false, ju: [8, 2, 5] },
  大暑: { yang: false, ju: [7, 1, 4] },
  立秋: { yang: false, ju: [2, 5, 8] },
  处暑: { yang: false, ju: [1, 4, 7] },
  白露: { yang: false, ju: [9, 3, 6] },
  秋分: { yang: false, ju: [7, 1, 4] },
  寒露: { yang: false, ju: [6, 9, 3] },
  霜降: { yang: false, ju: [5, 8, 2] },
  立冬: { yang: false, ju: [6, 9, 3] },
  小雪: { yang: false, ju: [5, 8, 2] },
  大雪: { yang: false, ju: [4, 7, 1] },
};

/** 节气顺序，用于定位当前所处节气。 */
export const JIEQI_ORDER = [
  '冬至',
  '小寒',
  '大寒',
  '立春',
  '雨水',
  '惊蛰',
  '春分',
  '清明',
  '谷雨',
  '立夏',
  '小满',
  '芒种',
  '夏至',
  '小暑',
  '大暑',
  '立秋',
  '处暑',
  '白露',
  '秋分',
  '寒露',
  '霜降',
  '立冬',
  '小雪',
  '大雪',
];

/**
 * 符头定元：拆补法以甲己日为符头，按其地支定上中下元。
 * 子午卯酉为上元，寅申巳亥为中元，辰戌丑未为下元。
 */
export const YUAN_BY_FUTOU_BRANCH = {
  子: 0,
  午: 0,
  卯: 0,
  酉: 0,
  寅: 1,
  申: 1,
  巳: 1,
  亥: 1,
  辰: 2,
  戌: 2,
  丑: 2,
  未: 2,
};

export const YUAN_NAMES = ['上元', '中元', '下元'];
