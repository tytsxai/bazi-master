import { test, expect } from './fixtures.js';
import path from 'path';

const buildScreenshotPath = (name) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(process.cwd(), '..', 'verification', `${stamp}-${name}.png`);
};

test('Security: /api/bazi/full-analysis rejects unauthenticated requests with 401', async ({ page, request }) => {
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

  await page.goto('/bazi', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /BaZi/i })).toBeVisible();
  await page.screenshot({ path: buildScreenshotPath('security-bazi-full-analysis-unauth-step-1-bazi') });

  const response = await request.post('/api/bazi/full-analysis', {
    data: {
      birthYear: 1992,
      birthMonth: 6,
      birthDay: 15,
      birthHour: 9,
      gender: 'male',
      birthLocation: 'SECURITY_UNAUTH',
      timezone: 'UTC+8',
    },
  });

  expect(response.status()).toBe(401);
  const body = await response.json().catch(() => ({}));
  expect(body && typeof body).toBe('object');

  await page.screenshot({ path: buildScreenshotPath('security-bazi-full-analysis-unauth-step-2-response') });
  expect(consoleErrors).toEqual([]);
});
