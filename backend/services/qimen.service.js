/**
 * 奇门遁甲排盘层。
 *
 * 排盘链条：定节气三元 → 定阴阳遁与局数 → 地盘三奇六仪 → 定旬首值符值使 →
 * 转天盘九星 → 转八门 → 布八神。
 *
 * 覆盖的是**盘的结构**。格局判定（青龙返首、飞鸟跌穴、三奇得使之类）不实现：
 * 那属于断语层，各家取名与成立条件出入极大，由调用方按所宗流派叠加。
 * 引擎给出的每一格都带宫位、地盘干、天盘干、星、门、神，断语所需的原料是齐的。
 */

import { Solar } from 'lunar-javascript';

import { BRANCHES, SEXAGENARY_CYCLE } from '../constants/ganzhi.js';
import {
  PALACES,
  YIQI_ORDER,
  NINE_STARS,
  EIGHT_GATES,
  EIGHT_GODS,
  XUNSHOU_TO_YI,
  JIEQI_JU,
  JIEQI_ORDER,
  YUAN_BY_FUTOU_BRANCH,
  YUAN_NAMES,
} from '../constants/qimen.js';

/**
 * 九宫飞泊次序。顺飞即 1→2→…→9→1，此处用一个环表表示，
 * 便于阳遁顺行、阴遁逆行统一处理。
 */
const PALACE_CYCLE = [1, 2, 3, 4, 5, 6, 7, 8, 9];

const stepPalace = (palace, step) => {
  const idx = PALACE_CYCLE.indexOf(palace);
  if (idx === -1) return null;
  return PALACE_CYCLE[(((idx + step) % 9) + 9) % 9];
};

/**
 * 洛书八宫顺时针环：坎一 → 艮八 → 震三 → 巽四 → 离九 → 坤二 → 兑七 → 乾六。
 *
 * 九星、八门、八神都在这个八宫环上转动，**中五宫不参与** —— 中宫寄坤二。
 * 地盘三奇六仪则不同，它是按一到九顺（逆）飞九宫的，中宫要占一位。
 * 这两套飞泊次序不能混用：拿九宫环去转八门，会转出「中五宫有门」这种不存在的盘。
 */
const OCTAGON = [1, 8, 3, 4, 9, 2, 7, 6];

/** 中五宫寄坤二。 */
const lodgeCenter = (palace) => (palace === 5 ? 2 : palace);

const octIndex = (palace) => OCTAGON.indexOf(lodgeCenter(palace));

const octStep = (palace, step) => {
  const idx = octIndex(palace);
  if (idx === -1) return null;
  return OCTAGON[(((idx + step) % 8) + 8) % 8];
};

/** 时辰地支。子时含 23 时。 */
const hourBranchIndex = (hour) => Math.floor((Number(hour) + 1) / 2) % 12;

/**
 * 定当前所处节气及其起始日。奇门按节气行局，节气一换局数即变。
 */
export const resolveJieQi = (year, month, day) => {
  const lunar = Solar.fromYmd(year, month, day).getLunar();
  const table = lunar.getJieQiTable();
  const target = new Date(year, month - 1, day);

  let current = null;
  JIEQI_ORDER.forEach((name) => {
    const solar = table[name];
    if (!solar) return;
    const date = new Date(solar.getYear(), solar.getMonth() - 1, solar.getDay());
    if (date <= target && (!current || date > current.date)) {
      current = { name, date };
    }
  });

  // 年初尚未交小寒时仍在上一年的冬至节内
  if (!current) current = { name: '冬至', date: new Date(year - 1, 11, 22) };
  return current;
};

/**
 * 定三元：拆补法以甲己日为符头，自占日**向前**寻最近的符头日，
 * 按其地支定上中下元（子午卯酉上元、寅申巳亥中元、辰戌丑未下元）。
 */
export const resolveYuan = (year, month, day) => {
  const solar = Solar.fromYmd(year, month, day);
  let cursor = solar;
  for (let back = 0; back < 60; back += 1) {
    const ganzhi = cursor.getLunar().getDayInGanZhi();
    const stem = ganzhi[0];
    if (stem === '甲' || stem === '己') {
      const yuan = YUAN_BY_FUTOU_BRANCH[ganzhi[1]];
      return {
        futou: ganzhi,
        yuan,
        yuanCn: YUAN_NAMES[yuan],
        daysSinceFutou: back,
      };
    }
    cursor = cursor.next(-1);
  }
  return null;
};

/** 定阴阳遁与局数。 */
export const resolveJu = (year, month, day) => {
  const jieqi = resolveJieQi(year, month, day);
  const yuanInfo = resolveYuan(year, month, day);
  const entry = JIEQI_JU[jieqi.name];
  if (!entry || !yuanInfo) return null;

  return {
    jieqi: jieqi.name,
    jieqiDate: jieqi.date.toISOString().slice(0, 10),
    yang: entry.yang,
    dunCn: entry.yang ? '阳遁' : '阴遁',
    ju: entry.ju[yuanInfo.yuan],
    ...yuanInfo,
  };
};

/**
 * 地盘三奇六仪：自局数所指之宫起，按戊己庚辛壬癸丁丙乙的次序，
 * 阳遁顺飞九宫、阴遁逆飞。
 */
export const buildEarthPlate = ({ yang, ju }) => {
  const plate = {};
  YIQI_ORDER.forEach((gan, offset) => {
    const palace = stepPalace(ju, yang ? offset : -offset);
    plate[palace] = gan;
  });
  return plate;
};

