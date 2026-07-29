import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Solar } from 'lunar-javascript';

import {
  resolveSolarTerm,
  resolveLiChun,
  resolveLiChunYear,
  listSolarTerms,
  MID_QI_NAMES,
} from '../services/jieqi.service.js';
import { resolveJieQi, resolveJu } from '../services/qimen.service.js';
import { resolveMonthGeneral } from '../services/liuren.service.js';
import { resolveLifeTrigram } from '../services/fengshui.service.js';

/**
 * 这一组守的是三个曾经真实存在的静默错误。它们都不会让请求失败，
 * 只会让盘悄悄错掉，所以必须由测试盯着。
 */

describe('节气基座：跨年区间', () => {
  /**
   * `getJieQiTable()` 里 24 个中文键覆盖本区间，另有 7 个拼音键跨到相邻年。
   * 只遍历中文键会漏掉冬至到年末那一段 —— 而冬至正是阴遁转阳遁的分界。
   */
  it('冬至之后到年末，判的是冬至而不是大雪', () => {
    // 2024 冬至：12-21 17:20
    assert.equal(resolveSolarTerm({ year: 2024, month: 12, day: 20, hour: 12 }).name, '大雪');
    assert.equal(resolveSolarTerm({ year: 2024, month: 12, day: 25, hour: 12 }).name, '冬至');
    assert.equal(resolveSolarTerm({ year: 2024, month: 12, day: 31, hour: 12 }).name, '冬至');
    assert.equal(resolveSolarTerm({ year: 2025, month: 1, day: 3, hour: 12 }).name, '冬至');
    assert.equal(resolveSolarTerm({ year: 2025, month: 1, day: 10, hour: 12 }).name, '小寒');
  });

  it('奇门在这一段跟着从阴遁翻成阳遁', () => {
    const beforeDongZhi = resolveJu(2024, 12, 20, 12);
    const afterDongZhi = resolveJu(2024, 12, 25, 12);
    assert.equal(beforeDongZhi.jieqi, '大雪');
    assert.equal(beforeDongZhi.yang, false, '大雪属阴遁');
    assert.equal(afterDongZhi.jieqi, '冬至');
    assert.equal(afterDongZhi.yang, true, '冬至起阳遁');
  });

  it('六壬月将在冬至后换成丑将大吉', () => {
    assert.equal(resolveMonthGeneral(2024, 12, 20, 12).branch, '寅');
    assert.equal(resolveMonthGeneral(2024, 12, 25, 12).branch, '丑');
    assert.equal(resolveMonthGeneral(2024, 12, 25, 12).cn, '大吉');
  });
});

describe('节气基座：交节精确到分', () => {
  // 2024 立春：2/4 16:27:07
  const lichun = { year: 2024, month: 2, day: 4 };

  it('交节当天，时刻决定落在哪个节气里', () => {
    assert.equal(resolveSolarTerm({ ...lichun, hour: 16, minute: 26 }).name, '大寒');
    assert.equal(resolveSolarTerm({ ...lichun, hour: 16, minute: 27 }).name, '立春');
    assert.equal(resolveSolarTerm({ ...lichun, hour: 17 }).name, '立春');
  });

  it('时刻恰等于交节时刻时算作已交节', () => {
    const term = resolveLiChun(2024);
    assert.equal(term.iso, '2024-02-04 16:27:07');
    assert.equal(
      resolveLiChunYear({ year: 2024, month: 2, day: 4, hour: term.at.hour, minute: term.at.minute }),
      2024
    );
  });

  it('奇门定局在交节前后是两个局', () => {
    const before = resolveJu(2024, 2, 4, 10);
    const after = resolveJu(2024, 2, 4, 17);
    assert.equal(before.jieqi, '大寒');
    assert.equal(after.jieqi, '立春');
    assert.notEqual(before.ju, after.ju);
  });

  it('八宅命卦在立春时刻前后差一位', () => {
    const before = resolveLifeTrigram(2024, 'male', {
      birthMonth: 2,
      birthDay: 4,
      birthHour: 10,
    });
    const after = resolveLifeTrigram(2024, 'male', {
      birthMonth: 2,
      birthDay: 4,
      birthHour: 17,
    });
    assert.equal(before.solarYearUsed, 2023);
    assert.equal(before.cn, '巽');
    assert.equal(after.solarYearUsed, 2024);
    assert.equal(after.cn, '震');
  });

  it('不给时刻的八宅结果标 precision: day，不冒充确定值', () => {
    assert.equal(
      resolveLifeTrigram(2024, 'male', { birthMonth: 2, birthDay: 4 }).precision,
      'day'
    );
    assert.equal(
      resolveLifeTrigram(2024, 'male', { birthMonth: 2, birthDay: 4, birthHour: 17 }).precision,
      'minute'
    );
    assert.equal(resolveLifeTrigram(2024, 'male').precision, 'year');
  });
});

