/**
 * 八字断命层：在四柱之上做藏干加权、旺衰、用神、神煞与刑冲合会。
 *
 * 与 calculations.service 的分工：那边负责「排出四柱」（走 lunar-javascript，节气换月与
 * 五鼠遁时由库保证），这边负责「拿四柱断命」。两边不互相 import 断命逻辑，避免循环依赖。
 *
 * 口径声明（有流派分歧的地方，本模块选定如下，换流派只改这里）：
 * - 藏干力量：本气 0.6 / 中气 0.3 / 余气 0.1（见 constants/ganzhi.js）
 * - 月令当权：月支力量 ×2，其余三支等权
 * - 旺衰：同党（比劫+印）对全局占比，>55% 身强、<45% 身弱、之间为中和
 * - 用神：扶抑法（身强用克泄耗，身弱用生扶）。调候、病药、通关法未实现
 */

import { STEMS_MAP, ELEMENTS } from '../constants/stems.js';
import {
  getHiddenStems,
  getNayin,
  getTwelveStage,
  detectBranchRelations,
  detectStemRelations,
  getXunkong,
} from './ganzhi.service.js';
import {
  TIANYI_NOBLE,
  WENCHANG_NOBLE,
  LUSHEN,
  YANGREN,
  BRANCH_GROUP_SHENSHA,
  GUCHEN_GUASU,
  KUIGANG,
  SHENSHA_META,
} from '../constants/shensha.js';

/** 月令当权，力量加倍。这是扶抑法里最吃重的一个系数。 */
const MONTH_BRANCH_MULTIPLIER = 2;

const STRONG_THRESHOLD = 0.55;
const WEAK_THRESHOLD = 0.45;

export const getElementRelation = (me, other) => {
  if (me === other) return 'Same';
  const meIdx = ELEMENTS.indexOf(me);
  const otherIdx = ELEMENTS.indexOf(other);
  if (meIdx === -1 || otherIdx === -1) return 'Unknown';
  if ((meIdx + 1) % 5 === otherIdx) return 'Generates';
  if ((otherIdx + 1) % 5 === meIdx) return 'GeneratedBy';
  if ((meIdx + 2) % 5 === otherIdx) return 'Controls';
  if ((otherIdx + 2) % 5 === meIdx) return 'ControlledBy';
  return 'Unknown';
};

export const TEN_GODS = {
  bijian: { key: 'bijian', cn: '比肩', name: 'Friend (Bi Jian)' },
  jiecai: { key: 'jiecai', cn: '劫财', name: 'Rob Wealth (Jie Cai)' },
  shishen: { key: 'shishen', cn: '食神', name: 'Eating God (Shi Shen)' },
  shangguan: { key: 'shangguan', cn: '伤官', name: 'Hurting Officer (Shang Guan)' },
  pianyin: { key: 'pianyin', cn: '偏印', name: 'Indirect Resource (Pian Yin)' },
  zhengyin: { key: 'zhengyin', cn: '正印', name: 'Direct Resource (Zheng Yin)' },
  piancai: { key: 'piancai', cn: '偏财', name: 'Indirect Wealth (Pian Cai)' },
  zhengcai: { key: 'zhengcai', cn: '正财', name: 'Direct Wealth (Zheng Cai)' },
  qisha: { key: 'qisha', cn: '七杀', name: 'Seven Killings (Qi Sha)' },
  zhengguan: { key: 'zhengguan', cn: '正官', name: 'Direct Officer (Zheng Guan)' },
};

/**
 * 十神：以日主为我，看目标天干与我的五行生克及阴阳异同。
 * 同性为偏（比肩/食神/偏印/偏财/七杀），异性为正（劫财/伤官/正印/正财/正官）。
 */
export const getTenGod = (dayMasterStem, targetStem) => {
  const dm = STEMS_MAP[dayMasterStem];
  const target = STEMS_MAP[targetStem];
  if (!dm || !target) return null;
  const relation = getElementRelation(dm.element, target.element);
  const same = dm.polarity === target.polarity;
  switch (relation) {
    case 'Same':
      return same ? TEN_GODS.bijian : TEN_GODS.jiecai;
    case 'Generates':
      return same ? TEN_GODS.shishen : TEN_GODS.shangguan;
    case 'GeneratedBy':
      return same ? TEN_GODS.pianyin : TEN_GODS.zhengyin;
    case 'Controls':
      return same ? TEN_GODS.piancai : TEN_GODS.zhengcai;
    case 'ControlledBy':
      return same ? TEN_GODS.qisha : TEN_GODS.zhengguan;
    default:
      return null;
  }
};

/**
 * 逐柱展开：天干十神、地支藏干及各自十神、纳音、日主在该支的十二长生。
 * 旧实现每支只取本气一个十神，中气余气整个丢掉，这里全数展开。
 */
