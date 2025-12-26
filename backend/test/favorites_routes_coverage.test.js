import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import { app } from '../server.js';
import { prisma } from '../config/prisma.js';
import { buildAuthToken } from '../services/auth.service.js';
import { sessionStore } from '../middleware/auth.js';

describe('Favorites routes coverage', () => {
  let user;
  let token;
  let record;
  let favoriteId;

  before(async () => {
    await prisma.$connect();

    user = await prisma.user.create({
      data: {
        email: `favorites_${Date.now()}@example.com`,
        password: 'hashedpassword',
      },
    });
    const secret = process.env.SESSION_TOKEN_SECRET || 'test-session-secret-for-auth-me-test';
    token = buildAuthToken({ userId: user.id, secret });
    sessionStore.set(token, Date.now());

    record = await prisma.baziRecord.create({
      data: {
        userId: user.id,
        birthYear: 2000,
        birthMonth: 1,
        birthDay: 1,
        birthHour: 0,
        gender: 'female',
        pillars: JSON.stringify({ day: { stem: 'Jia', branch: 'Zi' } }),
        fiveElements: JSON.stringify({ Wood: 1 }),
      },
    });
  });

  after(async () => {
    if (favoriteId) {
      await prisma.favorite.deleteMany({ where: { id: favoriteId, userId: user.id } });
    }
    if (record) {
      await prisma.favorite.deleteMany({ where: { userId: user.id, recordId: record.id } });
      await prisma.baziRecordTrash.deleteMany({ where: { userId: user.id, recordId: record.id } });
      await prisma.baziRecord.deleteMany({ where: { id: record.id, userId: user.id } });
    }
    if (user) {
      await prisma.user.deleteMany({ where: { id: user.id } });
    }
    await prisma.$disconnect();
  });

  it('POST/GET/DELETE favorites covers validation and duplicate handling', async () => {
    await request(app)
      .post('/api/favorites')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(400);

    await request(app)
      .post('/api/favorites')
      .set('Authorization', `Bearer ${token}`)
      .send({ recordId: 999999999 })
      .expect(404);

    const createRes = await request(app)
      .post('/api/favorites')
      .set('Authorization', `Bearer ${token}`)
      .send({ recordId: record.id })
      .expect(200);
    assert.ok(createRes.body.favorite);
    assert.equal(createRes.body.favorite.recordId, record.id);
    favoriteId = createRes.body.favorite.id;

    await request(app)
      .post('/api/favorites')
      .set('Authorization', `Bearer ${token}`)
      .send({ recordId: record.id })
      .expect(409);

    const listRes = await request(app)
      .get('/api/favorites')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    assert.ok(Array.isArray(listRes.body.favorites));
    assert.ok(listRes.body.favorites.some((f) => f.id === favoriteId));

    await request(app)
      .delete('/api/favorites/invalid')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    await request(app)
      .delete(`/api/favorites/${favoriteId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });
});
