import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ELEMENTS } from '../constants/stems.js';
import { performCalculation } from '../services/calculations.service.js';
import {
  getTenGod,
  getElementRelation,
  buildPillarDetails,
  calculateWeightedElements,
  determineStrength,
  determineUsefulGod,
  detectShensha,
  analyzeChart,
} from '../services/bazi.service.js';

/** 用真实排盘结果做输入，避免手搓 pillars 与实际结构脱节。 */
const chartOf = (birthYear, birthMonth, birthDay, birthHour, gender = 'male') =>
  performCalculation({ birthYear, birthMonth, birthDay, birthHour, gender });

describe('十神', () => {
  it('同性为偏、异性为正', () => {
    // 甲为阳木：见甲比肩、见乙劫财
    assert.equal(getTenGod('甲', '甲').key, 'bijian');
    assert.equal(getTenGod('甲', '乙').key, 'jiecai');
    // 甲生丙（阳生阳）食神，甲生丁（阳生阴）伤官
    assert.equal(getTenGod('甲', '丙').key, 'shishen');
    assert.equal(getTenGod('甲', '丁').key, 'shangguan');
    // 甲克戊（阳克阳）偏财，甲克己（阳克阴）正财
    assert.equal(getTenGod('甲', '戊').key, 'piancai');
    assert.equal(getTenGod('甲', '己').key, 'zhengcai');
    // 庚克甲（阳克阳）七杀，辛克甲（阴克阳）正官
    assert.equal(getTenGod('甲', '庚').key, 'qisha');
    assert.equal(getTenGod('甲', '辛').key, 'zhengguan');
    // 壬生甲（阳生阳）偏印，癸生甲（阴生阳）正印
    assert.equal(getTenGod('甲', '壬').key, 'pianyin');
    assert.equal(getTenGod('甲', '癸').key, 'zhengyin');
  });

  it('十天干对任一日主恰好覆盖十神，不重不漏', () => {
    ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'].forEach((dayMaster) => {
      const gods = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'].map(
        (target) => getTenGod(dayMaster, target).key
      );
      assert.equal(new Set(gods).size, 10, `${dayMaster} 日主的十神有重复或遗漏`);
    });
  });

  it('五行生克关系自洽', () => {
    assert.equal(getElementRelation('Wood', 'Fire'), 'Generates');
    assert.equal(getElementRelation('Fire', 'Wood'), 'GeneratedBy');
    assert.equal(getElementRelation('Wood', 'Earth'), 'Controls');
    assert.equal(getElementRelation('Earth', 'Wood'), 'ControlledBy');
    assert.equal(getElementRelation('Wood', 'Wood'), 'Same');
  });
});

describe('逐柱展开', () => {
  const chart = chartOf(1990, 5, 12, 10);

  it('每支的藏干全数展开，而非只取本气', () => {
    const details = buildPillarDetails(chart.pillars, chart.pillars.day.charStem);
    ['year', 'month', 'day', 'hour'].forEach((position) => {
      const detail = details[position];
      assert.ok(detail.hiddenStems.length >= 1, `${position} 柱无藏干`);
      detail.hiddenStems.forEach((hidden) => {
        assert.ok(hidden.tenGod, '藏干应带十神');
        assert.ok(hidden.element, '藏干应带五行');
      });
    });
    // 寅巳申亥等四生地必有三个藏干，若只取本气会退化成 1
    const anyThree = Object.values(details).some((d) => d.hiddenStems.length === 3);
    const branches = Object.values(details).map((d) => d.branch);
    if (branches.some((b) => ['寅', '巳', '申', '亥', '丑', '辰', '未', '戌'].includes(b))) {
      assert.ok(anyThree, '四生地/四墓库应展开出三个藏干');
    }
  });

  it('日柱标为日主，其余柱给出十神', () => {
    const details = buildPillarDetails(chart.pillars, chart.pillars.day.charStem);
    assert.equal(details.day.stemTenGod.key, 'rizhu');
    assert.ok(details.year.stemTenGod.key);
  });

  it('每柱带纳音与日主在该支的十二长生', () => {
    const details = buildPillarDetails(chart.pillars, chart.pillars.day.charStem);
    Object.values(details).forEach((detail) => {
      assert.ok(detail.nayin?.name, '缺纳音');
      assert.ok(detail.twelveStage?.cn, '缺十二长生');
    });
  });
});

