import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { TRIGRAMS } from '../data/ichingHexagrams.js';
import { HEXAGRAM_NAMES, TRIGRAM_CN, PALACE_ORDER } from '../constants/liuyao.js';
import {
  getTrigram,
  getPalaceInfo,
  listPalaceMap,
  getHexagramName,
  buildNajia,
  getSixRelative,
  buildSixGods,
  findHiddenSpirits,
  buildLiuyaoChart,
} from '../services/liuyao.service.js';

/** 由上下卦名组出六爻（下卦在前，自初爻起）。 */
const linesOf = (upperName, lowerName) => {
  const upper = TRIGRAMS.find((t) => t.name === upperName);
  const lower = TRIGRAMS.find((t) => t.name === lowerName);
  return [...lower.lines, ...upper.lines];
};

describe('六十四卦名表', () => {
  it('恰好 64 条，序号 1..64 不重不漏', () => {
    const entries = Object.values(HEXAGRAM_NAMES);
    assert.equal(entries.length, 64);
    const sequences = entries.map((e) => e.sequence).sort((a, b) => a - b);
    assert.deepEqual(
      sequences,
      Array.from({ length: 64 }, (_, i) => i + 1)
    );
    assert.equal(new Set(entries.map((e) => e.cn)).size, 64, '卦名有重复');
  });

  it('卦名与上下卦自洽', () => {
    // 非纯卦的卦名格式恒为「上卦象 + 下卦象 + 卦名」，如坎上震下 = 水雷屯；
    // 八纯卦格式为「X 为 Y」，如乾为天。这条规律能抓出任何上下卦错配。
    Object.entries(HEXAGRAM_NAMES).forEach(([key, entry]) => {
      const [upper, lower] = key.split('-');
      const upperImage = TRIGRAM_CN[upper].image;
      const lowerImage = TRIGRAM_CN[lower].image;
      if (upper === lower) {
        assert.equal(
          entry.cn,
          `${TRIGRAM_CN[upper].cn}为${upperImage}`,
          `${key} 八纯卦名不符：${entry.cn}`
        );
      } else {
        assert.equal(
          entry.cn.slice(0, 2),
          `${upperImage}${lowerImage}`,
          `${key} 卦名「${entry.cn}」与上下卦（${upperImage}上${lowerImage}下）不符`
        );
      }
    });
  });

  it('抽查经典卦序', () => {
    assert.equal(getHexagramName(linesOf('Qian', 'Qian')).cn, '乾为天');
    assert.equal(getHexagramName(linesOf('Kun', 'Kun')).sequence, 2);
    assert.equal(getHexagramName(linesOf('Kan', 'Zhen')).cn, '水雷屯');
    assert.equal(getHexagramName(linesOf('Gen', 'Kan')).cn, '山水蒙');
    assert.equal(getHexagramName(linesOf('Li', 'Kan')).cn, '火水未济');
    assert.equal(getHexagramName(linesOf('Kan', 'Li')).cn, '水火既济');
  });
});

