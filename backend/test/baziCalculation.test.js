import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BRANCHES_MAP,
  ELEMENTS,
  STEMS_MAP,
  buildBaziCacheKey,
  buildPillar,
  calculateTenGod,
  getBaziCalculation,
  getCachedBaziCalculation,
  getElementRelation,
  invalidateBaziCalculationCache,
  performCalculation,
  primeBaziCalculationCache,
  setBaziCacheEntry,
} from '../server.js';
import { buildFiveElementsPercent, normalizeBaziResult } from '../baziCache.js';
import { validateBaziInput } from '../validation.js';

test('validateBaziInput trims inputs and rejects invalid dates', () => {
  const ok = validateBaziInput({
    birthYear: '1990',
    birthMonth: '12',
    birthDay: '15',
    birthHour: '10',
    gender: ' male ',
    birthLocation: '  New York ',
    timezone: '  UTC '
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.payload.gender, 'male');
  assert.equal(ok.payload.birthYear, 1990);
  assert.equal(ok.payload.birthMonth, 12);
  assert.equal(ok.payload.birthDay, 15);
  assert.equal(ok.payload.birthHour, 10);
  assert.equal(ok.payload.birthLocation, 'New York');
  assert.equal(ok.payload.timezone, 'UTC');

  const whitespace = validateBaziInput({
    birthYear: 1990,
    birthMonth: 1,
    birthDay: 1,
    birthHour: 0,
    gender: '   ',
    birthLocation: 'LA',
    timezone: 'UTC'
  });
  assert.equal(whitespace.ok, false);
  assert.equal(whitespace.reason, 'whitespace');

  const invalidDate = validateBaziInput({
    birthYear: 2023,
    birthMonth: 2,
    birthDay: 30,
    birthHour: 12,
    gender: 'female'
  });
  assert.equal(invalidDate.ok, false);
  assert.equal(invalidDate.reason, 'invalid');
});

test('buildBaziCacheKey normalizes inputs', () => {
  const key = buildBaziCacheKey({
    birthYear: 1990,
    birthMonth: 12,
    birthDay: 15,
    birthHour: 10,
    gender: ' Male '
  });
  assert.equal(key, '1990-12-15-10-male');

  const missing = buildBaziCacheKey({ birthYear: 1990 });
  assert.equal(missing, null);
});

test('element relations and ten god calculations follow canonical rules', () => {
  assert.equal(getElementRelation('Wood', 'Fire'), 'Generates');
  assert.equal(getElementRelation('Fire', 'Wood'), 'GeneratedBy');
  assert.equal(getElementRelation('Wood', 'Earth'), 'Controls');
  assert.equal(getElementRelation('Earth', 'Wood'), 'ControlledBy');

  assert.equal(calculateTenGod('甲', '甲'), 'Friend (Bi Jian)');
  assert.equal(calculateTenGod('甲', '乙'), 'Rob Wealth (Jie Cai)');
  assert.equal(calculateTenGod('甲', '丙'), 'Eating God (Shi Shen)');
  assert.equal(calculateTenGod('甲', '丁'), 'Hurting Officer (Shang Guan)');
  assert.equal(calculateTenGod('甲', '庚'), 'Seven Killings (Qi Sha)');
});

test('buildPillar maps stems and branches to names and elements', () => {
  const pillar = buildPillar('甲', '子');
  assert.equal(pillar.stem, STEMS_MAP['甲'].name);
  assert.equal(pillar.branch, BRANCHES_MAP['子'].name);
  assert.equal(pillar.elementStem, STEMS_MAP['甲'].element);
  assert.equal(pillar.elementBranch, BRANCHES_MAP['子'].element);
  assert.equal(pillar.charStem, '甲');
  assert.equal(pillar.charBranch, '子');
});

test('five element percent normalization is stable', () => {
  const percent = buildFiveElementsPercent({
    Wood: 2,
    Fire: 1,
    Earth: 1,
    Metal: 0,
    Water: 0
  });
  assert.deepEqual(percent, {
    Wood: 50,
    Fire: 25,
    Earth: 25,
    Metal: 0,
    Water: 0
  });

  const normalized = normalizeBaziResult({
    fiveElements: { Wood: 2, Fire: 1, Earth: 1, Metal: 0, Water: 0 }
  });
  assert.deepEqual(normalized.fiveElementsPercent, percent);
});

test('performCalculation produces internally consistent Bazi structures', () => {
  const data = {
    birthYear: 1990,
    birthMonth: 1,
    birthDay: 1,
    birthHour: 0,
    gender: 'male'
  };
  const result = performCalculation(data);

  assert.ok(result.pillars);
  assert.ok(result.fiveElements);
  assert.ok(result.tenGods);
  assert.ok(result.luckCycles);

  const recomputed = { Wood: 0, Fire: 0, Earth: 0, Metal: 0, Water: 0 };
  Object.values(result.pillars).forEach((pillar) => {
    recomputed[pillar.elementStem] += 1;
    recomputed[pillar.elementBranch] += 1;
  });
  assert.deepEqual(result.fiveElements, recomputed);

  const percentSum = ELEMENTS.reduce((sum, element) => sum + result.fiveElementsPercent[element], 0);
  assert.ok(percentSum >= 99 && percentSum <= 101);

  assert.equal(result.tenGods.length, 10);
  const totalStrength = result.tenGods.reduce((sum, item) => sum + item.strength, 0);
  assert.equal(totalStrength, 70);

  assert.equal(result.luckCycles.length, 8);
  result.luckCycles.forEach((cycle) => {
    assert.match(cycle.range, /^\d+-\d+$/);
    assert.ok(typeof cycle.stem === 'string');
    assert.ok(typeof cycle.branch === 'string');
  });
});

test('getBaziCalculation caches and normalizes results', async () => {
  const data = {
    birthYear: 1988,
    birthMonth: 6,
    birthDay: 12,
    birthHour: 14,
    gender: 'female'
  };

  const key = buildBaziCacheKey(data);
  assert.ok(key);

  invalidateBaziCalculationCache(key);
  assert.equal(getCachedBaziCalculation(key), null);

  const fresh = await getBaziCalculation(data, { bypassCache: true });
  setBaziCacheEntry(key, { fiveElements: fresh.fiveElements });
  const cached = getCachedBaziCalculation(key);
  assert.ok(cached.fiveElementsPercent);

  invalidateBaziCalculationCache(key);
  assert.equal(getCachedBaziCalculation(key), null);

  primeBaziCalculationCache(data, fresh);
  const primed = getCachedBaziCalculation(key);
  assert.deepEqual(primed.pillars, fresh.pillars);
});
