import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { prisma } from '../config/prisma.js';
import { buildAuthToken } from '../services/auth.service.js';
import { cleanupUserInMemory, deleteUserCascade } from '../userCleanup.js';

describe('User cleanup coverage', () => {
  before(async () => {
    await prisma.$connect();
  });

  after(async () => {
    await prisma.$disconnect();
  });

  it('cleanupUserInMemory handles reset tokens and sessions (secret, prefix, keys)', () => {
    const userId = 123;
    const secret = 'test-secret';

    const resetTokenStore = new Map([
      ['tok-a', { userId }],
      ['tok-b', { userId: 999 }],
    ]);
    const resetTokenByUser = new Map([[userId, 'tok-a']]);

    const tokenForUser = buildAuthToken({ userId, secret });
    const tokenForOther = buildAuthToken({ userId: 999, secret });

    const deleted = new Set();
    const sessionStoreWithSecret = {
      keys() {
        return [tokenForUser, tokenForOther, 42];
      },
      delete(key) {
        deleted.add(key);
      },
    };

    const deletedClientIndex = new Map([[userId, { ok: true }]]);
    const clientRecordIndex = new Map([[userId, { ok: true }]]);

    cleanupUserInMemory(userId, {
      sessionStore: sessionStoreWithSecret,
      resetTokenStore,
      resetTokenByUser,
      deletedClientIndex,
      clientRecordIndex,
      sessionTokenSecret: secret,
    });

    assert.equal(resetTokenByUser.has(userId), false);
    assert.equal(resetTokenStore.has('tok-a'), false);
    assert.ok(deleted.has(tokenForUser));
    assert.equal(deletedClientIndex.has(userId), false);
    assert.equal(clientRecordIndex.has(userId), false);

    let deletedByPrefix = null;
    const prefixStore = {
      deleteByPrefix(prefix) {
        deletedByPrefix = prefix;
      },
    };
    cleanupUserInMemory(userId, { sessionStore: prefixStore });
    assert.equal(deletedByPrefix, `token_${userId}_`);

    const keyStore = new Map([
      [`token_${userId}_1`, 1],
      [`token_${userId}_2`, 1],
      ['token_999_1', 1],
    ]);
    const keysStore = {
      keys() {
        return keyStore.keys();
      },
      delete(key) {
        keyStore.delete(key);
      },
    };
    cleanupUserInMemory(userId, { sessionStore: keysStore });
    assert.equal(keyStore.has(`token_${userId}_1`), false);
    assert.equal(keyStore.has(`token_${userId}_2`), false);
    assert.equal(keyStore.has('token_999_1'), true);
  });

  it('deleteUserCascade throws on missing args and deletes a user with cleanup callback', async () => {
    await assert.rejects(() => deleteUserCascade({}), /Missing prisma or userId/);

    const user = await prisma.user.create({
      data: {
        email: `cleanup_${Date.now()}@example.com`,
        password: 'hashedpassword',
      },
    });

    let cleaned = null;
    await deleteUserCascade({
      prisma,
      userId: user.id,
      cleanupUserMemory(id) {
        cleaned = id;
      },
    });

    assert.equal(cleaned, user.id);
    const exists = await prisma.user.findUnique({ where: { id: user.id } });
    assert.equal(exists, null);
  });
});
