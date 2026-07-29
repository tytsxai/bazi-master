/**
 * 干支关系判定层。
 *
 * 只做「给定干支，返回它们之间的客观关系」——纳音、藏干、长生、合冲刑害破会、旬空、五行局。
 * 不做吉凶断语，不做强弱评分：那些属于各术数模块自己的口径，放在上层。
 */

import {
  STEMS,
  BRANCHES,
  NAYIN,
  HIDDEN_STEMS,
  TWELVE_STAGE_NAMES,
  TWELVE_STAGE_START,
  STEM_COMBINATIONS,
  STEM_CLASHES,
  BRANCH_SIX_COMBINATIONS,
  BRANCH_TRIPLE_COMBINATIONS,
  BRANCH_DIRECTIONAL_COMBINATIONS,
  BRANCH_CLASHES,
  BRANCH_PUNISHMENTS,
  BRANCH_HARMS,
  BRANCH_DESTRUCTIONS,
  FIVE_ELEMENT_BUREAU,
  SEXAGENARY_CYCLE,
  XUNKONG_BY_DECADE,
} from '../constants/ganzhi.js';

const branchIndex = (branch) => BRANCHES.indexOf(branch);

const normalize12 = (value) => ((value % 12) + 12) % 12;

/** 六十甲子纳音。接受 ('甲', '子') 或 ('甲子')。 */
export const getNayin = (stemOrGanzhi, branch) => {
  const ganzhi = branch ? `${stemOrGanzhi}${branch}` : stemOrGanzhi;
  return NAYIN[ganzhi] || null;
};

/** 地支藏干，顺序为 [本气, 中气, 余气]。 */
export const getHiddenStems = (branch) => HIDDEN_STEMS[branch] || [];

/** 地支本气（藏干之主），十神与五行统计的默认取值。 */
export const getPrimaryHiddenStem = (branch) => {
  const hidden = getHiddenStems(branch);
  return hidden.length ? hidden[0].stem : null;
};

/**
 * 十二长生：给定天干落在某地支上处于哪一位。
 * 阳干自长生顺行，阴干自长生逆行。
 */
export const getTwelveStage = (stem, branch) => {
  const start = TWELVE_STAGE_START[stem];
  const target = branchIndex(branch);
  if (!start || target === -1) return null;
  const startIdx = branchIndex(start.branch);
  const offset = start.forward
    ? normalize12(target - startIdx)
    : normalize12(startIdx - target);
  return { ...TWELVE_STAGE_NAMES[offset], index: offset };
};

/** 天干五合，命中返回合化五行。 */
export const getStemCombination = (stemA, stemB) => {
  return (
    STEM_COMBINATIONS.find(
      ({ pair }) =>
        (pair[0] === stemA && pair[1] === stemB) || (pair[0] === stemB && pair[1] === stemA)
    ) || null
  );
};

/** 天干相冲。 */
export const isStemClash = (stemA, stemB) =>
  STEM_CLASHES.some(
    ([a, b]) => (a === stemA && b === stemB) || (a === stemB && b === stemA)
  );

/**
 * 地支关系全集检测。
 *
 * 入参是一组地支（通常是四柱的年月日时四支，也可以加入大运流年支），
 * 返回其中成立的所有六合/三合/三会/六冲/相刑/相害/相破。
 *
 * 三合与三会按「全见」和「半合」分别标记：三合缺中神（子午卯酉）只作半合，
 * 力量不同，断命时要能区分，所以这里不合并成一个布尔。
 */
