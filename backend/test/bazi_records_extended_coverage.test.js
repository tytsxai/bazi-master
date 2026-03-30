import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import { app } from '../server.js';
import { prisma } from '../config/prisma.js';
import { buildAuthToken } from '../services/auth.service.js';
import { sessionStore } from '../middleware/auth.js';

describe('Bazi record management extended coverage', () => {
  let user;
  let token;
  let record;

  before(async () => {
    await prisma.$connect();

    user = await prisma.user.create({
      data: {
        email: `bazi_records_${Date.now()}@example.com`,
        password: 'hashedpassword',
      },
    });

    const secret = process.env.SESSION_TOKEN_SECRET || 'test-session-secret-for-auth-me-test';
    token = buildAuthToken({ userId: user.id, secret });
    sessionStore.set(token, Date.now());

    record = await prisma.baziRecord.create({
      data: {
        userId: user.id,
        birthYear: 1999,
        birthMonth: 12,
        birthDay: 31,
        birthHour: 23,
        gender: 'male',
        birthLocation: 'Beijing',
        timezone: 'Asia/Shanghai',
        pillars: JSON.stringify({ day: { stem: 'Jia', branch: 'Zi', elementStem: 'Wood' } }),
        fiveElements: JSON.stringify({ Wood: 2, Fire: 1, Earth: 0, Metal: 0, Water: 1 }),
        tenGods: JSON.stringify([]),
        luckCycles: JSON.stringify([]),
      },
    });
  });

  after(async () => {
    if (user) {
      await prisma.favorite.deleteMany({ where: { userId: user.id } });
      await prisma.baziRecordTrash.deleteMany({ where: { userId: user.id } });
      await prisma.baziRecord.deleteMany({ where: { userId: user.id } });
      await prisma.user.deleteMany({ where: { id: user.id } });
    }
    await prisma.$disconnect();
  });

  it('handles bulk delete, status filtering, restore and hard delete flows', async () => {
    await request(app)
      .post('/api/bazi/records/bulk-delete')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: 'nope' })
      .expect(400);

    await request(app)
      .get('/api/bazi/records/invalid')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    const getRes = await request(app)
      .get(`/api/bazi/records/${record.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    assert.equal(getRes.body.record.id, record.id);

    const searchRes = await request(app)
      .get('/api/bazi/records?query=Jia&status=all')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    assert.ok(Array.isArray(searchRes.body.records));

    await request(app)
      .post('/api/bazi/records/bulk-delete')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [record.id] })
      .expect(200);

    const deletedRes = await request(app)
      .get('/api/bazi/records?status=deleted')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    assert.ok(deletedRes.body.records.some((r) => r.id === record.id));

    await request(app)
      .post(`/api/bazi/records/${record.id}/restore`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const activeRes = await request(app)
      .get('/api/bazi/records?status=active')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    assert.ok(activeRes.body.records.some((r) => r.id === record.id));

    await request(app)
      .delete(`/api/bazi/records/${record.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    await request(app)
      .delete(`/api/bazi/records/${record.id}/hard-delete`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    await request(app)
      .delete(`/api/bazi/records/${record.id}/hard-delete`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('updates an existing record', async () => {
    const editableRecord = await prisma.baziRecord.create({
      data: {
        userId: user.id,
        birthYear: 1998,
        birthMonth: 6,
        birthDay: 15,
        birthHour: 8,
        gender: 'male',
        birthLocation: 'Guangzhou',
        timezone: 'Asia/Shanghai',
        pillars: JSON.stringify({ day: { stem: 'Yi', branch: 'Mao' } }),
        fiveElements: JSON.stringify({ Wood: 1, Fire: 1, Earth: 1, Metal: 1, Water: 1 }),
        tenGods: JSON.stringify([]),
        luckCycles: JSON.stringify([]),
      },
    });

    const res = await request(app)
      .put(`/api/bazi/records/${editableRecord.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        birthYear: 2000,
        birthMonth: 1,
        birthDay: 2,
        birthHour: 3,
        gender: 'female',
        birthLocation: 'Shanghai',
        timezone: 'Asia/Shanghai',
      })
      .expect(200);

    assert.equal(res.body.record.id, editableRecord.id);
    assert.equal(res.body.record.birthYear, 2000);
    assert.equal(res.body.record.birthMonth, 1);
    assert.equal(res.body.record.birthDay, 2);
    assert.equal(res.body.record.birthHour, 3);
    assert.equal(res.body.record.gender, 'female');
    assert.equal(res.body.record.birthLocation, 'Shanghai');
    assert.equal(res.body.record.timezone, 'Asia/Shanghai');
    assert.ok(res.body.record.pillars);
    assert.ok(res.body.record.fiveElements);

    await prisma.baziRecord.deleteMany({ where: { id: editableRecord.id, userId: user.id } });
  });
});
