import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSessionStore } from '../services/session.service.js';
import {
  buildOauthState,
  consumeOauthState,
  buildOauthRedirectUrl,
  oauthStateStore,
} from '../services/oauth.service.js';

describe('Services Bulk Coverage', () => {
  // --- Session Service ---
  it('sessionStore normalizes values', () => {
    const store = createSessionStore();
    store.set('key', '123'); // string -> number
    assert.equal(store.get('key'), 123);
    store.set('key2', 456);
    assert.equal(store.get('key2'), 456);
    store.set('invalid', 'abc');
    assert.equal(store.get('invalid'), undefined);
  });

  it('sessionStore basic operations', () => {
    const store = createSessionStore();
    store.set('a', 1);
    assert.equal(store.has('a'), true);
    store.delete('a');
    assert.equal(store.has('a'), false);

    store.set('b', 2);
    store.clear();
    assert.equal(store.has('b'), false);
  });

  it('sessionStore mirror operations (mock)', async () => {
    const mockMirror = {
      data: new Map(),
      get: async (k) => mockMirror.data.get(k),
      set: (k, v) => mockMirror.data.set(k, v),
      delete: (k) => mockMirror.data.delete(k),
      deleteByPrefix: (p) => {
        for (const k of mockMirror.data.keys()) {
          if (k.startsWith(p)) mockMirror.data.delete(k);
        }
      },
      clear: () => mockMirror.data.clear(),
    };
    const store = createSessionStore();
    store.setMirror(mockMirror);
    assert.equal(store.hasMirror(), true);

    store.set('k', 100);
    assert.equal(mockMirror.data.get('k'), 100); // Async sync in memory

    // getAsync from mirror
    store.delete('k'); // delete local
    const val = await store.getAsync('k');
    assert.equal(val, null); // Deleted from mirror too? yes, setMirror calls mirror.delete if delete is called

    // Populate mirror directly
    mockMirror.data.set('remote', 999);
    const remoteVal = await store.getAsync('remote');
    assert.equal(remoteVal, 999);

    // keys
    store.set('loc', 1);
    assert.ok([...store.keys()].includes('loc'));

    // deleteByPrefix
    store.set('pre:1', 1);
    mockMirror.data.set('pre:2', 2);
    store.deleteByPrefix('pre:');
    assert.equal(store.get('pre:1'), undefined);
    assert.equal(mockMirror.data.get('pre:2'), undefined);
  });

  // --- OAuth Service ---
  it('buildOauthState creates state and stores it', () => {
    const state = buildOauthState('/next');
    assert.ok(state);
    assert.ok(oauthStateStore.has(state));
    const entry = oauthStateStore.get(state);
    assert.equal(entry.nextPath, '/next');
  });

  it('consumeOauthState retrieves and deletes state', () => {
    const state = buildOauthState('/abc');
    const entry = consumeOauthState(state);
    assert.equal(entry.nextPath, '/abc');
    const entry2 = consumeOauthState(state);
    assert.equal(entry2, null);
  });

  it('buildOauthRedirectUrl constructs valid URL', () => {
    const url = buildOauthRedirectUrl({
      success: true,
      nextPath: '/dash',
    });
    const u = new URL(url);
    assert.ok(u.searchParams.get('oauth') === 'success');
    assert.ok(u.searchParams.get('next') === '/dash');
  });

  it('buildOauthRedirectUrl handles errors', () => {
    const url = buildOauthRedirectUrl({ error: 'failed' });
    const u = new URL(url);
    assert.equal(u.searchParams.get('error'), 'failed');
  });
});
