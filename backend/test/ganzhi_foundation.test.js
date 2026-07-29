import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LunarUtil } from 'lunar-javascript';

import { STEMS, BRANCHES, NAYIN, HIDDEN_STEMS, SEXAGENARY_CYCLE } from '../constants/ganzhi.js';
import {
  getNayin,
  getHiddenStems,
  getPrimaryHiddenStem,
  getTwelveStage,
  getStemCombination,
  isStemClash,
  detectBranchRelations,
  detectStemRelations,
  getXunkong,
  isXunkong,
  getFiveElementBureau,
  ganzhiFromIndex,
  ganzhiToIndex,
} from '../services/ganzhi.service.js';

describe('六十甲子与纳音', () => {
  it('六十甲子恰好 60 条且互不重复', () => {
    assert.equal(SEXAGENARY_CYCLE.length, 60);
    assert.equal(new Set(SEXAGENARY_CYCLE).size, 60);
    assert.equal(SEXAGENARY_CYCLE[0], '甲子');
    assert.equal(SEXAGENARY_CYCLE[59], '癸亥');
  });

  it('纳音表覆盖全部 60 组干支', () => {
    assert.equal(Object.keys(NAYIN).length, 60);
    SEXAGENARY_CYCLE.forEach((ganzhi) => {
      assert.ok(NAYIN[ganzhi], `${ganzhi} 缺纳音`);
    });
  });

  it('纳音与 lunar-javascript 独立实现逐条一致', () => {
    // 交叉校验：本仓库的纳音表是手工录入的，这里拿第三方库的表逐条比对，
    // 任何一条录错都会在这里炸出来，不依赖人眼核对。
    SEXAGENARY_CYCLE.forEach((ganzhi) => {
      assert.equal(NAYIN[ganzhi].name, LunarUtil.NAYIN[ganzhi], `${ganzhi} 纳音不符`);
    });
  });

  it('抽查经典纳音与其五行', () => {
    assert.deepEqual(getNayin('甲', '子'), { name: '海中金', element: 'Metal' });
    assert.deepEqual(getNayin('壬戌'), { name: '大海水', element: 'Water' });
    assert.deepEqual(getNayin('戊午'), { name: '天上火', element: 'Fire' });
    assert.equal(getNayin('甲', '丑'), null, '非法干支组合应返回 null');
  });
});

describe('地支藏干', () => {
  it('十二支齐全，且权重归一', () => {
    assert.equal(Object.keys(HIDDEN_STEMS).length, 12);
    BRANCHES.forEach((branch) => {
      const hidden = getHiddenStems(branch);
      assert.ok(hidden.length >= 1, `${branch} 无藏干`);
      const total = hidden.reduce((sum, item) => sum + item.weight, 0);
      assert.ok(Math.abs(total - 1) < 1e-9, `${branch} 藏干权重合计为 ${total}，应为 1`);
      assert.equal(hidden[0].role, 'primary', `${branch} 首位应为本气`);
    });
  });

  it('藏干内容符合子平通例', () => {
    assert.deepEqual(
      getHiddenStems('寅').map((h) => h.stem),
      ['甲', '丙', '戊']
    );
    assert.deepEqual(
      getHiddenStems('戌').map((h) => h.stem),
      ['戊', '辛', '丁']
    );
    assert.equal(getPrimaryHiddenStem('子'), '癸');
    assert.equal(getPrimaryHiddenStem('酉'), '辛');
    // 四正之中只有午另藏己土
    assert.equal(getHiddenStems('卯').length, 1);
    assert.equal(getHiddenStems('午').length, 2);
  });

  it('藏干本气的五行与地支五行一致', () => {
    const stemElement = {
      甲: 'Wood',
      乙: 'Wood',
      丙: 'Fire',
      丁: 'Fire',
      戊: 'Earth',
      己: 'Earth',
      庚: 'Metal',
      辛: 'Metal',
      壬: 'Water',
      癸: 'Water',
    };
    const branchElement = {
      子: 'Water',
      丑: 'Earth',
      寅: 'Wood',
      卯: 'Wood',
      辰: 'Earth',
      巳: 'Fire',
      午: 'Fire',
      未: 'Earth',
      申: 'Metal',
      酉: 'Metal',
      戌: 'Earth',
      亥: 'Water',
    };
    BRANCHES.forEach((branch) => {
      assert.equal(
        stemElement[getPrimaryHiddenStem(branch)],
        branchElement[branch],
        `${branch} 本气五行与地支五行不符`
      );
    });
  });
});

describe('十二长生', () => {
  it('阳干顺行：甲长生在亥、临官在寅、帝旺在卯', () => {
    assert.equal(getTwelveStage('甲', '亥').cn, '长生');
    assert.equal(getTwelveStage('甲', '寅').cn, '临官');
    assert.equal(getTwelveStage('甲', '卯').cn, '帝旺');
    assert.equal(getTwelveStage('甲', '未').cn, '墓');
  });

  it('阴干逆行：乙长生在午、临官在卯、帝旺在寅', () => {
    assert.equal(getTwelveStage('乙', '午').cn, '长生');
    assert.equal(getTwelveStage('乙', '卯').cn, '临官');
    assert.equal(getTwelveStage('乙', '寅').cn, '帝旺');
  });

  it('戊寄丙、己寄丁', () => {
    assert.equal(getTwelveStage('戊', '寅').cn, getTwelveStage('丙', '寅').cn);
    assert.equal(getTwelveStage('己', '酉').cn, getTwelveStage('丁', '酉').cn);
  });

  it('每个天干在十二支上恰好走满十二位，不重不漏', () => {
    STEMS.forEach((stem) => {
      const stages = BRANCHES.map((branch) => getTwelveStage(stem, branch).key);
      assert.equal(new Set(stages).size, 12, `${stem} 的十二长生有重复或遗漏`);
    });
  });
});

