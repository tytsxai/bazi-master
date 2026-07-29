import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  getHealthSnapshot,
  resetHealthSnapshotCache,
  resolveHealthCacheTtlMs,
} from '../services/health.service.js';

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
    assert.equal(
      resolveHealthCacheTtlMs({ NODE_ENV: 'production', HEALTH_CACHE_TTL_MS: 'x' }),
      1000
    );
  });

  it('reports dependencies under a checks dictionary', async () => {
    const snapshot = await getHealthSnapshot({
      env: { NODE_ENV: 'test' },
      checkRedisFn: async () => okRedis,
    });

    assert.deepEqual(snapshot, {
      checks: { redis: { ok: true } },
      ok: true,
    });
  });

  it('probes on every call when the cache is disabled', async () => {
    let redisCalls = 0;
    const env = { NODE_ENV: 'test' };
    const checkRedisFn = async () => {
      redisCalls += 1;
      return okRedis;
    };

    await getHealthSnapshot({ env, checkRedisFn });
    await getHealthSnapshot({ env, checkRedisFn });

    assert.equal(redisCalls, 2);
  });

  it('serves a second call from cache within the TTL', async () => {
    let redisCalls = 0;
    const env = { NODE_ENV: 'production', HEALTH_CACHE_TTL_MS: '60000' };
    const checkRedisFn = async () => {
      redisCalls += 1;
      return okRedis;
    };

    const first = await getHealthSnapshot({ env, checkRedisFn });
    const second = await getHealthSnapshot({ env, checkRedisFn });

    assert.equal(redisCalls, 1);
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
  });

  it('re-probes once the TTL has elapsed', async () => {
    let redisCalls = 0;
    const env = { NODE_ENV: 'production', HEALTH_CACHE_TTL_MS: '10' };
    const checkRedisFn = async () => {
      redisCalls += 1;
      return okRedis;
    };

    await getHealthSnapshot({ env, checkRedisFn });
    await new Promise((resolve) => setTimeout(resolve, 25));
    await getHealthSnapshot({ env, checkRedisFn });

    assert.equal(redisCalls, 2);
  });

  // This is the property the endpoint actually depends on: a flood arriving on a cold
  // cache must produce one dependency probe, not one per request.
  it('collapses a concurrent burst into a single probe', async () => {
    let redisCalls = 0;
    const env = { NODE_ENV: 'production', HEALTH_CACHE_TTL_MS: '60000' };
    const checkRedisFn = async () => {
      redisCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return okRedis;
    };

    const results = await Promise.all(
      Array.from({ length: 50 }, () => getHealthSnapshot({ env, checkRedisFn }))
    );

    assert.equal(redisCalls, 1);
    assert.equal(results.length, 50);
    assert.ok(results.every((r) => r.ok === true));
  });

  // Redis is an optional dependency: not configured is healthy, configured-but-unreachable
  // is not. Reporting "disabled" as a failure would leave a single-instance deployment
  // permanently degraded.
  it('treats a disabled redis as ok and an unavailable one as not ok', async () => {
    const env = { NODE_ENV: 'test' };

    const disabled = await getHealthSnapshot({
      env,
      checkRedisFn: async () => ({ ok: true, status: 'disabled' }),
    });
    assert.equal(disabled.ok, true);
    assert.equal(disabled.checks.redis.status, 'disabled');

    const unavailable = await getHealthSnapshot({
      env,
      checkRedisFn: async () => ({ ok: false, status: 'unavailable' }),
    });
    assert.equal(unavailable.ok, false);
    assert.equal(unavailable.checks.redis.status, 'unavailable');
  });

  // A failed probe must not be re-run on every request during an outage, but it also must
  // not outlive the TTL.
  it('caches a failing snapshot for the TTL as well', async () => {
    let redisCalls = 0;
    const env = { NODE_ENV: 'production', HEALTH_CACHE_TTL_MS: '60000' };
    const checkRedisFn = async () => {
      redisCalls += 1;
      return { ok: false, error: 'down' };
    };

    const first = await getHealthSnapshot({ env, checkRedisFn });
    const second = await getHealthSnapshot({ env, checkRedisFn });

    assert.equal(redisCalls, 1);
    assert.equal(first.ok, false);
    assert.equal(second.ok, false);
  });
});
