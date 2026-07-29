/**
 * 合盘：两张八字盘之间的关系。
 *
 * 旧实现只比日主与日支的**五行**，注释里自认「for now we'll do a basic element check」——
 * 而合婚最吃重的恰恰是日支（夫妻宫）之间的**六合、三合、六冲、相刑**，那是地支之间的
 * 具体关系，不是五行生克能替代的：子与丑同为「水生土」之外还六合，子与午同是「水克火」
 * 之外还相冲，五行看不出这个差别。干支基础层齐备之后，这里改为按真实的干支关系论。
 *
 * 口径：score 是把下面这些客观关系按权重折算出来的，权重列在 WEIGHTS 里，改口径只改那一处。
 * 断语不出这里 —— insights 给的是「哪两柱成了什么关系」这类事实，不是「你们很般配」。
 */

import { STEMS_MAP, BRANCHES_MAP, ELEMENTS } from '../constants/stems.js';
import { getElementRelation, getTenGod } from './bazi.service.js';
import { detectBranchRelations, getNayin } from './ganzhi.service.js';

/**
 * 各项关系的计分权重。
 *
 * 日支（夫妻宫）之间的关系权重最高，这是合婚的主位；日主次之；其余柱位再次。
 * 合与冲不是简单的「好」与「坏」—— 冲主动荡、合主亲近，但过合亦有牵绊，
 * 所以这里只按「和谐度」折算成一个可比的数，具体吉凶留给调用方。
 */
const WEIGHTS = {
  dayBranchSixCombination: 30,
  dayBranchTripleCombination: 25,
  dayBranchHalfCombination: 15,
  dayBranchClash: -20,
  dayBranchPunishment: -15,
  dayBranchHarm: -10,
  dayMasterGenerates: 25,
  dayMasterSame: 18,
  dayMasterControls: 8,
  crossPillarCombination: 5,
  crossPillarClash: -5,
  elementComplement: 10,
};

const PILLARS = ['year', 'month', 'day', 'hour'];

const pillarChars = (chart) =>
  PILLARS.map((position) => ({
    position,
    stem: chart.pillars?.[position]?.charStem,
    branch: chart.pillars?.[position]?.charBranch,
  })).filter((p) => p.stem && p.branch);

/**
 * 夫妻宫：两人日支之间的关系。合婚的主位，单独拎出来算。
 */
const analyzeSpousePalace = (branchA, branchB) => {
  if (!branchA || !branchB) return null;
  const relations = detectBranchRelations([branchA, branchB]);
  const found = [];

  relations.sixCombinations.forEach((c) =>
    found.push({
      type: 'sixCombination',
      cn: c.cn,
      transform: c.transform,
      weight: WEIGHTS.dayBranchSixCombination,
    })
  );
  relations.tripleCombinations.forEach((c) =>
    found.push({ type: 'tripleCombination', cn: c.cn, weight: WEIGHTS.dayBranchTripleCombination })
  );
  relations.halfCombinations.forEach((c) =>
    found.push({ type: 'halfCombination', cn: c.cn, weight: WEIGHTS.dayBranchHalfCombination })
  );
  relations.clashes.forEach((c) =>
    found.push({ type: 'clash', cn: c.cn, weight: WEIGHTS.dayBranchClash })
  );
  relations.punishments.forEach((p) =>
    found.push({ type: 'punishment', cn: p.cn, weight: WEIGHTS.dayBranchPunishment })
  );
  relations.harms.forEach((h) =>
    found.push({ type: 'harm', cn: h.cn, weight: WEIGHTS.dayBranchHarm })
  );

  return {
    branchA,
    branchB,
    elementA: BRANCHES_MAP[branchA]?.element || null,
    elementB: BRANCHES_MAP[branchB]?.element || null,
    relations: found,
  };
};

/** 日主之间：五行生克 + 互看十神。 */
const analyzeDayMasters = (stemA, stemB) => {
  if (!stemA || !stemB) return null;
  const elementA = STEMS_MAP[stemA]?.element;
  const elementB = STEMS_MAP[stemB]?.element;
  const relation = getElementRelation(elementA, elementB);

  let weight = 0;
  if (relation === 'Generates' || relation === 'GeneratedBy') weight = WEIGHTS.dayMasterGenerates;
  else if (relation === 'Same') weight = WEIGHTS.dayMasterSame;
  else if (relation === 'Controls' || relation === 'ControlledBy')
    weight = WEIGHTS.dayMasterControls;

  return {
    stemA,
    stemB,
    elementA,
    elementB,
    relation,
    // 互看十神：A 眼中的 B 是什么，B 眼中的 A 是什么，两边并不对称
    tenGodAtoB: getTenGod(stemA, stemB),
    tenGodBtoA: getTenGod(stemB, stemA),
    weight,
  };
};

