import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../server.js';
import { prisma } from '../config/prisma.js';
import { resetTokenStore, resetTokenByUser } from '../controllers/auth.controller.js';

describe('Auth Password Reset Flow', () => {
  let testUser;
  const PREFIX = '/api/auth';

  before(async () => {
    await prisma.$connect();
    // Clear tokens
    resetTokenStore.clear();
    resetTokenByUser.clear();

    testUser = await prisma.user.create({
      data: {
        email: `reset_test_${Date.now()}@example.com`,
        password: 'old_password_hash',
        name: 'Reset User',
      },
    });
  });

  after(async () => {
    if (testUser) {
      await prisma.user.delete({ where: { id: testUser.id } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  it('Complete Reset Flow', async () => {
    // 1. Request Reset
    // Note: Controller returns 200 even if invalid, but we use valid email
    await request(app)
      .post(`${PREFIX}/password/request`)
      .send({ email: testUser.email })
      .expect(200);

    // 2. Retrieve Token from Store (since it's not returned in API)
    const token = resetTokenByUser.get(testUser.id);
    assert.ok(token, 'Reset token should be generated in store');
    const entry = resetTokenStore.get(token);
    assert.equal(entry.userId, testUser.id);

    // 3. Reset Password with Token
    const newPassword = 'new_secure_password_123';
    await request(app)
      .post(`${PREFIX}/password/reset`)
      .send({ token, password: newPassword })
      .expect(200);

    // 4. Verify Token Consumed
    assert.equal(resetTokenStore.has(token), false);
    assert.equal(resetTokenByUser.has(testUser.id), false);

    // 5. Login with New Password
    const loginRes = await request(app)
      .post(`${PREFIX}/login`)
      .send({ email: testUser.email, password: newPassword })
      .expect(200);
    assert.ok(Array.isArray(loginRes.headers['set-cookie']));
    assert.equal(loginRes.body.user.email, testUser.email);
  });
});
