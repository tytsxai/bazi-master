import { test, expect } from './fixtures.js';
import path from 'path';

const buildScreenshotPath = (name) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(process.cwd(), '..', 'verification', `${stamp}-${name}.png`);
};

test('Security: /api/iching/ai-interpret rejects unauthenticated requests with 401', async ({ page, request }) => {
  const consoleErrors = [];

  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
    localStorage.removeItem('bazi_token');
    localStorage.removeItem('bazi_user');
    localStorage.removeItem('bazi_last_activity');
    localStorage.removeItem('bazi_session_expired');
  });

  await page.goto('/iching', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'I Ching Oracle' })).toBeVisible();
  await page.screenshot({ path: buildScreenshotPath('security-iching-ai-interpret-unauth-step-1-iching') });

  const response = await request.post('/api/iching/ai-interpret', {
    data: {
      method: 'number',
      question: 'SECURITY_UNAUTH_ICHING_AI',
      hexagramId: 1,
      changingLines: [1, 4],
    },
  });

  expect(response.status()).toBe(401);
  const body = await response.json().catch(() => ({}));
  expect(body && typeof body).toBe('object');

  await page.screenshot({ path: buildScreenshotPath('security-iching-ai-interpret-unauth-step-2-response') });
  expect(consoleErrors).toEqual([]);
});
