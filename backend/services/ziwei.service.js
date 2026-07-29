import { Solar } from 'lunar-javascript';

import { BRANCHES_MAP } from '../constants/stems.js';
import { STEMS } from '../constants/ganzhi.js';
import { getFiveElementBureau } from './ganzhi.service.js';
import {
  ZIWEI_BRANCH_ORDER,
  ZIWEI_MONTH_BRANCH_ORDER,
  ZIWEI_PALACES,
  ZIWEI_MAJOR_STARS,
  ZIWEI_MINOR_STARS,
  ZIWEI_MALEFIC_STARS,
  ZIWEI_GROUP_OFFSETS,
  TIANFU_GROUP_OFFSETS,
  YEAR_STEM_TO_YIN_PALACE_STEM,
  KUIYUE_BY_YEAR_STEM,
  LUCUN_BY_YEAR_STEM,
  HUOLING_START_BY_YEAR_GROUP,
  TIANMA_BY_YEAR_GROUP,
  ZIWEI_SIHUA_BY_STEM,
  ZIWEI_SIHUA_TYPES,
  XIAOXIAN_START_BY_YEAR_GROUP,
  YANG_STEMS,
} from '../constants/ziwei.js';

const YIN_INDEX = ZIWEI_BRANCH_ORDER.indexOf('寅');

const normalizeIndex = (value, modulo = 12) => ((value % modulo) + modulo) % modulo;

const branchIndexOf = (branch) => ZIWEI_BRANCH_ORDER.indexOf(branch);

/** 子时跨日：23 时起即入次日子时，故 (hour + 1) / 2 取整。 */
const getTimeBranchIndex = (birthHour) => {
  const hour = Number(birthHour);
  if (!Number.isFinite(hour)) return 0;
  return Math.floor((hour + 1) / 2) % 12;
};

/**
 * 五虎遁排十二宫天干：年干定寅宫之干，其余各宫自寅顺排。
 * 命宫天干由此得出，再取其干支纳音定五行局。
 */
const buildPalaceStems = (yearStem) => {
  const yinStem = YEAR_STEM_TO_YIN_PALACE_STEM[yearStem];
  if (!yinStem) return null;
  const yinStemIndex = STEMS.indexOf(yinStem);
  return ZIWEI_BRANCH_ORDER.map((_, branchIdx) => {
    const offset = normalizeIndex(branchIdx - YIN_INDEX);
    return STEMS[(yinStemIndex + offset) % 10];
  });
};

/**
 * 紫微星定位。
 *
 * 取最小的 n 使 n × 局数 ≥ 生日，余数 R = n × 局数 − 生日：
 *   R 为偶数 → 自寅宫顺数 (n−1) 后，再顺行 R 位
 *   R 为奇数 → 自寅宫顺数 (n−1) 后，再逆行 R 位
 *
 * 例：水二局初一 → n=1、R=1（奇）→ 寅逆一位得丑；火六局初一 → n=1、R=5（奇）→ 寅逆五位得酉。
 * 二者均与斗数全书的紫微诸星安星表相符。
 */
const locateZiwei = (bureauValue, lunarDay) => {
  if (!bureauValue || !lunarDay) return null;
  const steps = Math.ceil(lunarDay / bureauValue);
  const remainder = steps * bureauValue - lunarDay;
  const base = YIN_INDEX + (steps - 1);
  return normalizeIndex(remainder % 2 === 0 ? base + remainder : base - remainder);
};

/**
 * 天府与紫微关于「寅—申」轴镜像对称，即 tianfu = 4 − ziwei（模 12）。
 * 紫微在寅或申时两星同宫。旧实现用的 ziwei + 6 只在个别位置巧合成立。
 */
const locateTianfu = (ziweiIndex) => normalizeIndex(4 - ziweiIndex);

const findGroupBranch = (groups, yearBranch, field) => {
  const hit = groups.find((group) => group.branches.includes(yearBranch));
  return hit ? hit[field] : null;
};

const buildPalaces = (mingIndex, palaceStems) => {
  const palaces = ZIWEI_BRANCH_ORDER.map((branch, index) => ({
    index,
    stem: palaceStems ? palaceStems[index] : null,
    branch: {
      key: branch,
      name: BRANCHES_MAP[branch]?.name || branch,
      element: BRANCHES_MAP[branch]?.element || 'Unknown',
      polarity: BRANCHES_MAP[branch]?.polarity || null,
    },
    palace: null,
    stars: { major: [], minor: [], malefic: [] },
    transformations: [],
  }));

  ZIWEI_PALACES.forEach((palace, offset) => {
    palaces[normalizeIndex(mingIndex + offset)].palace = palace;
  });

  return palaces;
};

