import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { getBaziCacheConfig, getServerConfig, initAppConfig } from '../config/app.js';

const withEnv = async (patch, run) => {
  const previous = {};
  for (const [key, value] of Object.entries(patch)) {
    previous[key] = Object.prototype.hasOwnProperty.call(process.env, key)
      ? process.env[key]
      : undefined;
    if (value === undefined) delete process.env[key];
    else process.env[key] = String(value);
  }
  try {
    return await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

describe('app config more coverage', () => {
  it('parseOriginList expands loopback variants and tolerates invalid origins', async () => {
    await withEnv(
      {
        NODE_ENV: 'test',
        CORS_ALLOWED_ORIGINS: ' http://localhost:3000 , http://127.0.0.1:3000, not a url, ,',
      },
      async () => {
        const config = initAppConfig();
        assert.equal(config.allowedOrigins.has('http://localhost:3000'), true);
        assert.equal(config.allowedOrigins.has('http://127.0.0.1:3000'), true);
        assert.equal(config.allowedOrigins.has('not a url'), true);
      }
    );
  });

  it('CORS_ALLOWED_ORIGINS is the only origin source in production', async () => {
    // FRONTEND_URL used to be folded in here. It no longer is, and a deployment that still
    // sets it must not silently keep working — that would hide the migration until the
    // first cross-origin request from a client nobody remembered to re-list.
    await withEnv(
      {
        NODE_ENV: 'production',
        FRONTEND_URL: 'https://leftover.example.com',
        CORS_ALLOWED_ORIGINS: 'https://client.example.com',
      },
      async () => {
        const config = initAppConfig();
        assert.equal(config.allowedOrigins.has('https://client.example.com'), true);
        assert.equal(config.allowedOrigins.has('https://leftover.example.com'), false);
        // Localhost defaults are development-only.
        assert.equal(config.allowedOrigins.has('http://localhost:3000'), false);
      }
    );
  });

  it('falls back when numeric environment values are invalid', async () => {
    await withEnv(
      {
        NODE_ENV: 'production',
        PORT: 'bad-port',
        RATE_LIMIT_WINDOW_MS: 'not-a-number',
        RATE_LIMIT_MAX: 'also-bad',
        BAZI_CACHE_TTL_MS: 'invalid',
      },
      async () => {
        const serverConfig = getServerConfig();
        const baziCacheConfig = getBaziCacheConfig();
        assert.equal(serverConfig.port, 4000);
        assert.equal(serverConfig.rateLimitWindowMs, 60000);
        assert.equal(serverConfig.rateLimitMax, 120);
        assert.equal(baziCacheConfig.ttlMs, 6 * 60 * 60 * 1000);
      }
    );
  });
});
