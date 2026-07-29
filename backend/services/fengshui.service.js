/**
 * 八宅风水、择吉、姓名五格。
 *
 * 三者共性是「规则明确、可逐条验证」，故合于一处。都只做结构：
 * 八宅给出命卦与八方游年星，择吉给出当日的建除、值宿、吉神凶煞，
 * 姓名给出五格与三才配置 —— 吉凶断语一概不下，那属于调用方。
 */

import { Solar } from 'lunar-javascript';

import {
  TRIGRAM_LINES,
  TRIGRAM_BY_NUMBER,
  YOUNIAN_SEQUENCE,
  GROUP_NAMES,
  NUMBER_ELEMENTS,
} from '../constants/bazhai.js';
import { getElementRelation } from './bazi.service.js';

const linesKey = (lines) => lines.join('');

const TRIGRAM_BY_LINES = Object.entries(TRIGRAM_LINES).reduce((acc, [cn, lines]) => {
  acc[linesKey(lines)] = cn;
  return acc;
}, {});

/** 数字各位相加，反复至个位。 */
const digitalRoot = (value) => {
  let n = Math.abs(Math.trunc(value));
  while (n > 9) {
    n = String(n)
      .split('')
      .reduce((sum, d) => sum + Number(d), 0);
  }
  return n;
};

/**
 * 本命卦（三元命卦）。
 *
 * 年份四位相加至个位得 N：男取 11 − N，女取 N + 4（逾九减九）。
 * 得五者男寄坤二、女寄艮八 —— 中五宫无卦，必须寄出去。
 *
 * 年以**立春**为界，不是元旦：正月初的生日可能仍属上一年，这里按节气年取。
 */
export const resolveLifeTrigram = (birthYear, gender, { birthMonth, birthDay } = {}) => {
  let year = Number(birthYear);
  if (!Number.isFinite(year)) return null;

  // 立春前算作上一年
  if (Number.isFinite(Number(birthMonth)) && Number.isFinite(Number(birthDay))) {
    const lunar = Solar.fromYmd(year, Number(birthMonth), Number(birthDay)).getLunar();
    year = lunar.getYearInGanZhiByLiChun
      ? Solar.fromYmd(year, Number(birthMonth), Number(birthDay)).getLunar().getYear()
      : year;
    const table = lunar.getJieQiTable();
    const lichun = table['立春'];
    if (lichun) {
      const lichunDate = new Date(lichun.getYear(), lichun.getMonth() - 1, lichun.getDay());
      const target = new Date(Number(birthYear), Number(birthMonth) - 1, Number(birthDay));
      year = target < lichunDate ? Number(birthYear) - 1 : Number(birthYear);
    }
  }

  const male = String(gender || '').toLowerCase() === 'male';
  const root = digitalRoot(year);
  let number = male ? 11 - root : root + 4;
  if (number > 9) number -= 9;
  if (number === 5) number = male ? 2 : 8;
  if (number === 0) number = 9;

  const trigram = TRIGRAM_BY_NUMBER[number];
  if (!trigram) return null;
  return {
    number,
    ...trigram,
    solarYearUsed: year,
    group: trigram.group,
    groupCn: GROUP_NAMES[trigram.group].cn,
  };
};

/**
 * 八方游年星：自本命卦起依次变上、中、下、中、上、中、下、中爻，
 * 顺次得生气、五鬼、延年、六煞、祸害、天医、绝命、伏位。
 */
export const buildYounianMap = (trigramCn) => {
  const base = TRIGRAM_LINES[trigramCn];
  if (!base) return null;

  let lines = [...base];
  const result = [];
  YOUNIAN_SEQUENCE.forEach(({ flip, star }) => {
    lines = lines.map((bit, i) => (i === flip - 1 ? (bit ? 0 : 1) : bit));
    const cn = TRIGRAM_BY_LINES[linesKey(lines)];
    const meta = Object.values(TRIGRAM_BY_NUMBER).find((t) => t.cn === cn);
    result.push({
      trigram: cn,
      direction: meta?.direction || null,
      star,
    });
  });
  return result;
};

