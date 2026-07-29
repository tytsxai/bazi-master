/**
 * 六爻纳甲（京房筮法）装卦层。
 *
 * 输入一个六爻卦（自初爻至上爻的 0/1 数组）与起卦日的干支，输出可断的卦：
 * 卦名、所属宫、世应、纳甲干支、六亲、六神、伏神、旬空，以及动爻与变卦。
 *
 * 两个容易写错的地方，这里都显式处理：
 * - **八宫归属不硬编**。六十四卦的宫与世爻由「本宫→一世→…→五世→游魂→归魂」七条
 *   推衍规则算出来（见 PALACE_DERIVATION）。抄一张 64 行的表远比抄七条规则容易出错。
 * - **变卦的六亲仍以本卦之宫为我**，不按变卦自己的宫重排。这是纳甲筮法的定例，
 *   按变卦宫重排会让整个动爻分析失去参照。
 */

import { TRIGRAMS } from '../data/ichingHexagrams.js';
import { BRANCHES_MAP } from '../constants/stems.js';
import {
  HEXAGRAM_NAMES,
  TRIGRAM_CN,
  NAJIA,
  PALACE_ELEMENTS,
  PALACE_ORDER,
  PALACE_DERIVATION,
  SIX_RELATIVES,
  SIX_GODS,
  SIX_GOD_START_BY_DAY_STEM,
} from '../constants/liuyao.js';
import { getElementRelation } from './bazi.service.js';
import { getXunkong } from './ganzhi.service.js';
import { BRANCH_CLASHES, BRANCH_SIX_COMBINATIONS } from '../constants/ganzhi.js';

const trigramByLines = new Map(TRIGRAMS.map((t) => [t.lines.join(''), t]));

const linesKey = (lines) => lines.join('');

/** 由三爻取八卦。lines 自下而上，1 为阳。 */
export const getTrigram = (lines) => trigramByLines.get(linesKey(lines)) || null;

/**
 * 生成六十四卦的宫属表。
 *
 * 自每个八纯卦出发，依次施加世卦推衍规则，每一步落到的卦即该宫的对应世卦。
 * 八宫 × 八步 = 64 卦，恰好覆盖且互不重叠 —— 测试里会验证这一点。
 */
const buildPalaceMap = () => {
  const map = new Map();
  PALACE_ORDER.forEach((palaceKey) => {
    const trigram = TRIGRAMS.find((t) => t.name === palaceKey);
    if (!trigram) return;
    let lines = [...trigram.lines, ...trigram.lines];
    PALACE_DERIVATION.forEach((step) => {
      const next = [...lines];
      step.flip.forEach((position) => {
        next[position - 1] = next[position - 1] ? 0 : 1;
      });
      lines = next;
      map.set(linesKey(lines), {
        palace: palaceKey,
        palaceCn: TRIGRAM_CN[palaceKey]?.cn || palaceKey,
        palaceElement: PALACE_ELEMENTS[palaceKey],
        type: step.key,
        typeCn: step.cn,
        shiYao: step.shiYao,
        // 世应相隔两爻：世在初应在四，世在四应在初，余类推
        yingYao: ((step.shiYao - 1 + 3) % 6) + 1,
      });
    });
  });
  return map;
};

const PALACE_MAP = buildPalaceMap();

export const getPalaceInfo = (lines) => PALACE_MAP.get(linesKey(lines)) || null;

/** 供测试与调试用：导出整张宫属表。 */
export const listPalaceMap = () => new Map(PALACE_MAP);

/** 卦名。data/ichingHexagrams.js 里的 name 是描述不是卦名，断卦要用这里的。 */
export const getHexagramName = (lines) => {
  const lower = getTrigram(lines.slice(0, 3));
  const upper = getTrigram(lines.slice(3, 6));
  if (!lower || !upper) return null;
  const entry = HEXAGRAM_NAMES[`${upper.name}-${lower.name}`];
  if (!entry) return null;
  return {
    ...entry,
    upper: upper.name,
    lower: lower.name,
    upperCn: TRIGRAM_CN[upper.name]?.cn,
    lowerCn: TRIGRAM_CN[lower.name]?.cn,
  };
};