export const detectBranchRelations = (branches = []) => {
  const list = branches.filter((b) => branchIndex(b) !== -1);
  const has = (branch) => list.includes(branch);
  const countOf = (branch) => list.filter((b) => b === branch).length;

  const sixCombinations = BRANCH_SIX_COMBINATIONS.filter(
    ({ pair }) => has(pair[0]) && has(pair[1])
  );

  const tripleCombinations = [];
  const halfCombinations = [];
  BRANCH_TRIPLE_COMBINATIONS.forEach((entry) => {
    const present = entry.branches.filter(has);
    if (present.length === 3) {
      tripleCombinations.push(entry);
    } else if (present.length === 2 && present.includes(entry.center)) {
      // 半合必须带中神，缺中神的两支（如申辰）不成局
      halfCombinations.push({ ...entry, present, cn: `${present.join('')}半合${entry.transform}` });
    }
  });

  const directional = BRANCH_DIRECTIONAL_COMBINATIONS.filter(({ branches: trio }) =>
    trio.every(has)
  );

  const clashes = BRANCH_CLASHES.filter(([a, b]) => has(a) && has(b)).map(([a, b]) => ({
    pair: [a, b],
    cn: `${a}${b}相冲`,
  }));

  const punishments = [];
  BRANCH_PUNISHMENTS.triple.forEach((entry) => {
    const present = entry.branches.filter(has);
    if (present.length === 3) {
      punishments.push({ type: 'triple', branches: entry.branches, cn: entry.cn });
    } else if (present.length === 2) {
      punishments.push({ type: 'partial', branches: present, cn: `${present.join('')}相刑` });
    }
  });
  BRANCH_PUNISHMENTS.mutual.forEach((entry) => {
    if (entry.pair.every(has)) {
      punishments.push({ type: 'mutual', branches: entry.pair, cn: entry.cn });
    }
  });
  BRANCH_PUNISHMENTS.self.forEach((branch) => {
    if (countOf(branch) >= 2) {
      punishments.push({ type: 'self', branches: [branch, branch], cn: `${branch}${branch}自刑` });
    }
  });

  const harms = BRANCH_HARMS.filter(([a, b]) => has(a) && has(b)).map(([a, b]) => ({
    pair: [a, b],
    cn: `${a}${b}相害`,
  }));

  const destructions = BRANCH_DESTRUCTIONS.filter(([a, b]) => has(a) && has(b)).map(([a, b]) => ({
    pair: [a, b],
    cn: `${a}${b}相破`,
  }));

  return {
    sixCombinations,
    tripleCombinations,
    halfCombinations,
    directional,
    clashes,
    punishments,
    harms,
    destructions,
  };
};

/** 天干关系检测，用于四柱天干之间的合与冲。 */
export const detectStemRelations = (stems = []) => {
  const combinations = [];
  const clashes = [];
  for (let i = 0; i < stems.length; i += 1) {
    for (let j = i + 1; j < stems.length; j += 1) {
      const combo = getStemCombination(stems[i], stems[j]);
      if (combo) combinations.push({ ...combo, positions: [i, j] });
      if (isStemClash(stems[i], stems[j])) {
        clashes.push({ pair: [stems[i], stems[j]], positions: [i, j], cn: `${stems[i]}${stems[j]}相冲` });
      }
    }
  }
  return { combinations, clashes };
};

/**
 * 旬空（空亡）：定出干支所属之旬，返回该旬的两个空亡地支。
 * 六爻断卦与八字论空亡都用这个。
 */
export const getXunkong = (stemOrGanzhi, branch) => {
  const ganzhi = branch ? `${stemOrGanzhi}${branch}` : stemOrGanzhi;
  const index = SEXAGENARY_CYCLE.indexOf(ganzhi);
  if (index === -1) return null;
  const decadeHead = SEXAGENARY_CYCLE[Math.floor(index / 10) * 10];
  return { decade: decadeHead, branches: XUNKONG_BY_DECADE[decadeHead] || [] };
};

/** 判断某地支对给定干支而言是否落空亡。 */
export const isXunkong = (dayGanzhi, targetBranch) => {
  const xunkong = getXunkong(dayGanzhi);
  return xunkong ? xunkong.branches.includes(targetBranch) : false;
};

/**
 * 五行局：紫微斗数取命宫干支的纳音五行定局。
 * 局数同时决定紫微星起宫与大限的步长，错了整盘皆错。
 */
export const getFiveElementBureau = (stem, branch) => {
  const nayin = getNayin(stem, branch);
  if (!nayin) return null;
  const bureau = FIVE_ELEMENT_BUREAU[nayin.element];
  if (!bureau) return null;
  return { ...bureau, nayin: nayin.name, element: nayin.element };
};

/** 由甲子数还原干支，index 可为任意整数（自动取模）。 */
export const ganzhiFromIndex = (index) => {
  const safe = ((Math.trunc(index) % 60) + 60) % 60;
  return SEXAGENARY_CYCLE[safe];
};

/** 干支在六十甲子中的序号，非法输入返回 -1。 */
export const ganzhiToIndex = (stemOrGanzhi, branch) => {
  const ganzhi = branch ? `${stemOrGanzhi}${branch}` : stemOrGanzhi;
  return SEXAGENARY_CYCLE.indexOf(ganzhi);
};

export { STEMS, BRANCHES };
