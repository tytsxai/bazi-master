import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  createRateLimitMiddleware,
  isRateLimitDegraded,
  rateLimitStore,
  resetRateLimitState,
} from '../middleware/rateLimit.middleware.js';
import { logger } from '../config/logger.js';

const createRes = () => ({
  statusCode: null,
  body: null,
  setHeader() {},
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.body = payload;
    return this;
  },
});

// Drives the middleware with Redis unavailable, which is the only way into the fallback.
const runWithRedisDown = async ({ resolveKey } = {}) => {
  const middleware = createRateLimitMiddleware({
    RATE_LIMIT_ENABLED: true,
    RATE_LIMIT_MAX: 100,
    RATE_LIMIT_WINDOW_MS: 60_000,
    initRedisClient: async () => null,
    resolveKey: resolveKey || (() => 'client-key'),
  });
  const res = createRes();
  let nextCalled = false;
  await middleware({ headers: {}, ip: '203.0.113.7' }, res, () => {
    nextCalled = true;
  });
  return { res, nextCalled };
};

describe('rate limit degradation signal', () => {
  const originalEnv = process.env.NODE_ENV;
  let errorLines;
  let warnLines;
  let originalError;
  let originalWarn;

  beforeEach(() => {
    resetRateLimitState();
    rateLimitStore.clear();
    errorLines = [];
    warnLines = [];
    originalError = logger.error;
    originalWarn = logger.warn;
    logger.error = (...args) => errorLines.push(args);
    logger.warn = (...args) => warnLines.push(args);
  });

  afterEach(() => {
    logger.error = originalError;
    logger.warn = originalWarn;
    process.env.NODE_ENV = originalEnv;
    resetRateLimitState();
    rateLimitStore.clear();
  });

  it('starts undegraded', () => {
    assert.equal(isRateLimitDegraded(), false);
  });

  // The regression this guards: production used to return early and log nothing at all,
  // so the one environment where a per-instance quota matters was also the only one that
  // never said it had fallen back.
  it('logs an error in production when it falls back to the in-memory store', async () => {
    process.env.NODE_ENV = 'production';

    const { nextCalled } = await runWithRedisDown();

    assert.equal(nextCalled, true, 'requests must still be served while degraded');
    assert.equal(errorLines.length, 1);
    const [context, message] = errorLines[0];
    assert.equal(context.degraded, 'rate-limit-store');
    assert.match(message, /per instance/);
  });

  it('throttles the production log rather than emitting one line per request', async () => {
    process.env.NODE_ENV = 'production';

    for (let i = 0; i < 25; i += 1) {
      await runWithRedisDown();
    }

    assert.equal(errorLines.length, 1);
  });

  it('still warns outside production', async () => {
    process.env.NODE_ENV = 'development';

    await runWithRedisDown();

    assert.equal(errorLines.length, 0);
    assert.equal(warnLines.length >= 1, true);
  });

  it('flags degradation for the metrics endpoint once it has fallen back', async () => {
    process.env.NODE_ENV = 'production';

    assert.equal(isRateLimitDegraded(), false);
    await runWithRedisDown();
    assert.equal(isRateLimitDegraded(), true);
  });

  // Time-windowed rather than latched: a signal that stays red until the next restart is
  // one nobody keeps an alert on.
  it('clears the flag once the fallback window has elapsed', async () => {
    process.env.NODE_ENV = 'production';

    await runWithRedisDown();
    const now = Date.now();

    assert.equal(isRateLimitDegraded(now + 59_000), true);
    assert.equal(isRateLimitDegraded(now + 61_000), false);
  });
});
