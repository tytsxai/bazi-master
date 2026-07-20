import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { buildAuthToken, createAuthorizeToken } from '../services/auth.service.js';
import { createSessionStore } from '../services/session.service.js';
import {
  credentialRevocationStore,
  getCredentialsChangedAtAsync,
  markCredentialsChanged,
} from '../services/credentialRevocation.service.js';

const SECRET = 'credential-revocation-test-secret-value';

const buildDeps = ({ sessionStore, user = { id: 7, email: 'user@example.com' } }) => ({
  prisma: {
    user: {
      async findUnique() {
        return user;
      },
    },
  },
  sessionStore,
  isAdminUser: () => false,
  tokenSecret: SECRET,
});

describe('credential revocation', () => {
  beforeEach(async () => {
    await credentialRevocationStore.clearAsync();
  });

  it('accepts a token issued after the credential change', async () => {
    const sessionStore = createSessionStore();
    const authorize = createAuthorizeToken(buildDeps({ sessionStore }));

    await markCredentialsChanged(7, Date.now() - 60_000);

    const token = buildAuthToken({ userId: 7, secret: SECRET });
    sessionStore.set(token, Date.now());

    const user = await authorize(token);
    assert.equal(user.id, 7);
  });

  it('rejects a token issued before the credential change', async () => {
    const sessionStore = createSessionStore();
    const authorize = createAuthorizeToken(buildDeps({ sessionStore }));

    // A session that predates the password reset, as a stolen token would.
    const issuedAt = Date.now() - 60_000;
    const token = buildAuthToken({ userId: 7, issuedAt, secret: SECRET });
    sessionStore.set(token, Date.now());

    assert.equal((await authorize(token)).id, 7);

    await markCredentialsChanged(7, Date.now());

    await assert.rejects(() => authorize(token), /Session expired/);
  });

  it('only revokes the user whose credentials changed', async () => {
    const sessionStore = createSessionStore();
    const authorize = createAuthorizeToken(
      buildDeps({ sessionStore, user: { id: 9, email: 'other@example.com' } })
    );

    const token = buildAuthToken({ userId: 9, issuedAt: Date.now() - 60_000, secret: SECRET });
    sessionStore.set(token, Date.now());

    await markCredentialsChanged(7, Date.now());

    assert.equal((await authorize(token)).id, 9);
  });

  it('ignores invalid user ids', async () => {
    await markCredentialsChanged(Number.NaN);
    assert.equal(await getCredentialsChangedAtAsync(Number.NaN), null);
  });
});