/** 干支所属旬首。 */
export const getXunShou = (ganzhi) => {
  const index = SEXAGENARY_CYCLE.indexOf(ganzhi);
  if (index === -1) return null;
  return SEXAGENARY_CYCLE[Math.floor(index / 10) * 10];
};

/**
 * 时干支。以日干起时干（五鼠遁），与八字同法。
 */
export const getHourGanzhi = (dayStem, hour) => {
  const branchIdx = hourBranchIndex(hour);
  const startStemIndex = { 甲: 0, 己: 0, 乙: 2, 庚: 2, 丙: 4, 辛: 4, 丁: 6, 壬: 6, 戊: 8, 癸: 8 }[
    dayStem
  ];
  if (startStemIndex === undefined) return null;
  const stems = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
  return `${stems[(startStemIndex + branchIdx) % 10]}${BRANCHES[branchIdx]}`;
};

/**
 * 排一局奇门盘。
 *
 * @param {object} input 公历年月日与时辰
 */
export const castQimenChart = ({ year, month, day, hour }) => {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  const h = Number(hour);
  if (![y, m, d, h].every(Number.isFinite)) return null;

  const juInfo = resolveJu(y, m, d);
  if (!juInfo) return null;

  const lunar = Solar.fromYmd(y, m, d).getLunar();
  const dayGanzhi = lunar.getDayInGanZhi();
  const hourGanzhi = getHourGanzhi(dayGanzhi[0], h);
  if (!hourGanzhi) return null;

  const earthPlate = buildEarthPlate(juInfo);
  const xunshou = getXunShou(hourGanzhi);
  const dunYi = XUNSHOU_TO_YI[xunshou];

  // 值符宫 = 旬首所遁之仪在地盘所落之宫；该宫的九星为值符、八门为值使
  const zhifuPalace = Number(
    Object.keys(earthPlate).find((palace) => earthPlate[palace] === dunYi)
  );

  // 时干在地盘所落之宫。甲时用其遁仪。
  const hourStem = hourGanzhi[0];
  const effectiveStem = hourStem === '甲' ? dunYi : hourStem;
  const hourStemPalace = Number(
    Object.keys(earthPlate).find((palace) => earthPlate[palace] === effectiveStem)
  );

  // 星门神一律在八宫环上论，故遁仪或时干落中宫时先寄坤二，否则取不到星门
  const zhifuSeat = lodgeCenter(zhifuPalace);
  const hourStemSeat = lodgeCenter(hourStemPalace);

  // 转盘：值符星加临时干之宫，九星整体随之在八宫环上转动
  const starShift = octIndex(hourStemSeat) - octIndex(zhifuSeat);

  // 值使门随时辰而行：自值符宫起，按时辰在本旬中的序数，阳遁顺行、阴遁逆行
  const hourIndexInXun = SEXAGENARY_CYCLE.indexOf(hourGanzhi) - SEXAGENARY_CYCLE.indexOf(xunshou);
  const gateShift = juInfo.yang ? hourIndexInXun : -hourIndexInXun;
  const zhishiPalace = octStep(zhifuSeat, gateShift);
  const gateShiftFromOrigin = octIndex(zhishiPalace) - octIndex(zhifuSeat);

  // 天禽星居中，无独立方位，实务上寄坤二与天芮同宫
  const tianruiHome = 2;
  const tianqinPalace = octStep(tianruiHome, starShift);

  const palaces = PALACES.map((palace) => {
    const idx = palace.index;
    const isCenter = idx === 5;

    // 某宫现在所临之星/门，是原本在「本宫回退相应位移」那一宫的
    const starOrigin = isCenter ? 5 : octStep(idx, -starShift);
    const gateOrigin = isCenter ? null : octStep(idx, -gateShiftFromOrigin);

    // 八神自值符所临之宫起，阳遁顺布、阴遁逆布，只布八宫
    const godOffset = isCenter
      ? null
      : ((((octIndex(idx) - octIndex(hourStemPalace)) * (juInfo.yang ? 1 : -1)) % 8) + 8) % 8;

    return {
      ...palace,
      earthStem: earthPlate[idx] || null,
      heavenStem: isCenter ? earthPlate[5] || null : earthPlate[starOrigin] || null,
      star: isCenter ? NINE_STARS[5] : NINE_STARS[starOrigin] || null,
      // 天禽寄坤二随天芮，故其所临之宫会同时列出天禽
      lodgedStar: !isCenter && idx === tianqinPalace ? NINE_STARS[5] : null,
      gate: gateOrigin ? EIGHT_GATES[gateOrigin] || null : null,
      god: godOffset === null ? null : EIGHT_GODS[godOffset] || null,
      isZhifu: idx === hourStemSeat,
      isZhishi: idx === zhishiPalace,
    };
  });

  return {
    date: { year: y, month: m, day: d, hour: h },
    dayGanzhi,
    hourGanzhi,
    xunshou,
    dunYi,
    ju: juInfo,
    earthPlate,
    zhifu: {
      palace: zhifuPalace,
      seat: zhifuSeat,
      star: NINE_STARS[zhifuSeat] || null,
      landedPalace: hourStemSeat,
    },
    zhishi: {
      palace: zhishiPalace,
      gate: EIGHT_GATES[zhifuSeat] || null,
    },
    palaces,
  };
};
