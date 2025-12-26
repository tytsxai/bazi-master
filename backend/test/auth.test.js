import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequireAuth } from '../services/auth.service.js';

const buildRes = () => {
  const res = {
    statusCode: null,
    headers: {},
    body: null,
    set(key, value) {
      this.headers[String(key).toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
};

test('createRequireAuth strict mode ignores silent expiry header', async () => {
  const requireAuth = createRequireAuth({
    authorizeToken: async () => {
      throw new Error('Token expired');
    },
    allowSessionExpiredSilent: false,
  });

  const req = {
    headers: {
      authorization: 'Bearer token_1_0',
      'x-session-expired-silent': '1',
    },
  };
  const res = buildRes();
  let nextCalled = false;

  await requireAuth(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.headers['x-session-expired'], undefined);
  assert.equal(res.body?.error, 'Token expired');
});

test('createRequireAuth default mode respects silent expiry header', async () => {
  const requireAuth = createRequireAuth({
    authorizeToken: async () => {
      throw new Error('Token expired');
    },
  });

  const req = {
    headers: {
      authorization: 'Bearer token_1_0',
      'x-session-expired-silent': '1',
    },
  };
  const res = buildRes();

  await requireAuth(req, res, () => {});

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['x-session-expired'], '1');
  assert.equal(res.body?.sessionExpired, true);
  assert.equal(res.body?.error, 'Token expired');
});

test('createRequireAuth attaches user and continues on success', async () => {
  const requireAuth = createRequireAuth({
    authorizeToken: async () => ({ id: 42, email: 'test@example.com' }),
  });

  const req = { headers: { authorization: 'Bearer token_42_1' } };
  const res = buildRes();
  let nextCalled = false;

  await requireAuth(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(req.user?.id, 42);
  assert.equal(res.statusCode, null);
});