describe('藏干加权五行', () => {
  const chart = chartOf(1990, 5, 12, 10);

  it('百分比合计约等于 100，且分数非负', () => {
    const weighted = calculateWeightedElements(chart.pillars);
    const sum = ELEMENTS.reduce((acc, e) => acc + weighted.percent[e], 0);
    assert.ok(Math.abs(sum - 100) < 0.5, `五行占比合计 ${sum}，应约为 100`);
    ELEMENTS.forEach((e) => assert.ok(weighted.scores[e] >= 0));
  });

  it('月令加倍：同一组四柱，月支五行的分数高于把它当普通支时', () => {
    const weighted = calculateWeightedElements(chart.pillars);
    // 总分 = 天干 4 分 + 地支 4 分，其中月柱整体加倍 → 理论总分 10
    assert.ok(Math.abs(weighted.total - 10) < 0.01, `总分应为 10，实得 ${weighted.total}`);
  });

  it('与旧的个数统计口径不同（藏干确实参与了计算）', () => {
    // 旧口径只数天干+地支本气各 1，总计 8；新口径为 10 且带小数权重
    assert.notEqual(chart.analysis.weightedElements.total, 8);
  });
});

describe('旺衰与用神', () => {
  const samples = [
    chartOf(1990, 5, 12, 10),
    chartOf(1984, 2, 2, 3),
    chartOf(2000, 11, 20, 22),
    chartOf(1976, 8, 20, 15),
  ];

  samples.forEach((chart, i) => {
    it(`样本 ${i + 1}：旺衰判定自洽`, () => {
      const strength = chart.analysis.strength;
      assert.ok(['strong', 'weak', 'balanced'].includes(strength.level));
      assert.ok(strength.ratio >= 0 && strength.ratio <= 1, '同党占比应在 0..1');
      // 同党必须恰好是「同我」与「生我」两类五行
      assert.equal(strength.allyElements.length, 2);
      strength.allyElements.forEach((element) => {
        const relation = getElementRelation(strength.dayMasterElement, element);
        assert.ok(['Same', 'GeneratedBy'].includes(relation), `${element} 不该算作同党`);
      });
    });

    it(`样本 ${i + 1}：用神与旺衰方向相反`, () => {
      const { strength, usefulGod } = chart.analysis;
      if (strength.level === 'strong') {
        assert.equal(usefulGod.method, 'restraint');
        // 身强用神不得包含同党
        strength.allyElements.forEach((element) => {
          assert.ok(!usefulGod.favorable.includes(element), '身强不应以同党为用');
        });
      } else if (strength.level === 'weak') {
        assert.equal(usefulGod.method, 'support');
        assert.deepEqual(usefulGod.favorable, strength.allyElements);
      } else {
        assert.equal(usefulGod.method, 'balanced');
        assert.ok(usefulGod.reason.includes('调候'), '中和局应提示改用其他取用法');
      }
    });

    it(`样本 ${i + 1}：喜忌五行互不重叠`, () => {
      const { favorable, unfavorable } = chart.analysis.usefulGod;
      favorable.forEach((element) => {
        assert.ok(!unfavorable.includes(element), `${element} 同时被列为喜与忌`);
      });
    });
  });

  it('身强身弱两种局面都能出现（判定没有恒定偏向）', () => {
    const levels = new Set();
    for (let year = 1970; year <= 2010; year += 1) {
      levels.add(chartOf(year, 6, 15, 12).analysis.strength.level);
    }
    assert.ok(levels.size >= 2, `41 个样本只得到 ${[...levels]} 一种判定，疑似判定失效`);
  });
});

