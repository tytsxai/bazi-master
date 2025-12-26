import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import { app } from '../server.js';

describe('API/Ai routes coverage', () => {
  it('GET /api/health returns status payload', async () => {
    const res = await request(app).get('/api/health');
    assert.ok([200, 503].includes(res.statusCode));
    assert.equal(res.body.service, 'bazi-master-backend');
    assert.ok(res.body.checks);
    assert.ok(res.body.timestamp);
  });

  it('GET /api/ready returns readiness payload', async () => {
    const res = await request(app).get('/api/ready');
    assert.ok([200, 503].includes(res.statusCode));
    assert.equal(res.body.service, 'bazi-master-backend');
    assert.ok(res.body.checks);
    assert.ok(res.body.timestamp);
  });

  it('GET /api/ai/providers returns provider info', async () => {
    const res = await request(app).get('/api/ai/providers').expect(200);
    assert.ok(res.body.activeProvider);
    assert.ok(Array.isArray(res.body.providers));
    assert.ok(res.body.providers.length >= 1);
  });
});