export const buildPillarDetails = (pillars, dayMasterStem) => {
  const positions = ['year', 'month', 'day', 'hour'];
  return positions.reduce((acc, position) => {
    const pillar = pillars[position];
    if (!pillar) return acc;
    const stem = pillar.charStem;
    const branch = pillar.charBranch;
    acc[position] = {
      stem,
      branch,
      ganzhi: `${stem}${branch}`,
      stemTenGod: position === 'day' ? { key: 'rizhu', cn: '日主', name: 'Day Master' } : getTenGod(dayMasterStem, stem),
      hiddenStems: getHiddenStems(branch).map((hidden) => ({
        ...hidden,
        element: STEMS_MAP[hidden.stem]?.element || null,
        tenGod: getTenGod(dayMasterStem, hidden.stem),
      })),
      nayin: getNayin(stem, branch),
      twelveStage: getTwelveStage(dayMasterStem, branch),
    };
    return acc;
  }, {});
};

/**
 * 藏干加权五行力量。
 *
 * 天干各计 1 分；地支按藏干权重分配 1 分；月支整体 ×2（当令）。
 * 返回原始分与归一化百分比，断旺衰用的是这里的分数，不是干支个数。
 */
export const calculateWeightedElements = (pillars) => {
  const scores = ELEMENTS.reduce((acc, element) => ({ ...acc, [element]: 0 }), {});
  const add = (element, weight) => {
    if (element && scores[element] !== undefined) scores[element] += weight;
  };

  ['year', 'month', 'day', 'hour'].forEach((position) => {
    const pillar = pillars[position];
    if (!pillar) return;
    const multiplier = position === 'month' ? MONTH_BRANCH_MULTIPLIER : 1;
    add(STEMS_MAP[pillar.charStem]?.element, 1 * multiplier);
    getHiddenStems(pillar.charBranch).forEach((hidden) => {
      add(STEMS_MAP[hidden.stem]?.element, hidden.weight * multiplier);
    });
  });

  const total = Object.values(scores).reduce((sum, value) => sum + value, 0);
  const percent = ELEMENTS.reduce((acc, element) => {
    acc[element] = total ? Math.round((scores[element] / total) * 1000) / 10 : 0;
    return acc;
  }, {});
  const rounded = ELEMENTS.reduce((acc, element) => {
    acc[element] = Math.round(scores[element] * 100) / 100;
    return acc;
  }, {});

  return { scores: rounded, percent, total: Math.round(total * 100) / 100 };
};

/**
 * 身强身弱：同党（比肩劫财 + 正偏印）力量占全局比重。
 *
 * 这是扶抑法的量化实现。得令（月支藏干含日主同党）单独标出，因为月令是旺衰第一决定因素，
 * 调用方可能要单独看这一项。
 */
export const determineStrength = (pillars, dayMasterStem) => {
  const dmElement = STEMS_MAP[dayMasterStem]?.element;
  if (!dmElement) return null;

  const { scores, total } = calculateWeightedElements(pillars);
  // 同党：与我同类（比劫）+ 生我者（印）
  const allyElements = ELEMENTS.filter((element) => {
    const relation = getElementRelation(dmElement, element);
    return relation === 'Same' || relation === 'GeneratedBy';
  });
  const allyScore = allyElements.reduce((sum, element) => sum + scores[element], 0);
  const ratio = total ? allyScore / total : 0;

  let level = 'balanced';
  if (ratio > STRONG_THRESHOLD) level = 'strong';
  else if (ratio < WEAK_THRESHOLD) level = 'weak';

  // 得令：月支藏干中是否有日主的同党
  const monthBranch = pillars.month?.charBranch;
  const monthHidden = getHiddenStems(monthBranch);
  const hasSeasonalSupport = monthHidden.some((hidden) =>
    allyElements.includes(STEMS_MAP[hidden.stem]?.element)
  );
  // 得地：年日时三支中有本气为同党者
  const rootedIn = ['year', 'day', 'hour'].filter((position) => {
    const branch = pillars[position]?.charBranch;
    return getHiddenStems(branch).some((hidden) =>
      allyElements.includes(STEMS_MAP[hidden.stem]?.element)
    );
  });

  return {
    dayMaster: dayMasterStem,
    dayMasterElement: dmElement,
    level,
    levelCn: { strong: '身强', weak: '身弱', balanced: '中和' }[level],
    allyScore: Math.round(allyScore * 100) / 100,
    totalScore: total,
    ratio: Math.round(ratio * 1000) / 1000,
    allyElements,
    hasSeasonalSupport,
    rootedIn,
  };
};

/**
 * 用神喜忌（扶抑法）。
 *
 * 身强则克泄耗为用（官杀、食伤、财），身弱则生扶为用（印、比劫）。
 * 中和局扶抑意义不大，此时返回 null 并说明理由，不硬凑一个用神。
 */
