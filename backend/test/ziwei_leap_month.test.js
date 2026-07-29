import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { calculateZiweiChart } from '../services/ziwei.service.js';

/**
 * 闰月回归。
 *
 * lunar-javascript 用负数月份表示闰月（闰二月 = -2）。这个约定曾经把紫微盘算错两次：
 *   - 判闰月读的是不存在的 lunar.isLeap，恒为 false，闰月识别不出来；
 *   - 负数直接进 normalizeIndex(-2 - 1) = 9，而二月本该是 1，月支错位、紫微星落宫全错。
 *
 * 两处都不会抛错，返回的依然是一张结构完整的盘 —— 所以只能靠测试守。
 *
 * 选定流派：**闰月归本月**，闰二月与二月落同一个月支。
 */

// 2023 年闰二月。两个日期的农历「日」都是初四、时辰相同，
// 因此按本月流派，除干支外的宫位结果必须完全一致。
const NORMAL_2ND_MONTH = { birthYear: 2023, birthMonth: 2, birthDay: 23, birthHour: 10 }; // 农历二月初四
const LEAP_2ND_MONTH = { birthYear: 2023, birthMonth: 3, birthDay: 25, birthHour: 10 }; // 农历闰二月初四

describe('紫微：闰月处理', () => {
  it('闰月能被识别出来，且月份不再是负数', () => {
    const chart = calculateZiweiChart({ ...LEAP_2ND_MONTH, gender: 'male' });

    assert.equal(chart.lunar.isLeap, true, '闰二月必须标记为闰月');
    assert.equal(chart.lunar.month, 2, '对外暴露的月份应是正数 2，不是 -2');
    assert.equal(chart.lunar.day, 4);
  });

  it('非闰月不受影响', () => {
    const chart = calculateZiweiChart({ ...NORMAL_2ND_MONTH, gender: 'male' });

    assert.equal(chart.lunar.isLeap, false);
    assert.equal(chart.lunar.month, 2);
    assert.equal(chart.lunar.day, 4);
  });

  it('闰月归本月：闰二月初四与二月初四落在同一组宫位', () => {
    const normal = calculateZiweiChart({ ...NORMAL_2ND_MONTH, gender: 'male' });
    const leap = calculateZiweiChart({ ...LEAP_2ND_MONTH, gender: 'male' });

    assert.equal(
      leap.mingPalace.index,
      normal.mingPalace.index,
      '闰月按本月算，命宫必须与同日的本月盘一致'
    );
    assert.equal(leap.shenPalace.index, normal.shenPalace.index, '身宫同理');
    assert.equal(leap.mingPalace.branch.key, normal.mingPalace.branch.key);
  });

  it('负数月份没有被当成合法索引用掉', () => {
    // 这是修复前的具体症状：normalizeIndex(-2 - 1) = 9，落到第 10 个位置。
    // 断言闰二月不等于"农历十月"那张盘，就能锁住这个回归。
    const leap = calculateZiweiChart({ ...LEAP_2ND_MONTH, gender: 'male' });
    const tenthMonthSameDay = calculateZiweiChart({
      birthYear: 2023,
      birthMonth: 11,
      birthDay: 16, // 农历十月初四
      birthHour: 10,
      gender: 'male',
    });

    assert.equal(tenthMonthSameDay.lunar.month, 10, '前置条件：这天确实是农历十月');
    assert.equal(tenthMonthSameDay.lunar.day, 4, '前置条件：农历日也要相同才有可比性');
    assert.notEqual(
      leap.mingPalace.index,
      tenthMonthSameDay.mingPalace.index,
      '闰二月被错当成第 10 个月支时，命宫会和农历十月重合'
    );
  });

  it('闰月盘依然是一张结构完整的盘', () => {
    const chart = calculateZiweiChart({ ...LEAP_2ND_MONTH, gender: 'female' });

    assert.equal(chart.palaces.length, 12);
    assert.equal(chart.palaces.filter((p) => p.palace).length, 12, '十二宫都要落定，不能有空宫位');
    assert.ok(chart.mingPalace.branch, '命宫必须有地支');
  });
});