describe('八宫推衍', () => {
  const map = listPalaceMap();

  it('八宫 × 八世恰好覆盖六十四卦，无重叠', () => {
    assert.equal(map.size, 64, `宫属表应覆盖 64 卦，实得 ${map.size}`);
    PALACE_ORDER.forEach((palace) => {
      const count = [...map.values()].filter((v) => v.palace === palace).length;
      assert.equal(count, 8, `${palace} 宫应辖 8 卦，实得 ${count}`);
    });
  });

  it('乾宫八卦与传世卦序一致', () => {
    // 乾、姤、遁、否、观、剥、晋、大有
    const expected = [
      '乾为天',
      '天风姤',
      '天山遁',
      '天地否',
      '风地观',
      '山地剥',
      '火地晋',
      '火天大有',
    ];
    const qianPalace = [...map.entries()]
      .filter(([, v]) => v.palace === 'Qian')
      .map(([lines, v]) => ({ cn: getHexagramName(lines.split('').map(Number)).cn, type: v.type }));

    const order = ['benGong', 'yiShi', 'erShi', 'sanShi', 'siShi', 'wuShi', 'youHun', 'guiHun'];
    order.forEach((type, i) => {
      const hit = qianPalace.find((h) => h.type === type);
      assert.equal(hit.cn, expected[i], `乾宫${type} 应为 ${expected[i]}`);
    });
  });

  it('坤宫归魂为水地比，震宫游魂为泽风大过', () => {
    const kunGuiHun = [...map.entries()].find(([, v]) => v.palace === 'Kun' && v.type === 'guiHun');
    assert.equal(getHexagramName(kunGuiHun[0].split('').map(Number)).cn, '水地比');

    const zhenYouHun = [...map.entries()].find(
      ([, v]) => v.palace === 'Zhen' && v.type === 'youHun'
    );
    assert.equal(getHexagramName(zhenYouHun[0].split('').map(Number)).cn, '泽风大过');
  });

  it('世爻位置合乎世卦名目，应爻与世爻恒隔两爻', () => {
    const expectedShi = {
      benGong: 6,
      yiShi: 1,
      erShi: 2,
      sanShi: 3,
      siShi: 4,
      wuShi: 5,
      youHun: 4,
      guiHun: 3,
    };
    map.forEach((info) => {
      assert.equal(info.shiYao, expectedShi[info.type], `${info.type} 世爻位置不符`);
      const gap = Math.abs(info.shiYao - info.yingYao);
      assert.equal(gap, 3, '世应应恒隔两爻（位差 3）');
    });
  });

  it('八纯卦世在六爻应在三爻', () => {
    const qian = getPalaceInfo(linesOf('Qian', 'Qian'));
    assert.equal(qian.type, 'benGong');
    assert.equal(qian.shiYao, 6);
    assert.equal(qian.yingYao, 3);
  });
});

describe('纳甲装卦', () => {
  it('乾为天：内卦甲子甲寅甲辰，外卦壬午壬申壬戌', () => {
    const najia = buildNajia(linesOf('Qian', 'Qian'));
    assert.deepEqual(
      najia.map((y) => `${y.stem}${y.branch}`),
      ['甲子', '甲寅', '甲辰', '壬午', '壬申', '壬戌']
    );
  });

  it('坤为地：内卦乙未乙巳乙卯，外卦癸丑癸亥癸酉', () => {
    const najia = buildNajia(linesOf('Kun', 'Kun'));
    assert.deepEqual(
      najia.map((y) => `${y.stem}${y.branch}`),
      ['乙未', '乙巳', '乙卯', '癸丑', '癸亥', '癸酉']
    );
  });

  it('八纯卦纳甲与京房定例一致', () => {
    const expected = {
      Zhen: ['庚子', '庚寅', '庚辰', '庚午', '庚申', '庚戌'],
      Xun: ['辛丑', '辛亥', '辛酉', '辛未', '辛巳', '辛卯'],
      Kan: ['戊寅', '戊辰', '戊午', '戊申', '戊戌', '戊子'],
      Li: ['己卯', '己丑', '己亥', '己酉', '己未', '己巳'],
      Gen: ['丙辰', '丙午', '丙申', '丙戌', '丙子', '丙寅'],
      Dui: ['丁巳', '丁卯', '丁丑', '丁亥', '丁酉', '丁未'],
    };
    Object.entries(expected).forEach(([name, ganzhi]) => {
      const najia = buildNajia(linesOf(name, name));
      assert.deepEqual(
        najia.map((y) => `${y.stem}${y.branch}`),
        ganzhi,
        `${name} 为纯卦纳甲不符`
      );
    });
  });

  it('异卦相叠时内外各取所属：天风姤内卦取巽、外卦取乾', () => {
    const najia = buildNajia(linesOf('Qian', 'Xun'));
    assert.deepEqual(
      najia.map((y) => `${y.stem}${y.branch}`),
      ['辛丑', '辛亥', '辛酉', '壬午', '壬申', '壬戌']
    );
  });

  it('六十四卦都能装出六爻干支', () => {
    TRIGRAMS.forEach((upper) => {
      TRIGRAMS.forEach((lower) => {
        const najia = buildNajia(linesOf(upper.name, lower.name));
        assert.equal(najia.length, 6, `${upper.name}上${lower.name}下 装卦失败`);
        najia.forEach((yao) => {
          assert.ok(yao.stem && yao.branch);
        });
      });
    });
  });
});

