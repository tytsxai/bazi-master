import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../server.js';
import { prisma } from '../config/prisma.js';
import { buildAuthToken } from '../services/auth.service.js';
import { sessionStore } from '../middleware/auth.js';

describe('Bazi Advanced Routes Coverage', () => {
    let testUser;
    let validToken;

    before(async () => {
        await prisma.$connect();
        testUser = await prisma.user.create({
            data: {
                email: `bazi_adv_${Date.now()}@example.com`,
                password: 'hashedpassword',
            }
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

    it('POST /api/bazi/full-analysis returns 401 unauthenticated', async () => {
        await request(app).post('/api/bazi/full-analysis').send({}).expect(401);
    });

    it('POST /api/bazi/full-analysis performs full calculation', async () => {
        const res = await request(app)
            .post('/api/bazi/full-analysis')
            .set('Authorization', `Bearer ${validToken}`)
            .send({
                birthYear: 1990, birthMonth: 1, birthDay: 1, birthHour: 12, gender: 'male',
                birthLocation: 'Shanghai', timezone: 'Asia/Shanghai',
                provider: 'mock'
            })
            .expect(200);
        assert.ok(res.body.calculation);
        assert.ok(res.body.interpretation);
    });

    it('POST /api/bazi/ai-interpret returns 400 for missing data', async () => {
        await request(app)
            .post('/api/bazi/ai-interpret')
            .set('Authorization', `Bearer ${validToken}`)
            .send({})
            .expect(400);
    });

    it('POST /api/bazi/ai-interpret works with mock', async () => {
        // Need to provide full bazi structure
        const mockPillars = { year: { stem: 'Jia', branch: 'Zi' }, month: {}, day: {}, hour: {} };
        const mockFiveElements = { Wood: 100 };
        const mockTenGods = [];

        const res = await request(app)
            .post('/api/bazi/ai-interpret')
            .set('Authorization', `Bearer ${validToken}`)
            .send({
                pillars: mockPillars,
                fiveElements: mockFiveElements,
                tenGods: mockTenGods,
                provider: 'mock'
            })
            .expect(200);
        assert.ok(res.body.content);
    });
});
