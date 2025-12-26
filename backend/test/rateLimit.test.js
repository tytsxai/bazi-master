import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createRateLimitMiddleware } from '../middleware/rateLimit.middleware.js';

describe('rate limit middleware', () => {
  test('uses Redis when available', async () => {
    let multiCalled = false;
    const fakeMulti = {
      incr() {
        return this;
      },
      pttl() {
        return this;
      },
      async exec() {
        multiCalled = true;
        return [1, 5000];
      },
    };
    const fakeRedis = {
      multi() {
        return fakeMulti;
      },
      async pexpire() {},
    };

    const middleware = createRateLimitMiddleware({
      RATE_LIMIT_ENABLED: true,
      RATE_LIMIT_MAX: 10,
      RATE_LIMIT_WINDOW_MS: 60000,
      initRedisClient: async () => fakeRedis,
    });

    const req = {
      ip: '203.0.113.10',
      connection: {},
      app: { get: () => false },
    };
    const res = {
      headers: {},
      setHeader(name, value) {
        this.headers[name] = value;
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.payload = payload;
        return this;
      },
    };

    let nextCalled = false;
    await middleware(req, res, () => {
      nextCalled = true;
    });

    assert.equal(multiCalled, true);
    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, undefined);
    assert.equal(res.headers['X-RateLimit-Limit'], 10);
  });
});
