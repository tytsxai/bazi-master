import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  BRANCHES,
  BRANCH_SIX_COMBINATIONS,
  BRANCH_PUNISH_TARGET,
  SELF_PUNISH_BRANCHES,
  YIMA_BY_GROUP,
} from '../constants/ganzhi.js';
import { MONTH_GENERALS, STEM_LODGING, BAZHUAN_DAYS } from '../constants/liuren.js';
import {
  getHourBranch,
  resolveMonthGeneral,
  buildHeavenPlate,
  buildFourCourses,
  buildTwelveGenerals,
  calculateShehaiDepth,
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
  it('任一占例都能取出完整三传，没有取不出的课', () => {
    let count = 0;
    for (let month = 1; month <= 12; month += 1) {
      for (let day = 1; day <= 28; day += 3) {
        for (let hour = 0; hour < 24; hour += 1) {
          const chart = castLiurenChart({ year: 2024, month, day, hour });
          const tri = chart.threeTransmissions;
          count += 1;
          assert.equal(tri.supported, true, `${month}/${day} ${hour}时 取传失败`);
          assert.ok(tri.initial.branch, '缺初传');
          assert.ok(tri.middle.branch, '缺中传');
          assert.ok(tri.last.branch, '缺末传');
          assert.ok(tri.courseType?.cn, '缺课体名目');
        }
      }
    }
    assert.ok(count > 2000, `样本量应足够大，实得 ${count}`);
  });

  it('常规课的中末传为递取上神', () => {
    // 伏吟取刑、返吟无克取驿马、昴星别责八专另有取法，故排除这些课体
    const explicitTypes = new Set([
      'ziren',
      'zixin',
      'fuyinKe',
      'wuqin',
      'hushi',
      'dongshe',
      'bieze',
      'bazhuan',
    ]);
    let checked = 0;
    for (let month = 1; month <= 12; month += 1) {
      for (let hour = 0; hour < 24; hour += 1) {
        const chart = castLiurenChart({ year: 2024, month, day: 15, hour });
        const tri = chart.threeTransmissions;
        if (explicitTypes.has(tri.courseType.key)) continue;
        checked += 1;
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
    assert.ok(checked > 0);
  });

  it('伏吟：中末传递取其刑，自刑则改取', () => {
    for (let month = 1; month <= 12; month += 1) {
      for (let hour = 0; hour < 24; hour += 1) {
        const chart = castLiurenChart({ year: 2024, month, day: 20, hour });
        if (!chart.isFuyin) continue;
        const tri = chart.threeTransmissions;
        assert.equal(tri.supported, true);
        assert.ok(
          ['ziren', 'zixin', 'fuyinKe'].includes(tri.courseType.key),
          `伏吟课体应为自任/自信/伏吟，实得 ${tri.courseType.cn}`
        );
        // 初传非自刑时，中传必为初传之刑
        if (!SELF_PUNISH_BRANCHES.includes(tri.initial.branch)) {
          assert.equal(
            tri.middle.branch,
            BRANCH_PUNISH_TARGET[tri.initial.branch],
            '中传应为初传之刑'
          );
        }
      }
    }
  });

  it('返吟：无克时取驿马为初传', () => {
    for (let month = 1; month <= 12; month += 1) {
      for (let hour = 0; hour < 24; hour += 1) {
        const chart = castLiurenChart({ year: 2024, month, day: 12, hour });
        if (!chart.isFanyin) continue;
        const tri = chart.threeTransmissions;
        assert.equal(tri.supported, true);
        if (tri.courseType.key === 'wuqin') {
          const entry = YIMA_BY_GROUP.find((g) => g.branches.includes(chart.dayBranch));
          assert.equal(tri.initial.branch, entry.yima, '无亲课初传应为驿马');
          assert.equal(tri.middle.branch, chart.fourCourses[2].upper, '中传应为支上神');
          assert.equal(tri.last.branch, chart.fourCourses[0].upper, '末传应为干上神');
        }
      }
    }
  });

  it('涉害深浅：自所乘地盘位逆行归家，沿途受克计数', () => {
    // 亥将加子时：地盘丑上乘子。子水逆行自丑归子，途经丑（土克水）→ 深度 1
    const plate = buildHeavenPlate('亥', '子');
    assert.equal(calculateShehaiDepth('子', plate), 1);
    // 本家即所乘位时无途可涉，深度 0
    const same = buildHeavenPlate('子', '子');
    assert.equal(calculateShehaiDepth('子', same), 0);
  });

  it('八专排在遥克之前：八专日的课体不得落到遥克', () => {
    // 八专课的成立条件是「日干支同位、上下无克」，此门**不取遥克**。
    // 若把八专判定放在遥克之后，八专日会被蒿矢/弹射先截走，课体就判错了。
    let seenBazhuan = 0;
    for (let month = 1; month <= 12; month += 1) {
      for (let day = 1; day <= 28; day += 1) {
        for (let hour = 0; hour < 24; hour += 2) {
          const chart = castLiurenChart({ year: 2024, month, day, hour });
          if (!BAZHUAN_DAYS.includes(chart.dayGanzhi)) continue;
          const key = chart.threeTransmissions.courseType.key;
          assert.ok(
            key !== 'haoshi' && key !== 'tanshe',
            `八专日 ${chart.dayGanzhi} 不该走遥克，实得 ${chart.threeTransmissions.courseType.cn}`
          );
          if (key === 'bazhuan') {
            seenBazhuan += 1;
            const stemUpper = chart.fourCourses[0].upper;
            assert.equal(chart.threeTransmissions.middle.branch, stemUpper, '中传应取干上神');
            assert.equal(chart.threeTransmissions.last.branch, stemUpper, '末传应取干上神');
          }
        }
      }
    }
    assert.ok(seenBazhuan > 0, '样本中应出现八专课');
  });

  it('别责按「四课缺一」判定，而非只看上神重复', () => {
    // 四课缺一指的是上下神成对重复、实际只剩三课；
    // 两课上神相同而下神不同时仍是四课，不该判为别责。
    for (let month = 1; month <= 12; month += 1) {
      for (let day = 1; day <= 28; day += 2) {
        for (let hour = 0; hour < 24; hour += 3) {
          const chart = castLiurenChart({ year: 2024, month, day, hour });
          const tri = chart.threeTransmissions;
          if (tri.courseType.key !== 'bieze') continue;
          const distinct = new Set(chart.fourCourses.map((c) => `${c.upper}/${c.lower}`));
          assert.equal(distinct.size, 3, '别责课应恰为四课缺一');
        }
      }
    }
  });

  it('九宗门各课体都能在样本中出现，取法互不冲突', () => {
    const seen = new Set();
    for (let month = 1; month <= 12; month += 1) {
      for (let day = 1; day <= 28; day += 2) {
        for (let hour = 0; hour < 24; hour += 1) {
          const tri = castLiurenChart({ year: 2024, month, day, hour }).threeTransmissions;
          seen.add(tri.courseType.key);
        }
      }
    }
    // 贼克法的两种课体是最常见的，必须出现
    assert.ok(seen.has('yuanshou'), '未出现元首课');
    assert.ok(seen.has('zhongshen'), '未出现重审课');
    // 覆盖面应当足够广
    assert.ok(seen.size >= 6, `课体覆盖偏少，实得 ${[...seen].join(',')}`);
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
