import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../server.js';
import { prisma } from '../config/prisma.js';
import { buildAuthToken } from '../services/auth.service.js';
import { sessionStore } from '../middleware/auth.js';

describe('I Ching Routes Integration', () => {
    let testUser;
    let validToken;

    before(async () => {
        await prisma.$connect();
        testUser = await prisma.user.create({
            data: { email: `iching_test_${Date.now()}@example.com`, password: 'hash' }
        });
        const secret = process.env.SESSION_TOKEN_SECRET || 'test-session-secret-for-auth-me-test';
        validToken = buildAuthToken({ userId: testUser.id, secret });
        sessionStore.set(validToken, Date.now());
    });

    after(async () => {
        if (testUser) {
            await prisma.ichingRecord.deleteMany({ where: { userId: testUser.id } });
            await prisma.user.delete({ where: { id: testUser.id } });
        }
        await prisma.$disconnect();
    });

    it('GET /api/iching/hexagrams returns data', async () => {
        const res = await request(app).get('/api/iching/hexagrams').expect(200);
        assert.ok(res.body.hexagrams);
    });

    it('POST /api/iching/divine validation', async () => {
        await request(app)
            .post('/api/iching/divine')
            .send({ method: 'number', numbers: [1] }) // missing 3
            .expect(400);
    });

    it('POST /api/iching/divine works with numbers', async () => {
        const res = await request(app)
            .post('/api/iching/divine')
            .send({ method: 'number', numbers: [111, 222, 333] })
            .expect(200);
        assert.ok(res.body.hexagram);
        assert.ok(res.body.changingLines);
    });

    it('POST /api/iching/divine works with time', async () => {
        const res = await request(app)
            .post('/api/iching/divine')
            .send({ method: 'time' })
            .expect(200);
        assert.ok(res.body.timeContext);
    });

    it('POST /api/iching/ai-interpret works (mock)', async () => {
        const res = await request(app)
            .post('/api/iching/ai-interpret')
            .set('Authorization', `Bearer ${validToken}`)
            .send({
                hexagram: { name: 'Qian', number: 1 },
                userQuestion: 'Guidance?',
                method: 'time',
                provider: 'mock'
            })
            .expect(200);
        assert.ok(res.body.content);

        // History
        const hist = await request(app)
            .get('/api/iching/history')
            .set('Authorization', `Bearer ${validToken}`)
            .expect(200);
        assert.ok(hist.body.records.length > 0);

        // Delete
        const id = hist.body.records[0].id;
        await request(app)
            .delete(`/api/iching/history/${id}`)
            .set('Authorization', `Bearer ${validToken}`)
            .expect(200);
    });
});