/**
 * 纳甲装卦：内卦（初二三）取下卦的前三支，外卦（四五六）取上卦的后三支。
 * 天干只有乾坤内外有别（乾内甲外壬、坤内乙外癸），其余六卦内外同干。
 */
export const buildNajia = (lines) => {
  const lower = getTrigram(lines.slice(0, 3));
  const upper = getTrigram(lines.slice(3, 6));
  if (!lower || !upper) return [];
  const lowerNajia = NAJIA[lower.name];
  const upperNajia = NAJIA[upper.name];
  if (!lowerNajia || !upperNajia) return [];

  return [0, 1, 2]
    .map((i) => ({ stem: lowerNajia.innerStem, branch: lowerNajia.branches[i] }))
    .concat([3, 4, 5].map((i) => ({ stem: upperNajia.outerStem, branch: upperNajia.branches[i] })));
};

/**
 * 六亲：以本宫五行为「我」，看爻支五行与我的生克。
 * 生我者父母、我生者子孙、克我者官鬼、我克者妻财、同我者兄弟。
 */
export const getSixRelative = (palaceElement, branchElement) => {
  switch (getElementRelation(palaceElement, branchElement)) {
    case 'Same':
      return SIX_RELATIVES.xiongdi;
    case 'Generates':
      return SIX_RELATIVES.zisun;
    case 'GeneratedBy':
      return SIX_RELATIVES.fumu;
    case 'Controls':
      return SIX_RELATIVES.qicai;
    case 'ControlledBy':
      return SIX_RELATIVES.guangui;
    default:
      return null;
  }
};

/** 六神：日干定初爻所安之神，其余顺序而上，六神循环。 */
export const buildSixGods = (dayStem) => {
  const start = SIX_GOD_START_BY_DAY_STEM[dayStem];
  if (start === undefined) return [];
  return Array.from({ length: 6 }, (_, i) => SIX_GODS[(start + i) % 6]);
};

/**
 * 伏神：本卦六亲不全时，缺的那一路从本宫首卦（八纯卦）同名六亲处取，
 * 伏于本卦对应爻位之下。用神不上卦时全靠它来断。
 */
export const findHiddenSpirits = (lines, palaceInfo) => {
  if (!palaceInfo) return [];
  const palaceTrigram = TRIGRAMS.find((t) => t.name === palaceInfo.palace);
  if (!palaceTrigram) return [];

  const pureLines = [...palaceTrigram.lines, ...palaceTrigram.lines];
  const pureNajia = buildNajia(pureLines);
  const presentRelatives = new Set(
    buildNajia(lines)
      .map((yao) => getSixRelative(palaceInfo.palaceElement, BRANCHES_MAP[yao.branch]?.element))
      .filter(Boolean)
      .map((relative) => relative.key)
  );

  const hidden = [];
  pureNajia.forEach((yao, index) => {
    const element = BRANCHES_MAP[yao.branch]?.element;
    const relative = getSixRelative(palaceInfo.palaceElement, element);
    if (!relative || presentRelatives.has(relative.key)) return;
    hidden.push({
      position: index + 1,
      stem: yao.stem,
      branch: yao.branch,
      element,
      relative,
    });
  });
  return hidden;
};

const isClash = (a, b) =>
  BRANCH_CLASHES.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

const isCombine = (a, b) =>
  BRANCH_SIX_COMBINATIONS.some(
    ({ pair }) => (pair[0] === a && pair[1] === b) || (pair[0] === b && pair[1] === a)
  );

/**
 * 月建日辰对各爻的作用。这是六爻断卦里决定爻之旺衰的两个外部力量：
 * 月建管一月之权，日辰管一日之令，二者都能生扶或冲克爻神。
 */
