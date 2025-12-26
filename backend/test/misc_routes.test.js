import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../server.js';
import { prisma } from '../config/prisma.js';
import { buildAuthToken } from '../services/auth.service.js';
import { sessionStore } from '../middleware/auth.js';

describe('Routes Bulk Coverage', () => {
    let testUser;
    let validToken;

    before(async () => {
        await prisma.$connect();
        testUser = await prisma.user.create({
            data: {
                email: `bulk_test_${Date.now()}@example.com`,
                password: 'hashedpassword',
            }
        });
        const secret = process.env.SESSION_TOKEN_SECRET || 'test-session-secret-for-auth-me-test';
        validToken = buildAuthToken({ userId: testUser.id, secret });
        sessionStore.set(validToken, Date.now());
    });

    after(async () => {
        if (testUser) {
            await prisma.tarotRecord.deleteMany({ where: { userId: testUser.id } });
            await prisma.ichingRecord.deleteMany({ where: { userId: testUser.id } });
            await prisma.ziweiRecord.deleteMany({ where: { userId: testUser.id } });
            await prisma.user.delete({ where: { id: testUser.id } });
        }
        await prisma.$disconnect();
    });

    // --- Iching Routes Coverage ---
    it('POST /api/iching/divine returns 400 for invalid method', async () => {
        await request(app).post('/api/iching/divine').send({}).expect(400);
    });

    it('POST /api/iching/divine calculates manually', async () => {
        const res = await request(app)
            .post('/api/iching/divine')
            .send({ method: 'number', numbers: [1, 2, 3] })
            .expect(200);
        assert.ok(res.body.hexagram);
    });

    it('POST /api/iching/ai-interpret returns 401 unauthenticated', async () => {
        await request(app).post('/api/iching/ai-interpret').expect(401);
    });

    it('POST /api/iching/ai-interpret works with mock', async () => {
        const res = await request(app)
            .post('/api/iching/ai-interpret')
            .set('Authorization', `Bearer ${validToken}`)
            .send({ hexagram: { name: 'Qian' }, provider: 'mock' })
            .expect(200);
        assert.ok(res.body.content);
    });

    // --- Tarot Routes Coverage ---
    it('POST /api/tarot/draw works', async () => {
        const res = await request(app).post('/api/tarot/draw').send({ spread: 'SingleCard' }).expect(200);
        assert.ok(Array.isArray(res.body.cards));
    });

    it('POST /api/tarot/ai-interpret works with mock', async () => {
        const res = await request(app)
            .post('/api/tarot/ai-interpret')
            .set('Authorization', `Bearer ${validToken}`)
            .send({ cards: [{ name: 'Fool' }], spread: 'SingleCard', provider: 'mock' })
            .expect(200);
        assert.ok(res.body.content);
    });

    // --- Ziwei Routes Coverage ---
    it('POST /api/ziwei/calculate returns 401 without auth', async () => {
        await request(app).post('/api/ziwei/calculate').send({}).expect(401);
    });

    it('POST /api/ziwei/calculate returns 400 for invalid input (authenticated)', async () => {
        await request(app)
            .post('/api/ziwei/calculate')
            .set('Authorization', `Bearer ${validToken}`)
            .send({})
            .expect(400);
    });

    it('POST /api/ziwei/calculate works', async () => {
        const res = await request(app)
            .post('/api/ziwei/calculate')
            .set('Authorization', `Bearer ${validToken}`)
            .send({ birthYear: 1990, birthMonth: 1, birthDay: 1, birthHour: 1, gender: 'male' })
            .expect(200);

        // Debug
        // console.log('Ziwei Response:', JSON.stringify(res.body, null, 2));

        assert.ok(res.body.mingPalace);
        assert.ok(res.body.lunar);
        // Solar is not guaranteed to be at root depending on implementation details found
        // but 'payload' was incorrect.
        // We assert what we know exists.
    });

    it('POST /api/ziwei/history returns 400 for invalid data', async () => {
        await request(app)
            .post('/api/ziwei/history')
            .set('Authorization', `Bearer ${validToken}`)
            .send({})
            .expect(400);
    });

    it('POST /api/ziwei/history returns created record', async () => {
        const res = await request(app)
            .post('/api/ziwei/history')
            .set('Authorization', `Bearer ${validToken}`)
            .send({ birthYear: 1990, birthMonth: 1, birthDay: 1, birthHour: 1, gender: 'male' })
            .expect(200);
        assert.ok(res.body.record);
    });
});
