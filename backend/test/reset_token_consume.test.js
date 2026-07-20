import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  consumeResetTokenEntryAsync,
  resetTokenStore,
  resetTokenByUser,
  setResetTokenForUser,
  setResetTokenMirrors,
} from '../services/resetTokens.service.js';

describe('reset token single-use consumption', () => {
  beforeEach(async () => {
    setResetTokenMirrors({ tokenMirror: null, userMirror: null });
    await resetTokenStore.clearAsync();
    await resetTokenByUser.clearAsync();
  });

  it('returns the entry once and never again', async () => {
    await setResetTokenForUser({ userId: 3, token: 'tok-1', expiresAt: Date.now() + 60_000 });

    const first = await consumeResetTokenEntryAsync('tok-1');
    assert.equal(first?.userId, 3);

    assert.equal(await consumeResetTokenEntryAsync('tok-1'), null);
  });

  it('two concurrent redemptions cannot both succeed', async () => {
    await setResetTokenForUser({ userId: 4, token: 'tok-2', expiresAt: Date.now() + 60_000 });

    const results = await Promise.all([
      consumeResetTokenEntryAsync('tok-2'),
      consumeResetTokenEntryAsync('tok-2'),
    ]);

    assert.equal(results.filter(Boolean).length, 1);
  });

  it('rejects an expired token and clears it', async () => {
    await setResetTokenForUser({ userId: 5, token: 'tok-3', expiresAt: Date.now() - 1 });

    assert.equal(await consumeResetTokenEntryAsync('tok-3'), null);
    assert.equal(await consumeResetTokenEntryAsync('tok-3'), null);
  });

  it('uses the mirror getAndDelete when one is configured', async () => {
    const calls = [];
    const remote = new Map();

    setResetTokenMirrors({
      tokenMirror: {
        async get(key) {
          return remote.get(key) ?? null;
        },
        async set(key, value) {
          remote.set(key, value);
        },
        async delete(key) {
          remote.delete(key);
        },
        async getAndDelete(key) {
          calls.push(key);
          const value = remote.get(key) ?? null;
          remote.delete(key);
          return value;
        },
      },
      userMirror: {
        async get() {
          return null;
        },
        async set() {},
        async delete() {},
      },
    });

    await setResetTokenForUser({ userId: 6, token: 'tok-4', expiresAt: Date.now() + 60_000 });

    const entry = await consumeResetTokenEntryAsync('tok-4');
    assert.equal(entry?.userId, 6);
    assert.deepEqual(calls, ['tok-4']);
    assert.equal(await consumeResetTokenEntryAsync('tok-4'), null);
  });
});
