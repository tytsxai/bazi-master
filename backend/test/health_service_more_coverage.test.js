import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { withTimeout, checkRedis } from '../services/health.service.js';

describe('health.service more coverage', () => {
  it('withTimeout returns original promise when disabled', async () => {
    const p = Promise.resolve('ok');
    assert.equal(withTimeout(p, 0), p);
    assert.equal(withTimeout(p, -1), p);
    assert.equal(withTimeout(p, NaN), p);
    assert.equal(await withTimeout(p, 0), 'ok');
  });

  it('withTimeout rejects when timeout elapses', async () => {
    const pending = new Promise(() => {});
    const keepAlive = setTimeout(() => {}, 50);
    try {
      await assert.rejects(() => withTimeout(pending, 1), /Timeout/);
    } finally {
      clearTimeout(keepAlive);
    }
  });

  it('checkRedis covers disabled/unavailable/ok/error', async () => {
    assert.deepEqual(await checkRedis({ initRedisFn: async () => null, env: {}, timeoutMs: 1 }), {
      ok: true,
      status: 'disabled',
    });
    assert.deepEqual(
      await checkRedis({
        initRedisFn: async () => null,
        env: { REDIS_URL: 'redis://x' },
        timeoutMs: 1,
      }),
      { ok: false, status: 'unavailable' }
    );
    assert.deepEqual(
      await checkRedis({
        initRedisFn: async () => ({ ping: async () => 'PONG' }),
        env: { REDIS_URL: 'redis://x' },
        timeoutMs: 1,
      }),
      { ok: true }
    );
    assert.deepEqual(
      await checkRedis({
        initRedisFn: async () => ({
          ping: async () => {
            throw new Error('no');
          },
        }),
        env: { REDIS_URL: 'redis://x' },
        timeoutMs: 1,
      }),
      { ok: false, error: 'no' }
    );
    assert.deepEqual(
      await checkRedis({
        initRedisFn: async () => ({
          ping: async () => {
            throw null;
          },
        }),
        env: { REDIS_URL: 'redis://x' },
        timeoutMs: 1,
      }),
      { ok: false, error: 'redis_check_failed' }
    );
  });
});
