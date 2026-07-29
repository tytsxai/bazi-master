/**
 * 大六壬静态数据：月将、日干寄宫、十二天将。
 *
 * 月将不硬编表 —— 它恒等于**月建的六合**（正月建寅，寅亥合，故正月将亥登明），
 * 换将以**中气**为界（雨水后换亥将），不是节。这两条是六壬起课的第一步，错了整课全错。
 */

/** 十二月将，键为地支。名称与所值中气一并记录，便于回溯换将时点。 */
export const MONTH_GENERALS = {
  亥: { cn: '登明', order: 1, afterQi: '雨水', monthBranch: '寅' },
  戌: { cn: '河魁', order: 2, afterQi: '春分', monthBranch: '卯' },
  酉: { cn: '从魁', order: 3, afterQi: '谷雨', monthBranch: '辰' },
  申: { cn: '传送', order: 4, afterQi: '小满', monthBranch: '巳' },
  未: { cn: '小吉', order: 5, afterQi: '夏至', monthBranch: '午' },
  午: { cn: '胜光', order: 6, afterQi: '大暑', monthBranch: '未' },
  巳: { cn: '太乙', order: 7, afterQi: '处暑', monthBranch: '申' },
  辰: { cn: '天罡', order: 8, afterQi: '秋分', monthBranch: '酉' },
  卯: { cn: '太冲', order: 9, afterQi: '霜降', monthBranch: '戌' },
  寅: { cn: '功曹', order: 10, afterQi: '小雪', monthBranch: '亥' },
  丑: { cn: '大吉', order: 11, afterQi: '冬至', monthBranch: '子' },
  子: { cn: '神后', order: 12, afterQi: '大寒', monthBranch: '丑' },
};

/** 中气 → 月将地支。换将以中气为界，用节换将是另一派，本模块不取。 */
export const QI_TO_MONTH_GENERAL = Object.entries(MONTH_GENERALS).reduce((acc, [branch, meta]) => {
  acc[meta.afterQi] = branch;
  return acc;
}, {});

/** 十二中气，按一年顺序排列。 */
export const MID_QI_ORDER = [
  '雨水',
  '春分',
  '谷雨',
  '小满',
  '夏至',
  '大暑',
  '处暑',
  '秋分',
  '霜降',
  '小雪',
  '冬至',
  '大寒',
];

/**
 * 日干寄宫：天干无地盘之位，寄于地支起课。
 * 戊寄巳同丙、己寄未同丁，与子平法的土寄火乡同理。
 */
export const STEM_LODGING = {
  甲: '寅',
  乙: '辰',
  丙: '巳',
  戊: '巳',
  丁: '未',
  己: '未',
  庚: '申',
  辛: '戌',
  壬: '亥',
  癸: '丑',
};

/** 十二天将，自贵人起顺序排列。 */
export const TWELVE_GENERALS = [
  { key: 'guiren', cn: '贵人', name: 'Noble' },
  { key: 'tengshe', cn: '螣蛇', name: 'Serpent' },
  { key: 'zhuque', cn: '朱雀', name: 'Vermilion Bird' },
  { key: 'liuhe', cn: '六合', name: 'Six Harmony' },
  { key: 'gouchen', cn: '勾陈', name: 'Hook Snake' },
  { key: 'qinglong', cn: '青龙', name: 'Azure Dragon' },
  { key: 'tiankong', cn: '天空', name: 'Sky Void' },
  { key: 'baihu', cn: '白虎', name: 'White Tiger' },
  { key: 'taichang', cn: '太常', name: 'Great Constant' },
  { key: 'xuanwu', cn: '玄武', name: 'Dark Warrior' },
  { key: 'taiyin', cn: '太阴', name: 'Great Yin' },
  { key: 'tianhou', cn: '天后', name: 'Heaven Queen' },
];

/**
 * 天乙贵人所临，分昼夜。卯至申为昼占用昼贵，酉至寅为夜占用夜贵。
 * 与八字的天乙贵人同出一源，但八字不分昼夜、六壬必分。
 */
