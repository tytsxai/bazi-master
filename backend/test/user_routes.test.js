import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../server.js'; // Imports express app
import { sessionStore } from '../middleware/auth.js';
import { buildAuthToken } from '../services/auth.service.js';
import { prisma } from '../config/prisma.js';

describe('User Routes Integration', () => {
    let testUser;
    let validToken;

    before(async () => {
        // Ensure DB connection
        await prisma.$connect();

        // Create a test user
        const email = `testuser_${Date.now()}@example.com`;
        testUser = await prisma.user.create({
            data: {
                email,
                password: 'hashedpassword', // In a real test we'd hash it, but here we just need the user record
                name: 'Test User'
            }
        });

        // Generate a valid token
        // server.js usually sets appConfig but simplified here:
        const secret = process.env.SESSION_TOKEN_SECRET || 'test-session-secret-for-auth-me-test';
        validToken = buildAuthToken({ userId: testUser.id, secret });

        // Register token in session store
        sessionStore.set(validToken, Date.now());
    });

    after(async () => {
        // Cleanup
        if (testUser) {
            await prisma.userSettings.deleteMany({ where: { userId: testUser.id } });
            await prisma.favorite.deleteMany({ where: { userId: testUser.id } });
            await prisma.baziRecord.deleteMany({ where: { userId: testUser.id } });
            await prisma.user.delete({ where: { id: testUser.id } });
        }
        await prisma.$disconnect();
    });

    it('GET /api/user/settings returns 200 and default settings', async () => {
        const res = await request(app)
            .get('/api/user/settings')
            .set('Authorization', `Bearer ${validToken}`)
            .expect(200);

        assert.ok(res.body.settings);
        assert.equal(res.body.settings.locale, null);
    });

    it('PUT /api/user/settings updates settings', async () => {
        const res = await request(app)
            .put('/api/user/settings')
            .set('Authorization', `Bearer ${validToken}`)
            .send({
                locale: 'en-US',
                preferences: { theme: 'dark' }
            })
            .expect(200);

        assert.equal(res.body.settings.locale, 'en-US');
        assert.deepEqual(res.body.settings.preferences, { theme: 'dark' });

        // Verify persistence
        const check = await request(app)
            .get('/api/user/settings')
            .set('Authorization', `Bearer ${validToken}`)
            .expect(200);

        assert.equal(check.body.settings.locale, 'en-US');
    });

    it('GET /api/user/settings returns 401 without token', async () => {
        await request(app)
            .get('/api/user/settings')
            .expect(401);
    });
});
