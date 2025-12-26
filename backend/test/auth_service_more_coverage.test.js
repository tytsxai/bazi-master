import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';

import {
  buildAuthToken,
  createAuthorizeToken,
  createRequireAuth,
  parseAuthToken,
  requireAdmin,
} from '../services/auth.service.js';

describe('auth.service more coverage', () => {
  it('buildAuthToken returns null for invalid userId', () => {
    assert.equal(buildAuthToken({ userId: NaN, secret: 's' }), null);
    assert.equal(buildAuthToken({ userId: Infinity, secret: 's' }), null);
  });

  it('parseAuthToken supports legacy token format', () => {
    const secret = 'secret';
    const userId = 123;
    const issuedAt = 456;
    const nonce = 'a'.repeat(32);
    const signature = crypto
      .createHmac('sha256', secret)
      .update(`${userId}.${issuedAt}.${nonce}`)
      .digest('hex');
    const token = `token_${userId}_${issuedAt}_${nonce}${signature}`;

    const parsed = parseAuthToken(token, { secret });
    assert.ok(parsed);
    assert.equal(parsed.userId, userId);
    assert.equal(parsed.issuedAt, issuedAt);
    assert.equal(parsed.nonce, nonce);
    assert.equal(parsed.signature, signature);
  });

  it('authorizeToken covers invalid token/session/user error paths and success', async () => {
    const secret = 'secret';

    const sessionStore = new Map();
    const prisma = {
      user: {
        async findUnique({ where }) {
          if (where.id === 404) return null;
          return { id: where.id, email: 'u@example.com', name: 'User' };
        },
      },
    };

    const now = (() => {
      let current = 1000;
      const fn = () => current;
      fn.set = (v) => {
        current = v;
      };
      return fn;
    })();

    const authorizeToken = createAuthorizeToken({
      prisma,
      sessionStore,
      isAdminUser: () => false,
      tokenSecret: secret,
      tokenTtlMs: 100,
      sessionIdleMs: 50,
      now,
    });

    await assert.rejects(() => authorizeToken(null), /Unauthorized/);
    await assert.rejects(() => authorizeToken('not-a-token'), /Invalid token/);

    // Legacy token missing signature => invalid token
    await assert.rejects(() => authorizeToken('token_1_2_nonceOnly'), /Invalid token/);

    // Token expired
    {
      const token = buildAuthToken({ userId: 1, issuedAt: 0, secret });
      sessionStore.set(token, 0);
      now.set(1000);
      await assert.rejects(() => authorizeToken(token), /Token expired/);
    }

    // Session expired (missing)
    {
      now.set(1000);
      const token = buildAuthToken({ userId: 1, issuedAt: 990, secret });
      await assert.rejects(() => authorizeToken(token), /Session expired/);
    }

    // Session idle expired => delete + error
    {
      now.set(2000);
      const token = buildAuthToken({ userId: 1, issuedAt: 1990, secret });
      sessionStore.set(token, 1900);
      await assert.rejects(() => authorizeToken(token), /Session expired/);
      assert.equal(sessionStore.has(token), false);
    }

    // User not found
    {
      now.set(3000);
      const token = buildAuthToken({ userId: 404, issuedAt: 2990, secret });
      sessionStore.set(token, 2990);
      await assert.rejects(() => authorizeToken(token), /User not found/);
    }

    // Success
    {
      now.set(4000);
      const token = buildAuthToken({ userId: 5, issuedAt: 3990, secret });
      sessionStore.set(token, 3990);
      const user = await authorizeToken(token);
      assert.deepEqual(user, {
        id: 5,
        email: 'u@example.com',
        name: 'User',
        isAdmin: false,
      });
      assert.ok(sessionStore.get(token) >= 4000);
    }
  });

  it('createRequireAuth supports silent expired mode', async () => {
    const authorizeToken = async () => {
      throw new Error('Token expired');
    };
    const middleware = createRequireAuth({ authorizeToken, allowSessionExpiredSilent: true });

    const req = { headers: { authorization: 'Bearer t', 'x-session-expired-silent': '1' } };
    const res = {
      statusCode: null,
      body: null,
      headers: {},
      set(name, value) {
        this.headers[name] = value;
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        return this;
      },
    };

    let nextCalls = 0;
    await middleware(req, res, () => {
      nextCalls++;
    });

    assert.equal(nextCalls, 0);
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['x-session-expired'], '1');
    assert.equal(res.body.sessionExpired, true);
  });

  it('requireAdmin rejects non-admin', () => {
    const res = {
      statusCode: null,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        return this;
      },
    };
    let nextCalls = 0;
    requireAdmin({ user: { isAdmin: false } }, res, () => {
      nextCalls++;
    });
    assert.equal(nextCalls, 0);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error, 'Forbidden');
  });
});
