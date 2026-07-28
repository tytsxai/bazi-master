import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setSessionCookie } from '../utils/sessionCookie.js';

const captureCookieOptions = () => {
  const calls = [];
  return {
    calls,
    res: {
      cookie(name, value, options) {
        calls.push({ name, value, options });
      },
    },
  };
};

describe('Session cookie max age', () => {
  const originalIdleMs = process.env.SESSION_IDLE_MS;

  afterEach(() => {
    if (originalIdleMs === undefined) {
      delete process.env.SESSION_IDLE_MS;
    } else {
      process.env.SESSION_IDLE_MS = originalIdleMs;
    }
  });

  it('defaults to 30 minutes when SESSION_IDLE_MS is unset', () => {
    delete process.env.SESSION_IDLE_MS;
    const { calls, res } = captureCookieOptions();
    setSessionCookie(res, 'token');
    assert.equal(calls[0].options.maxAge, 30 * 60 * 1000);
  });

  // The server expires idle sessions at SESSION_IDLE_MS. A cookie pinned to 30 minutes
  // meant raising that value did nothing: the browser dropped the cookie on the old
  // schedule and logged the user out while the session was still valid server-side.
  it('follows SESSION_IDLE_MS so the cookie and the server agree', () => {
    process.env.SESSION_IDLE_MS = String(2 * 60 * 60 * 1000);
    const { calls, res } = captureCookieOptions();
    setSessionCookie(res, 'token');
    assert.equal(calls[0].options.maxAge, 2 * 60 * 60 * 1000);
  });

  it('ignores values that are not a usable duration', () => {
    for (const value of ['', 'forever', '0', '-5']) {
      process.env.SESSION_IDLE_MS = value;
      const { calls, res } = captureCookieOptions();
      setSessionCookie(res, 'token');
      assert.equal(calls[0].options.maxAge, 30 * 60 * 1000, `unexpected maxAge for "${value}"`);
    }
  });

  it('keeps the cookie hardened regardless of the max age', () => {
    process.env.SESSION_IDLE_MS = '60000';
    const { calls, res } = captureCookieOptions();
    setSessionCookie(res, 'token');
    assert.equal(calls[0].options.httpOnly, true);
    assert.equal(calls[0].options.path, '/');
  });
});
