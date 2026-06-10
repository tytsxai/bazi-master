import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';

import {
  deleteResetTokenAsync,
  resetTokenByUser,
  resetTokenStore,
  setResetTokenForUser,
  setResetTokenMirrors,
} from '../services/resetTokens.service.js';

describe('reset token service', () => {
  afterEach(() => {
    resetTokenStore.clear();
    resetTokenByUser.clear();
    setResetTokenMirrors();
  });

  test('setResetTokenForUser awaits mirrored writes and replacement deletes', async () => {
    const calls = [];
    setResetTokenMirrors({
      tokenMirror: {
        async set(key, value, ttlMs) {
          await new Promise((resolve) => setTimeout(resolve, 5));
          calls.push(['token:set', key, value.userId, ttlMs]);
        },
        async delete(key) {
          await new Promise((resolve) => setTimeout(resolve, 5));
          calls.push(['token:delete', key]);
        },
      },
      userMirror: {
        async set(key, value, ttlMs) {
          await new Promise((resolve) => setTimeout(resolve, 5));
          calls.push(['user:set', key, value, ttlMs]);
        },
      },
    });

    await setResetTokenForUser({
      userId: 7,
      token: 'first-token',
      expiresAt: Date.now() + 60000,
      ttlMs: 60000,
    });
    await setResetTokenForUser({
      userId: 7,
      token: 'second-token',
      expiresAt: Date.now() + 60000,
      ttlMs: 60000,
    });

    assert.deepEqual(
      calls.map((call) => call.slice(0, 2)),
      [
        ['token:set', 'first-token'],
        ['user:set', 7],
        ['token:delete', 'first-token'],
        ['token:set', 'second-token'],
        ['user:set', 7],
      ]
    );
    assert.equal(resetTokenStore.has('first-token'), false);
    assert.equal(resetTokenStore.has('second-token'), true);
    assert.equal(resetTokenByUser.get(7), 'second-token');
  });

  test('deleteResetTokenAsync removes remote user index when local index is empty', async () => {
    const calls = [];
    setResetTokenMirrors({
      tokenMirror: {
        async delete(key) {
          await new Promise((resolve) => setTimeout(resolve, 5));
          calls.push(['token:delete', key]);
        },
      },
      userMirror: {
        async get(key) {
          calls.push(['user:get', key]);
          return key === 7 ? 'remote-token' : null;
        },
        async delete(key) {
          await new Promise((resolve) => setTimeout(resolve, 5));
          calls.push(['user:delete', key]);
        },
      },
    });

    await deleteResetTokenAsync('remote-token', 7);

    assert.deepEqual(calls, [
      ['token:delete', 'remote-token'],
      ['user:get', 7],
      ['user:delete', 7],
    ]);
    assert.equal(resetTokenByUser.get(7), undefined);
  });
});
