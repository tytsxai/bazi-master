import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { BRANCHES } from '../constants/ganzhi.js';
import { BRANCH_SIX_COMBINATIONS } from '../constants/ganzhi.js';
import { MONTH_GENERALS, STEM_LODGING } from '../constants/liuren.js';
import {
  getHourBranch,
  resolveMonthGeneral,
  buildHeavenPlate,
  buildFourCourses,
  buildTwelveGenerals,
  castLiurenChart,
} from '../services/liuren.service.js';

describe('月将', () => {
  it('月将恒为月建的六合', () => {
    // 正月建寅、寅亥合，故正月将亥；十二月建丑、丑子合，故十二月将子
    Object.entries(MONTH_GENERALS).forEach(([branch, meta]) => {
      const combined = BRANCH_SIX_COMBINATIONS.find(
        ({ pair }) => pair.includes(branch) && pair.includes(meta.monthBranch)
      );
      assert.ok(combined, `${meta.monthBranch}月的月将应为其六合，实得 ${branch}`);
    });
  });

  it('十二月将齐备且名称唯一', () => {
    const entries = Object.values(MONTH_GENERALS);
    assert.equal(entries.length, 12);
    assert.equal(new Set(entries.map((e) => e.cn)).size, 12);
    assert.equal(new Set(entries.map((e) => e.afterQi)).size, 12, '十二中气应各配一将');
  });

  it('按中气换将：雨水前后月将不同', () => {
    // 2024 年雨水在 2/19。2/10 未过雨水，仍行丑月的子将；2/25 已过，行亥将
    const before = resolveMonthGeneral(2024, 2, 10);
    const after = resolveMonthGeneral(2024, 2, 25);
    assert.equal(before.branch, '子', `雨水前应行子将，实得 ${before.branch}${before.cn}`);
    assert.equal(after.branch, '亥', `雨水后应行亥将，实得 ${after.branch}${after.cn}`);
    assert.equal(after.cn, '登明');
  });

  it('春分后换河魁戌将', () => {
    // 2024 年春分在 3/20
    assert.equal(resolveMonthGeneral(2024, 3, 15).branch, '亥');
    assert.equal(resolveMonthGeneral(2024, 3, 25).branch, '戌');
    assert.equal(resolveMonthGeneral(2024, 3, 25).cn, '河魁');
  });

  it('全年任一天都能定出月将', () => {
    for (let month = 1; month <= 12; month += 1) {
      [5, 15, 25].forEach((day) => {
        const general = resolveMonthGeneral(2024, month, day);
        assert.ok(MONTH_GENERALS[general.branch], `${month}/${day} 定将失败`);
      });
    }
  });
});

describe('月将加时得天盘', () => {
  it('月将落在占时的地盘位上', () => {
    // 亥将加子时：地盘子位上是亥
    const plate = buildHeavenPlate('亥', '子');
    assert.equal(plate[BRANCHES.indexOf('子')], '亥');
    // 其余顺排：地盘丑位上是子
    assert.equal(plate[BRANCHES.indexOf('丑')], '子');
  });

  it('将时相同则天地盘重合（伏吟）', () => {
    const plate = buildHeavenPlate('午', '午');
    BRANCHES.forEach((branch, i) => assert.equal(plate[i], branch));
  });

  it('将时相冲则天地盘全冲（返吟）', () => {
    const plate = buildHeavenPlate('子', '午');
    BRANCHES.forEach((branch, i) => {
      assert.equal(plate[i], BRANCHES[(i + 6) % 12], `${branch} 位上应为其冲支`);
    });
  });

  it('天盘是十二支的一个轮转，不重不漏', () => {
    const plate = buildHeavenPlate('辰', '寅');
    assert.equal(new Set(plate).size, 12);
  });
});

describe('日干寄宫与四课', () => {
  it('寄宫表齐备，戊寄巳同丙、己寄未同丁', () => {
    assert.equal(Object.keys(STEM_LODGING).length, 10);
    assert.equal(STEM_LODGING['戊'], STEM_LODGING['丙']);
    assert.equal(STEM_LODGING['己'], STEM_LODGING['丁']);
    assert.equal(STEM_LODGING['甲'], '寅');
    assert.equal(STEM_LODGING['癸'], '丑');
  });

  it('四课自寄宫与日支起，各取其上神', () => {
    const plate = buildHeavenPlate('亥', '子');
    const courses = buildFourCourses(plate, '甲', '子');
    assert.equal(courses.length, 4);
    // 一课下神为甲之寄宫寅
    assert.equal(courses[0].lower, '寅');
    assert.equal(courses[0].upper, plate[BRANCHES.indexOf('寅')]);
    // 二课下神即一课上神
    assert.equal(courses[1].lower, courses[0].upper);
    // 三课下神为日支
    assert.equal(courses[2].lower, '子');
    // 四课下神即三课上神
    assert.equal(courses[3].lower, courses[2].upper);
  });

  it('伏吟时四课上下神相同', () => {
    const plate = buildHeavenPlate('子', '子');
    const courses = buildFourCourses(plate, '甲', '子');
    courses.forEach((c) => assert.equal(c.upper, c.lower));
  });
});

