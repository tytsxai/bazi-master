import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { initAppConfig } from '../config/app.js';

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
  it('normalizeOrigin returns empty string on invalid URLs', async () => {
    await withEnv(
      {
        NODE_ENV: 'test',
        FRONTEND_URL: 'not a url',
        WECHAT_FRONTEND_URL: 'also bad',
        CORS_ALLOWED_ORIGINS: '',
      },
      async () => {
        const config = initAppConfig();
        assert.ok(config.allowedOrigins instanceof Set);
        assert.equal(config.allowedOrigins.has(''), true);
      }
    );
  });

  it('parseOriginList expands loopback variants and tolerates invalid origins', async () => {
    await withEnv(
      {
        NODE_ENV: 'test',
        FRONTEND_URL: 'http://example.com',
        WECHAT_FRONTEND_URL: 'http://example.com',
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
});
