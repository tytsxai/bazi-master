import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  resetTokenStore,
  resetTokenByUser,
  consumeResetTokenEntryAsync,
  setResetTokenForUser,
  setResetTokenMirrors,
} from '../services/resetTokens.service.js';

describe('resetTokens service coverage', () => {
  beforeEach(() => {
    resetTokenStore.clear();
    resetTokenByUser.clear();
    setResetTokenMirrors({ tokenMirror: null, userMirror: null });
  });

  after(() => {
    resetTokenStore.clear();
    resetTokenByUser.clear();
    setResetTokenMirrors({ tokenMirror: null, userMirror: null });
  });

  it('consumeResetTokenEntryAsync consumes token once and clears indexes', async () => {
    const userId = 101;
    const token = 'tok-101';
    await setResetTokenForUser({
      userId,
      token,
      expiresAt: Date.now() + 10_000,
      ttlMs: 10_000,
    });

    const entry = await consumeResetTokenEntryAsync(token);
    assert.equal(entry.userId, userId);
    assert.equal(resetTokenStore.has(token), false);
    assert.equal(resetTokenByUser.has(userId), false);

    const second = await consumeResetTokenEntryAsync(token);
    assert.equal(second, null);
  });

  it('consumeResetTokenEntryAsync uses mirror getAndDelete when available', async () => {
    const tokenStoreMirror = new Map();
    const userStoreMirror = new Map();

    const tokenMirror = {
      get: async (key) => tokenStoreMirror.get(key),
      getAndDelete: async (key) => {
        const value = tokenStoreMirror.get(key);
        tokenStoreMirror.delete(key);
        return value;
      },
      delete: (key) => tokenStoreMirror.delete(key),
    };

    const userMirror = {
      get: async (key) => userStoreMirror.get(String(key)),
      delete: (key) => userStoreMirror.delete(String(key)),
    };

    setResetTokenMirrors({ tokenMirror, userMirror });

    const userId = 202;
    const token = 'tok-202';
    tokenStoreMirror.set(token, { userId, expiresAt: Date.now() + 10_000 });
    userStoreMirror.set(String(userId), token);

    const entry = await consumeResetTokenEntryAsync(token);
    assert.equal(entry.userId, userId);
    assert.equal(tokenStoreMirror.has(token), false);
    assert.equal(userStoreMirror.has(String(userId)), false);
  });
});
