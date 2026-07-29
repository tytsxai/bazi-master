import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ZIWEI_BRANCH_ORDER, ZIWEI_MAJOR_STARS } from '../constants/ziwei.js';
import {
  calculateZiweiChart,
  locateZiwei,
  locateTianfu,
  buildPalaceStems,
  getTimeBranchIndex,
} from '../services/ziwei.service.js';

const branchAt = (index) => ZIWEI_BRANCH_ORDER[index];

/**
 * 紫微诸星安星表（初一至初十，五局）。
 * 出自斗数通行安星表，是本模块唯一的外部基准 —— 实现改动后这张表必须照旧通过。
 */
const ZIWEI_TABLE = {
  2: ['丑', '寅', '寅', '卯', '卯', '辰', '辰', '巳', '巳', '午'],
  3: ['辰', '丑', '寅', '巳', '寅', '卯', '午', '卯', '辰', '未'],
  4: ['亥', '辰', '丑', '寅', '子', '巳', '寅', '卯', '丑', '午'],
  5: ['午', '亥', '辰', '丑', '寅', '未', '子', '巳', '寅', '卯'],
  6: ['酉', '午', '亥', '辰', '丑', '寅', '戌', '未', '子', '巳'],
};

describe('紫微星定位', () => {
  it('五局初一至初十逐日与安星表一致', () => {
    Object.entries(ZIWEI_TABLE).forEach(([bureau, expected]) => {
      expected.forEach((branch, idx) => {
        const day = idx + 1;
        const actual = branchAt(locateZiwei(Number(bureau), day));
        assert.equal(actual, branch, `${bureau}局 初${day} 紫微应在${branch}，实得${actual}`);
      });
    });
  });

  it('局数越大紫微起点越远离寅宫', () => {
    // 初一时紫微落宫由局数唯一决定：水二丑、木三辰、金四亥、土五午、火六酉
    assert.equal(branchAt(locateZiwei(2, 1)), '丑');
    assert.equal(branchAt(locateZiwei(3, 1)), '辰');
    assert.equal(branchAt(locateZiwei(4, 1)), '亥');
    assert.equal(branchAt(locateZiwei(5, 1)), '午');
    assert.equal(branchAt(locateZiwei(6, 1)), '酉');
  });

  it('整月每一天都能落到合法宫位', () => {
    [2, 3, 4, 5, 6].forEach((bureau) => {
      for (let day = 1; day <= 30; day += 1) {
        const index = locateZiwei(bureau, day);
        assert.ok(index >= 0 && index < 12, `${bureau}局 ${day} 日落到非法宫位 ${index}`);
      }
    });
  });
});

describe('天府定位', () => {
  it('与紫微关于寅申轴对称', () => {
    // 紫微在寅或申，两星同宫；其余位置镜像
    assert.equal(branchAt(locateTianfu(ZIWEI_BRANCH_ORDER.indexOf('寅'))), '寅');
    assert.equal(branchAt(locateTianfu(ZIWEI_BRANCH_ORDER.indexOf('申'))), '申');
    assert.equal(branchAt(locateTianfu(ZIWEI_BRANCH_ORDER.indexOf('卯'))), '丑');
    assert.equal(branchAt(locateTianfu(ZIWEI_BRANCH_ORDER.indexOf('丑'))), '卯');
    assert.equal(branchAt(locateTianfu(ZIWEI_BRANCH_ORDER.indexOf('辰'))), '子');
  });

  it('镜像是对合的：对天府再取一次镜像回到紫微', () => {
    for (let i = 0; i < 12; i += 1) {
      assert.equal(locateTianfu(locateTianfu(i)), i);
    }
  });
});

describe('十二宫天干（五虎遁）', () => {
  it('甲年寅宫起丙寅，顺排至丑宫', () => {
    const stems = buildPalaceStems('甲');
    assert.equal(stems[ZIWEI_BRANCH_ORDER.indexOf('寅')], '丙');
    assert.equal(stems[ZIWEI_BRANCH_ORDER.indexOf('卯')], '丁');
    // 自寅顺排：寅丙 卯丁 辰戊 巳己 午庚 未辛 申壬 酉癸 戌甲 亥乙 子丙 丑丁
    assert.equal(stems[ZIWEI_BRANCH_ORDER.indexOf('戌')], '甲');
    assert.equal(stems[ZIWEI_BRANCH_ORDER.indexOf('子')], '丙');
  });

  it('五虎遁分组正确：甲己丙作首、戊癸甲作首', () => {
    const yinIdx = ZIWEI_BRANCH_ORDER.indexOf('寅');
    assert.equal(buildPalaceStems('己')[yinIdx], '丙');
    assert.equal(buildPalaceStems('乙')[yinIdx], '戊');
    assert.equal(buildPalaceStems('庚')[yinIdx], '戊');
    assert.equal(buildPalaceStems('癸')[yinIdx], '甲');
  });
});

describe('时支换算', () => {
  it('子时跨日：23 时与 0 时同为子', () => {
    assert.equal(getTimeBranchIndex(23), 0);
    assert.equal(getTimeBranchIndex(0), 0);
    assert.equal(getTimeBranchIndex(1), 1); // 丑
    assert.equal(getTimeBranchIndex(12), 6); // 午
  });
});

