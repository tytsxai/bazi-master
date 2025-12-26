import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { prisma } from '../config/prisma.js';
import { hashPassword } from '../utils/passwords.js';
import { createSessionToken, isAdminUser, sessionStore } from '../middleware/auth.js';
import {
  buildOauthRedirectUrl,
  buildOauthState,
  consumeOauthState,
  oauthStateStore,
  handleDevOauthLogin,
} from '../services/oauth.service.js';

describe('OAuth service coverage v2', () => {
  const usersToCleanup = [];

  before(async () => {
    await prisma.$connect();
  });

  after(async () => {
    for (const id of usersToCleanup) {
      await prisma.user.deleteMany({ where: { id } });
    }
    await prisma.$disconnect();
  });

  it('buildOauthState prunes expired entries and consumeOauthState enforces TTL', () => {
    oauthStateStore.set('expired', { createdAt: Date.now() - 9999999, nextPath: '/x' });
    const state = buildOauthState('/next');
    assert.ok(state);
    assert.equal(oauthStateStore.has('expired'), false);

    oauthStateStore.set('expired2', { createdAt: Date.now() - 9999999, nextPath: '/y' });
    assert.equal(consumeOauthState('expired2'), null);
    assert.equal(oauthStateStore.has('expired2'), false);

    const entry = consumeOauthState(state);
    assert.ok(entry);
    assert.equal(entry.nextPath, '/next');
  });

  it('buildOauthRedirectUrl sets token/user hash and query params', () => {
    const url = buildOauthRedirectUrl({
      token: 'tok',
      user: { id: 1, email: 'a@b.com' },
      nextPath: '/profile',
      error: 'x',
      frontendUrl: 'http://localhost:3000',
    });
    assert.ok(url.includes('/login'));
    assert.ok(url.includes('next=%2Fprofile'));
    assert.ok(url.includes('error=x'));
    assert.ok(url.includes('#'));
  });

  it('handleDevOauthLogin redirects with server_error when password hash fails', async () => {
    const res = {
      redirectedTo: null,
      redirect(url) {
        this.redirectedTo = url;
        return this;
      },
    };

    await handleDevOauthLogin({
      provider: 'google',
      req: { query: { dev_email: 'dev_oauth_hashfail@example.com' } },
      res,
      nextPath: '/home',
      prisma,
      hashPassword: async () => null,
      createSessionToken,
      sessionStore,
      isAdminUser,
      frontendUrl: 'http://localhost:3000',
    });

    assert.ok(res.redirectedTo);
    assert.ok(res.redirectedTo.includes('error=server_error'));
    assert.ok(res.redirectedTo.includes('next=%2Fhome'));
  });

  it('handleDevOauthLogin creates/updates user and redirects with token and encoded user', async () => {
    const email = `dev_oauth_${Date.now()}@example.com`;
    const res = {
      redirectedTo: null,
      redirect(url) {
        this.redirectedTo = url;
        return this;
      },
    };

    await handleDevOauthLogin({
      provider: 'google',
      req: { query: { dev_email: email, dev_name: 'Dev User' } },
      res,
      nextPath: '/home',
      prisma,
      hashPassword,
      createSessionToken,
      sessionStore,
      isAdminUser,
      frontendUrl: 'http://localhost:3000',
    });

    const created = await prisma.user.findUnique({ where: { email } });
    assert.ok(created);
    usersToCleanup.push(created.id);

    assert.ok(res.redirectedTo);
    assert.ok(res.redirectedTo.includes('/login'));
    assert.ok(res.redirectedTo.includes('#'));
    assert.ok(res.redirectedTo.includes('token='));
    assert.ok(res.redirectedTo.includes('user='));

    // Update branch: user exists but name missing.
    await prisma.user.update({ where: { id: created.id }, data: { name: null } });
    const res2 = {
      redirectedTo: null,
      redirect(url) {
        this.redirectedTo = url;
        return this;
      },
    };
    await handleDevOauthLogin({
      provider: 'google',
      req: { query: { dev_email: email, dev_name: 'Updated Name' } },
      res: res2,
      nextPath: '/home',
      prisma,
      hashPassword,
      createSessionToken,
      sessionStore,
      isAdminUser,
      frontendUrl: 'http://localhost:3000',
    });
    const updated = await prisma.user.findUnique({ where: { email } });
    assert.equal(updated.name, 'Updated Name');
    assert.ok(res2.redirectedTo);
  });
});
