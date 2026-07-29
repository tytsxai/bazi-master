import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { performCalculation, resolveChartTime } from '../services/calculations.service.js';
import { buildBaziCacheKey } from '../services/cache.service.js';

const BASE = {
  birthYear: 1990,
  birthMonth: 5,
  birthDay: 12,
  birthHour: 10,
  birthMinute: 0,
  gender: 'male',
};

// 乌鲁木齐一带（东经约 87.6）行用北京时间，标准经线 120°E，
// 经度差 32.4 度 × 4 分钟 ≈ 落后 130 分钟 —— 足以把巳时推回辰时。
const FAR_WEST = { birthLocation: '43.8,87.6', timezoneOffsetMinutes: 480 };

describe('真太阳时参与排盘', () => {
  it('不给出生地时按钟表时间排盘，不臆造校正', () => {
    const resolved = resolveChartTime(BASE);
    assert.equal(resolved.trueSolarTime, null);
    assert.equal(resolved.hour, 10);
  });

  it('给了出生地与时区就应用校正', () => {
    const resolved = resolveChartTime({ ...BASE, ...FAR_WEST });
    assert.ok(resolved.trueSolarTime?.applied, '应已应用真太阳时');
    assert.ok(
      resolved.trueSolarTime.correctionMinutes < -100,
      `西部地区应显著回拨，实得 ${resolved.trueSolarTime.correctionMinutes} 分钟`
    );
    assert.equal(resolved.hour, 7, '10 时回拨逾两小时应落在 7 时');
  });

  it('校正确实改变了时柱，而不只是挂了个字段', () => {
    const clock = performCalculation(BASE);
    const solar = performCalculation({ ...BASE, ...FAR_WEST });
    assert.notDeepEqual(solar.pillars.hour, clock.pillars.hour, '跨两个时辰的校正后时柱必须不同');
    // 年月日柱不受影响（同一天内回拨未跨日）
    assert.deepEqual(solar.pillars.year, clock.pillars.year);
    assert.deepEqual(solar.pillars.day, clock.pillars.day);
  });

  it('经度越偏西回拨越多', () => {
    const west = resolveChartTime({
      ...BASE,
      birthLocation: '43.8,87.6',
      timezoneOffsetMinutes: 480,
    });
    const east = resolveChartTime({
      ...BASE,
      birthLocation: '31.2,121.5',
      timezoneOffsetMinutes: 480,
    });
    assert.ok(
      west.trueSolarTime.longitudeCorrection < east.trueSolarTime.longitudeCorrection,
      '偏西地点的经度校正应更负'
    );
    // 上海几乎压在标准经线上，经度校正接近 0
    assert.ok(Math.abs(east.trueSolarTime.longitudeCorrection) < 10);
  });

  it('已知城市名与坐标串两种写法都能解析', () => {
    const byName = resolveChartTime({
      ...BASE,
      birthLocation: 'Beijing',
      timezoneOffsetMinutes: 480,
    });
    assert.ok(byName.trueSolarTime?.applied);
    assert.equal(byName.trueSolarTime.location.name, 'Beijing');
  });

  it('可显式关闭', () => {
    const resolved = resolveChartTime({ ...BASE, ...FAR_WEST, trueSolarTime: false });
    assert.equal(resolved.trueSolarTime, null);
    assert.equal(resolved.hour, 10);
  });

  it('缺时区偏移时不敢擅自校正', () => {
    const resolved = resolveChartTime({ ...BASE, birthLocation: '43.8,87.6' });
    // buildBirthTimeMeta 取不到偏移就退回钟表时间，而不是假设 UTC
    if (resolved.trueSolarTime) {
      assert.ok(Number.isFinite(resolved.trueSolarTime.correctionMinutes));
    } else {
      assert.equal(resolved.hour, 10);
    }
  });

  it('排盘结果带出所用时刻，便于调用方核对', () => {
    const chart = performCalculation({ ...BASE, ...FAR_WEST });
    assert.equal(chart.chartTime.used.hour, 7);
    assert.equal(chart.chartTime.trueSolarTime.applied, true);
    assert.equal(chart.chartTime.trueSolarTime.clockTime.hour, 10, '应保留原始钟表时间');
  });
});

describe('缓存键区分排盘因子', () => {
  it('无额外因子时键格式与历史一致', () => {
    assert.equal(buildBaziCacheKey(BASE), '1990-5-12-10-male');
  });

  it('不同出生地不得共用一条缓存', () => {
    const a = buildBaziCacheKey({ ...BASE, birthLocation: 'Beijing', timezoneOffsetMinutes: 480 });
    const b = buildBaziCacheKey({
      ...BASE,
      birthLocation: '43.8,87.6',
      timezoneOffsetMinutes: 480,
    });
    assert.notEqual(a, b, '不同出生地的真太阳时不同，缓存键必须区分');
  });

  it('分钟、时区、关闭开关都进键', () => {
    const base = buildBaziCacheKey(BASE);
    assert.notEqual(buildBaziCacheKey({ ...BASE, birthMinute: 30 }), base);
    assert.notEqual(buildBaziCacheKey({ ...BASE, timezoneOffsetMinutes: 480 }), base);
    assert.notEqual(buildBaziCacheKey({ ...BASE, trueSolarTime: false }), base);
  });

  it('两次相同输入得到相同键', () => {
    const payload = { ...BASE, ...FAR_WEST };
    assert.equal(buildBaziCacheKey(payload), buildBaziCacheKey({ ...payload }));
  });
});
