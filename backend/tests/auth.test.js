import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createAuthorizeToken, createRequireAuth, requireAdmin } from '../auth.js';

const makeRes = () => {
  const res = {
    statusCode: null,
    body: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    set(key, value) {
      this.headers[String(key).toLowerCase()] = String(value);
      return this;
    }
  };
  return res;
};

const makeNext = () => {
  let called = false;
  const fn = () => {
    called = true;
  };
  return { fn, get called() { return called; } };
};

describe('requireAuth', () => {
  test('returns 401 when Authorization header is missing', async () => {
    const sessionStore = new Map();
    const prisma = { user: { findUnique: async () => ({ id: 1, email: 'a@b.com', name: 'A' }) } };
    const authorizeToken = createAuthorizeToken({
      prisma,
      sessionStore,
      isAdminUser: () => false,
      now: () => 1000
    });
    const requireAuth = createRequireAuth({ authorizeToken });
    const req = { headers: {} };
    const res = makeRes();
    const next = makeNext();

    await requireAuth(req, res, next.fn);

    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'Unauthorized');
    assert.equal(next.called, false);
  });

  test('returns 401 when silent session handling is disabled', async () => {
    const sessionStore = new Map();
    const prisma = { user: { findUnique: async () => ({ id: 1, email: 'a@b.com', name: 'A' }) } };
    const authorizeToken = createAuthorizeToken({
      prisma,
      sessionStore,
      isAdminUser: () => false,
      now: () => 1000
    });
    const requireAuth = createRequireAuth({ authorizeToken, allowSessionExpiredSilent: false });
    const req = { headers: { 'x-session-expired-silent': '1' } };
    const res = makeRes();
    const next = makeNext();

    await requireAuth(req, res, next.fn);

    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'Unauthorized');
    assert.equal(next.called, false);
  });

  test('returns 401 when Authorization header is missing even with silent expiry header', async () => {
    const sessionStore = new Map();
    const prisma = { user: { findUnique: async () => ({ id: 1, email: 'a@b.com', name: 'A' }) } };
    const authorizeToken = createAuthorizeToken({
      prisma,
      sessionStore,
      isAdminUser: () => false,
      now: () => 1000
    });
    const requireAuth = createRequireAuth({ authorizeToken });
    const req = { headers: { 'x-session-expired-silent': '1' } };
    const res = makeRes();
    const next = makeNext();

    await requireAuth(req, res, next.fn);

    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'Unauthorized');
    assert.equal(res.headers['x-session-expired'], undefined);
    assert.equal(next.called, false);
  });

  test('returns 401 for invalid token format', async () => {
    const sessionStore = new Map();
    const prisma = { user: { findUnique: async () => ({ id: 1, email: 'a@b.com', name: 'A' }) } };
    const authorizeToken = createAuthorizeToken({
      prisma,
      sessionStore,
      isAdminUser: () => false,
      now: () => 1000
    });
    const requireAuth = createRequireAuth({ authorizeToken });
    const req = { headers: { authorization: 'Bearer nope' } };
    const res = makeRes();
    const next = makeNext();

    await requireAuth(req, res, next.fn);

    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'Invalid token');
    assert.equal(next.called, false);
  });

  test('returns 200 with x-session-expired for expired token when silent header is set', async () => {
    const sessionStore = new Map();
    const prisma = { user: { findUnique: async () => ({ id: 1, email: 'a@b.com', name: 'A' }) } };
    const now = 2000;
    const authorizeToken = createAuthorizeToken({
      prisma,
      sessionStore,
      isAdminUser: () => false,
      tokenTtlMs: 500,
      now: () => now
    });
    const requireAuth = createRequireAuth({ authorizeToken });
    const req = {
      headers: {
        authorization: 'Bearer token_1_1000',
        'x-session-expired-silent': '1'
      }
    };
    const res = makeRes();
    const next = makeNext();

    await requireAuth(req, res, next.fn);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.error, 'Token expired');
    assert.equal(res.body.sessionExpired, true);
    assert.equal(res.headers['x-session-expired'], '1');
    assert.equal(next.called, false);
  });

  test('returns 401 for expired token', async () => {
    const sessionStore = new Map();
    const prisma = { user: { findUnique: async () => ({ id: 1, email: 'a@b.com', name: 'A' }) } };
    const now = 2000;
    const authorizeToken = createAuthorizeToken({
      prisma,
      sessionStore,
      isAdminUser: () => false,
      tokenTtlMs: 500,
      now: () => now
    });
    const requireAuth = createRequireAuth({ authorizeToken });
    const req = { headers: { authorization: 'Bearer token_1_1000' } };
    const res = makeRes();
    const next = makeNext();

    await requireAuth(req, res, next.fn);

    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'Token expired');
    assert.equal(next.called, false);
  });

  test('returns 401 for expired session idle time', async () => {
    const sessionStore = new Map();
    const prisma = { user: { findUnique: async () => ({ id: 1, email: 'a@b.com', name: 'A' }) } };
    const now = 2000;
    const token = 'token_1_1500';
    sessionStore.set(token, 1000);
    const authorizeToken = createAuthorizeToken({
      prisma,
      sessionStore,
      isAdminUser: () => false,
      sessionIdleMs: 500,
      now: () => now
    });
    const requireAuth = createRequireAuth({ authorizeToken });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = makeRes();
    const next = makeNext();

    await requireAuth(req, res, next.fn);

    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'Session expired');
    assert.equal(sessionStore.has(token), false);
    assert.equal(next.called, false);
  });

  test('returns 401 when user does not exist', async () => {
    const sessionStore = new Map();
    const prisma = { user: { findUnique: async () => null } };
    const token = 'token_2_1500';
    sessionStore.set(token, 1800);
    const authorizeToken = createAuthorizeToken({
      prisma,
      sessionStore,
      isAdminUser: () => false,
      now: () => 2000
    });
    const requireAuth = createRequireAuth({ authorizeToken });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = makeRes();
    const next = makeNext();

    await requireAuth(req, res, next.fn);

    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'User not found');
    assert.equal(next.called, false);
  });

  test('attaches user and calls next for valid token', async () => {
    const sessionStore = new Map();
    const prisma = { user: { findUnique: async () => ({ id: 7, email: 'user@b.com', name: 'User' }) } };
    const now = 3000;
    const token = 'token_7_2500';
    sessionStore.set(token, 2800);
    const authorizeToken = createAuthorizeToken({
      prisma,
      sessionStore,
      isAdminUser: (user) => user.email === 'admin@b.com',
      now: () => now
    });
    const requireAuth = createRequireAuth({ authorizeToken });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = makeRes();
    const next = makeNext();

    await requireAuth(req, res, next.fn);

    assert.equal(res.statusCode, null);
    assert.equal(next.called, true);
    assert.deepEqual(req.user, {
      id: 7,
      email: 'user@b.com',
      name: 'User',
      isAdmin: false
    });
    assert.equal(sessionStore.get(token), now);
  });
});

describe('requireAdmin', () => {
  test('returns 403 when user is not admin', () => {
    const req = { user: { isAdmin: false } };
    const res = makeRes();
    const next = makeNext();

    requireAdmin(req, res, next.fn);

    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error, 'Forbidden');
    assert.equal(next.called, false);
  });

  test('allows request when user is admin', () => {
    const req = { user: { isAdmin: true } };
    const res = makeRes();
    const next = makeNext();

    requireAdmin(req, res, next.fn);

    assert.equal(res.statusCode, null);
    assert.equal(next.called, true);
  });
});