describe('节气基座：与 lunar-javascript 交叉验证', () => {
  /**
   * 非交节当日，本模块的判定应与 lunar-javascript 的 `getPrevJieQi` 完全一致。
   * 交节当日两者可以不同 —— 它按日比较，本模块按时刻，那正是本模块存在的理由。
   */
  it('2020–2026 抽样逐日比对，非交节日零差异', () => {
    let checked = 0;
    const diffs = [];
    for (let year = 2020; year <= 2026; year += 1) {
      for (let month = 1; month <= 12; month += 1) {
        for (let day = 1; day <= 28; day += 2) {
          const mine = resolveSolarTerm({ year, month, day, hour: 12 });
          const theirs = Solar.fromYmd(year, month, day).getLunar().getPrevJieQi(true);
          checked += 1;
          if (mine.name === theirs.getName()) continue;
          const s = theirs.getSolar();
          const isTermDay = s.getYear() === year && s.getMonth() === month && s.getDay() === day;
          if (!isTermDay) diffs.push(`${year}-${month}-${day}: ${mine.name} vs ${theirs.getName()}`);
        }
      }
    }
    assert.ok(checked > 1000, `抽样量偏小：${checked}`);
    assert.deepEqual(diffs, []);
  });

  it('每年前后节气条数稳定，去重后无遗漏', () => {
    [2023, 2024, 2025].forEach((year) => {
      const terms = listSolarTerms(year);
      // 三张表合并去重后覆盖约三年零头，逐条严格递增
      assert.ok(terms.length >= 72, `${year} 年节气条数偏少：${terms.length}`);
      for (let i = 1; i < terms.length; i += 1) {
        assert.ok(terms[i].key > terms[i - 1].key, `${year} 年节气未严格递增`);
      }
    });
  });

  it('十二中气标记正确', () => {
    assert.equal(MID_QI_NAMES.size, 12);
    assert.equal(resolveSolarTerm({ year: 2024, month: 6, day: 25 }).name, '夏至');
    assert.equal(resolveSolarTerm({ year: 2024, month: 6, day: 25 }).isMidQi, true);
    assert.equal(resolveSolarTerm({ year: 2024, month: 6, day: 10 }).name, '芒种');
    assert.equal(resolveSolarTerm({ year: 2024, month: 6, day: 10 }).isMidQi, false);
  });
});

describe('节气时刻不经 Date，不随部署时区漂移', () => {
  /**
   * lunar-javascript 给的节气时刻是东八区墙钟。此前几处走 `toISOString()`，
   * 在 UTC 之东的时区会把日期整体退一天 —— 奇门的 `jieqiDate` 曾输出 2024-02-03。
   */
  it('奇门 jieqiDate 与真实交节日一致', () => {
    const ju = resolveJu(2024, 2, 10, 12);
    assert.equal(ju.jieqi, '立春');
    assert.equal(ju.jieqiDate, '2024-02-04');
    assert.equal(ju.jieqiAt, '2024-02-04 16:27:07');
  });

  it('六壬 afterQiDate 与真实交气日一致', () => {
    const general = resolveMonthGeneral(2024, 2, 25, 12);
    assert.equal(general.currentMidQi, '雨水');
    assert.equal(general.afterQiDate, '2024-02-19');
    assert.equal(general.afterQiAt, '2024-02-19 12:13:12');
  });

  it('resolveJieQi 的返回带得出交节时刻', () => {
    const term = resolveJieQi(2024, 12, 25, 12);
    assert.equal(term.name, '冬至');
    assert.equal(term.iso, '2024-12-21 17:20:35');
    assert.equal(term.daysSinceTerm, 4);
  });
});