describe('神煞', () => {
  it('天乙贵人按日干查得，并标注查法依据', () => {
    // 日干甲，天乙在丑未
    const pillars = {
      year: { charStem: '甲', charBranch: '子' },
      month: { charStem: '丙', charBranch: '丑' },
      day: { charStem: '甲', charBranch: '午' },
      hour: { charStem: '庚', charBranch: '未' },
    };
    const found = detectShensha(pillars);
    const tianyi = found.filter((s) => s.key === 'tianyi');
    assert.equal(tianyi.length, 2, '丑未两支都应查出天乙');
    assert.ok(tianyi.every((s) => s.basis === 'dayStem'));
    assert.deepEqual(tianyi.map((s) => s.position).sort(), ['hour', 'month']);
  });

  it('羊刃只对阳干成立', () => {
    const yangDay = {
      year: { charStem: '甲', charBranch: '子' },
      month: { charStem: '丙', charBranch: '寅' },
      day: { charStem: '甲', charBranch: '卯' }, // 甲刃在卯
      hour: { charStem: '庚', charBranch: '申' },
    };
    assert.ok(detectShensha(yangDay).some((s) => s.key === 'yangren'));

    const yinDay = { ...yangDay, day: { charStem: '乙', charBranch: '卯' } };
    assert.ok(
      !detectShensha(yinDay).some((s) => s.key === 'yangren'),
      '阴干羊刃流派不一，本模块不予判定'
    );
  });

  it('魁罡看日柱，非魁罡日不误报', () => {
    const kuigang = {
      year: { charStem: '甲', charBranch: '子' },
      month: { charStem: '丙', charBranch: '寅' },
      day: { charStem: '庚', charBranch: '辰' },
      hour: { charStem: '庚', charBranch: '申' },
    };
    assert.ok(detectShensha(kuigang).some((s) => s.key === 'kuigang'));

    const notKuigang = { ...kuigang, day: { charStem: '庚', charBranch: '午' } };
    assert.ok(!detectShensha(notKuigang).some((s) => s.key === 'kuigang'));
  });

  it('支系神煞分别以年支和日支起，两处结果都保留', () => {
    // 年支子（申子辰组）→ 桃花在酉；日支午（寅午戌组）→ 桃花在卯
    const pillars = {
      year: { charStem: '甲', charBranch: '子' },
      month: { charStem: '丁', charBranch: '卯' },
      day: { charStem: '丙', charBranch: '午' },
      hour: { charStem: '辛', charBranch: '酉' },
    };
    const taohua = detectShensha(pillars).filter((s) => s.key === 'taohua');
    const bases = taohua.map((s) => s.basis);
    assert.ok(bases.includes('yearBranch'), '年起桃花（酉）应查出');
    assert.ok(bases.includes('dayBranch'), '日起桃花（卯）应查出');
  });
});

describe('刑冲合会与空亡', () => {
  it('四柱地支关系接到干支基础库', () => {
    const chart = chartOf(1990, 5, 12, 10);
    const { branches, stems } = chart.analysis.relations;
    ['sixCombinations', 'tripleCombinations', 'clashes', 'punishments', 'harms'].forEach((key) => {
      assert.ok(Array.isArray(branches[key]), `缺 ${key}`);
    });
    assert.ok(Array.isArray(stems.combinations));
  });

  it('空亡按日柱所在旬取得', () => {
    const chart = chartOf(1990, 5, 12, 10);
    assert.equal(chart.analysis.xunkong.branches.length, 2);
    assert.ok(chart.analysis.xunkong.decade.startsWith('甲'));
  });
});

describe('接入既有排盘', () => {
  it('原有字段一个不少，analysis 为新增', () => {
    const chart = chartOf(1990, 5, 12, 10);
    ['pillars', 'fiveElements', 'fiveElementsPercent', 'tenGods', 'luckCycles'].forEach((key) => {
      assert.ok(chart[key], `原有字段 ${key} 丢失`);
    });
    assert.ok(chart.analysis, 'analysis 未接入');
    assert.equal(chart.analysis.dayMaster.stem, chart.pillars.day.charStem);
  });

  it('analyzeChart 对残缺输入返回 null 而非抛错', () => {
    assert.equal(analyzeChart(null), null);
    assert.equal(analyzeChart({}), null);
  });

  it('determineUsefulGod 对空旺衰返回 null', () => {
    assert.equal(determineUsefulGod(null), null);
    assert.equal(determineStrength({ day: {} }, '不存在'), null);
  });
});
