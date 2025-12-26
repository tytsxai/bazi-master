import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { initRedis, resetRedisState, createRedisMirror } from '../config/redis.js';

describe('redis config more coverage', () => {
  beforeEach(() => {
    resetRedisState();
  });

  it('initRedis returns null when not configured and throws when required', async () => {
    assert.equal(await initRedis({ env: {}, require: false }), null);
    await assert.rejects(
      () => initRedis({ env: {}, require: true }),
      /REDIS_URL is required/,
    );
  });

  it('initRedis connects using injected redis module and caches client', async () => {
    let createCalls = 0;
    const client = {
      onCalls: [],
      on(event, fn) { this.onCalls.push(event); this._onError = fn; },
      async connect() {},
    };
    const logger = { logs: [], warns: [], errors: [], log(...a) { this.logs.push(a.join(' ')); }, warn(...a) { this.warns.push(a.join(' ')); }, error(...a) { this.errors.push(a.join(' ')); } };
    const importRedis = async () => ({
      createClient({ url }) {
        createCalls += 1;
        client.url = url;
        return client;
      },
    });

    const c1 = await initRedis({ url: 'redis://x', importRedis, logger });
    const c2 = await initRedis({ url: 'redis://x', importRedis, logger });
    assert.equal(c1, client);
    assert.equal(c2, client);
    assert.equal(createCalls, 1);
    assert.ok(logger.logs.some((l) => l.includes('[redis] connected')));
    assert.deepEqual(client.onCalls, ['error']);
  });

  it('initRedis handles connect failure and allows retry', async () => {
    let createCalls = 0;
    const logger = { warns: [], errors: [], log() {}, warn(...a) { this.warns.push(a.join(' ')); }, error(...a) { this.errors.push(a.join(' ')); } };
    const importRedis = async () => ({
      createClient() {
        createCalls += 1;
        return {
          on() {},
          async connect() { throw new Error('nope'); },
        };
      },
    });

    assert.equal(await initRedis({ url: 'redis://x', importRedis, logger, require: false }), null);
    assert.ok(logger.warns.some((l) => l.includes('[redis] unavailable')));

    // retry should attempt createClient again because init promise is cleared on error
    assert.equal(await initRedis({ url: 'redis://x', importRedis, logger, require: false }), null);
    assert.equal(createCalls, 2);

    resetRedisState();
    await assert.rejects(
      () => initRedis({ url: 'redis://x', importRedis, logger, require: true }),
      /nope/,
    );
  });

  it('createRedisMirror get/set/delete cover json, ttl, and error branches', async () => {
    const calls = [];
    const client = {
      async get(key) {
        calls.push(['get', key]);
        if (key.endsWith('badjson')) return '{';
        if (key.endsWith('throw')) throw new Error('getfail');
        return JSON.stringify({ ok: true });
      },
      async set(...args) { calls.push(['set', ...args]); },
      async del(...args) { calls.push(['del', ...args]); throw new Error('delfail'); },
    };
    const mirror = createRedisMirror(client, { prefix: 'p:', ttlMs: 10 });

    assert.equal(await mirror.get(''), null);
    assert.deepEqual(await mirror.get('x'), { ok: true });
    assert.equal(await mirror.get('badjson'), null);
    assert.equal(await mirror.get('throw'), null);

    await mirror.set('', { a: 1 });
    await mirror.set('x', undefined);
    await mirror.set('x', { a: 1 });
    await mirror.set('x', { a: 1 }, 5);
    await mirror.delete('');
    await mirror.delete('x');

    assert.ok(calls.some((c) => c[0] === 'set' && c[3] && c[3].PX === 10));
    assert.ok(calls.some((c) => c[0] === 'set' && c[3] && c[3].PX === 5));
  });

  it('createRedisMirror clear/deleteByPrefix cover scanIterator batching and missing iterator', async () => {
    const delCalls = [];
    const clientNoScan = { del: async () => {} };
    const noScan = createRedisMirror(clientNoScan, { prefix: 'p:' });
    await noScan.clear();
    await noScan.deleteByPrefix('x');

    async function* scanIterator() {
      for (let i = 0; i < 201; i += 1) {
        yield `p:key:${i}`;
      }
    }

    const client = {
      scanIterator: async function* () { yield* scanIterator(); },
      del: async (keys) => {
        delCalls.push(Array.isArray(keys) ? keys.length : 1);
      },
    };
    const mirror = createRedisMirror(client, { prefix: 'p:' });
    await mirror.clear();
    await mirror.deleteByPrefix('key:');

    // For 201 keys: one batch of 200 and one batch of 1, executed twice (clear + deleteByPrefix)
    assert.deepEqual(delCalls, [200, 1, 200, 1]);
  });
});
