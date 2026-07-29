import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { TRIGRAM_LINES, TRIGRAM_BY_NUMBER, YOUNIAN_SEQUENCE } from '../constants/bazhai.js';
import {
  resolveLifeTrigram,
  buildYounianMap,
  buildBazhaiChart,
  buildAlmanac,
  buildNameGrids,
} from '../services/fengshui.service.js';

describe('本命卦', () => {
  it('八卦各有卦数与方位，中五无卦', () => {
    assert.equal(Object.keys(TRIGRAM_BY_NUMBER).length, 8);
    assert.equal(TRIGRAM_BY_NUMBER[5], undefined, '中五宫不立卦');
    assert.equal(Object.keys(TRIGRAM_LINES).length, 8);
  });

  it('男取 11 减、女取加四，得五者男寄坤女寄艮', () => {
    // 2000 年：2+0+0+0 = 2；男 11-2 = 9 离，女 2+4 = 6 乾
    assert.equal(resolveLifeTrigram(2000, 'male').cn, '离');
    assert.equal(resolveLifeTrigram(2000, 'female').cn, '乾');
    // 找一个得五的年份验证寄卦：男寄坤、女寄艮
    let maleLodged = false;
    let femaleLodged = false;
    for (let y = 1950; y <= 2050; y += 1) {
      const m = resolveLifeTrigram(y, 'male');
      const f = resolveLifeTrigram(y, 'female');
      assert.notEqual(m.number, 5, '男命不得停留在中五');
      assert.notEqual(f.number, 5, '女命不得停留在中五');
      if (m.cn === '坤') maleLodged = true;
      if (f.cn === '艮') femaleLodged = true;
    }
    assert.ok(maleLodged && femaleLodged);
  });

  it('东四命西四命分组正确', () => {
    ['坎', '离', '震', '巽'].forEach((cn) => {
      const entry = Object.values(TRIGRAM_BY_NUMBER).find((t) => t.cn === cn);
      assert.equal(entry.group, 'east', `${cn} 应属东四`);
    });
    ['乾', '坤', '艮', '兑'].forEach((cn) => {
      const entry = Object.values(TRIGRAM_BY_NUMBER).find((t) => t.cn === cn);
      assert.equal(entry.group, 'west', `${cn} 应属西四`);
    });
  });

  it('年以立春为界，正月初可能算作上一年', () => {
    // 2024 立春在 2/4。2/1 出生应按 2023 年取卦
    const before = resolveLifeTrigram(2024, 'male', { birthMonth: 2, birthDay: 1 });
    const after = resolveLifeTrigram(2024, 'male', { birthMonth: 2, birthDay: 20 });
    assert.equal(before.solarYearUsed, 2023);
    assert.equal(after.solarYearUsed, 2024);
  });
});

describe('游年九星', () => {
  it('变爻序列为上中下中上中下中，八步归位', () => {
    assert.deepEqual(
      YOUNIAN_SEQUENCE.map((s) => s.flip),
      [3, 2, 1, 2, 3, 2, 1, 2]
    );
    // 末位必为伏位，即回到本卦
    Object.keys(TRIGRAM_LINES).forEach((cn) => {
      const map = buildYounianMap(cn);
      assert.equal(map[map.length - 1].star.key, 'fuwei');
      assert.equal(map[map.length - 1].trigram, cn, `${cn} 八步后应回本卦`);
    });
  });

  it('八方各得一星，不重不漏', () => {
    Object.keys(TRIGRAM_LINES).forEach((cn) => {
      const map = buildYounianMap(cn);
      assert.equal(map.length, 8);
      assert.equal(new Set(map.map((m) => m.trigram)).size, 8, `${cn} 八方应各不相同`);
      assert.equal(new Set(map.map((m) => m.star.key)).size, 8);
    });
  });

  it('四吉四凶各半', () => {
    const map = buildYounianMap('坎');
    assert.equal(map.filter((m) => m.star.auspicious).length, 4);
    assert.equal(map.filter((m) => !m.star.auspicious).length, 4);
  });

  it('同组卦互为吉方：东四命的吉方落在东四卦上', () => {
    const chart = buildBazhaiChart({ birthYear: 2000, gender: 'male' });
    assert.equal(chart.lifeTrigram.cn, '离');
    assert.equal(chart.lifeTrigram.group, 'east');
    const auspiciousTrigrams = chart.younian.filter((y) => y.star.auspicious).map((y) => y.trigram);
    // 离命的四吉方应尽在东四卦（坎离震巽）之内
    auspiciousTrigrams.forEach((t) => {
      assert.ok(['坎', '离', '震', '巽'].includes(t), `${t} 不应是东四命的吉方`);
    });
  });

  it('八宅盘输出吉凶方位', () => {
    const chart = buildBazhaiChart({ birthYear: 1990, gender: 'female' });
    assert.equal(chart.auspiciousDirections.length, 4);
    assert.equal(chart.inauspiciousDirections.length, 4);
    assert.ok(chart.suitableHouseGroup.cn);
  });
});