const STAR_REGISTRY = { ...ZIWEI_MAJOR_STARS, ...ZIWEI_MINOR_STARS, ...ZIWEI_MALEFIC_STARS };

const isMale = (gender) => String(gender || '').toLowerCase() === 'male';

/**
 * 大限顺逆：阳男阴女顺行，阴男阳女逆行。阴阳看**年干**。
 */
export const getMajorPeriodDirection = (yearStem, gender) => {
  const yang = YANG_STEMS.includes(yearStem);
  const male = isMale(gender);
  return (yang && male) || (!yang && !male) ? 1 : -1;
};

/**
 * 大限：自命宫起，每宫十年，起限岁数即五行局数（水二局 2 岁上运、火六局 6 岁上运）。
 * 这里用虚岁，与斗数传统一致。
 */
export const calculateMajorPeriods = ({ mingIndex, bureauValue, yearStem, gender, count = 12 }) => {
  if (!bureauValue) return [];
  const direction = getMajorPeriodDirection(yearStem, gender);
  return Array.from({ length: count }, (_, i) => {
    const index = normalizeIndex(mingIndex + direction * i);
    const startAge = bureauValue + i * 10;
    return {
      order: i + 1,
      palaceIndex: index,
      branch: ZIWEI_BRANCH_ORDER[index],
      startAge,
      endAge: startAge + 9,
    };
  });
};

/**
 * 小限：年支三合组定起宫，男顺女逆，一岁一宫。与大限各行其是，不共用顺逆。
 */
export const calculateMinorPeriodIndex = (yearBranch, gender, age) => {
  const start = findGroupBranch(XIAOXIAN_START_BY_YEAR_GROUP, yearBranch, 'branch');
  if (!start || !Number.isFinite(age) || age < 1) return null;
  const direction = isMale(gender) ? 1 : -1;
  return normalizeIndex(branchIndexOf(start) + direction * (age - 1));
};