describe('六亲与六神', () => {
  it('乾宫属金：乾为天六爻六亲为子孙妻财父母官鬼兄弟父母', () => {
    const chart = buildLiuyaoChart(linesOf('Qian', 'Qian'), { dayGanzhi: '甲子' });
    assert.deepEqual(
      chart.yaos.map((y) => y.relative.cn),
      ['子孙', '妻财', '父母', '官鬼', '兄弟', '父母']
    );
  });

  it('六亲生克取法正确', () => {
    // 以金为我
    assert.equal(getSixRelative('Metal', 'Metal').cn, '兄弟');
    assert.equal(getSixRelative('Metal', 'Water').cn, '子孙'); // 我生者
    assert.equal(getSixRelative('Metal', 'Earth').cn, '父母'); // 生我者
    assert.equal(getSixRelative('Metal', 'Wood').cn, '妻财'); // 我克者
    assert.equal(getSixRelative('Metal', 'Fire').cn, '官鬼'); // 克我者
  });

  it('六神按日干起，自初爻顺行', () => {
    assert.deepEqual(
      buildSixGods('甲').map((g) => g.cn),
      ['青龙', '朱雀', '勾陈', '螣蛇', '白虎', '玄武']
    );
    assert.deepEqual(
      buildSixGods('戊').map((g) => g.cn),
      ['勾陈', '螣蛇', '白虎', '玄武', '青龙', '朱雀']
    );
    // 壬癸起玄武，绕回青龙
    assert.deepEqual(
      buildSixGods('壬').map((g) => g.cn),
      ['玄武', '青龙', '朱雀', '勾陈', '螣蛇', '白虎']
    );
    assert.deepEqual(buildSixGods('乙'), buildSixGods('甲'));
  });
});

describe('伏神', () => {
  it('六亲齐全则无伏神', () => {
    const chart = buildLiuyaoChart(linesOf('Qian', 'Qian'), { dayGanzhi: '甲子' });
    assert.equal(chart.hiddenSpirits.length, 0, '乾为天六亲俱全，不应有伏神');
  });

  it('天风姤缺妻财，伏神取本宫乾卦的寅木妻财', () => {
    const lines = linesOf('Qian', 'Xun');
    const info = getPalaceInfo(lines);
    const hidden = findHiddenSpirits(lines, info);
    assert.equal(hidden.length, 1);
    assert.equal(hidden[0].relative.cn, '妻财');
    assert.equal(hidden[0].branch, '寅');
    assert.equal(hidden[0].position, 2, '应伏于本宫卦该六亲所在之爻');
  });

  it('伏神所缺六亲确实不在本卦中', () => {
    const lines = linesOf('Qian', 'Xun');
    const chart = buildLiuyaoChart(lines, { dayGanzhi: '甲子' });
    const present = new Set(chart.yaos.map((y) => y.relative.key));
    chart.hiddenSpirits.forEach((h) => {
      assert.ok(!present.has(h.relative.key), `${h.relative.cn} 已上卦，不该再作伏神`);
    });
  });
});

describe('动爻与变卦', () => {
  const lines = linesOf('Qian', 'Qian');

  it('无动爻时不给之卦', () => {
    const chart = buildLiuyaoChart(lines, { dayGanzhi: '甲子' });
    assert.equal(chart.changedHexagram, null);
    assert.ok(chart.yaos.every((y) => !y.isChanging));
  });

  it('动爻反转阴阳，之卦卦名正确', () => {
    // 乾为天初爻动 → 天风姤
    const chart = buildLiuyaoChart(lines, { changingLines: [1], dayGanzhi: '甲子' });
    assert.equal(chart.changedHexagram.name.cn, '天风姤');
    assert.ok(chart.yaos[0].isChanging);
    assert.equal(chart.yaos[0].changedTo.branch, '丑', '初爻变后纳甲应改取巽宫之支');
  });

  it('变爻六亲仍以本卦之宫为我，不按之卦重排', () => {
    // 乾为天（金宫）初爻动变姤。之爻丑土，以金为我 → 父母；
    // 若误按之卦（姤仍属乾宫，故另取一例）以变卦宫论会得出不同六亲。
    const chart = buildLiuyaoChart(linesOf('Kun', 'Kun'), {
      changingLines: [1],
      dayGanzhi: '甲子',
    });
    // 坤宫属土，本卦初爻乙未土为兄弟；动变后初爻成震之子水，以土为我 → 妻财
    assert.equal(chart.palace.palaceElement, 'Earth');
    assert.equal(chart.yaos[0].relative.cn, '兄弟');
    assert.equal(chart.yaos[0].changedTo.branch, '子');
    assert.equal(chart.yaos[0].changedTo.relative.cn, '妻财');
  });

  it('多爻齐动', () => {
    const chart = buildLiuyaoChart(lines, { changingLines: [1, 3, 5], dayGanzhi: '甲子' });
    assert.equal(chart.yaos.filter((y) => y.isChanging).length, 3);
    assert.deepEqual(chart.changedHexagram.lines, [0, 1, 0, 1, 0, 1]);
  });

  it('越界的动爻位被忽略', () => {
    const chart = buildLiuyaoChart(lines, { changingLines: [0, 7, 99], dayGanzhi: '甲子' });
    assert.equal(chart.changedHexagram, null);
  });
});