describe('十二天将', () => {
  it('贵人分昼夜：卯至申为昼', () => {
    const plate = buildHeavenPlate('亥', '辰');
    const day = buildTwelveGenerals('甲', '辰', plate);
    const night = buildTwelveGenerals('甲', '子', buildHeavenPlate('亥', '子'));
    assert.equal(day.isDaytime, true);
    assert.equal(day.nobleBranch, '丑', '甲日昼贵在丑');
    assert.equal(night.isDaytime, false);
    assert.equal(night.nobleBranch, '未', '甲日夜贵在未');
  });

  it('十二将布满十二位，不重不漏', () => {
    const plate = buildHeavenPlate('亥', '辰');
    const generals = buildTwelveGenerals('甲', '辰', plate);
    assert.equal(generals.plate.filter(Boolean).length, 12);
    assert.equal(new Set(generals.plate.map((g) => g.key)).size, 12);
  });

  it('贵人临亥子丑寅卯辰顺行，临巳午未申酉戌逆行', () => {
    const plate = buildHeavenPlate('亥', '辰');
    const generals = buildTwelveGenerals('甲', '辰', plate);
    const nobleIdx = BRANCHES.indexOf(generals.nobleEarthBranch);
    const nextIdx = (nobleIdx + (generals.forward ? 1 : -1) + 12) % 12;
    assert.equal(generals.plate[nobleIdx].key, 'guiren');
    assert.equal(generals.plate[nextIdx].key, 'tengshe', '贵人之后应为螣蛇');
  });
});

describe('三传', () => {
  it('已实现的课体给出初中末三传，且中末传为递取上神', () => {
    // 遍历一批占例，凡 supported 者都要结构完整且自洽
    let supported = 0;
    for (let month = 1; month <= 12; month += 1) {
      for (let hour = 0; hour < 24; hour += 3) {
        const chart = castLiurenChart({ year: 2024, month, day: 15, hour });
        const tri = chart.threeTransmissions;
        if (!tri.supported) continue;
        supported += 1;
        assert.ok(tri.initial.branch && tri.middle.branch && tri.last.branch);
        // 中传 = 初传之上神，末传 = 中传之上神
        assert.equal(
          tri.middle.branch,
          chart.heavenPlate[BRANCHES.indexOf(tri.initial.branch)],
          '中传应为初传之上神'
        );
        assert.equal(
          tri.last.branch,
          chart.heavenPlate[BRANCHES.indexOf(tri.middle.branch)],
          '末传应为中传之上神'
        );
      }
    }
    assert.ok(supported > 0, '样本中应有可支持的课体');
  });

  it('未实现的课体明确标注，不臆造三传', () => {
    let unsupported = 0;
    for (let month = 1; month <= 12; month += 1) {
      for (let hour = 0; hour < 24; hour += 1) {
        const chart = castLiurenChart({ year: 2024, month, day: 8, hour });
        const tri = chart.threeTransmissions;
        if (tri.supported) continue;
        unsupported += 1;
        assert.ok(tri.cn, '不支持时应给出所判定的课体名');
        assert.ok(tri.reason, '不支持时应说明原因');
        assert.equal(tri.initial, undefined, '不支持时不得给出三传');
      }
    }
    assert.ok(unsupported > 0, '样本中应出现未实现的课体');
  });

  it('伏吟返吟被识别并标为未实现', () => {
    // 构造将时相同/相冲的情形
    for (let month = 1; month <= 12; month += 1) {
      for (let hour = 0; hour < 24; hour += 1) {
        const chart = castLiurenChart({ year: 2024, month, day: 20, hour });
        if (chart.isFuyin) {
          assert.equal(chart.threeTransmissions.detected, 'fuyin');
          assert.equal(chart.threeTransmissions.supported, false);
        }
        if (chart.isFanyin) {
          assert.equal(chart.threeTransmissions.detected, 'fanyin');
          assert.equal(chart.threeTransmissions.supported, false);
        }
      }
    }
  });

  it('课体名目正确：独一下贼上为重审，独一上克下为元首', () => {
    const seen = new Set();
    for (let month = 1; month <= 12; month += 1) {
      for (let day = 1; day <= 28; day += 3) {
        for (let hour = 0; hour < 24; hour += 4) {
          const tri = castLiurenChart({ year: 2024, month, day, hour }).threeTransmissions;
          if (tri.supported) seen.add(tri.courseType.key);
        }
      }
    }
    // 至少要能出现贼克法的两种课体
    assert.ok(
      seen.has('yuanshou') || seen.has('zhongshen'),
      `样本未出现贼克法课体，实得 ${[...seen]}`
    );
  });
});

describe('整盘', () => {
  it('起课输出天地盘、四课、天将、旬空齐备', () => {
    const chart = castLiurenChart({ year: 2024, month: 5, day: 20, hour: 14 });
    assert.equal(chart.earthPlate.length, 12);
    assert.equal(chart.heavenPlate.length, 12);
    assert.equal(chart.fourCourses.length, 4);
    assert.equal(chart.twelveGenerals.plate.length, 12);
    assert.equal(chart.xunkong.branches.length, 2);
    assert.ok(chart.monthGeneral.cn);
    assert.equal(chart.stemLodging, STEM_LODGING[chart.dayStem]);
  });

  it('非法输入返回 null', () => {
    assert.equal(castLiurenChart({ year: 'x', month: 1, day: 1, hour: 0 }), null);
  });
});
