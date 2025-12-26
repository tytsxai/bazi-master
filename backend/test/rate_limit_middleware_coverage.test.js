import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createRateLimitMiddleware,
  getRateLimitKey,
  isLocalAddress,
  maybeCleanupRateLimitStore,
  rateLimitStore,
  resetRateLimitState,
} from '../middleware/rateLimit.middleware.js';

const createRes = () => {
  const headers = new Map();
  return {
    statusCode: null,
    body: null,
    setHeader(name, value) {
      headers.set(name, value);
    },
    getHeader(name) {
      return headers.get(name);
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
};

describe('Rate limit middleware coverage', () => {
  it('redis init failure and redis command errors fall back to memory', async () => {
    resetRateLimitState();
    rateLimitStore.clear();

    const warnLines = [];
    const prevWarn = console.warn;
    console.warn = (...args) => warnLines.push(args.map(String).join(' '));
    try {
      const mwInitFail = createRateLimitMiddleware({
        RATE_LIMIT_ENABLED: true,
        RATE_LIMIT_MAX: 10,
        RATE_LIMIT_WINDOW_MS: 1000,
        initRedisClient: async () => {
          throw new Error('initfail');
        },
      });

      let nextCalls = 0;
      await mwInitFail({ ip: '2.2.2.2', app: { get: () => false } }, createRes(), () => { nextCalls += 1; });
      assert.equal(nextCalls, 1);
      assert.ok(warnLines.some((l) => l.includes('Redis init failed')));
      assert.ok(warnLines.some((l) => l.includes('Redis unavailable')));

      resetRateLimitState();
      rateLimitStore.clear();
      warnLines.length = 0;

      const client = {
        multi() {
          return {
            incr() { return this; },
            pttl() { return this; },
            async exec() { throw new Error('execfail'); },
          };
        },
      };
      const mwExecFail = createRateLimitMiddleware({
        RATE_LIMIT_ENABLED: true,
        RATE_LIMIT_MAX: 10,
        RATE_LIMIT_WINDOW_MS: 1000,
        initRedisClient: async () => client,
      });
      await mwExecFail({ ip: '3.3.3.3', app: { get: () => false } }, createRes(), () => { nextCalls += 1; });
      assert.ok(warnLines.some((l) => l.includes('Redis error')));
    } finally {
      console.warn = prevWarn;
    }
  });

  it('redis ttl missing triggers expire attempt and count=0 is normalized to 1', async () => {
    resetRateLimitState();
    rateLimitStore.clear();

    const warnLines = [];
    const prevWarn = console.warn;
    console.warn = (...args) => warnLines.push(args.map(String).join(' '));
    try {
      const client = {
        multi() {
          return {
            incr() { return this; },
            pttl() { return this; },
            async exec() { return [0, -1]; },
          };
        },
        async pexpire() {
          throw new Error('expirefail');
        },
      };

      const mw = createRateLimitMiddleware({
        RATE_LIMIT_ENABLED: true,
        RATE_LIMIT_MAX: 10,
        RATE_LIMIT_WINDOW_MS: 1000,
        initRedisClient: async () => client,
      });

      let nextCalls = 0;
      const res = createRes();
      await mw({ ip: '4.4.4.4', app: { get: () => false } }, res, () => { nextCalls += 1; });
      assert.equal(nextCalls, 1);
      assert.ok(warnLines.some((l) => l.includes('Redis expire failed')));
      assert.equal(res.getHeader('X-RateLimit-Remaining'), 9);
    } finally {
      console.warn = prevWarn;
    }
  });

  it('in-memory path resets when window elapsed', async () => {
    resetRateLimitState();
    rateLimitStore.clear();

    const now = Date.now();
    rateLimitStore.set('5.5.5.5', { count: 5, resetAt: now - 1 });

    const mw = createRateLimitMiddleware({
      RATE_LIMIT_ENABLED: true,
      RATE_LIMIT_MAX: 10,
      RATE_LIMIT_WINDOW_MS: 1000,
      initRedisClient: async () => null,
    });

    let nextCalls = 0;
    const res = createRes();
    await mw({ ip: '5.5.5.5', app: { get: () => false } }, res, () => { nextCalls += 1; });
    assert.equal(nextCalls, 1);
    assert.equal(res.getHeader('X-RateLimit-Remaining'), 9);
  });

  it('getRateLimitKey respects trust proxy ips', () => {
    const req = {
      ip: '1.1.1.1',
      ips: ['9.9.9.9'],
      app: { get: (k) => k === 'trust proxy' },
    };
    assert.equal(getRateLimitKey(req), '9.9.9.9');
  });

  it('isLocalAddress detects loopback variants', () => {
    assert.equal(isLocalAddress('127.0.0.1'), true);
    assert.equal(isLocalAddress('127.0.0.9'), true);
    assert.equal(isLocalAddress('::1'), true);
    assert.equal(isLocalAddress('localhost'), true);
    assert.equal(isLocalAddress('1.2.3.4'), false);
    assert.equal(isLocalAddress(null), false);
  });

  it('middleware no-ops when disabled or local address', async () => {
    let nextCalls = 0;
    const next = () => {
      nextCalls++;
    };

    const disabled = createRateLimitMiddleware({
      RATE_LIMIT_ENABLED: false,
      RATE_LIMIT_MAX: 1,
      RATE_LIMIT_WINDOW_MS: 10,
      initRedisClient: async () => null,
    });

    await disabled({ ip: '1.2.3.4', app: { get: () => false } }, createRes(), next);
    assert.equal(nextCalls, 1);

    const enabled = createRateLimitMiddleware({
      RATE_LIMIT_ENABLED: true,
      RATE_LIMIT_MAX: 1,
      RATE_LIMIT_WINDOW_MS: 10,
      initRedisClient: async () => null,
    });
    await enabled({ ip: '127.0.0.1', app: { get: () => false } }, createRes(), next);
    assert.equal(nextCalls, 2);
  });

  it('middleware enforces limits using in-memory fallback', async () => {
    resetRateLimitState();
    rateLimitStore.clear();

    const mw = createRateLimitMiddleware({
      RATE_LIMIT_ENABLED: true,
      RATE_LIMIT_MAX: 1,
      RATE_LIMIT_WINDOW_MS: 60_000,
      initRedisClient: async () => null,
    });

    let nextCalls = 0;
    const next = () => {
      nextCalls++;
    };

    const req = { ip: '1.2.3.4', app: { get: () => false } };
    const res1 = createRes();
    await mw(req, res1, next);
    assert.equal(nextCalls, 1);
    assert.equal(res1.getHeader('X-RateLimit-Limit'), 1);

    const res2 = createRes();
    await mw(req, res2, next);
    assert.equal(nextCalls, 1);
    assert.equal(res2.statusCode, 429);
    assert.equal(res2.body.error, 'Too many requests');
    assert.ok(res2.getHeader('Retry-After') >= 0);
  });

  it('maybeCleanupRateLimitStore prunes expired entries when enabled', () => {
    resetRateLimitState();
    rateLimitStore.clear();
    rateLimitStore.set('x', { count: 1, resetAt: 1 });
    const prevMax = process.env.RATE_LIMIT_MAX;
    const prevWin = process.env.RATE_LIMIT_WINDOW_MS;
    try {
      process.env.RATE_LIMIT_MAX = '1';
      process.env.RATE_LIMIT_WINDOW_MS = '1';
      maybeCleanupRateLimitStore(10_000);
      assert.equal(rateLimitStore.has('x'), false);
    } finally {
      if (prevMax === undefined) delete process.env.RATE_LIMIT_MAX;
      else process.env.RATE_LIMIT_MAX = prevMax;
      if (prevWin === undefined) delete process.env.RATE_LIMIT_WINDOW_MS;
      else process.env.RATE_LIMIT_WINDOW_MS = prevWin;
    }
  });
});