/** 四柱交叉：A 的每一柱地支与 B 的每一柱地支之间的合与冲。 */
const analyzeCrossPillars = (charsA, charsB) => {
  const found = [];
  charsA.forEach((a) => {
    charsB.forEach((b) => {
      const relations = detectBranchRelations([a.branch, b.branch]);
      relations.sixCombinations.forEach((c) =>
        found.push({ a: a.position, b: b.position, type: 'sixCombination', cn: c.cn })
      );
      relations.clashes.forEach((c) =>
        found.push({ a: a.position, b: b.position, type: 'clash', cn: c.cn })
      );
    });
  });
  return found;
};

/**
 * 五行互补：一方所缺，另一方是否补得上。
 *
 * 用的是 analysis.weightedElements（藏干加权）而非旧的干支个数百分比 ——
 * 后者把「地支只数本气」的粗略统计当成了五行分布，缺什么补什么因此常判错。
 * 拿不到加权数据时退回百分比，并在返回里标出用的是哪一种。
 */
const analyzeElementComplement = (chartA, chartB) => {
  const pick = (chart) => {
    const weighted = chart.analysis?.weightedElements?.percent;
    if (weighted) return { source: 'weighted', percent: weighted };
    return { source: 'countBased', percent: chart.fiveElementsPercent || {} };
  };

  const a = pick(chartA);
  const b = pick(chartB);
  const supplies = [];

  const check = (lacking, supplier, direction) => {
    ELEMENTS.forEach((element) => {
      const own = lacking.percent[element] || 0;
      const other = supplier.percent[element] || 0;
      if (own < 10 && other > 30) {
        supplies.push({ element, direction, ownPercent: own, otherPercent: other });
      }
    });
  };
  check(a, b, 'BtoA');
  check(b, a, 'AtoB');

  return { source: a.source === b.source ? a.source : 'mixed', supplies };
};

export const calculateCompatibility = (chartA, chartB) => {
  if (!chartA || !chartB || !chartA.pillars || !chartB.pillars) {
    throw new Error('Invalid chart data for comparison');
  }

  const charsA = pillarChars(chartA);
  const charsB = pillarChars(chartB);
  const dayA = chartA.pillars.day;
  const dayB = chartB.pillars.day;

  const dayMasters = analyzeDayMasters(dayA?.charStem, dayB?.charStem);
  const spousePalace = analyzeSpousePalace(dayA?.charBranch, dayB?.charBranch);
  const crossPillars = analyzeCrossPillars(charsA, charsB);
  const elementComplement = analyzeElementComplement(chartA, chartB);

  // 计分：基准 50，各项关系按权重增减，最后夹到 0..100
  let score = 50;
  const insights = [];

  if (dayMasters) {
    score += dayMasters.weight;
    insights.push({
      area: 'dayMaster',
      cn: `日主 ${dayMasters.stemA} 与 ${dayMasters.stemB}：${dayMasters.relation}`,
      detail: `互看十神 ${dayMasters.tenGodAtoB?.cn || '?'} / ${dayMasters.tenGodBtoA?.cn || '?'}`,
    });
  }

  (spousePalace?.relations || []).forEach((relation) => {
    score += relation.weight;
    insights.push({ area: 'spousePalace', cn: `夫妻宫${relation.cn}`, type: relation.type });
  });

  crossPillars.forEach((relation) => {
    score += relation.type === 'clash' ? WEIGHTS.crossPillarClash : WEIGHTS.crossPillarCombination;
    insights.push({
      area: 'crossPillar',
      cn: `${relation.a}柱与对方${relation.b}柱${relation.cn}`,
    });
  });

  elementComplement.supplies.forEach((supply) => {
    score += WEIGHTS.elementComplement;
    insights.push({
      area: 'elementComplement',
      cn: `${supply.direction === 'BtoA' ? '乙方' : '甲方'}补${supply.element}`,
      detail: `对方 ${supply.otherPercent}% / 自身 ${supply.ownPercent}%`,
    });
  });

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    insights,
    dayMasters,
    spousePalace,
    crossPillars,
    elementComplement,
    nayin: {
      a: getNayin(dayA?.charStem, dayA?.charBranch),
      b: getNayin(dayB?.charStem, dayB?.charBranch),
    },
    // 计分口径随代码走，调用方要自定权重时照这份改
    weights: WEIGHTS,
    details: {
      dayMasterRelation: dayMasters
        ? `${dayMasters.elementA} 与 ${dayMasters.elementB}：${dayMasters.relation}`
        : '',
      dayBranchRelation: spousePalace
        ? spousePalace.relations.map((r) => r.cn).join('、') || '无合无冲'
        : '',
      elementBalance: `互补 ${elementComplement.supplies.length} 项（${elementComplement.source}）`,
    },
  };
};
