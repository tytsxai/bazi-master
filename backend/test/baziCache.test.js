import test from 'node:test';
import assert from 'node:assert/strict';

const importCacheModule = async (envOverrides = {}) => {
  const priorEnv = {};
  Object.keys(envOverrides).forEach((key) => {
    priorEnv[key] = process.env[key];
    const next = envOverrides[key];
    if (next === null || next === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = String(next);
    }
  });

  const cacheModule = await import(`../baziCache.js?ts=${Date.now()}-${Math.random()}`);

  Object.keys(envOverrides).forEach((key) => {
    if (priorEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = priorEnv[key];
    }
  });

  return cacheModule;
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
  const { buildBaziCacheKey } = await importCacheModule();

  assert.equal(
    buildBaziCacheKey(buildPayload({ birthYear: '2001.9', gender: '  Male ' })),
    '2001-5-20-14-male'
  );

  assert.equal(buildBaziCacheKey(buildPayload({ gender: '   ' })), null);
  assert.equal(buildBaziCacheKey(buildPayload({ birthDay: null })), null);
  assert.equal(buildBaziCacheKey(null), null);
});

test('set/get returns normalized fiveElementsPercent', async () => {
  const {
    buildBaziCacheKey,
    setBaziCacheEntry,
    getCachedBaziCalculation,
    clearBaziCalculationCache,
  } = await importCacheModule({ BAZI_CACHE_TTL_MS: '1000', BAZI_CACHE_MAX_ENTRIES: '10' });

  clearBaziCalculationCache();
  const key = buildBaziCacheKey(buildPayload());
  setBaziCacheEntry(key, buildResult());

  const cached = getCachedBaziCalculation(key);
  assert.ok(cached);
  assert.deepEqual(cached.fiveElementsPercent, {
    Wood: 25,
    Fire: 25,
    Earth: 50,
    Metal: 0,
    Water: 0,
  });
});

test('entries expire based on TTL', async () => {
  const {
    buildBaziCacheKey,
    setBaziCacheEntry,
    getCachedBaziCalculation,
    clearBaziCalculationCache,
  } = await importCacheModule({ BAZI_CACHE_TTL_MS: '10', BAZI_CACHE_MAX_ENTRIES: '10' });

  clearBaziCalculationCache();
  const key = buildBaziCacheKey(buildPayload());

  const originalNow = Date.now;
  try {
    Date.now = () => 1000;
    setBaziCacheEntry(key, buildResult());

    Date.now = () => 1011;
    assert.equal(getCachedBaziCalculation(key), null);
  } finally {
    Date.now = originalNow;
  }
});

test('LRU eviction removes oldest entry', async () => {
  const {
    buildBaziCacheKey,
    setBaziCacheEntry,
    getCachedBaziCalculation,
    clearBaziCalculationCache,
  } = await importCacheModule({ BAZI_CACHE_TTL_MS: '1000', BAZI_CACHE_MAX_ENTRIES: '2' });

  clearBaziCalculationCache();

  const keyA = buildBaziCacheKey(buildPayload({ birthDay: 1 }));
  const keyB = buildBaziCacheKey(buildPayload({ birthDay: 2 }));
  const keyC = buildBaziCacheKey(buildPayload({ birthDay: 3 }));

  setBaziCacheEntry(keyA, buildResult({ pillars: { year: 'A' } }));
  setBaziCacheEntry(keyB, buildResult({ pillars: { year: 'B' } }));

  assert.ok(getCachedBaziCalculation(keyA));

  setBaziCacheEntry(keyC, buildResult({ pillars: { year: 'C' } }));

  assert.equal(getCachedBaziCalculation(keyB), null);
  assert.ok(getCachedBaziCalculation(keyA));
  assert.ok(getCachedBaziCalculation(keyC));
});

test('invalidateBaziCalculationCache clears entries by key or payload', async () => {
  const {
    buildBaziCacheKey,
    setBaziCacheEntry,
    getCachedBaziCalculation,
    invalidateBaziCalculationCache,
    clearBaziCalculationCache,
  } = await importCacheModule({ BAZI_CACHE_TTL_MS: '1000', BAZI_CACHE_MAX_ENTRIES: '10' });

  clearBaziCalculationCache();
  const payload = buildPayload();
  const key = buildBaziCacheKey(payload);
  setBaziCacheEntry(key, buildResult());

  invalidateBaziCalculationCache(payload);
  assert.equal(getCachedBaziCalculation(key), null);

  setBaziCacheEntry(key, buildResult());
  invalidateBaziCalculationCache(key);
  assert.equal(getCachedBaziCalculation(key), null);
});