export const determineUsefulGod = (strength) => {
  if (!strength) return null;
  const dmElement = strength.dayMasterElement;
  const classify = (element) => getElementRelation(dmElement, element);

  const drains = ELEMENTS.filter((element) => {
    const relation = classify(element);
    return relation === 'Generates' || relation === 'Controls' || relation === 'ControlledBy';
  });
  const supports = strength.allyElements;

  if (strength.level === 'strong') {
    return {
      method: 'restraint',
      methodCn: '扶抑法（身强宜克泄耗）',
      favorable: drains,
      unfavorable: supports,
      reason: `日主${dmElement}偏旺（同党占比 ${strength.ratio}），宜以官杀食伤财耗其气`,
    };
  }
  if (strength.level === 'weak') {
    return {
      method: 'support',
      methodCn: '扶抑法（身弱宜生扶）',
      favorable: supports,
      unfavorable: drains,
      reason: `日主${dmElement}偏弱（同党占比 ${strength.ratio}），宜以印比生扶`,
    };
  }
  return {
    method: 'balanced',
    methodCn: '中和',
    favorable: [],
    unfavorable: [],
    reason: `日主${dmElement}中和（同党占比 ${strength.ratio}），扶抑法难分主次，宜改用调候或病药法取用`,
  };
};

const groupShenshaFor = (branch, field) => {
  const hit = BRANCH_GROUP_SHENSHA.find((group) => group.branches.includes(branch));
  return hit ? hit[field] : null;
};

/**
 * 神煞检出。
 *
 * 查法基准：干系神煞（天乙/文昌/禄/刃）以日干为主，支系神煞（驿马/桃花/华盖/将星、
 * 孤辰寡宿）以年支与日支分别起，两处所得都列出并标注 basis，不合并 —— 年起与日起
 * 落点不同是常态，合并会丢信息。
 */
export const detectShensha = (pillars) => {
  const positions = ['year', 'month', 'day', 'hour'];
  const dayStem = pillars.day?.charStem;
  const yearBranch = pillars.year?.charBranch;
  const dayBranch = pillars.day?.charBranch;
  const found = [];

  const push = (key, targetBranch, basis) => {
    if (!targetBranch) return;
    positions.forEach((position) => {
      if (pillars[position]?.charBranch === targetBranch) {
        found.push({ ...SHENSHA_META[key], branch: targetBranch, position, basis });
      }
    });
  };

  (TIANYI_NOBLE[dayStem] || []).forEach((branch) => push('tianyi', branch, 'dayStem'));
  push('wenchang', WENCHANG_NOBLE[dayStem], 'dayStem');
  push('lushen', LUSHEN[dayStem], 'dayStem');
  push('yangren', YANGREN[dayStem], 'dayStem');

  [
    { basis: 'yearBranch', source: yearBranch },
    { basis: 'dayBranch', source: dayBranch },
  ].forEach(({ basis, source }) => {
    if (!source) return;
    ['yima', 'taohua', 'huagai', 'jiangxing'].forEach((key) => {
      push(key, groupShenshaFor(source, key), basis);
    });
    const guhit = GUCHEN_GUASU.find((entry) => entry.branches.includes(source));
    if (guhit) {
      push('guchen', guhit.guchen, basis);
      push('guasu', guhit.guasu, basis);
    }
  });

  const dayGanzhi = `${dayStem}${dayBranch}`;
  if (KUIGANG.includes(dayGanzhi)) {
    found.push({ ...SHENSHA_META.kuigang, branch: dayBranch, position: 'day', basis: 'dayPillar' });
  }

  // 同一神煞可能由年起与日起同时命中同一支，去重时保留 basis 以便追溯
  const seen = new Set();
  return found.filter((item) => {
    const id = `${item.key}-${item.position}-${item.basis}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};

/** 四柱之间的刑冲合会害破，以及天干合冲。 */
export const analyzeRelations = (pillars) => {
  const positions = ['year', 'month', 'day', 'hour'];
  const branches = positions.map((p) => pillars[p]?.charBranch).filter(Boolean);
  const stems = positions.map((p) => pillars[p]?.charStem).filter(Boolean);
  return {
    branches: detectBranchRelations(branches),
    stems: detectStemRelations(stems),
  };
};

/**
 * 完整的八字分析：在四柱之上叠加藏干、旺衰、用神、神煞、刑冲、空亡。
 * 返回结构是新增的，不动 performCalculation 原有的 pillars/fiveElements/tenGods/luckCycles。
 */
export const analyzeChart = (pillars) => {
  const dayMasterStem = pillars?.day?.charStem;
  if (!dayMasterStem) return null;

  const strength = determineStrength(pillars, dayMasterStem);
  const dayGanzhi = `${dayMasterStem}${pillars.day.charBranch}`;

  return {
    dayMaster: {
      stem: dayMasterStem,
      element: STEMS_MAP[dayMasterStem]?.element || null,
      polarity: STEMS_MAP[dayMasterStem]?.polarity || null,
    },
    pillarDetails: buildPillarDetails(pillars, dayMasterStem),
    weightedElements: calculateWeightedElements(pillars),
    strength,
    usefulGod: determineUsefulGod(strength),
    shensha: detectShensha(pillars),
    relations: analyzeRelations(pillars),
    xunkong: getXunkong(dayGanzhi),
  };
};
