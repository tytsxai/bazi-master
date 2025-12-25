import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { server, prisma } from '../server.js';

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

test('POST /api/iching/ai-interpret returns 401 when unauthenticated', async () => {
  const response = await fetch(`${baseUrl}/api/iching/ai-interpret`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hexagram: { name: 'Test' } }),
  });

  const payload = await response.json();

  assert.equal(response.status, 401);
  assert.equal(payload?.error, 'Unauthorized');
});
