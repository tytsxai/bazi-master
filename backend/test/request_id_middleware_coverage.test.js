import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  REQUEST_ID_HEADER,
  getRequestId,
  requestIdMiddleware,
} from '../middleware/requestId.middleware.js';

describe('request id middleware coverage', () => {
  it('getRequestId prefers string header value', () => {
    const req = { headers: { [REQUEST_ID_HEADER]: '  abc  ' } };
    assert.equal(getRequestId(req), 'abc');
  });

  it('getRequestId supports array header value', () => {
    const req = { headers: { [REQUEST_ID_HEADER]: ['  first  ', 'second'] } };
    assert.equal(getRequestId(req), 'first');
  });

  it('getRequestId generates an id when header missing/empty', () => {
    const req1 = { headers: {} };
    const id1 = getRequestId(req1);
    assert.equal(typeof id1, 'string');
    assert.ok(id1.length > 0);

    const req2 = { headers: { [REQUEST_ID_HEADER]: '   ' } };
    const id2 = getRequestId(req2);
    assert.equal(typeof id2, 'string');
    assert.ok(id2.length > 0);
  });

  it('requestIdMiddleware attaches request id and sets response header', () => {
    const req = { headers: { [REQUEST_ID_HEADER]: 'rid' } };
    const headers = new Map();
    const res = {
      setHeader(name, value) {
        headers.set(name, value);
      },
    };
    let nextCalls = 0;
    const next = () => {
      nextCalls++;
    };

    requestIdMiddleware(req, res, next);
    assert.equal(req.requestId, 'rid');
    assert.equal(req.id, 'rid');
    assert.equal(headers.get('X-Request-ID'), 'rid');
    assert.equal(nextCalls, 1);
  });
});
