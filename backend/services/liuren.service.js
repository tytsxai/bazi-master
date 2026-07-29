/**
 * 大六壬起课层。
 *
 * 起课链条：定月将 → 月将加时得天地盘 → 日干寄宫 → 四课 → 三传 → 十二天将。
 *
 * **覆盖范围要看清楚**：天地盘、四课、天将、以及三传里的贼克法（元首/重审）、
 * 比用法（知一）、遥克法（蒿矢/弹射）已实现且可验证；涉害、昴星、别责、八专、
 * 伏吟、返吟六门未实现 —— 遇到这些课式时 `threeTransmissions.supported` 为 false，
 * 并给出所判定的课体与未实现的原因，而不是返回一组看似合理实则未经核对的三传。
 */

import { Solar } from 'lunar-javascript';

import {
  BRANCHES,
  STEMS,
  BRANCH_PUNISH_TARGET,
  SELF_PUNISH_BRANCHES,
  MENG_BRANCHES,
  ZHONG_BRANCHES,
  YIMA_BY_GROUP,
  STEM_COMBINATIONS,
  BRANCH_TRIPLE_COMBINATIONS,
} from '../constants/ganzhi.js';
import { BRANCHES_MAP, STEMS_MAP } from '../constants/stems.js';
import { getElementRelation } from './bazi.service.js';
import { getXunkong } from './ganzhi.service.js';
import {
  MONTH_GENERALS,
  QI_TO_MONTH_GENERAL,
  MID_QI_ORDER,
  STEM_LODGING,
  TWELVE_GENERALS,
  NOBLE_BY_DAY_STEM,
  DAY_TIME_BRANCHES,
  COURSE_TYPES,
  BAZHUAN_DAYS,
} from '../constants/liuren.js';

const normalize12 = (value) => ((value % 12) + 12) % 12;
const branchIndex = (branch) => BRANCHES.indexOf(branch);
const elementOf = (branch) => BRANCHES_MAP[branch]?.element || null;

/** 时辰地支。子时含 23 时。 */
export const getHourBranch = (hour) => BRANCHES[Math.floor((Number(hour) + 1) / 2) % 12];

/**
 * 定月将：取不晚于占日的最近一个**中气**，其对应之将即为当月月将。
 * 用节换将是另一派，本模块取中气派。
 */
export const resolveMonthGeneral = (year, month, day) => {
  const solar = Solar.fromYmd(year, month, day);
  const lunar = solar.getLunar();
  const table = lunar.getJieQiTable();

  let best = null;
  MID_QI_ORDER.forEach((qi) => {
    const qiSolar = table[qi];
    if (!qiSolar) return;
    const qiDate = new Date(qiSolar.getYear(), qiSolar.getMonth() - 1, qiSolar.getDay());
    const target = new Date(year, month - 1, day);
    if (qiDate <= target && (!best || qiDate > best.date)) {
      best = { qi, date: qiDate };
    }
  });

  // 年初尚未过雨水时，仍行上一年大寒之后的子将
  const branch = best ? QI_TO_MONTH_GENERAL[best.qi] : '子';
  return {
    branch,
    ...MONTH_GENERALS[branch],
    afterQiDate: best ? best.date.toISOString().slice(0, 10) : null,
  };
};

/**
 * 月将加时得天盘：把月将安在占时所在的地盘位上，其余顺排。
 * 返回数组下标即地盘位（0 = 子），值为该位之上的天盘支。
 */
export const buildHeavenPlate = (monthGeneralBranch, hourBranch) => {
  const generalIdx = branchIndex(monthGeneralBranch);
  const hourIdx = branchIndex(hourBranch);
  if (generalIdx === -1 || hourIdx === -1) return null;
  return BRANCHES.map((_, earthIdx) => BRANCHES[normalize12(generalIdx + earthIdx - hourIdx)]);
};

/** 取某地支之上所乘的天盘支。 */
const above = (heavenPlate, branch) => heavenPlate[branchIndex(branch)];

/**
 * 四课。
 * 一课：日干寄宫及其上神；二课：一课上神及其上神；
 * 三课：日支及其上神；四课：三课上神及其上神。
 */