export const calculateZiweiChart = (data) => {
  const { birthYear, birthMonth, birthDay, birthHour, gender } = data;
  const solar = Solar.fromYmdHms(birthYear, birthMonth, birthDay, birthHour || 0, 0, 0);
  const lunar = solar.getLunar();
  const eightChar = lunar.getEightChar();

  // lunar-javascript 用**负数月份**表示闰月：闰二月 = -2。这个约定有两个后果，
  // 都必须显式处理，否则闰月出生的盘会静默算错：
  //
  // 1. 判闰月只能看正负。这个版本的 Lunar 没有 isLeap 属性/方法，
  //    早先那句 `typeof lunar.isLeap === 'function' ? ... : Boolean(lunar.isLeap)`
  //    实际恒等于 Boolean(undefined)，也就是永远 false —— 连闰月都识别不出来。
  // 2. 负数不能直接拿去查表。normalizeIndex(-2 - 1) 得 9，而二月应当是 1，
  //    月支整个错位，紫微星落宫连带全错。
  //
  // 取绝对值 = 闰月归本月（闰二月与二月落同一个月支）。这是选定的流派。
  const rawLunarMonth = lunar.getMonth();
  const isLeapMonth = rawLunarMonth < 0;
  const lunarMonth = Math.abs(rawLunarMonth);
  const lunarDay = lunar.getDay();
  const lunarYear = lunar.getYear();
  const yearStem = eightChar.getYearGan();
  const yearBranch = eightChar.getYearZhi();

  const monthBranch = ZIWEI_MONTH_BRANCH_ORDER[normalizeIndex(lunarMonth - 1)];
  const monthBranchIndex = branchIndexOf(monthBranch);
  const timeBranchIndex = getTimeBranchIndex(birthHour);

  // 寅宫起正月顺数至生月，再自生月起子时逆数至生时得命宫；身宫改顺数。
  const mingIndex = normalizeIndex(monthBranchIndex - timeBranchIndex);
  const shenIndex = normalizeIndex(monthBranchIndex + timeBranchIndex);

  const palaceStems = buildPalaceStems(yearStem);
  const mingStem = palaceStems ? palaceStems[mingIndex] : null;
  const mingBranch = ZIWEI_BRANCH_ORDER[mingIndex];
  const bureau = mingStem ? getFiveElementBureau(mingStem, mingBranch) : null;

  const ziweiIndex = bureau ? locateZiwei(bureau.value, lunarDay) : null;
  const tianfuIndex = ziweiIndex === null ? null : locateTianfu(ziweiIndex);

  const palaces = buildPalaces(mingIndex, palaceStems);

  // 本命四化：年干定四化，落在星曜所在之宫。
  const transformMap = ZIWEI_SIHUA_BY_STEM[yearStem] || {};
  const transformsByStar = Object.entries(transformMap).reduce((acc, [type, starKey]) => {
    if (!starKey) return acc;
    acc[starKey] = acc[starKey] || [];
    acc[starKey].push(type);
    return acc;
  }, {});

  const addStar = (index, starKey, group) => {
    const star = STAR_REGISTRY[starKey];
    if (index === null || !star) return;
    const target = palaces[normalizeIndex(index)];
    if (!target) return;
    const transforms = transformsByStar[starKey] || [];
    target.stars[group].push(transforms.length ? { ...star, transforms } : { ...star });
    transforms.forEach((type) => {
      target.transformations.push({
        type,
        typeCn: ZIWEI_SIHUA_TYPES[type]?.cn || type,
        starKey,
        starName: star.name,
        starCn: star.cn,
      });
    });
  };

  if (ziweiIndex !== null) {
    ZIWEI_GROUP_OFFSETS.forEach(({ key, offset }) =>
      addStar(normalizeIndex(ziweiIndex + offset), key, 'major')
    );
    TIANFU_GROUP_OFFSETS.forEach(({ key, offset }) =>
      addStar(normalizeIndex(tianfuIndex + offset), key, 'major')
    );
  }

  // 六吉星：昌曲由时支定，辅弼由生月定，魁钺由年干定。四条规则各不相同，
  // 旧实现把它们压成同一个基数加偏移，是错的。
  addStar(normalizeIndex(10 - timeBranchIndex), 'wenchang', 'minor'); // 戌宫起子时逆行
  addStar(normalizeIndex(4 + timeBranchIndex), 'wenqu', 'minor'); // 辰宫起子时顺行
  addStar(normalizeIndex(4 + (lunarMonth - 1)), 'zuofu', 'minor'); // 辰宫起正月顺行
  addStar(normalizeIndex(10 - (lunarMonth - 1)), 'youbi', 'minor'); // 戌宫起正月逆行

  const kuiyue = KUIYUE_BY_YEAR_STEM[yearStem];
  if (kuiyue) {
    addStar(branchIndexOf(kuiyue.kui), 'tiankui', 'minor');
    addStar(branchIndexOf(kuiyue.yue), 'tianyue', 'minor');
  }

  // 禄存定羊陀：擎羊在禄存前一位，陀罗在后一位。
  const lucunBranch = LUCUN_BY_YEAR_STEM[yearStem];
  if (lucunBranch) {
    const lucunIndex = branchIndexOf(lucunBranch);
    addStar(lucunIndex, 'lucun', 'minor');
    addStar(normalizeIndex(lucunIndex + 1), 'qingyang', 'malefic');
    addStar(normalizeIndex(lucunIndex - 1), 'tuoluo', 'malefic');
  }

  const tianmaBranch = findGroupBranch(TIANMA_BY_YEAR_GROUP, yearBranch, 'branch');
  if (tianmaBranch) addStar(branchIndexOf(tianmaBranch), 'tianma', 'minor');

  // 火铃：年支三合组定起点，自起点顺行至生时。
  const huoStart = findGroupBranch(HUOLING_START_BY_YEAR_GROUP, yearBranch, 'huo');
  const lingStart = findGroupBranch(HUOLING_START_BY_YEAR_GROUP, yearBranch, 'ling');
  if (huoStart)
    addStar(normalizeIndex(branchIndexOf(huoStart) + timeBranchIndex), 'huoxing', 'malefic');
  if (lingStart)
    addStar(normalizeIndex(branchIndexOf(lingStart) + timeBranchIndex), 'lingxing', 'malefic');

  // 空劫：亥宫起子时，地劫顺行、地空逆行。
  addStar(normalizeIndex(11 + timeBranchIndex), 'dijie', 'malefic');
  addStar(normalizeIndex(11 - timeBranchIndex), 'dikong', 'malefic');

  const fourTransformations = Object.entries(transformMap).map(([type, starKey]) => {
    const starDef = STAR_REGISTRY[starKey] || { key: starKey };
    return {
      type,
      typeCn: ZIWEI_SIHUA_TYPES[type]?.cn || type,
      starKey,
      starName: starDef.name || starKey,
      starCn: starDef.cn || null,
    };
  });

  const majorPeriods = calculateMajorPeriods({
    mingIndex,
    bureauValue: bureau?.value,
    yearStem,
    gender,
  });
  majorPeriods.forEach((period) => {
    const target = palaces[period.palaceIndex];
    if (target)
      target.majorPeriod = {
        order: period.order,
        startAge: period.startAge,
        endAge: period.endAge,
      };
  });

  return {
    gender: gender || null,
    lunar: {
      year: lunarYear,
      month: lunarMonth,
      day: lunarDay,
      isLeap: isLeapMonth,
      yearStem,
      yearBranch,
      monthStem: eightChar.getMonthGan(),
      monthBranch: eightChar.getMonthZhi(),
      dayStem: eightChar.getDayGan(),
      dayBranch: eightChar.getDayZhi(),
      timeStem: eightChar.getTimeGan(),
      timeBranch: eightChar.getTimeZhi(),
    },
    fiveElementBureau: bureau
      ? {
          key: bureau.key,
          value: bureau.value,
          cn: bureau.cn,
          element: bureau.element,
          nayin: bureau.nayin,
          mingGanzhi: `${mingStem}${mingBranch}`,
        }
      : null,
    mingPalace: {
      index: mingIndex,
      stem: mingStem,
      branch: palaces[mingIndex]?.branch,
      palace: palaces[mingIndex]?.palace,
    },
    shenPalace: {
      index: shenIndex,
      stem: palaceStems ? palaceStems[shenIndex] : null,
      branch: palaces[shenIndex]?.branch,
      palace: palaces[shenIndex]?.palace,
    },
    starPositions: {
      ziwei: ziweiIndex,
      tianfu: tianfuIndex,
    },
    majorPeriods,
    majorPeriodDirection: getMajorPeriodDirection(yearStem, gender),
    fourTransformations,
    palaces,
  };
};

