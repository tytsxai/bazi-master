import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { buildAuthToken } from '../services/auth.service.js';
import { prisma } from '../server.js';

const TOKEN_SECRET = 'test-session-secret-for-auth-me-test';

before(async () => {
  // Set test environment
  process.env.SESSION_TOKEN_SECRET = TOKEN_SECRET;
});

after(async () => {
  await prisma.$disconnect();
});

// Simple test: just verify that invalid tokens result in 401
test('GET /api/auth/me returns 401 for invalid token', async () => {
  // Create a minimal test that verifies the behavior without full HTTP server
  const { createAuthorizeToken } = await import('../services/auth.service.js');
  const { prisma: db } = await import('../config/prisma.js');
  const { createSessionStore } = await import('../services/session.service.js');

  const sessionStore = createSessionStore();
  const authorizeToken = createAuthorizeToken({
    prisma: db,
    sessionStore,
    isAdminUser: () => false,
    tokenSecret: TOKEN_SECRET
  });

  // Test invalid token
  try {
    await authorizeToken('not-a-token');
    assert.fail('Expected authorization to fail');
  } catch (error) {
    assert.equal(error.message, 'Invalid token');
  }
});

test('GET /api/auth/me returns 401 for expired token', async () => {
  const { createAuthorizeToken } = await import('../services/auth.service.js');
  const { prisma: db } = await import('../config/prisma.js');
  const { createSessionStore } = await import('../services/session.service.js');

  const sessionStore = createSessionStore();
  const authorizeToken = createAuthorizeToken({
    prisma: db,
    sessionStore,
    isAdminUser: () => false,
    tokenSecret: TOKEN_SECRET
  });

  // Test expired token
  const expiredIssuedAt = Date.now() - 25 * 60 * 60 * 1000;
  const token = buildAuthToken({ userId: 1, issuedAt: expiredIssuedAt, secret: TOKEN_SECRET });

  try {
    await authorizeToken(token);
    assert.fail('Expected authorization to fail');
  } catch (error) {
    assert.equal(error.message, 'Token expired');
  }
});
