import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../server.js';
import { prisma } from '../config/prisma.js';
import { buildAuthToken } from '../services/auth.service.js';
import { sessionStore } from '../middleware/auth.js';

describe('Tarot Routes Integration V2', () => {
  let testUser;
  let validToken;

  before(async () => {
    await prisma.$connect();
    testUser = await prisma.user.create({
      data: { email: `tarot_v2_${Date.now()}@example.com`, password: 'hash' },
    });
    const secret = process.env.SESSION_TOKEN_SECRET || 'test-session-secret-for-auth-me-test';
    validToken = buildAuthToken({ userId: testUser.id, secret });
    sessionStore.set(validToken, Date.now());
  });

  after(async () => {
    if (testUser) {
      await prisma.tarotRecord.deleteMany({ where: { userId: testUser.id } });
      await prisma.user.delete({ where: { id: testUser.id } });
    }
    await prisma.$disconnect();
  });

  it('GET /api/tarot/cards returns deck', async () => {
    const res = await request(app).get('/api/tarot/cards').expect(200);
    assert.ok(Array.isArray(res.body.cards));
  });

  it('POST /api/tarot/draw returns cards logic', async () => {
    const res = await request(app)
      .post('/api/tarot/draw')
      .send({ spreadType: 'ThreeCard' })
      .expect(200);
    assert.ok(res.body.cards);
    assert.ok(Array.isArray(res.body.cards));
    assert.equal(res.body.cards.length, 3);
  });

  it('POST /api/tarot/ai-interpret validation', async () => {
    await request(app)
      .post('/api/tarot/ai-interpret')
      .set('Authorization', `Bearer ${validToken}`)
      .send({})
      .expect(400);
  });

  it('manages tarot history', async () => {
    // 1. Draw and Save
    const cards = [{ name: 'The Fool', position: 1, meaningUp: 'Beginnings', isReversed: false }];
    await request(app)
      .post('/api/tarot/ai-interpret')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        spreadType: 'SingleCard',
        cards,
        userQuestion: 'History check?',
        provider: 'mock',
      })
      .expect(200);

    // 2. Get History
    const historyRes = await request(app)
      .get('/api/tarot/history')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(200);
    assert.ok(historyRes.body.records.length > 0);
    const recordId = historyRes.body.records[0].id;

    // 3. Delete Record
    await request(app)
      .delete(`/api/tarot/history/${recordId}`)
      .set('Authorization', `Bearer ${validToken}`)
      .expect(200);

    // 4. Verify Deletion (Get History again and check it's gone)
    // Since we only added 1, it should be empty or not contain that ID
    const historyRes2 = await request(app)
      .get('/api/tarot/history')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(200);
    const exists = historyRes2.body.records.some((r) => r.id === recordId);
    assert.equal(exists, false);
  });
});