/**
 * 流年盘：流年地支所在之宫即流年命宫；同时给出该年所值的大限与小限。
 * age 用虚岁（出生即一岁），与大限小限的口径保持一致。
 */
export const calculateFlowYear = (chart, targetYear) => {
  if (!chart || !Number.isFinite(targetYear)) return null;
  const birthLunarYear = chart.lunar.year;
  const age = targetYear - birthLunarYear + 1;
  if (age < 1) return null;

  const flowYearGanzhi = Solar.fromYmd(targetYear, 7, 1).getLunar().getYearInGanZhi();
  const flowBranch = flowYearGanzhi[1];
  const flowIndex = branchIndexOf(flowBranch);

  const majorPeriod = chart.majorPeriods.find((p) => age >= p.startAge && age <= p.endAge) || null;
  const minorIndex = calculateMinorPeriodIndex(chart.lunar.yearBranch, chart.gender, age);

  return {
    year: targetYear,
    age,
    ganzhi: flowYearGanzhi,
    stem: flowYearGanzhi[0],
    branch: flowBranch,
    palaceIndex: flowIndex,
    palace: chart.palaces[flowIndex]?.palace || null,
    majorPeriod,
    minorPeriodIndex: minorIndex,
    minorPeriodBranch: minorIndex === null ? null : ZIWEI_BRANCH_ORDER[minorIndex],
    // 流年四化由流年天干起，与本命四化叠加论断
    flowTransformations: Object.entries(ZIWEI_SIHUA_BY_STEM[flowYearGanzhi[0]] || {}).map(
      ([type, starKey]) => ({
        type,
        typeCn: ZIWEI_SIHUA_TYPES[type]?.cn || type,
        starKey,
        starCn: STAR_REGISTRY[starKey]?.cn || null,
      })
    ),
  };
};

export { locateZiwei, locateTianfu, buildPalaceStems, getTimeBranchIndex };