export const NOBLE_BY_DAY_STEM = {
  甲: { day: '丑', night: '未' },
  戊: { day: '丑', night: '未' },
  庚: { day: '丑', night: '未' },
  乙: { day: '子', night: '申' },
  己: { day: '子', night: '申' },
  丙: { day: '亥', night: '酉' },
  丁: { day: '亥', night: '酉' },
  辛: { day: '午', night: '寅' },
  壬: { day: '巳', night: '卯' },
  癸: { day: '巳', night: '卯' },
};

/** 昼占的时支范围（卯至申）。 */
export const DAY_TIME_BRANCHES = ['卯', '辰', '巳', '午', '未', '申'];

/**
 * 课体名目（九宗门）。
 *
 * 取传按九宗门次第逐层排除：贼克 → 比用 → 涉害 → 遥克 → 昴星 → 别责 → 八专，
 * 另有伏吟、返吟两种因天地盘特殊而先行判定的课式。
 *
 * 口径声明：本模块依通行的《六壬大全》一系取法。有分歧处如下，换派只改 liuren.service：
 * - 涉害深浅：以天盘支自所乘地盘位**逆行**归本家，沿途地盘之支克它者计数，多者为深
 * - 涉害深浅相等：先取孟神，次取仲神，仍等则阳日取干上神、阴日取支上神（见机、察微）
 * - 伏吟中末传取刑，遇自刑则改取支上神（阳日）或干上神（阴日）
 * - 返吟无克取驿马为初传
 */
export const COURSE_TYPES = {
  yuanshou: { key: 'yuanshou', cn: '元首课', rule: '贼克法：四课独一上克下' },
  zhongshen: { key: 'zhongshen', cn: '重审课', rule: '贼克法：四课独一下贼上' },
  zhiyi: { key: 'zhiyi', cn: '知一课', rule: '比用法：克贼有二，取与日干同阴阳者' },
  shehai: { key: 'shehai', cn: '涉害课', rule: '涉害法：比用不决，取涉害深者' },
  jianji: { key: 'jianji', cn: '见机课', rule: '涉害深浅相等，取孟神' },
  chawei: { key: 'chawei', cn: '察微课', rule: '涉害深浅相等且无孟，取仲神' },
  haoshi: { key: 'haoshi', cn: '蒿矢课', rule: '遥克法：四课无克，上神遥克日干' },
  tanshe: { key: 'tanshe', cn: '弹射课', rule: '遥克法：四课无克，日干遥克上神' },
  hushi: { key: 'hushi', cn: '虎视课', rule: '昴星法阳日：取地盘酉上之神' },
  dongshe: { key: 'dongshe', cn: '冬蛇掩目课', rule: '昴星法阴日：取天盘酉下之神' },
  bieze: { key: 'bieze', cn: '别责课', rule: '四课不备，阳日取干合寄宫上神、阴日取支三合前一位' },
  bazhuan: { key: 'bazhuan', cn: '八专课', rule: '干支同位，阳日顺数三位、阴日逆数三位' },
  ziren: { key: 'ziren', cn: '自任课', rule: '伏吟无克阳日：取干上神' },
  zixin: { key: 'zixin', cn: '自信课', rule: '伏吟无克阴日：取支上神' },
  fuyinKe: { key: 'fuyinKe', cn: '伏吟课', rule: '伏吟有克：依贼克法取初传，中末传递取其刑' },
  wuqin: { key: 'wuqin', cn: '无亲课', rule: '返吟无克：取驿马为初传' },
  fanyinKe: { key: 'fanyinKe', cn: '返吟课', rule: '返吟有克：依贼克法' },
};

/** 八专日：日干寄宫与日支同位。 */
export const BAZHUAN_DAYS = ['甲寅', '乙卯', '丁未', '戊戌', '己未', '庚申', '辛酉', '癸丑'];
