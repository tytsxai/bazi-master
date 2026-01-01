import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validationMiddleware } from '../middleware/validation.middleware.js';

const runMiddleware = (req) =>
  new Promise((resolve) => {
    const res = {
      statusCode: null,
      payload: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.payload = payload;
        resolve({ res: this, nextCalled: false });
      },
    };
    const next = (err) => resolve({ err, res, nextCalled: true });
    validationMiddleware(req, res, next);
  });

const buildDeepObject = (depth) => {
  let obj = { value: 'ok' };
  for (let i = 0; i < depth; i += 1) {
    obj = { nested: obj };
  }
  return obj;
};

const buildObjectWithKeys = (count) => {
  const obj = {};
  for (let i = 0; i < count; i += 1) {
    obj[`k${i}`] = 'v';
  }
  return obj;
};

describe('validationMiddleware', () => {
  it('sanitizes strings and trims values', async () => {
    const req = {
      body: { name: '  <script>alert(1)</script> ok  ' },
      query: {},
      params: {},
    };
    const { res, nextCalled } = await runMiddleware(req);
    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, null);
    assert.equal(typeof req.body.name, 'string');
    assert.ok(!req.body.name.includes('<script'));
    assert.equal(req.body.name, req.body.name.trim());
  });

  it('rejects prototype pollution keys', async () => {
    const req = {
      body: { __proto__: { polluted: true } },
      query: {},
      params: {},
    };
    const { res, nextCalled } = await runMiddleware(req);
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 400);
    assert.equal(res.payload.error, 'Invalid body');
  });

  it('rejects overly deep payloads', async () => {
    const req = {
      body: buildDeepObject(10),
      query: {},
      params: {},
    };
    const { res } = await runMiddleware(req);
    assert.equal(res.statusCode, 400);
  });

  it('rejects payloads with too many keys', async () => {
    const req = {
      body: buildObjectWithKeys(300),
      query: {},
      params: {},
    };
    const { res } = await runMiddleware(req);
    assert.equal(res.statusCode, 400);
  });

  it('rejects payloads with too many array entries', async () => {
    const maxArrayLength = Number.parseInt(process.env.MAX_INPUT_ARRAY_LENGTH || '', 10) || 2000;
    const req = {
      body: { items: Array.from({ length: maxArrayLength + 1 }, () => 'x') },
      query: {},
      params: {},
    };
    const { res } = await runMiddleware(req);
    assert.equal(res.statusCode, 400);
  });
});
