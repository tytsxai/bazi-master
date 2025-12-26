import test from 'node:test';
import assert from 'node:assert/strict';
import * as cache from '../services/cache.service.js';

const withEnv = async (envOverrides = {}, run) => {
  const priorEnv = {};
  for (const [key, next] of Object.entries(envOverrides)) {
    priorEnv[key] = Object.prototype.hasOwnProperty.call(process.env, key)
      ? process.env[key]
      : undefined;
    if (next === null || next === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = String(next);
    }
  }

  try {
    return await run();
  } finally {
    for (const [key, prior] of Object.entries(priorEnv)) {
      if (prior === undefined) delete process.env[key];
      else process.env[key] = prior;
    }
  }
};

const buildPayload = (overrides = {}) => ({
  birthYear: 1984,
  birthMonth: 5,
  birthDay: 20,
  birthHour: 14,
  gender: 'female',
  ...overrides,
});

const buildResult = (overrides = {}) => ({
  pillars: { year: 'a', month: 'b', day: 'c', hour: 'd' },
  fiveElements: { Wood: 1, Fire: 1, Earth: 2, Metal: 0, Water: 0 },
  ...overrides,
});

test('buildBaziCacheKey normalizes and rejects invalid input', async () => {
  assert.equal(
    cache.buildBaziCacheKey(buildPayload({ birthYear: '2001.9', gender: '  Male ' })),
    '2001-5-20-14-male'
  );

  assert.equal(cache.buildBaziCacheKey(buildPayload({ gender: '   ' })), null);
  assert.equal(cache.buildBaziCacheKey(buildPayload({ birthDay: null })), null);
  assert.equal(cache.buildBaziCacheKey(null), null);
});

test('set/get returns normalized fiveElementsPercent', async () => {
  await withEnv({ BAZI_CACHE_TTL_MS: '1000', BAZI_CACHE_MAX_ENTRIES: '10' }, async () => {
    cache.setBaziCacheMirror(null);
    cache.clearBaziCalculationCache();

    const key = cache.buildBaziCacheKey(buildPayload());
    cache.setBaziCacheEntry(key, buildResult());

    const cached = cache.getCachedBaziCalculation(key);
    assert.ok(cached);
    assert.deepEqual(cached.fiveElementsPercent, {
      Wood: 25,
      Fire: 25,
      Earth: 50,
      Metal: 0,
      Water: 0,
    });
  });
});

test('entries expire based on TTL', async () => {
  await withEnv({ BAZI_CACHE_TTL_MS: '10', BAZI_CACHE_MAX_ENTRIES: '10' }, async () => {
    cache.setBaziCacheMirror(null);
    cache.clearBaziCalculationCache();
    const key = cache.buildBaziCacheKey(buildPayload());

    const originalNow = Date.now;
    try {
      Date.now = () => 1000;
      cache.setBaziCacheEntry(key, buildResult());

      Date.now = () => 1011;
      assert.equal(cache.getCachedBaziCalculation(key), null);
    } finally {
      Date.now = originalNow;
    }
  });
});

test('LRU eviction removes oldest entry', async () => {
  await withEnv({ BAZI_CACHE_TTL_MS: '1000', BAZI_CACHE_MAX_ENTRIES: '2' }, async () => {
    cache.setBaziCacheMirror(null);
    cache.clearBaziCalculationCache();

    const keyA = cache.buildBaziCacheKey(buildPayload({ birthDay: 1 }));
    const keyB = cache.buildBaziCacheKey(buildPayload({ birthDay: 2 }));
    const keyC = cache.buildBaziCacheKey(buildPayload({ birthDay: 3 }));

    cache.setBaziCacheEntry(keyA, buildResult({ pillars: { year: 'A' } }));
    cache.setBaziCacheEntry(keyB, buildResult({ pillars: { year: 'B' } }));

    assert.ok(cache.getCachedBaziCalculation(keyA));

    cache.setBaziCacheEntry(keyC, buildResult({ pillars: { year: 'C' } }));

    assert.equal(cache.getCachedBaziCalculation(keyB), null);
    assert.ok(cache.getCachedBaziCalculation(keyA));
    assert.ok(cache.getCachedBaziCalculation(keyC));
  });
});

test('invalidateBaziCalculationCache clears entries by key or payload', async () => {
  await withEnv({ BAZI_CACHE_TTL_MS: '1000', BAZI_CACHE_MAX_ENTRIES: '10' }, async () => {
    cache.setBaziCacheMirror(null);
    cache.clearBaziCalculationCache();

    const payload = buildPayload();
    const key = cache.buildBaziCacheKey(payload);
    cache.setBaziCacheEntry(key, buildResult());

    cache.invalidateBaziCalculationCache(payload);
    assert.equal(cache.getCachedBaziCalculation(key), null);

    cache.setBaziCacheEntry(key, buildResult());
    cache.invalidateBaziCalculationCache(key);
    assert.equal(cache.getCachedBaziCalculation(key), null);
  });
});
