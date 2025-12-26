import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createRedisMirror, initRedis } from '../config/redis.js';

describe('Redis config coverage', () => {
  it('initRedis returns null when REDIS_URL missing and throws when require=true', async () => {
    assert.equal(await initRedis(), null);
    await assert.rejects(() => initRedis({ require: true }), /REDIS_URL is required/);
  });

  it('createRedisMirror get/set/delete/clear/deleteByPrefix cover success and error paths', async () => {
    const calls = [];
    const store = new Map();

    const client = {
      async get(key) {
        if (key === 'p:bad') return '{not-json';
        return store.get(key) ?? null;
      },
      async set(key, value, options) {
        calls.push({ op: 'set', key, options });
        store.set(key, value);
      },
      async del(keys) {
        calls.push({ op: 'del', keys });
        if (Array.isArray(keys)) {
          for (const k of keys) store.delete(k);
        } else {
          store.delete(keys);
        }
      },
      async *scanIterator({ MATCH }) {
        for (const key of store.keys()) {
          if (key.startsWith(MATCH.replace('*', ''))) {
            yield key;
          }
        }
      },
    };

    const mirror = createRedisMirror(client, { prefix: 'p:', ttlMs: 10 });
    await mirror.set('a', { x: 1 });
    const value = await mirror.get('a');
    assert.deepEqual(value, { x: 1 });

    assert.equal(await mirror.get('bad'), null);

    await mirror.set('b', { y: 2 }, 20);
    assert.ok(calls.some((c) => c.op === 'set' && c.key === 'p:b' && c.options?.PX === 20));

    await mirror.delete('a');
    assert.equal(store.has('p:a'), false);

    // Cover no-op guards
    await mirror.set('', { z: 1 });
    assert.equal(await mirror.get(''), null);
    await mirror.delete('');

    // clear/deleteByPrefix via scanIterator
    await mirror.set('token_1', { ok: true });
    await mirror.set('token_2', { ok: true });
    await mirror.deleteByPrefix('token_');
    assert.equal(store.has('p:token_1'), false);
    assert.equal(store.has('p:token_2'), false);

    await mirror.set('c', { ok: true });
    await mirror.clear();
    assert.equal(store.size, 0);

    // Error paths
    const badClient = {
      async get() {
        throw new Error('nope');
      },
      async set() {
        throw new Error('nope');
      },
      async del() {
        throw new Error('nope');
      },
    };
    const mirror2 = createRedisMirror(badClient, { prefix: 'x:' });
    assert.equal(await mirror2.get('a'), null);
    await mirror2.set('a', { x: 1 });
    await mirror2.delete('a');
    await mirror2.clear();
    await mirror2.deleteByPrefix('a');
  });
});