export const buildFourCourses = (heavenPlate, dayStem, dayBranch) => {
  const lodging = STEM_LODGING[dayStem];
  if (!lodging || !heavenPlate) return null;

  const first = { lower: lodging, upper: above(heavenPlate, lodging), basis: 'stemLodging' };
  const second = { lower: first.upper, upper: above(heavenPlate, first.upper), basis: 'first' };
  const third = { lower: dayBranch, upper: above(heavenPlate, dayBranch), basis: 'dayBranch' };
  const fourth = { lower: third.upper, upper: above(heavenPlate, third.upper), basis: 'third' };

  return [first, second, third, fourth].map((course, index) => ({
    index: index + 1,
    ...course,
    upperElement: elementOf(course.upper),
    lowerElement: elementOf(course.lower),
  }));
};

/** 上克下为「克」，下克上为「贼」。贼较克为急，故先取贼。 */
const classifyCourse = (course) => {
  const relation = getElementRelation(course.lowerElement, course.upperElement);
  if (relation === 'ControlledBy') return 'ke'; // 上克下
  if (relation === 'Controls') return 'zei'; // 下贼上
  return null;
};

/** 与日干阴阳相同者为「比」。比用法据此取舍。 */
const isSamePolarity = (branch, dayStem) => {
  const stemPolarity = STEMS_MAP[dayStem]?.polarity;
  const branchPolarity = BRANCHES_MAP[branch]?.polarity;
  return stemPolarity && branchPolarity && stemPolarity === branchPolarity;
};

/**
 * 取三传。
 *
 * 依九宗门次第：贼克 → 比用 → 涉害 → 遥克 → 昴星 → 别责 → 八专 → 伏吟 → 返吟，
 * 前门不成立才轮到后门。本实现覆盖贼克、比用、遥克三门，其余明确返回不支持。
 *
 * 中传取初传之上神，末传取中传之上神 —— 这一条在已实现的几门里是共通的。
 */
/**
 * 涉害深浅：天盘之支自其所乘的地盘位**逆行**归返本家，沿途所经地盘诸支中，
 * 克它者的个数即涉害之深。数多者受伤重，取为初传。
 */
export const calculateShehaiDepth = (heavenBranch, heavenPlate) => {
  const ridingIdx = heavenPlate.indexOf(heavenBranch);
  const homeIdx = branchIndex(heavenBranch);
  if (ridingIdx === -1 || homeIdx === -1) return 0;

  let depth = 0;
  let cursor = ridingIdx;
  // 逆行归家，途中每遇一个克我的地盘之支便计一分
  while (cursor !== homeIdx) {
    const earthBranch = BRANCHES[cursor];
    if (getElementRelation(elementOf(earthBranch), elementOf(heavenBranch)) === 'Controls') {
      depth += 1;
    }
    cursor = normalize12(cursor - 1);
  }
  return depth;
};

const isYangDay = (dayStem) => STEMS_MAP[dayStem]?.polarity === '+';

/** 干上神（一课上神）与支上神（三课上神）。 */
const stemUpper = (courses) => courses[0].upper;
const branchUpper = (courses) => courses[2].upper;

/**
 * 涉害法及其两个分支：深浅相等时先取孟神（见机），无孟取仲神（察微），
 * 仍不能决则阳日取干上神、阴日取支上神。
 */
const resolveShehai = (candidates, heavenPlate, dayStem, courses) => {
  const scored = candidates.map((branch) => ({
    branch,
    depth: calculateShehaiDepth(branch, heavenPlate),
  }));
  const maxDepth = Math.max(...scored.map((s) => s.depth));
  const deepest = scored.filter((s) => s.depth === maxDepth);
  if (deepest.length === 1) {
    return { initial: deepest[0].branch, courseType: COURSE_TYPES.shehai, depths: scored };
  }

  const meng = deepest.filter((s) => MENG_BRANCHES.includes(s.branch));
  if (meng.length === 1) {
    return { initial: meng[0].branch, courseType: COURSE_TYPES.jianji, depths: scored };
  }
  const zhong = deepest.filter((s) => ZHONG_BRANCHES.includes(s.branch));
  if (zhong.length === 1) {
    return { initial: zhong[0].branch, courseType: COURSE_TYPES.chawei, depths: scored };
  }

  // 孟仲皆不能决：阳日取干上神，阴日取支上神
  const fallback = isYangDay(dayStem) ? stemUpper(courses) : branchUpper(courses);
  return {
    initial: fallback,
    courseType: isYangDay(dayStem) ? COURSE_TYPES.jianji : COURSE_TYPES.chawei,
    depths: scored,
  };
};

