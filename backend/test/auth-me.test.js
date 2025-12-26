import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { buildAuthToken } from '../auth.js';
import { server, prisma } from '../server.js';

const TOKEN_SECRET = 'test-session-secret-for-auth-me-test';

let baseUrl = '';

const listenServer = () =>
  new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      resolve(server.address());
    });
    server.once('error', reject);
  });

const closeServer = () =>
  new Promise((resolve) => {
    if (!server.listening) return resolve();
    server.close(() => resolve());
  });

before(async () => {
  if (!server.listening) {
    const address = await listenServer();
    baseUrl = `http://127.0.0.1:${address.port}`;
  } else {
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
  }
});

after(async () => {
  await closeServer();
  await prisma.$disconnect();
});

test('GET /api/auth/me returns 401 for invalid token', async () => {
  const response = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Authorization: 'Bearer not-a-token' }
  });
  const payload = await response.json();

  assert.equal(response.status, 401);
  assert.equal(payload?.error, 'Invalid token');
});

test('GET /api/auth/me returns 401 for expired token', async () => {
  const expiredIssuedAt = Date.now() - 25 * 60 * 60 * 1000;
  const token = buildAuthToken({ userId: 1, issuedAt: expiredIssuedAt, secret: TOKEN_SECRET });
  const response = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const payload = await response.json();

  assert.equal(response.status, 401);
  assert.equal(payload?.error, 'Token expired');
});