/** 八宅盘：命卦 + 八方吉凶。 */
export const buildBazhaiChart = ({ birthYear, birthMonth, birthDay, gender }) => {
  const life = resolveLifeTrigram(birthYear, gender, { birthMonth, birthDay });
  if (!life) return null;
  const younian = buildYounianMap(life.cn);
  return {
    lifeTrigram: life,
    younian,
    auspiciousDirections: younian.filter((y) => y.star.auspicious).map((y) => y.direction),
    inauspiciousDirections: younian.filter((y) => !y.star.auspicious).map((y) => y.direction),
    suitableHouseGroup: GROUP_NAMES[life.group],
  };
};

/**
 * 择日：当日的建除十二神、值宿、吉神凶煞、彭祖百忌。
 *
 * 这些历注由 lunar-javascript 提供 —— 它已经是一份经过验证的实现，
 * 重写一遍只会多一处出错的地方。本函数负责的是把它组织成稳定的响应结构。
 */
export const buildAlmanac = ({ year, month, day }) => {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (![y, m, d].every(Number.isFinite)) return null;

  const solar = Solar.fromYmd(y, m, d);
  const lunar = solar.getLunar();

  return {
    date: { year: y, month: m, day: d },
    ganzhi: {
      year: lunar.getYearInGanZhi(),
      month: lunar.getMonthInGanZhi(),
      day: lunar.getDayInGanZhi(),
    },
    lunarDate: {
      year: lunar.getYear(),
      month: lunar.getMonth(),
      day: lunar.getDay(),
      monthCn: lunar.getMonthInChinese(),
      dayCn: lunar.getDayInChinese(),
    },
    zhiXing: lunar.getZhiXing(),
    xiu: {
      name: lunar.getXiu(),
      luck: lunar.getXiuLuck(),
      animal: lunar.getAnimal(),
      gong: lunar.getGong(),
      zheng: lunar.getZheng(),
    },
    auspiciousGods: lunar.getDayJiShen(),
    inauspiciousGods: lunar.getDayXiongSha(),
    pengzu: { gan: lunar.getPengZuGan(), zhi: lunar.getPengZuZhi() },
    dayLu: lunar.getDayLu(),
    festivals: lunar.getFestivals(),
  };
};

/**
 * 姓名五格。
 *
 * **笔画数由调用方提供**，引擎不内置字典。五格的算法是确定的，笔画数却不是：
 * 康熙笔画与现代简体笔画差异很大，部首另有独立算法（如「氵」按「水」计四画），
 * 内置一份来路不明的笔画表只会让结果看着精确、实则不可追溯。
 *
 * @param {number[]} surnameStrokes 姓的逐字笔画
 * @param {number[]} givenNameStrokes 名的逐字笔画
 */
export const buildNameGrids = (surnameStrokes, givenNameStrokes) => {
  const surname = (surnameStrokes || []).map(Number).filter(Number.isFinite);
  const given = (givenNameStrokes || []).map(Number).filter(Number.isFinite);
  if (!surname.length || !given.length) return null;

  const sum = (arr) => arr.reduce((a, b) => a + b, 0);

  // 单姓天格加一虚位，复姓则两字相加
  const heaven = surname.length === 1 ? surname[0] + 1 : sum(surname);
  const human = surname[surname.length - 1] + given[0];
  // 单名地格加一虚位
  const earth = given.length === 1 ? given[0] + 1 : sum(given);
  const total = sum(surname) + sum(given);
  const outer = total - human + 1;

  const toElement = (n) => NUMBER_ELEMENTS[n % 10];
  const grids = { heaven, human, earth, outer, total };

  const sancai = {
    heaven: toElement(heaven),
    human: toElement(human),
    earth: toElement(earth),
  };
  // 三才配置的相生相克关系：天生人、人生地为顺
  const relations = {
    heavenToHuman: getElementRelation(sancai.heaven, sancai.human),
    humanToEarth: getElementRelation(sancai.human, sancai.earth),
  };

  return {
    strokes: { surname, given },
    grids,
    gridElements: {
      heaven: sancai.heaven,
      human: sancai.human,
      earth: sancai.earth,
      outer: toElement(outer),
      total: toElement(total),
    },
    sancai,
    sancaiRelations: relations,
  };
};