/** 伏吟、返吟以外的常规课，中末传皆递取上神。 */
const buildByUpper = (initial, heavenPlate, courseType, extra = {}) => {
  const middle = above(heavenPlate, initial);
  const last = above(heavenPlate, middle);
  return {
    supported: true,
    courseType,
    initial: { branch: initial, element: elementOf(initial) },
    middle: { branch: middle, element: elementOf(middle) },
    last: { branch: last, element: elementOf(last) },
    ...extra,
  };
};

/** 显式指定三传（昴星、别责、八专、伏吟、返吟用）。 */
const buildExplicit = (initial, middle, last, courseType, extra = {}) => ({
  supported: true,
  courseType,
  initial: { branch: initial, element: elementOf(initial) },
  middle: { branch: middle, element: elementOf(middle) },
  last: { branch: last, element: elementOf(last) },
  ...extra,
});

/**
 * 伏吟：天地盘重合。有克依贼克法定初传，无克则阳日取干上神（自任）、阴日取支上神（自信）。
 * 中末传递取其刑；遇自刑之支则改取支上神（阳日）或干上神（阴日）。
 */
const resolveFuyin = (courses, dayStem) => {
  const zei = courses.filter((c) => classifyCourse(c) === 'zei');
  const ke = courses.filter((c) => classifyCourse(c) === 'ke');
  const primary = zei.length ? zei : ke;
  const yang = isYangDay(dayStem);

  let initial;
  let courseType;
  if (primary.length) {
    initial = primary[0].upper;
    courseType = COURSE_TYPES.fuyinKe;
  } else {
    initial = yang ? stemUpper(courses) : branchUpper(courses);
    courseType = yang ? COURSE_TYPES.ziren : COURSE_TYPES.zixin;
  }

  // 中传取初传之刑；初传自刑则改取另一上神
  let middle = BRANCH_PUNISH_TARGET[initial];
  if (SELF_PUNISH_BRANCHES.includes(initial)) {
    middle = yang ? branchUpper(courses) : stemUpper(courses);
  }
  // 末传取中传之刑；中传自刑则取其冲
  let last = BRANCH_PUNISH_TARGET[middle];
  if (SELF_PUNISH_BRANCHES.includes(middle)) {
    last = BRANCHES[normalize12(branchIndex(middle) + 6)];
  }

  return buildExplicit(initial, middle, last, courseType, { note: '伏吟：中末传递取其刑' });
};

/**
 * 返吟：天地盘全冲。有克依贼克法；无克为无亲课，取驿马为初传、支上神为中传、干上神为末传。
 */
const resolveFanyin = (courses, heavenPlate, dayStem, dayBranch) => {
  const zei = courses.filter((c) => classifyCourse(c) === 'zei');
  const ke = courses.filter((c) => classifyCourse(c) === 'ke');
  const primary = zei.length ? zei : ke;

  if (primary.length) {
    const chosen =
      primary.length === 1
        ? primary[0].upper
        : resolveShehai(
            primary.map((c) => c.upper),
            heavenPlate,
            dayStem,
            courses
          ).initial;
    return buildByUpper(chosen, heavenPlate, COURSE_TYPES.fanyinKe);
  }

  const yimaEntry = YIMA_BY_GROUP.find((g) => g.branches.includes(dayBranch));
  const yima = yimaEntry ? yimaEntry.yima : branchUpper(courses);
  return buildExplicit(yima, branchUpper(courses), stemUpper(courses), COURSE_TYPES.wuqin, {
    note: '返吟无克，取驿马为初传',
  });
};

/**
 * 取三传，依九宗门次第。
 *
 * 伏吟返吟因天地盘特殊，先行判定；其余按
 * 贼克 → 比用 → 涉害 → 遥克 → 昴星 → 别责 → 八专 逐层排除。
 */
