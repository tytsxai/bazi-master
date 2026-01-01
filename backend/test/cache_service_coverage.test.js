import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBaziCacheKey,
  buildFiveElementsPercent,
  clearBaziCalculationCache,
  getCachedBaziCalculation,
  getCachedBaziCalculationAsync,
  hasBaziCacheMirror,
  invalidateBaziCalculationCache,
  normalizeBaziResult,
  primeBaziCalculationCache,
  setBaziCacheEntry,
  setBaziCacheMirror,
} from '../services/cache.service.js';

const withEnv = async (patch, run) => {
  const previous = {};
  for (const [key, value] of Object.entries(patch)) {
    previous[key] = Object.prototype.hasOwnProperty.call(process.env, key)
      ? process.env[key]
      : undefined;
    if (value === undefined) delete process.env[key];
    else process.env[key] = String(value);
  }
  try {
    return await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

describe('cache.service coverage', () => {
  it('buildBaziCacheKey validates required fields', () => {
    assert.equal(buildBaziCacheKey(null), null);
    assert.equal(buildBaziCacheKey({ birthYear: 1990 }), null);
    assert.equal(
      buildBaziCacheKey({
        birthYear: '1990',
        birthMonth: 1,
        birthDay: 2,
        birthHour: 3,
        gender: ' F ',
      }),
      '1990-1-2-3-f'
    );
  });

  it('buildFiveElementsPercent handles totals and bad inputs', () => {
    assert.equal(buildFiveElementsPercent(null), null);
    assert.deepEqual(buildFiveElementsPercent({}), {
      Wood: 0,
      Fire: 0,
      Earth: 0,
      Metal: 0,
      Water: 0,
    });

    assert.deepEqual(buildFiveElementsPercent({ Wood: 2, Fire: '1', Earth: 'bad' }), {
      Wood: 67,
      Fire: 33,
      Earth: 0,
      Metal: 0,
      Water: 0,
    });
  });

  it('normalizeBaziResult adds fiveElementsPercent when missing', () => {
    const input = { pillars: {}, fiveElements: { Wood: 1, Fire: 1 } };
    const normalized = normalizeBaziResult(input);
    assert.ok(normalized.fiveElementsPercent);
    assert.equal(normalized.fiveElementsPercent.Wood, 50);
  });

  it('mirror interactions: getCachedBaziCalculationAsync invalidates bad remote value', async () => {
    const calls = [];
    setBaziCacheMirror({
      async get(key) {
        calls.push(['get', key]);
        return { nope: true };
      },
      delete(key) {
        calls.push(['delete', key]);
      },
    });
    assert.equal(hasBaziCacheMirror(), true);

    const out = await getCachedBaziCalculationAsync('k1');
    assert.equal(out, null);
    assert.deepEqual(calls, [
      ['get', 'k1'],
      ['delete', 'k1'],
    ]);
  });

  it('mirror interactions: caches valid remote and supports invalidation/clear', async () => {
    const calls = [];
    const remoteValue = { pillars: { day: {} }, fiveElements: { Wood: 1 } };

    setBaziCacheMirror({
      async get(key) {
        calls.push(['get', key]);
        return remoteValue;
      },
      set(key, value, ttlMs) {
        calls.push(['set', key, Boolean(value?.fiveElementsPercent), ttlMs]);
      },
      delete(key) {
        calls.push(['delete', key]);
      },
      clear() {
        calls.push(['clear']);
      },
    });

    await withEnv({ BAZI_CACHE_TTL_MS: 0, BAZI_CACHE_MAX_ENTRIES: 100 }, async () => {
      clearBaziCalculationCache();

      const miss = getCachedBaziCalculation('k2');
      assert.equal(miss, null);

      const loaded = await getCachedBaziCalculationAsync('k2');
      assert.ok(loaded);
      assert.ok(loaded.fiveElementsPercent);
      assert.ok(getCachedBaziCalculation('k2'));

      setBaziCacheEntry('k3', { pillars: {}, fiveElements: { Wood: 1 } });
      primeBaziCalculationCache(
        { birthYear: 1990, birthMonth: 1, birthDay: 2, birthHour: 3, gender: 'm' },
        { pillars: {}, fiveElements: { Wood: 1 } }
      );

      invalidateBaziCalculationCache('k2');
      assert.equal(getCachedBaziCalculation('k2'), null);

      clearBaziCalculationCache();
    });

    assert.ok(calls.some((c) => c[0] === 'get' && c[1] === 'k2'));
    assert.ok(calls.some((c) => c[0] === 'set' && c[1] === 'k3'));
    assert.ok(calls.some((c) => c[0] === 'delete' && c[1] === 'k2'));
    assert.ok(calls.some((c) => c[0] === 'clear'));
  });

  it('prunes local cache based on max entries and deletes mirror keys', async () => {
    const deletes = [];
    setBaziCacheMirror({
      delete(key) {
        deletes.push(key);
      },
    });

    await withEnv({ BAZI_CACHE_TTL_MS: 0, BAZI_CACHE_MAX_ENTRIES: 1 }, async () => {
      clearBaziCalculationCache();
      setBaziCacheEntry('a', { pillars: {}, fiveElements: { Wood: 1 } });
      setBaziCacheEntry('b', { pillars: {}, fiveElements: { Wood: 1 } });
      assert.ok(getCachedBaziCalculation('b'));
      assert.equal(getCachedBaziCalculation('a'), null);
    });

    assert.ok(deletes.includes('a'));
  });
});
