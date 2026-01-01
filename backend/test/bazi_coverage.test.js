import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../server.js';
import { prisma } from '../config/prisma.js';
import { buildAuthToken } from '../services/auth.service.js';
import { sessionStore } from '../middleware/auth.js';

describe('Bazi Routes Coverage', () => {
  let testUser;
  let validToken;

  before(async () => {
    await prisma.$connect();
    // Create user for auth routes
    testUser = await prisma.user.create({
      data: {
        email: `bazi_test_${Date.now()}@example.com`,
        password: 'hashedpassword',
      },
    });
    const secret = process.env.SESSION_TOKEN_SECRET || 'test-session-secret-for-auth-me-test';
    validToken = buildAuthToken({ userId: testUser.id, secret });
    sessionStore.set(validToken, Date.now());
  });

  after(async () => {
    if (testUser) {
      await prisma.baziRecord.deleteMany({ where: { userId: testUser.id } });
      await prisma.user.delete({ where: { id: testUser.id } });
    }
    await prisma.$disconnect();
  });

  // POST /calculate
  it('POST /api/bazi/calculate returns 400 for empty body', async () => {
    await request(app).post('/api/bazi/calculate').send({}).expect(400);
  });

  it('POST /api/bazi/calculate returns 400 for whitespace fields', async () => {
    await request(app)
      .post('/api/bazi/calculate')
      .send({
        birthYear: 2000,
        birthMonth: 1,
        birthDay: 1,
        birthHour: 0,
        gender: 'male',
        birthLocation: '  ',
      })
      .expect(400);
    // .expect((res) => assert.match(res.body.error, /Whitespace/));
    // The logic says "Whitespace-only input" if validation.reason === 'whitespace'
  });

  it('POST /api/bazi/calculate returns 200 for valid input', async () => {
    const res = await request(app)
      .post('/api/bazi/calculate')
      .send({
        birthYear: 1990,
        birthMonth: 5,
        birthDay: 15,
        birthHour: 10,
        gender: 'male',
        birthLocation: 'Beijing',
      })
      .expect(200);
    assert.ok(res.body.pillars);
    assert.ok(res.body.fiveElements);
  });

  // POST /ai-interpret
  it('POST /api/bazi/ai-interpret returns 401 if unauthenticated', async () => {
    await request(app).post('/api/bazi/ai-interpret').expect(401);
  });

  it('POST /api/bazi/ai-interpret returns 400 if missing data', async () => {
    await request(app)
      .post('/api/bazi/ai-interpret')
      .set('Authorization', `Bearer ${validToken}`)
      .send({})
      .expect(400);
  });

  it('POST /api/bazi/ai-interpret works with mock provider', async () => {
    const res = await request(app)
      .post('/api/bazi/ai-interpret')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        provider: 'mock',
        pillars: { day: { stem: 'Jia', branch: 'Zi' } },
        fiveElements: { Wood: 2 },
        tenGods: [],
      })
      .expect(200);
    assert.ok(res.body.content);
    assert.match(res.body.content, /BaZi Insight/);
  });

  it('POST /api/bazi/ai-interpret handles invalid provider', async () => {
    await request(app)
      .post('/api/bazi/ai-interpret')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        provider: 'invalid-provider',
        pillars: {},
      })
      .expect(400);
  });

  // POST /full-analysis
  it('POST /api/bazi/full-analysis returns success', async () => {
    const res = await request(app)
      .post('/api/bazi/full-analysis')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        birthYear: 1990,
        birthMonth: 5,
        birthDay: 15,
        birthHour: 10,
        gender: 'female',
        provider: 'mock',
      })
      .expect(200);

    assert.ok(res.body.calculation);
    assert.ok(res.body.interpretation);
  });

  // Records CRUD coverage
  it('POST /api/bazi/records creates a record', async () => {
    const res = await request(app)
      .post('/api/bazi/records')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        birthYear: 1988,
        birthMonth: 8,
        birthDay: 8,
        birthHour: 8,
        gender: 'male',
      })
      .expect(200);
    assert.ok(res.body.record.id);
  });

  it('GET /api/bazi/records lists records', async () => {
    const res = await request(app)
      .get('/api/bazi/records')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(200);
    assert.ok(Array.isArray(res.body.records));
    assert.ok(res.body.totalCount >= 1);
  });

  it('GET /api/bazi/records/:id returns 404 for unknown', async () => {
    await request(app)
      .get('/api/bazi/records/999999')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(404);
  });

  it('GET /api/bazi/records/export returns array', async () => {
    const res = await request(app)
      .get('/api/bazi/records/export')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(200);
    assert.ok(Array.isArray(res.body));
  });

  it('POST /api/bazi/records/import imports records', async () => {
    const res = await request(app)
      .post('/api/bazi/records/import')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        records: [{ birthYear: 2001, birthMonth: 1, birthDay: 1, birthHour: 1, gender: 'female' }],
      })
      .expect(200);
    assert.equal(res.body.created, 1);
  });
});
