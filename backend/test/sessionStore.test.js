import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createSessionStore } from '../sessionStore.js';

describe('session store', () => {
  test('set/get/has work with numeric values', () => {
    const store = createSessionStore();
    store.set('token', 123);
    assert.equal(store.get('token'), 123);
    assert.equal(store.has('token'), true);
    store.delete('token');
    assert.equal(store.get('token'), undefined);
    assert.equal(store.has('token'), false);
  });

  test('ignores non-numeric values', () => {
    const store = createSessionStore();
    store.set('bad', 'not-a-number');
    assert.equal(store.has('bad'), false);
  });

  test('getAsync hydrates from mirror and normalizes', async () => {
    const mirror = new Map();
    const store = createSessionStore({ ttlMs: 5000 });
    store.setMirror({
      get: async (key) => mirror.get(key),
      set: (key, value) => mirror.set(key, value),
      delete: (key) => mirror.delete(key),
    });

    mirror.set('session', '42');
    const value = await store.getAsync('session');
    assert.equal(value, 42);
    assert.equal(store.get('session'), 42);
  });

  test('hasAsync clears invalid mirror values', async () => {
    const mirror = new Map();
    let deleteCalled = false;
    const store = createSessionStore();
    store.setMirror({
      get: async (key) => mirror.get(key),
      delete: (key) => {
        deleteCalled = true;
        mirror.delete(key);
      },
    });

    mirror.set('session', 'bad');
    const exists = await store.hasAsync('session');
    assert.equal(exists, false);
    assert.equal(deleteCalled, true);
  });
});
