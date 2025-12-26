import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { notFoundHandler, createGlobalErrorHandler } from '../middleware/error.js';

describe('error middleware coverage', () => {
  it('notFoundHandler forwards 404 error', () => {
    const req = { originalUrl: '/missing' };
    let captured;
    notFoundHandler(req, {}, (err) => { captured = err; });
    assert.equal(captured.statusCode, 404);
    assert.ok(String(captured.message).includes('/missing'));
  });

  it('globalErrorHandler logs redacted payload and hides stack in production', () => {
    const logger = {
      calls: [],
      error(payload, message) {
        this.calls.push({ payload, message });
      },
    };

    const circular = { token: 'secret' };
    circular.self = circular;

    const deep = { a: { b: { c: { d: { e: { f: 1 } } } } } };

    const req = {
      id: 'req-1',
      method: 'POST',
      originalUrl: '/x',
      body: { password: 'p', nested: circular, deep },
      query: { apiKey: 'k' },
      params: { authorization: 'bearer' },
    };

    const res = {
      statusCode: null,
      jsonBody: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.jsonBody = body;
        return this;
      },
    };

    const handler = createGlobalErrorHandler({ loggerInstance: logger, env: { NODE_ENV: 'production' } });
    handler({ statusCode: 400, message: 'bad', stack: 'STACK' }, req, res, () => {});

    assert.equal(res.statusCode, 400);
    assert.equal(res.jsonBody.status, 'error');
    assert.equal(res.jsonBody.message, 'bad');
    assert.equal('stack' in res.jsonBody, false);

    assert.equal(logger.calls.length, 1);
    const logged = logger.calls[0].payload.req;
    assert.equal(logged.body.password, '[REDACTED]');
    assert.equal(logged.query.apiKey, '[REDACTED]');
    assert.equal(logged.params.authorization, '[REDACTED]');
    assert.equal(logged.body.nested.self, '[Circular]');
    assert.equal(logged.body.deep.a.b.c.d.e, '[Truncated]');
  });

  it('globalErrorHandler includes stack outside production', () => {
    const logger = { error() {} };
    const req = { method: 'GET', originalUrl: '/', body: {}, query: {}, params: {} };
    const res = {
      statusCode: null,
      jsonBody: null,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.jsonBody = body; return this; },
    };

    const handler = createGlobalErrorHandler({ loggerInstance: logger, env: { NODE_ENV: 'test' } });
    handler({ statusCode: 500, message: 'oops', stack: 'STACK' }, req, res, () => {});
    assert.equal(res.jsonBody.stack, 'STACK');
  });
});
