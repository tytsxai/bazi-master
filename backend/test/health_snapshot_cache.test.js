import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  getHealthSnapshot,
  resetHealthSnapshotCache,
  resolveHealthCacheTtlMs,
} from '../services/health.service.js';

const okDb = { ok: true };
const okRedis = { ok: true };

describe('health snapshot cache', () => {
  beforeEach(() => {
    resetHealthSnapshotCache();
  });

  it('defaults to caching only in production', () => {
    assert.equal(resolveHealthCacheTtlMs({ NODE_ENV: 'production' }), 1000);
    assert.equal(resolveHealthCacheTtlMs({ NODE_ENV: 'test' }), 0);
    assert.equal(resolveHealthCacheTtlMs({}), 0);
  });

  it('honours an explicit TTL override, including 0 in production', () => {
    assert.equal(
      resolveHealthCacheTtlMs({ NODE_ENV: 'production', HEALTH_CACHE_TTL_MS: '5000' }),
      5000
    );
    assert.equal(resolveHealthCacheTtlMs({ NODE_ENV: 'production', HEALTH_CACHE_TTL_MS: '0' }), 0);
    // Garbage falls back to the environment default rather than disabling the cache.
    assert.equal(resolveHealthCacheTtlMs({ NODE_ENV: 'production', HEALTH_CACHE_TTL_MS: 'x' }), 1000);
  });

  it('probes on every call when the cache is disabled', async () => {
    let dbCalls = 0;
    const env = { NODE_ENV: 'test' };
    const checkDatabaseFn = async () => {
      dbCalls += 1;
      return okDb;
    };

    await getHealthSnapshot({ env, checkDatabaseFn, checkRedisFn: async () => okRedis });
    await getHealthSnapshot({ env, checkDatabaseFn, checkRedisFn: async () => okRedis });

    assert.equal(dbCalls, 2);
  });

  it('serves a second call from cache within the TTL', async () => {
    let dbCalls = 0;
    const env = { NODE_ENV: 'production', HEALTH_CACHE_TTL_MS: '60000' };
    const checkDatabaseFn = async () => {
      dbCalls += 1;
      return okDb;
    };

    const first = await getHealthSnapshot({ env, checkDatabaseFn, checkRedisFn: async () => okRedis });
    const second = await getHealthSnapshot({
      env,
      checkDatabaseFn,
      checkRedisFn: async () => okRedis,
    });

    assert.equal(dbCalls, 1);
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
  });

  it('re-probes once the TTL has elapsed', async () => {
    let dbCalls = 0;
    const env = { NODE_ENV: 'production', HEALTH_CACHE_TTL_MS: '10' };
    const checkDatabaseFn = async () => {
      dbCalls += 1;
      return okDb;
    };

    await getHealthSnapshot({ env, checkDatabaseFn, checkRedisFn: async () => okRedis });
    await new Promise((resolve) => setTimeout(resolve, 25));
    await getHealthSnapshot({ env, checkDatabaseFn, checkRedisFn: async () => okRedis });

    assert.equal(dbCalls, 2);
  });

  // This is the property the endpoint actually depends on: a flood arriving on a cold
  // cache must produce one database query, not one per request.
  it('collapses a concurrent burst into a single probe', async () => {
    let dbCalls = 0;
    const env = { NODE_ENV: 'production', HEALTH_CACHE_TTL_MS: '60000' };
    const checkDatabaseFn = async () => {
      dbCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return okDb;
    };

    const results = await Promise.all(
      Array.from({ length: 50 }, () =>
        getHealthSnapshot({ env, checkDatabaseFn, checkRedisFn: async () => okRedis })
      )
    );

    assert.equal(dbCalls, 1);
    assert.equal(results.length, 50);
    assert.ok(results.every((r) => r.ok === true));
  });

  it('reports not-ok when a dependency fails, and treats disabled redis as ok', async () => {
    const env = { NODE_ENV: 'test' };

    const dbDown = await getHealthSnapshot({
      env,
      checkDatabaseFn: async () => ({ ok: false, error: 'boom' }),
      checkRedisFn: async () => okRedis,
    });
    assert.equal(dbDown.ok, false);

    const redisDisabled = await getHealthSnapshot({
      env,
      checkDatabaseFn: async () => okDb,
      checkRedisFn: async () => ({ ok: true, status: 'disabled' }),
    });
    assert.equal(redisDisabled.ok, true);

    const redisDown = await getHealthSnapshot({
      env,
      checkDatabaseFn: async () => okDb,
      checkRedisFn: async () => ({ ok: false, status: 'unavailable' }),
    });
    assert.equal(redisDown.ok, false);
  });

  // A failed probe must not be pinned for the rest of the TTL in a way that outlives the
  // outage, but it also must not be re-run on every request during one.
  it('caches a failing snapshot for the TTL as well', async () => {
    let dbCalls = 0;
    const env = { NODE_ENV: 'production', HEALTH_CACHE_TTL_MS: '60000' };
    const checkDatabaseFn = async () => {
      dbCalls += 1;
      return { ok: false, error: 'down' };
    };

    const first = await getHealthSnapshot({ env, checkDatabaseFn, checkRedisFn: async () => okRedis });
    const second = await getHealthSnapshot({
      env,
      checkDatabaseFn,
      checkRedisFn: async () => okRedis,
    });

    assert.equal(dbCalls, 1);
    assert.equal(first.ok, false);
    assert.equal(second.ok, false);
  });
});