describe('干支合冲刑害', () => {
  it('天干五合与相冲', () => {
    assert.equal(getStemCombination('甲', '己').transform, 'Earth');
    assert.equal(getStemCombination('己', '甲').transform, 'Earth', '合应无向性');
    assert.equal(getStemCombination('甲', '乙'), null);
    assert.ok(isStemClash('甲', '庚'));
    assert.ok(!isStemClash('戊', '己'), '戊己土居中不冲');
  });

  it('三合全见成局，缺中神不成半合', () => {
    const full = detectBranchRelations(['申', '子', '辰', '午']);
    assert.equal(full.tripleCombinations.length, 1);
    assert.equal(full.tripleCombinations[0].transform, 'Water');

    const withCenter = detectBranchRelations(['申', '子']);
    assert.equal(withCenter.halfCombinations.length, 1, '带中神应成半合');

    const withoutCenter = detectBranchRelations(['申', '辰']);
    assert.equal(withoutCenter.halfCombinations.length, 0, '缺中神不成局');
  });

  it('三会方局', () => {
    const result = detectBranchRelations(['寅', '卯', '辰']);
    assert.equal(result.directional.length, 1);
    assert.equal(result.directional[0].transform, 'Wood');
  });

  it('六冲、六合、六害、相破', () => {
    const clash = detectBranchRelations(['子', '午']);
    assert.equal(clash.clashes.length, 1);
    assert.equal(detectBranchRelations(['子', '丑']).sixCombinations[0].transform, 'Earth');
    assert.equal(detectBranchRelations(['子', '未']).harms.length, 1);
    assert.equal(detectBranchRelations(['子', '酉']).destructions.length, 1);
  });

  it('三刑全见为 triple，两见为 partial', () => {
    const full = detectBranchRelations(['寅', '巳', '申']);
    const triple = full.punishments.find((p) => p.type === 'triple');
    assert.ok(triple, '寅巳申全见应成三刑');

    const partial = detectBranchRelations(['寅', '巳']).punishments;
    assert.equal(partial[0].type, 'partial');
  });

  it('自刑需同支重见，单见不成立', () => {
    assert.equal(detectBranchRelations(['辰']).punishments.length, 0);
    const selfPunish = detectBranchRelations(['辰', '辰']).punishments;
    assert.equal(selfPunish.length, 1);
    assert.equal(selfPunish[0].type, 'self');
  });

  it('子卯互刑', () => {
    const result = detectBranchRelations(['子', '卯']);
    assert.ok(result.punishments.some((p) => p.type === 'mutual'));
  });

  it('天干关系带回位置下标，便于定位是哪两柱', () => {
    const { combinations, clashes } = detectStemRelations(['甲', '己', '丙', '壬']);
    assert.deepEqual(combinations[0].positions, [0, 1]);
    assert.deepEqual(clashes[0].positions, [2, 3]);
  });
});

describe('旬空与五行局', () => {
  it('甲子旬空戌亥，甲辰旬空寅卯', () => {
    assert.deepEqual(getXunkong('甲子').branches, ['戌', '亥']);
    assert.deepEqual(getXunkong('甲', '辰').branches, ['寅', '卯']);
    assert.equal(getXunkong('乙丑').decade, '甲子', '同旬应归到同一旬首');
    assert.equal(getXunkong('不存在'), null);
  });

  it('isXunkong 判断目标支是否落空', () => {
    assert.ok(isXunkong('甲子', '戌'));
    assert.ok(!isXunkong('甲子', '子'));
  });

  it('五行局由命宫干支纳音取得', () => {
    // 甲子纳音海中金 → 金四局
    assert.deepEqual(getFiveElementBureau('甲', '子'), {
      value: 4,
      cn: '金四局',
      key: 'metal4',
      nayin: '海中金',
      element: 'Metal',
    });
    // 丙寅纳音炉中火 → 火六局
    assert.equal(getFiveElementBureau('丙', '寅').value, 6);
    // 戊辰纳音大林木 → 木三局
    assert.equal(getFiveElementBureau('戊', '辰').value, 3);
    assert.equal(getFiveElementBureau('甲', '丑'), null);
  });

  it('五行局只有 2/3/4/5/6 五种取值', () => {
    const seen = new Set();
    SEXAGENARY_CYCLE.forEach((ganzhi) => {
      const bureau = getFiveElementBureau(ganzhi[0], ganzhi[1]);
      assert.ok(bureau, `${ganzhi} 取不到五行局`);
      seen.add(bureau.value);
    });
    assert.deepEqual([...seen].sort(), [2, 3, 4, 5, 6]);
  });

  it('甲子数与干支互转', () => {
    assert.equal(ganzhiFromIndex(0), '甲子');
    assert.equal(ganzhiFromIndex(60), '甲子', '应按 60 取模');
    assert.equal(ganzhiFromIndex(-1), '癸亥', '负数索引也要落回环上');
    assert.equal(ganzhiToIndex('癸亥'), 59);
    assert.equal(ganzhiToIndex('甲', '子'), 0);
  });
});
