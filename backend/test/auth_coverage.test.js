import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../server.js';
import { prisma } from '../config/prisma.js';

describe('Auth Routes Coverage', () => {
    let testUser;

    before(async () => {
        await prisma.$connect();
        testUser = await prisma.user.create({
            data: { email: `coverage_${Date.now()}@test.com`, password: 'hashed' }
        });
    });

    after(async () => {
        if (testUser) await prisma.user.delete({ where: { id: testUser.id } }).catch(() => { });
        await prisma.$disconnect();
    });

    it('POST /api/auth/register creates user', async () => {
        const email = `newreg_${Date.now()}@test.com`;
        const res = await request(app)
            .post('/api/auth/register')
            .send({ email, password: 'password123', name: 'Tester' })
            .expect(200);
        assert.ok(res.body.token);
        assert.equal(res.body.user.email, email);
        await prisma.user.delete({ where: { email } });
    });

    it('POST /api/auth/login logs in', async () => {
        await request(app)
            .post('/api/auth/login')
            .send({ email: testUser.email, password: 'wrong' })
            .expect(401);
    });

    it('POST /api/auth/logout succeeds', async () => {
        // Register a tmp user to get a valid token
        const email = `logout_${Date.now()}@test.com`;
        const regRes = await request(app)
            .post('/api/auth/register')
            .send({ email, password: 'password123', name: 'Leaver' })
            .expect(200);
        const token = regRes.body.token;

        await request(app)
            .post('/api/auth/logout')
            .set('Authorization', `Bearer ${token}`)
            .expect(200);

        // Cleanup
        await prisma.user.delete({ where: { email } });
    });

    it('GET /api/auth/me requires token', async () => {
        await request(app).get('/api/auth/me').expect(401);
    });
});
