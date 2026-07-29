/**
 * 节气基座：给一个精确到分的时刻，定出它落在哪个节气（或中气）里。
 *
 * 这一层存在的理由是**口径统一**。奇门定局、六壬换将、八宅定命卦年，三者都要判节气，
 * 此前各写了一遍，且都只比到「日」—— 于是同一个引擎里出现了两套节气口径：
 * 八字按交节时刻换柱，其余按当日零点换。同一张生辰在不同体系里落进不同的节气，
 * 这类错误不会报错，只会让盘悄悄错掉。
 *
 * 两个坑在这里一次性处理掉，各体系不必再各踩一遍：
 *
 * **一、`getJieQiTable()` 的键里混着拼音。** 表有 31 项：24 个中文键覆盖本区间，
 * 另有 7 个拼音键（`DA_XUE` 是上一年的大雪，`DONG_ZHI` 起是下一年的）。
 * 只遍历中文键会漏掉跨年那一段 —— 实测后果是**每年冬至到年末约十天，奇门判成大雪**，
 * 而冬至正是阴遁转阳遁的分界，整盘阴阳颠倒。
 *
 * **二、`getPrevJieQi()` 不精确到时刻。** 它按日比较：2024 立春在 2/4 16:27，
 * 而 2/4 10:00 问它也答「立春」。要时刻级判定只能自己比。
 *
 * 比较一律走**墙钟数值**（`YYYYMMDDHHmm` 拼成的整数），不经 `Date`：
 * lunar-javascript 给出的节气时刻是东八区墙钟，服务器 TZ 不一定是 +08，
 * 一旦经 `new Date(y, m-1, d)` 就会随部署环境漂移。数值比较没有这个问题。
 */

import { Solar } from 'lunar-javascript';

/**
 * `getJieQiTable()` 里的拼音键 → 中文名。
 * 这些是跨到相邻年的那一份，中文键与它们同名但属于不同年份，故不能靠名字去重，
 * 只能靠时刻。
 */
const PINYIN_ALIAS = {
  DA_XUE: '大雪',
  DONG_ZHI: '冬至',
  XIAO_HAN: '小寒',
  DA_HAN: '大寒',
  LI_CHUN: '立春',
  YU_SHUI: '雨水',
  JING_ZHE: '惊蛰',
};

/**
 * 十二中气。二十四节气里节、气相间，逢单为节、逢双为气。
 * 六壬换将只认气不认节，故单列。
 */
export const MID_QI_NAMES = new Set([
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
]);

/** 把年月日时分压成可比较的整数。纯墙钟，不涉时区。 */
const wallClock = (year, month, day, hour = 0, minute = 0) =>
  Number(year) * 100000000 +
  Number(month) * 1000000 +
  Number(day) * 10000 +
  Number(hour) * 100 +
  Number(minute);

const termFromSolar = (name, solar) => ({
  name,
  isMidQi: MID_QI_NAMES.has(name),
  at: {
    year: solar.getYear(),
    month: solar.getMonth(),
    day: solar.getDay(),
    hour: solar.getHour(),
    minute: solar.getMinute(),
    second: solar.getSecond(),
  },
  /** 东八区墙钟，不带偏移后缀 —— 它不是某个瞬时的 UTC 表示。 */
  iso: solar.toYmdHms(),
  key: wallClock(
    solar.getYear(),
    solar.getMonth(),
    solar.getDay(),
    solar.getHour(),
    solar.getMinute()
  ),
});

const tableAt = (year, month, day) => {
  const table = Solar.fromYmd(year, month, day).getLunar().getJieQiTable();
  return Object.entries(table).map(([rawName, solar]) =>
    termFromSolar(PINYIN_ALIAS[rawName] || rawName, solar)
  );
};

/**
 * 覆盖目标日期前后的全部节气，按时刻升序，去重。
 *
 * 取三个锚点的表再合并：单张表虽然跨了年，但两端各有一截是靠拼音键补的，
 * 边界上仍可能差一两个节气。三张表合并后，目标日期前后至少各有整整一年，
 * 找「不晚于目标时刻的最后一个节气」永远有解。
 */
const collectTerms = (year, month, day) => {
  const merged = new Map();
  [tableAt(year - 1, 6, 15), tableAt(year, month, day), tableAt(year + 1, 6, 15)]
    .flat()
    .forEach((term) => {
      // 同一时刻的节气在多张表里会重复出现，按时刻去重
      if (!merged.has(term.key)) merged.set(term.key, term);
    });
  return [...merged.values()].sort((a, b) => a.key - b.key);
};

/**
 * 定出某时刻所处的节气 —— 即不晚于该时刻的最后一个节气。
 *
 * 时刻**恰好等于**交节时刻时算作已交节，与八字换柱口径一致。
 *
 * @param {object} moment 公历年月日时分。时分缺省为 0 点，
 *   即退化成「当日零点」的日级判定 —— 交节当天会偏向上一个节气。
 * @param {object} [options]
 * @param {boolean} [options.midQiOnly] 只在十二中气里找（六壬换将用）
 * @returns {object|null} 节气名、是否中气、交节时刻，以及距交节的天数
 */
export const resolveSolarTerm = (
  { year, month, day, hour = 0, minute = 0 } = {},
  { midQiOnly = false } = {}
) => {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (![y, m, d].every(Number.isFinite)) return null;

  const target = wallClock(y, m, d, Number(hour) || 0, Number(minute) || 0);
  const terms = collectTerms(y, m, d).filter((term) => !midQiOnly || term.isMidQi);

  let found = null;
  terms.forEach((term) => {
    if (term.key <= target) found = term;
  });
  if (!found) return null;

  const startSolar = Solar.fromYmd(found.at.year, found.at.month, found.at.day);
  const targetSolar = Solar.fromYmd(y, m, d);
  return {
    name: found.name,
    isMidQi: found.isMidQi,
    at: { ...found.at },
    iso: found.iso,
    /** 自交节当日起算的天数，交节当天为 0。定三元、算元内序数要用。 */
    daysSinceTerm: targetSolar.subtract(startSolar),
  };
};

/** 某公历年的立春时刻。年柱与八宅命卦都以它为年界。 */
export const resolveLiChun = (year) => {
  const y = Number(year);
  if (!Number.isFinite(y)) return null;
  return collectTerms(y, 6, 15).find((term) => term.name === '立春' && term.at.year === y) || null;
};

/**
 * 立春年：年柱、八宅命卦都以立春为界，不以元旦为界。
 *
 * 时分缺省时按当日零点判 —— 立春当天出生而未给出时刻的，会被算进上一年。
 * 调用方应把这种「精度不足」如实告知使用者，不要让它看着像确定结果。
 */
export const resolveLiChunYear = ({ year, month, day, hour = 0, minute = 0 } = {}) => {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (![y, m, d].every(Number.isFinite)) return null;

  const lichun = resolveLiChun(y);
  if (!lichun) return null;
  return wallClock(y, m, d, Number(hour) || 0, Number(minute) || 0) >= lichun.key ? y : y - 1;
};

/** 供测试与排查用：某公历年前后的全部节气，按时刻升序。 */
export const listSolarTerms = (year) => collectTerms(Number(year), 6, 15);
