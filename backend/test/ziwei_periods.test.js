import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ZIWEI_BRANCH_ORDER } from '../constants/ziwei.js';
import {
  calculateZiweiChart,
  calculateMajorPeriods,
  calculateMinorPeriodIndex,
  calculateFlowYear,
  getMajorPeriodDirection,
} from '../services/ziwei.service.js';

const idx = (branch) => ZIWEI_BRANCH_ORDER.indexOf(branch);

describe('大限顺逆', () => {
  it('阳男阴女顺行，阴男阳女逆行', () => {
    assert.equal(getMajorPeriodDirection('甲', 'male'), 1, '阳男应顺行');
    assert.equal(getMajorPeriodDirection('乙', 'female'), 1, '阴女应顺行');
    assert.equal(getMajorPeriodDirection('乙', 'male'), -1, '阴男应逆行');
    assert.equal(getMajorPeriodDirection('甲', 'female'), -1, '阳女应逆行');
  });
});

describe('大限', () => {
  it('起限岁数等于五行局数，每宫十年不断档', () => {
    [2, 3, 4, 5, 6].forEach((bureauValue) => {
      const periods = calculateMajorPeriods({
        mingIndex: 0,
        bureauValue,
        yearStem: '甲',
        gender: 'male',
      });
      assert.equal(periods[0].startAge, bureauValue, `${bureauValue}局应${bureauValue}岁起运`);
      periods.forEach((p, i) => {
        assert.equal(p.endAge - p.startAge, 9, '每步大限应管十年');
        if (i > 0) {
          assert.equal(p.startAge, periods[i - 1].endAge + 1, '大限之间不得断档或重叠');
        }
      });
    });
  });

  it('顺行沿宫序递增，逆行递减，且十二步走满一圈', () => {
    const forward = calculateMajorPeriods({
      mingIndex: 2,
      bureauValue: 4,
      yearStem: '甲',
      gender: 'male',
    });
    assert.deepEqual(
      forward.slice(0, 4).map((p) => p.palaceIndex),
      [2, 3, 4, 5]
    );

    const backward = calculateMajorPeriods({
      mingIndex: 2,
      bureauValue: 4,
      yearStem: '甲',
      gender: 'female',
    });
    assert.deepEqual(
      backward.slice(0, 4).map((p) => p.palaceIndex),
      [2, 1, 0, 11]
    );

    assert.equal(new Set(forward.map((p) => p.palaceIndex)).size, 12, '十二步应走满十二宫');
  });

  it('缺五行局时不臆造大限', () => {
    assert.deepEqual(
      calculateMajorPeriods({ mingIndex: 0, bureauValue: null, yearStem: '甲', gender: 'male' }),
      []
    );
  });
});

describe('小限', () => {
  it('起宫由年支三合组决定，一岁在起宫', () => {
    assert.equal(calculateMinorPeriodIndex('午', 'male', 1), idx('辰')); // 寅午戌起辰
    assert.equal(calculateMinorPeriodIndex('子', 'male', 1), idx('戌')); // 申子辰起戌
    assert.equal(calculateMinorPeriodIndex('酉', 'male', 1), idx('未')); // 巳酉丑起未
    assert.equal(calculateMinorPeriodIndex('卯', 'male', 1), idx('丑')); // 亥卯未起丑
  });

  it('男顺女逆，一岁一宫', () => {
    assert.equal(calculateMinorPeriodIndex('午', 'male', 3), idx('午')); // 辰→巳→午
    assert.equal(calculateMinorPeriodIndex('午', 'female', 3), idx('寅')); // 辰→卯→寅
  });

  it('十二年一轮回', () => {
    assert.equal(
      calculateMinorPeriodIndex('午', 'male', 1),
      calculateMinorPeriodIndex('午', 'male', 13)
    );
  });

  it('非法岁数返回 null 而非乱指一宫', () => {
    assert.equal(calculateMinorPeriodIndex('午', 'male', 0), null);
    assert.equal(calculateMinorPeriodIndex('午', 'male', NaN), null);
  });
});

describe('流年', () => {
  const chart = calculateZiweiChart({
    birthYear: 1990,
    birthMonth: 5,
    birthDay: 12,
    birthHour: 10,
    gender: 'male',
  });

  it('本命盘带出大限序列与性别', () => {
    assert.equal(chart.gender, 'male');
    assert.equal(chart.majorPeriods.length, 12);
    // 大限应挂到对应宫位上
    const first = chart.majorPeriods[0];
    assert.deepEqual(chart.palaces[first.palaceIndex].majorPeriod, {
      order: 1,
      startAge: first.startAge,
      endAge: first.endAge,
    });
  });

  it('流年虚岁与干支正确，并定出所值大限', () => {
    const flow = calculateFlowYear(chart, 2024);
    assert.equal(flow.year, 2024);
    assert.equal(flow.ganzhi, '甲辰', '2024 为甲辰年');
    assert.equal(flow.branch, '辰');
    assert.equal(flow.age, 2024 - chart.lunar.year + 1);
    assert.ok(flow.majorPeriod, '应能定出所值大限');
    assert.ok(
      flow.age >= flow.majorPeriod.startAge && flow.age <= flow.majorPeriod.endAge,
      '虚岁应落在所值大限区间内'
    );
  });

  it('流年命宫即流年地支所在之宫', () => {
    const flow = calculateFlowYear(chart, 2024);
    assert.equal(flow.palaceIndex, idx('辰'));
    assert.equal(flow.palace.key, chart.palaces[idx('辰')].palace.key);
  });

  it('流年四化由流年干起，与本命四化各自独立', () => {
    const flow = calculateFlowYear(chart, 2024);
    assert.equal(flow.flowTransformations.length, 4);
    // 甲年四化：廉贞化禄、破军化权、武曲化科、太阳化忌
    const lu = flow.flowTransformations.find((t) => t.type === 'lu');
    assert.equal(lu.starKey, 'lianzhen');
    const ji = flow.flowTransformations.find((t) => t.type === 'ji');
    assert.equal(ji.starKey, 'taiyang');
  });

  it('出生之前的年份不给流年盘', () => {
    assert.equal(calculateFlowYear(chart, 1980), null);
    assert.equal(calculateFlowYear(null, 2024), null);
  });

  it('逐年推进时大限按十年切换一次', () => {
    const spans = [];
    for (let year = chart.lunar.year; year < chart.lunar.year + 60; year += 1) {
      const flow = calculateFlowYear(chart, year);
      if (flow?.majorPeriod) spans.push(flow.majorPeriod.order);
    }
    // 每个大限序号应连续出现十次
    const runs = spans.reduce((acc, order) => {
      const last = acc[acc.length - 1];
      if (last && last.order === order) last.count += 1;
      else acc.push({ order, count: 1 });
      return acc;
    }, []);
    runs.slice(0, -1).forEach((run) => {
      assert.equal(run.count, 10, `第 ${run.order} 步大限覆盖了 ${run.count} 年，应为 10 年`);
    });
  });
});