describe('择日历注', () => {
  const almanac = buildAlmanac({ year: 2024, month: 5, day: 20 });

  it('给出干支、建除、值宿与吉神凶煞', () => {
    assert.equal(almanac.ganzhi.day.length, 2);
    assert.ok(almanac.zhiXing, '缺建除十二神');
    assert.ok(almanac.xiu.name, '缺二十八宿');
    assert.ok(Array.isArray(almanac.auspiciousGods));
    assert.ok(Array.isArray(almanac.inauspiciousGods));
    assert.ok(almanac.pengzu.gan && almanac.pengzu.zhi);
  });

  it('建除十二神取值合法', () => {
    const valid = ['建', '除', '满', '平', '定', '执', '破', '危', '成', '收', '开', '闭'];
    for (let day = 1; day <= 28; day += 1) {
      const a = buildAlmanac({ year: 2024, month: 3, day });
      assert.ok(valid.includes(a.zhiXing), `${day} 日建除值 ${a.zhiXing} 非法`);
    }
  });

  it('建除十二神在一个月内循环出现', () => {
    const seen = new Set();
    for (let day = 1; day <= 28; day += 1) {
      seen.add(buildAlmanac({ year: 2024, month: 3, day }).zhiXing);
    }
    assert.ok(seen.size >= 10, `一月内建除应基本走满一轮，实得 ${seen.size} 种`);
  });

  it('二十八宿逐日轮转', () => {
    const xius = [];
    for (let day = 1; day <= 28; day += 1) {
      xius.push(buildAlmanac({ year: 2024, month: 3, day }).xiu.name);
    }
    assert.equal(new Set(xius).size, 28, '二十八日应恰好走满二十八宿');
  });

  it('非法日期返回 null', () => {
    assert.equal(buildAlmanac({ year: 'x', month: 1, day: 1 }), null);
  });
});

describe('姓名五格', () => {
  it('单姓单名：天格姓加一，地格名加一', () => {
    // 姓 7 画、名 8 画
    const r = buildNameGrids([7], [8]);
    assert.equal(r.grids.heaven, 8, '单姓天格为姓加一');
    assert.equal(r.grids.human, 15, '人格为姓末字加名首字');
    assert.equal(r.grids.earth, 9, '单名地格为名加一');
    assert.equal(r.grids.total, 15);
    assert.equal(r.grids.outer, r.grids.total - r.grids.human + 1);
  });

  it('单姓双名', () => {
    const r = buildNameGrids([7], [8, 9]);
    assert.equal(r.grids.heaven, 8);
    assert.equal(r.grids.human, 15);
    assert.equal(r.grids.earth, 17, '双名地格为两字之和');
    assert.equal(r.grids.total, 24);
  });

  it('复姓：天格为两字之和', () => {
    const r = buildNameGrids([5, 6], [8]);
    assert.equal(r.grids.heaven, 11);
    assert.equal(r.grids.human, 14, '人格取姓之末字');
    assert.equal(r.grids.total, 19);
  });

  it('五行按个位取，三才为天人地', () => {
    const r = buildNameGrids([7], [8]);
    // 天格 8 → 金，人格 15 → 五 → 土，地格 9 → 水
    assert.equal(r.sancai.heaven, 'Metal');
    assert.equal(r.sancai.human, 'Earth');
    assert.equal(r.sancai.earth, 'Water');
    assert.ok(r.sancaiRelations.heavenToHuman);
    assert.ok(r.sancaiRelations.humanToEarth);
  });

  it('十画整数归水', () => {
    const r = buildNameGrids([9], [10]);
    // 天格 10 → 水
    assert.equal(r.gridElements.heaven, 'Water');
  });

  it('缺笔画返回 null，不臆造', () => {
    assert.equal(buildNameGrids([], [8]), null);
    assert.equal(buildNameGrids([7], []), null);
    assert.equal(buildNameGrids(null, null), null);
  });
});
