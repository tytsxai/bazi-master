import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { withTimeout, checkDatabase, checkRedis } from '../services/health.service.js';

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
    await assert.rejects(() => withTimeout(pending, 1), /Timeout/);
  });

  it('checkDatabase returns ok true/false', async () => {
    assert.deepEqual(
      await checkDatabase({ prismaClient: { user: { findFirst: async () => ({ id: 1 }) } }, timeoutMs: 1 }),
      { ok: true },
    );
    assert.deepEqual(
      await checkDatabase({ prismaClient: { user: { findFirst: async () => { throw new Error('db'); } } }, timeoutMs: 1 }),
      { ok: false, error: 'db' },
    );
    assert.deepEqual(
      await checkDatabase({ prismaClient: { user: { findFirst: async () => { throw null; } } }, timeoutMs: 1 }),
      { ok: false, error: 'db_check_failed' },
    );
  });

  it('checkRedis covers disabled/unavailable/ok/error', async () => {
    assert.deepEqual(
      await checkRedis({ initRedisFn: async () => null, env: {}, timeoutMs: 1 }),
      { ok: true, status: 'disabled' },
    );
    assert.deepEqual(
      await checkRedis({ initRedisFn: async () => null, env: { REDIS_URL: 'redis://x' }, timeoutMs: 1 }),
      { ok: false, status: 'unavailable' },
    );
    assert.deepEqual(
      await checkRedis({ initRedisFn: async () => ({ ping: async () => 'PONG' }), env: { REDIS_URL: 'redis://x' }, timeoutMs: 1 }),
      { ok: true },
    );
    assert.deepEqual(
      await checkRedis({ initRedisFn: async () => ({ ping: async () => { throw new Error('no'); } }), env: { REDIS_URL: 'redis://x' }, timeoutMs: 1 }),
      { ok: false, error: 'no' },
    );
    assert.deepEqual(
      await checkRedis({ initRedisFn: async () => ({ ping: async () => { throw null; } }), env: { REDIS_URL: 'redis://x' }, timeoutMs: 1 }),
      { ok: false, error: 'redis_check_failed' },
    );
  });
});