const analyzeExternalInfluence = (branch, { monthBranch, dayBranch, xunkongBranches }) => {
  const element = BRANCHES_MAP[branch]?.element;
  const result = {
    monthBroken: false,
    clashedByDay: false,
    combinedWithDay: false,
    xunkong: xunkongBranches.includes(branch),
    monthRelation: null,
    dayRelation: null,
  };

  if (monthBranch) {
    // 月破：爻支与月建相冲
    result.monthBroken = isClash(branch, monthBranch);
    result.monthRelation = getElementRelation(BRANCHES_MAP[monthBranch]?.element, element);
  }
  if (dayBranch) {
    result.clashedByDay = isClash(branch, dayBranch);
    result.combinedWithDay = isCombine(branch, dayBranch);
    result.dayRelation = getElementRelation(BRANCHES_MAP[dayBranch]?.element, element);
  }
  return result;
};

/**
 * 完整装卦。
 *
 * @param {number[]} lines 本卦六爻，自初爻至上爻，1 阳 0 阴
 * @param {object} options
 * @param {number[]} options.changingLines 动爻位置（1..6）
 * @param {string} options.dayGanzhi 起卦日干支，用于六神、旬空与日辰
 * @param {string} options.monthBranch 起卦月建地支
 */
export const buildLiuyaoChart = (lines, options = {}) => {
  if (!Array.isArray(lines) || lines.length !== 6) return null;
  const { changingLines = [], dayGanzhi = null, monthBranch = null } = options;

  const palaceInfo = getPalaceInfo(lines);
  const najia = buildNajia(lines);
  const name = getHexagramName(lines);
  if (!palaceInfo || !najia.length) return null;

  const dayStem = dayGanzhi ? dayGanzhi[0] : null;
  const dayBranch = dayGanzhi ? dayGanzhi[1] : null;
  const sixGods = buildSixGods(dayStem);
  const xunkong = dayGanzhi ? getXunkong(dayGanzhi) : null;
  const xunkongBranches = xunkong?.branches || [];

  const changing = new Set(changingLines.filter((n) => n >= 1 && n <= 6));

  // 之卦：动爻阴阳反转。变爻的六亲仍以**本卦之宫**为我，不按之卦的宫重排。
  const changedLines = lines.map((bit, index) => (changing.has(index + 1) ? (bit ? 0 : 1) : bit));
  const hasChange = changing.size > 0;
  const changedNajia = hasChange ? buildNajia(changedLines) : [];

  const yaos = najia.map((yao, index) => {
    const position = index + 1;
    const element = BRANCHES_MAP[yao.branch]?.element || null;
    const isChanging = changing.has(position);
    const changedYao = hasChange ? changedNajia[index] : null;

    return {
      position,
      yin: lines[index] === 0,
      yang: lines[index] === 1,
      stem: yao.stem,
      branch: yao.branch,
      ganzhi: `${yao.stem}${yao.branch}`,
      element,
      relative: getSixRelative(palaceInfo.palaceElement, element),
      sixGod: sixGods[index] || null,
      isShi: position === palaceInfo.shiYao,
      isYing: position === palaceInfo.yingYao,
      isChanging,
      influence: analyzeExternalInfluence(yao.branch, {
        monthBranch,
        dayBranch,
        xunkongBranches,
      }),
      changedTo:
        isChanging && changedYao
          ? {
              stem: changedYao.stem,
              branch: changedYao.branch,
              element: BRANCHES_MAP[changedYao.branch]?.element || null,
              // 之爻六亲依旧以本卦之宫论
              relative: getSixRelative(
                palaceInfo.palaceElement,
                BRANCHES_MAP[changedYao.branch]?.element
              ),
            }
          : null,
    };
  });

  return {
    lines: [...lines],
    name,
    palace: palaceInfo,
    yaos,
    shiYao: palaceInfo.shiYao,
    yingYao: palaceInfo.yingYao,
    hiddenSpirits: findHiddenSpirits(lines, palaceInfo),
    xunkong,
    dayGanzhi,
    monthBranch,
    changedHexagram: hasChange
      ? {
          lines: changedLines,
          name: getHexagramName(changedLines),
          palace: getPalaceInfo(changedLines),
        }
      : null,
  };
};
