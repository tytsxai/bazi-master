import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { prisma } from '../server.js';

before(async () => {
  // Set test environment if needed
});

after(async () => {
  await prisma.$disconnect();
});

// Simple test: verify that unauthenticated requests to protected routes fail
test('POST /api/tarot/ai-interpret returns 401 when unauthenticated', async () => {
  const { createRequireAuth } = await import('../services/auth.service.js');
  const { prisma: db } = await import('../config/prisma.js');
  const { createSessionStore } = await import('../services/session.service.js');
  const { createAuthorizeToken } = await import('../services/auth.service.js');

  const sessionStore = createSessionStore();
  const authorizeToken = createAuthorizeToken({
    prisma: db,
    sessionStore,
    isAdminUser: () => false,
    tokenSecret: 'test-secret',
  });

  const requireAuth = createRequireAuth({ authorizeToken });

  // Create mock request/response
  const req = {
    headers: {},
    method: 'POST',
    url: '/api/tarot/ai-interpret',
    body: {
      spreadType: 'SingleCard',
      cards: [
        {
          position: 1,
          name: 'The Fool',
          isReversed: false,
          meaningUp: 'Beginnings',
          meaningRev: 'Hesitation',
        },
      ],
    },
  };

  const res = {
    statusCode: 200,
    body: null,
    status: function (code) {
      this.statusCode = code;
      return this;
    },
    json: function (data) {
      this.body = data;
      return this;
    },
  };

  let nextCalled = false;
  const next = () => {
    nextCalled = true;
  };

  // Test that requireAuth fails without proper auth header
  await requireAuth(req, res, next);

  // Should not call next (authentication should fail)
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body?.error, 'Unauthorized');
});
