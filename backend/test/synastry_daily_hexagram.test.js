import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { hexagrams, HEXAGRAM_NAMES } from '../data/ichingHexagrams.js';
import { HEXAGRAM_NAMES as LIUYAO_NAMES } from '../constants/liuyao.js';
import {
  performCalculation,
  calculateDailyPillars,
  calculateDailyScore,
} from '../services/calculations.service.js';
import { calculateCompatibility } from '../services/synastry.service.js';

const chartOf = (y, m, d, h, gender = 'male') =>
  performCalculation({ birthYear: y, birthMonth: m, birthDay: d, birthHour: h, gender });

describe('卦名数据只有一份', () => {
  it('易经端点的六十四卦带真卦名与序号', () => {
    assert.equal(hexagrams.length, 64);
    hexagrams.forEach((h) => {
      assert.ok(h.name, '缺卦名');
      assert.ok(h.sequence >= 1 && h.sequence <= 64, `${h.title} 序号非法`);
      // 旧的方位描述保留在 nameEn，便于对照
      assert.ok(h.nameEn?.includes('over'), '应保留旧的方位描述');
    });
    const sequences = hexagrams.map((h) => h.sequence).sort((a, b) => a - b);
    assert.deepEqual(
      sequences,
      Array.from({ length: 64 }, (_, i) => i + 1)
    );
  });

  it('name 不再是程序拼出来的方位描述', () => {
    const qian = hexagrams.find((h) => h.title === 'Qian / Qian');
    assert.equal(qian.name, '乾为天');
    assert.equal(qian.nameEn, 'Heaven over Heaven');
    assert.equal(qian.sequence, 1);
    // summary 也不该再是那句模板
    hexagrams.forEach((h) => {
      assert.ok(!h.summary.includes('to reveal the lesson'), `${h.name} 仍是模板 summary`);
    });
  });

  it('六爻与易经端点读的是同一份卦名', () => {
    assert.equal(LIUYAO_NAMES, HEXAGRAM_NAMES, '六爻应转出 data 层的同一个对象');
    hexagrams.forEach((h) => {
      const [upper, lower] = h.title.split(' / ');
      assert.equal(HEXAGRAM_NAMES[`${upper}-${lower}`].cn, h.name);
    });
  });
});

describe('合盘按干支关系论', () => {
  it('夫妻宫的自刑能被认出来，而不只是「五行相同」', () => {
    // 两盘日支同为酉：旧实现只会判五行相同并加分，看不出这是自刑
    const a = chartOf(1990, 5, 20, 14);
    const b = chartOf(1992, 8, 1, 9, 'female');
    assert.equal(a.pillars.day.charBranch, '酉');
    assert.equal(b.pillars.day.charBranch, '酉');

    const result = calculateCompatibility(a, b);
    const types = result.spousePalace.relations.map((r) => r.type);
    assert.ok(types.includes('punishment'), `酉酉应为自刑，实得 ${JSON.stringify(types)}`);
    assert.ok(result.spousePalace.relations.some((r) => r.cn.includes('自刑')));
  });

  it('日主互看十神，两边不对称', () => {
    const result = calculateCompatibility(
      chartOf(1990, 5, 20, 14),
      chartOf(1992, 8, 1, 9, 'female')
    );
    assert.ok(result.dayMasters.tenGodAtoB, '缺 A 看 B 的十神');
    assert.ok(result.dayMasters.tenGodBtoA, '缺 B 看 A 的十神');
    // 甲看己是正财、己看甲是正官之类：除同类外两边取值通常不同
    assert.ok(result.dayMasters.relation);
  });

  it('五行互补用藏干加权，不用干支个数统计', () => {
    const result = calculateCompatibility(
      chartOf(1990, 5, 20, 14),
      chartOf(1992, 8, 1, 9, 'female')
    );
    assert.equal(result.elementComplement.source, 'weighted');
  });

  it('交叉柱的合冲被列出，并指明是哪两柱', () => {
    const result = calculateCompatibility(
      chartOf(1990, 5, 20, 14),
      chartOf(1992, 8, 1, 9, 'female')
    );
    result.crossPillars.forEach((r) => {
      assert.ok(['year', 'month', 'day', 'hour'].includes(r.a));
      assert.ok(['year', 'month', 'day', 'hour'].includes(r.b));
      assert.ok(['sixCombination', 'clash'].includes(r.type));
    });
  });

  it('评分落在 0..100，且权重口径随结果一并返回', () => {
    for (let year = 1970; year <= 2000; year += 5) {
      const result = calculateCompatibility(
        chartOf(year, 3, 3, 8),
        chartOf(year + 2, 9, 9, 20, 'female')
      );
      assert.ok(result.score >= 0 && result.score <= 100, `score ${result.score} 越界`);
    }
    const one = calculateCompatibility(chartOf(1990, 5, 20, 14), chartOf(1992, 8, 1, 9, 'female'));
    assert.ok(one.weights.dayBranchSixCombination > 0, '应返回计分权重');
    assert.ok(one.nayin.a?.name && one.nayin.b?.name, '应给出双方日柱纳音');
  });

  it('残缺输入照旧抛错', () => {
    assert.throws(() => calculateCompatibility(null, null));
    assert.throws(() => calculateCompatibility({}, {}));
  });
});

describe('流日关系走基础层', () => {
  it('冲合刑害都能认出，不再只认冲', () => {
    const chart = chartOf(1990, 5, 20, 14); // 日支酉
    // 卯酉相冲
    const clashDay = { charBranch: '卯', elementStem: 'Wood', branch: 'Mao' };
    const clash = calculateDailyScore(chart, clashDay);
    assert.ok(
      clash.branchRelations.some((r) => r.type === 'clash'),
      '卯酉应判相冲'
    );

    // 辰酉六合
    const combineDay = { charBranch: '辰', elementStem: 'Earth', branch: 'Chen' };
    const combine = calculateDailyScore(chart, combineDay);
    assert.ok(
      combine.branchRelations.some((r) => r.type === 'sixCombination'),
      '辰酉应判六合'
    );

    // 酉酉自刑
    const selfDay = { charBranch: '酉', elementStem: 'Metal', branch: 'You' };
    const self = calculateDailyScore(chart, selfDay);
    assert.ok(
      self.branchRelations.some((r) => r.type === 'punishment'),
      '酉酉应判自刑'
    );
  });

  it('相冲扣分、相合加分', () => {
    const chart = chartOf(1990, 5, 20, 14);
    const clash = calculateDailyScore(chart, {
      charBranch: '卯',
      elementStem: 'Wood',
      branch: 'Mao',
    });
    const combine = calculateDailyScore(chart, {
      charBranch: '辰',
      elementStem: 'Earth',
      branch: 'Chen',
    });
    assert.ok(combine.score > clash.score, '合日应高于冲日');
    assert.ok(clash.score >= 0 && combine.score <= 100);
  });

  it('无本命盘时给出兜底而非崩', () => {
    const fallback = calculateDailyScore(null, null);
    assert.equal(fallback.score, 50);
  });

  it('日主关系一并返回', () => {
    const chart = chartOf(1990, 5, 20, 14);
    const daily = calculateDailyPillars(new Date('2024-03-15'));
    const result = calculateDailyScore(chart, daily);
    assert.ok(result.dayMasterRelation, '应返回日主与流日的五行关系');
    assert.ok(Array.isArray(result.branchRelations));
  });
});