describe('旬空与月建日辰', () => {
  it('旬空按日干支所在旬取得，并标到爻上', () => {
    // 甲子旬空戌亥；乾为天上爻戌、无亥
    const chart = buildLiuyaoChart(linesOf('Qian', 'Qian'), { dayGanzhi: '甲子' });
    assert.deepEqual(chart.xunkong.branches, ['戌', '亥']);
    assert.ok(chart.yaos[5].influence.xunkong, '戌爻应落空亡');
    assert.ok(!chart.yaos[0].influence.xunkong, '子爻不该落空');
  });

  it('月破：爻支与月建相冲', () => {
    // 乾为天四爻午火，月建子水，子午相冲 → 月破
    const chart = buildLiuyaoChart(linesOf('Qian', 'Qian'), {
      dayGanzhi: '甲子',
      monthBranch: '子',
    });
    assert.ok(chart.yaos[3].influence.monthBroken, '午爻遇子月应为月破');
    assert.ok(!chart.yaos[1].influence.monthBroken);
  });

  it('日辰冲合各爻', () => {
    const chart = buildLiuyaoChart(linesOf('Qian', 'Qian'), { dayGanzhi: '甲午' });
    // 日支午：冲子（初爻），合未（本卦无未）
    assert.ok(chart.yaos[0].influence.clashedByDay, '子爻应被午日冲');
    const chartChou = buildLiuyaoChart(linesOf('Qian', 'Qian'), { dayGanzhi: '甲子' });
    // 日支子：与丑合，乾卦无丑；与午冲
    assert.ok(chartChou.yaos[3].influence.clashedByDay, '午爻应被子日冲');
  });

  it('缺日干支时不臆造六神与旬空', () => {
    const chart = buildLiuyaoChart(linesOf('Qian', 'Qian'));
    assert.equal(chart.xunkong, null);
    assert.ok(chart.yaos.every((y) => y.sixGod === null));
  });
});

describe('整卦结构', () => {
  it('六十四卦都能装出完整可断之卦', () => {
    TRIGRAMS.forEach((upper) => {
      TRIGRAMS.forEach((lower) => {
        const chart = buildLiuyaoChart(linesOf(upper.name, lower.name), { dayGanzhi: '甲子' });
        assert.ok(chart, `${upper.name}上${lower.name}下 装卦失败`);
        assert.ok(chart.name?.cn, '缺卦名');
        assert.ok(chart.palace?.palace, '缺宫属');
        assert.equal(chart.yaos.length, 6);
        chart.yaos.forEach((y) => {
          assert.ok(y.relative, '缺六亲');
          assert.ok(y.sixGod, '缺六神');
        });
        assert.equal(chart.yaos.filter((y) => y.isShi).length, 1, '世爻应恰有一个');
        assert.equal(chart.yaos.filter((y) => y.isYing).length, 1, '应爻应恰有一个');
      });
    });
  });

  it('非法输入返回 null', () => {
    assert.equal(buildLiuyaoChart([1, 1, 1]), null);
    assert.equal(buildLiuyaoChart(null), null);
  });
});