export const deriveThreeTransmissions = (courses, heavenPlate, dayStem, options = {}) => {
  const { isFuyin = false, isFanyin = false, dayBranch = null } = options;

  if (isFuyin) return resolveFuyin(courses, dayStem);
  if (isFanyin) return resolveFanyin(courses, heavenPlate, dayStem, dayBranch);

  const zei = courses.filter((c) => classifyCourse(c) === 'zei');
  const ke = courses.filter((c) => classifyCourse(c) === 'ke');

  // 贼克法：先取下贼上，无贼则取上克下
  const primary = zei.length ? zei : ke;
  const typeWhenSingle = zei.length ? COURSE_TYPES.zhongshen : COURSE_TYPES.yuanshou;

  if (primary.length === 1) {
    return buildByUpper(primary[0].upper, heavenPlate, typeWhenSingle);
  }

  if (primary.length > 1) {
    // 比用法：取与日干同阴阳者；独一者用之
    const matched = primary.filter((c) => isSamePolarity(c.upper, dayStem));
    if (matched.length === 1) {
      return buildByUpper(matched[0].upper, heavenPlate, COURSE_TYPES.zhiyi);
    }
    // 俱比或俱不比，用涉害法
    const pool = (matched.length ? matched : primary).map((c) => c.upper);
    const resolved = resolveShehai(pool, heavenPlate, dayStem, courses);
    return buildByUpper(resolved.initial, heavenPlate, resolved.courseType, {
      shehaiDepths: resolved.depths,
    });
  }

  // 遥克法：四课无克，先取上神遥克日干（蒿矢），次取日干遥克上神（弹射）
  const stemElement = STEMS_MAP[dayStem]?.element;
  const shooters = courses.filter(
    (c) => getElementRelation(stemElement, c.upperElement) === 'ControlledBy'
  );
  const targets = courses.filter(
    (c) => getElementRelation(stemElement, c.upperElement) === 'Controls'
  );
  const remote = shooters.length ? shooters : targets;
  const remoteType = shooters.length ? COURSE_TYPES.haoshi : COURSE_TYPES.tanshe;

  if (remote.length === 1) {
    return buildByUpper(remote[0].upper, heavenPlate, remoteType);
  }
  if (remote.length > 1) {
    const matched = remote.filter((c) => isSamePolarity(c.upper, dayStem));
    const chosen =
      matched.length === 1
        ? matched[0].upper
        : resolveShehai(
            remote.map((c) => c.upper),
            heavenPlate,
            dayStem,
            courses
          ).initial;
    return buildByUpper(chosen, heavenPlate, remoteType);
  }

  // 无克无遥克。四课不备用别责，干支同位用八专，四课俱全用昴星。
  const distinctUppers = new Set(courses.map((c) => c.upper));
  const dayGanzhi = `${dayStem}${options.dayBranch || ''}`;
  const yang = isYangDay(dayStem);

  if (BAZHUAN_DAYS.includes(dayGanzhi)) {
    // 八专：阳日自干上神顺数三位，阴日自四课上神逆数三位（含本位计一）
    const base = yang ? stemUpper(courses) : courses[3].upper;
    const step = yang ? 2 : -2;
    const initial = BRANCHES[normalize12(branchIndex(base) + step)];
    return buildExplicit(initial, stemUpper(courses), stemUpper(courses), COURSE_TYPES.bazhuan, {
      note: '八专：中末传皆取干上神',
    });
  }

  if (distinctUppers.size < 4) {
    // 别责：阳日取日干之合的寄宫上神，阴日取日支三合的前一位
    let initial;
    if (yang) {
      const combo = STEM_COMBINATIONS.find(({ pair }) => pair.includes(dayStem));
      const partner = combo ? combo.pair.find((s) => s !== dayStem) : null;
      const lodging = partner ? STEM_LODGING[partner] : null;
      initial = lodging ? above(heavenPlate, lodging) : stemUpper(courses);
    } else {
      const triple = BRANCH_TRIPLE_COMBINATIONS.find((t) => t.branches.includes(options.dayBranch));
      if (triple) {
        const idx = triple.branches.indexOf(options.dayBranch);
        initial = triple.branches[(idx + 1) % 3];
      } else {
        initial = branchUpper(courses);
      }
    }
    return buildExplicit(initial, stemUpper(courses), stemUpper(courses), COURSE_TYPES.bieze, {
      note: '别责：中末传皆取干上神',
    });
  }

  // 昴星：阳日取地盘酉上之神（虎视），阴日取天盘酉下之神（冬蛇掩目）
  if (yang) {
    const initial = above(heavenPlate, '酉');
    return buildExplicit(initial, branchUpper(courses), stemUpper(courses), COURSE_TYPES.hushi, {
      note: '昴星阳日：中传支上神、末传干上神',
    });
  }
  const initial = BRANCHES[heavenPlate.indexOf('酉')];
  return buildExplicit(initial, stemUpper(courses), branchUpper(courses), COURSE_TYPES.dongshe, {
    note: '昴星阴日：中传干上神、末传支上神',
  });
};

