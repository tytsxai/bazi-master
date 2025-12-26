import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createCorsConfig,
  createCorsMiddleware,
  expandLoopbackOrigins,
  isAllowedOrigin,
  normalizeOrigin,
  parseOriginList,
} from '../middleware/cors.middleware.js';

describe('CORS middleware coverage', () => {
  it('normalizeOrigin returns origin or empty string', () => {
    assert.equal(normalizeOrigin('https://example.com/path'), 'https://example.com');
    assert.equal(normalizeOrigin('not-a-url'), '');
    assert.equal(normalizeOrigin(null), '');
  });

  it('expandLoopbackOrigins expands localhost/127.0.0.1', () => {
    const a = expandLoopbackOrigins('http://localhost:3000');
    assert.ok(a.includes('http://localhost:3000'));
    assert.ok(a.includes('http://127.0.0.1:3000'));

    const b = expandLoopbackOrigins('http://127.0.0.1:3000');
    assert.ok(b.includes('http://localhost:3000'));
    assert.ok(b.includes('http://127.0.0.1:3000'));

    assert.deepEqual(expandLoopbackOrigins(''), []);
  });

  it('parseOriginList splits and expands', () => {
    const list = parseOriginList('http://localhost:3000, https://example.com');
    assert.ok(list.includes('http://127.0.0.1:3000'));
    assert.ok(list.includes('https://example.com'));
  });

  it('isAllowedOrigin allows missing origin and checks allowedOrigins set', () => {
    assert.equal(isAllowedOrigin('', new Set(['x'])), true);
    assert.equal(isAllowedOrigin('http://a', null), false);
    assert.equal(isAllowedOrigin('http://a', new Set(['http://a'])), true);
    assert.equal(isAllowedOrigin('http://b', new Set(['http://a'])), false);
  });

  it('createCorsConfig origin callback allows/blocks origins', () => {
    const allowed = new Set(['https://allowed.example']);
    const config = createCorsConfig(allowed);

    config.origin('https://allowed.example', (err, ok) => {
      assert.equal(err, null);
      assert.equal(ok, true);
    });

    config.origin('https://blocked.example', (err) => {
      assert.ok(err);
      assert.equal(err.message, 'Not allowed by CORS');
      assert.equal(err.statusCode, 403);
    });
  });

  it('createCorsMiddleware returns a handler function', () => {
    const middleware = createCorsMiddleware(new Set(['https://allowed.example']));
    assert.equal(typeof middleware, 'function');
  });
});
