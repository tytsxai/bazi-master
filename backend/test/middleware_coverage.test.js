import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimitMiddleware } from '../middleware/rateLimit.middleware.js';
import { notFoundHandler, globalErrorHandler as errorHandler } from '../middleware/error.js';
import { validateBaziInput, isUrlTooLong } from '../utils/validation.js';

describe('Middleware & Utils Coverage', () => {
  // --- Rate Limit Middleware ---
  it('createRateLimitMiddleware returns function', () => {
    const limiter = createRateLimitMiddleware({
      RATE_LIMIT_ENABLED: true,
      RATE_LIMIT_MAX: 100,
      RATE_LIMIT_WINDOW_MS: 60000,
    });
    assert.equal(typeof limiter, 'function');
  });

  // --- Error Middleware ---
  it('notFoundHandler calls next with 404', () => {
    const req = { originalUrl: '/missing' };
    const res = {};
    const next = (err) => {
      assert.ok(err);
      assert.equal(err.statusCode, 404);
      assert.ok(err.message.includes('/missing'));
    };
    notFoundHandler(req, res, next);
  });

  it('errorHandler sends JSON response', () => {
    const err = { statusCode: 400, message: 'Bad' };
    const req = { id: 'test-req-id', method: 'GET', originalUrl: '/test' };
    let sentStatus, sentJson;
    const res = {
      status: (s) => {
        sentStatus = s;
        return res;
      },
      json: (j) => {
        sentJson = j;
        return res;
      },
    };
    const next = () => {};

    errorHandler(err, req, res, next);
    assert.equal(sentStatus, 400);
    assert.equal(sentJson.message, 'Bad');
    assert.equal(sentJson.status, 'error');
  });

  it('errorHandler handles generic errors', () => {
    const err = new Error('Ouch');
    const req = {};
    let sentStatus;
    const res = {
      status: (s) => {
        sentStatus = s;
        return res;
      },
      json: () => res,
    };
    const next = () => {};

    errorHandler(err, req, res, next);
    assert.equal(sentStatus, 500);
  });

  // --- Utils Validation ---
  it('isUrlTooLong detects long URLs', () => {
    const req = { url: 'short' };
    assert.equal(isUrlTooLong(req), false);
    // default max is 16384
    const longUrl = 'a'.repeat(17000);
    assert.equal(isUrlTooLong({ url: longUrl }), true);
    assert.equal(isUrlTooLong(null), false);
  });

  it('validateBaziInput checks fields', () => {
    const good = {
      birthYear: 1990,
      birthMonth: 1,
      birthDay: 1,
      birthHour: 12,
      gender: 'male',
      birthLocation: 'Loc',
      timezone: 'UTC',
    };
    const res = validateBaziInput(good);
    assert.equal(res.ok, true);
    assert.equal(res.payload.birthYear, 1990);

    const bad = { birthYear: 'invalid' };
    const res2 = validateBaziInput(bad);
    assert.equal(res2.ok, false);
    assert.equal(res2.reason, 'invalid');

    const whitespace = { gender: ' ' };
    const res3 = validateBaziInput(whitespace);
    assert.equal(res3.ok, false);
    assert.equal(res3.reason, 'whitespace');
  });
});