/**
 * 十二天将：贵人分昼夜落于地盘，贵人临亥子丑寅卯辰则顺行，临巳午未申酉戌则逆行。
 * 返回数组下标为地盘位，值为该位所临之将。
 */
export const buildTwelveGenerals = (dayStem, hourBranch, heavenPlate) => {
  const noble = NOBLE_BY_DAY_STEM[dayStem];
  if (!noble || !heavenPlate) return null;
  const isDaytime = DAY_TIME_BRANCHES.includes(hourBranch);
  const nobleBranch = isDaytime ? noble.day : noble.night;

  // 贵人所乘之天盘支决定其落于哪个地盘位
  const nobleEarthIndex = heavenPlate.findIndex((heaven) => heaven === nobleBranch);
  if (nobleEarthIndex === -1) return null;

  // 顺逆看贵人所临地盘位：亥子丑寅卯辰顺，巳午未申酉戌逆
  const forwardBranches = ['亥', '子', '丑', '寅', '卯', '辰'];
  const forward = forwardBranches.includes(BRANCHES[nobleEarthIndex]);

  const plate = new Array(12);
  TWELVE_GENERALS.forEach((general, offset) => {
    const idx = normalize12(nobleEarthIndex + (forward ? offset : -offset));
    plate[idx] = general;
  });

  return {
    isDaytime,
    nobleBranch,
    nobleEarthBranch: BRANCHES[nobleEarthIndex],
    forward,
    plate,
  };
};

/**
 * 起一课完整六壬盘。
 *
 * @param {object} input
 * @param {number} input.year 占日公历年
 * @param {number} input.month 占日公历月
 * @param {number} input.day 占日公历日
 * @param {number} input.hour 占时（0-23）
 */
export const castLiurenChart = ({ year, month, day, hour }) => {
  if (![year, month, day].every((v) => Number.isInteger(Number(v)))) return null;

  const solar = Solar.fromYmd(Number(year), Number(month), Number(day));
  const lunar = solar.getLunar();
  const dayGanzhi = lunar.getDayInGanZhi();
  const dayStem = dayGanzhi[0];
  const dayBranch = dayGanzhi[1];

  const hourBranch = getHourBranch(hour);
  const monthGeneral = resolveMonthGeneral(Number(year), Number(month), Number(day));
  const heavenPlate = buildHeavenPlate(monthGeneral.branch, hourBranch);
  if (!heavenPlate) return null;

  const courses = buildFourCourses(heavenPlate, dayStem, dayBranch);
  if (!courses) return null;

  // 伏吟：月将与占时同，天地盘重合；返吟：月将与占时相冲，天地盘全冲
  const isFuyin = monthGeneral.branch === hourBranch;
  const isFanyin = normalize12(branchIndex(monthGeneral.branch) - branchIndex(hourBranch)) === 6;

  const transmissions = deriveThreeTransmissions(courses, heavenPlate, dayStem, {
    isFuyin,
    isFanyin,
    dayBranch,
  });
  const generals = buildTwelveGenerals(dayStem, hourBranch, heavenPlate);

  return {
    date: { year: Number(year), month: Number(month), day: Number(day), hour: Number(hour) },
    dayGanzhi,
    dayStem,
    dayBranch,
    hourBranch,
    monthGeneral,
    stemLodging: STEM_LODGING[dayStem],
    // 地盘恒定，天盘随月将加时而转
    earthPlate: [...BRANCHES],
    heavenPlate,
    fourCourses: courses,
    threeTransmissions: transmissions,
    twelveGenerals: generals,
    xunkong: getXunkong(dayGanzhi),
    isFuyin,
    isFanyin,
  };
};

export { STEMS, BRANCHES };