describe('整盘结构不变量', () => {
  // 取若干跨年份、跨月份、跨时辰的样本，任一盘都必须满足斗数的结构铁律
  const samples = [
    { birthYear: 1990, birthMonth: 5, birthDay: 12, birthHour: 10 },
    { birthYear: 1984, birthMonth: 1, birthDay: 1, birthHour: 23 },
    { birthYear: 2000, birthMonth: 12, birthDay: 31, birthHour: 0 },
    { birthYear: 1976, birthMonth: 8, birthDay: 20, birthHour: 15 },
    { birthYear: 2023, birthMonth: 3, birthDay: 7, birthHour: 6 },
  ];

  const collectStars = (chart) => {
    const map = new Map();
    chart.palaces.forEach((palace) => {
      [...palace.stars.major, ...palace.stars.minor, ...palace.stars.malefic].forEach((star) => {
        map.set(star.key, palace.index);
      });
    });
    return map;
  };

  samples.forEach((sample) => {
    const label = `${sample.birthYear}-${sample.birthMonth}-${sample.birthDay} ${sample.birthHour}时`;

    it(`${label}：十四主星不重不漏各安一次`, () => {
      const chart = calculateZiweiChart(sample);
      const majors = chart.palaces.flatMap((p) => p.stars.major.map((s) => s.key));
      assert.equal(majors.length, 14, '十四主星总数应为 14');
      assert.equal(new Set(majors).size, 14, '主星出现重复');
      Object.keys(ZIWEI_MAJOR_STARS).forEach((key) => {
        assert.ok(majors.includes(key), `缺主星 ${key}`);
      });
    });

    it(`${label}：杀破狼互隔四宫成三合`, () => {
      const stars = collectStars(calculateZiweiChart(sample));
      const gap = (a, b) => ((stars.get(a) - stars.get(b) + 12) % 12);
      assert.equal(gap('qisha', 'tanlang'), 4, '七杀贪狼未成三合');
      assert.equal(gap('pojun', 'qisha'), 4, '破军七杀未成三合');
      assert.equal(gap('tanlang', 'pojun'), 4, '贪狼破军未成三合');
    });

    it(`${label}：七杀天府相冲、破军天相相冲`, () => {
      const stars = collectStars(calculateZiweiChart(sample));
      const opposite = (a, b) => ((stars.get(a) - stars.get(b) + 12) % 12) === 6;
      assert.ok(opposite('qisha', 'tianfu'), '七杀天府应永远相对');
      assert.ok(opposite('pojun', 'tianxiang'), '破军天相应永远相对');
    });

    it(`${label}：五行局有效且十二宫齐备`, () => {
      const chart = calculateZiweiChart(sample);
      assert.ok(chart.fiveElementBureau, '未能定出五行局');
      assert.ok([2, 3, 4, 5, 6].includes(chart.fiveElementBureau.value));
      const palaceKeys = chart.palaces.map((p) => p.palace?.key).filter(Boolean);
      assert.equal(new Set(palaceKeys).size, 12, '十二宫应各安一次');
      assert.equal(chart.palaces[chart.mingPalace.index].palace.key, 'ming');
    });

    it(`${label}：六吉六煞全部落盘`, () => {
      const stars = collectStars(calculateZiweiChart(sample));
      ['wenchang', 'wenqu', 'zuofu', 'youbi', 'tiankui', 'tianyue', 'lucun', 'tianma'].forEach(
        (key) => assert.ok(stars.has(key), `缺吉星 ${key}`)
      );
      ['qingyang', 'tuoluo', 'huoxing', 'lingxing', 'dikong', 'dijie'].forEach((key) =>
        assert.ok(stars.has(key), `缺煞星 ${key}`)
      );
    });

    it(`${label}：擎羊陀罗夹禄存`, () => {
      const stars = collectStars(calculateZiweiChart(sample));
      const lucun = stars.get('lucun');
      assert.equal(stars.get('qingyang'), (lucun + 1) % 12, '擎羊应在禄存前一位');
      assert.equal(stars.get('tuoluo'), (lucun + 11) % 12, '陀罗应在禄存后一位');
    });
  });
});

describe('本命四化', () => {
  it('四化落到星曜所在宫，并标注化禄化权化科化忌', () => {
    const chart = calculateZiweiChart({
      birthYear: 1990,
      birthMonth: 5,
      birthDay: 12,
      birthHour: 10,
    });
    assert.equal(chart.fourTransformations.length, 4);
    const types = chart.fourTransformations.map((t) => t.type).sort();
    assert.deepEqual(types, ['ji', 'ke', 'lu', 'quan']);

    // 庚年四化：太阳化禄、武曲化权、太阴化科、天同化忌
    const geng = calculateZiweiChart({
      birthYear: 1990,
      birthMonth: 8,
      birthDay: 8,
      birthHour: 8,
    });
    assert.equal(geng.lunar.yearStem, '庚');
    const lu = geng.fourTransformations.find((t) => t.type === 'lu');
    assert.equal(lu.starKey, 'taiyang');
    assert.equal(lu.typeCn, '化禄');

    // 化忌必须真的落在某个宫的 transformations 里，而不是只挂在顶层
    const flat = geng.palaces.flatMap((p) => p.transformations.map((t) => t.type));
    assert.ok(flat.includes('ji'), '化忌未落宫');
    assert.equal(flat.length, 4, '四化应恰好落盘四次');
  });
});

describe('闰月处理', () => {
  it('闰月归本月，且被标记出来', () => {
    // 2023 年闰二月：农历闰二月十五 对应公历 2023-04-05
    const chart = calculateZiweiChart({
      birthYear: 2023,
      birthMonth: 4,
      birthDay: 5,
      birthHour: 12,
    });
    assert.equal(chart.lunar.isLeap, true, '应识别为闰月');
    assert.ok(chart.lunar.month > 0, '月份不得为负');
    assert.ok(chart.fiveElementBureau, '闰月盘也要能定五行局');
  });
});
