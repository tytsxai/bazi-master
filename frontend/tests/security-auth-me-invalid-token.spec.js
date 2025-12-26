import { test, expect } from '@playwright/test';
import path from 'path';

const buildScreenshotPath = (name) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(process.cwd(), '..', 'verification', `${stamp}-${name}.png`);
};

test('Security: /api/auth/me rejects invalid or expired tokens with 401', async ({ page, request }) => {
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

  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
  await page.screenshot({ path: buildScreenshotPath('security-auth-me-invalid-step-1-login') });

  const invalidResponse = await request.get('/api/auth/me', {
    headers: { Authorization: 'Bearer not-a-token' },
  });
  expect(invalidResponse.status()).toBe(401);
  const invalidBody = await invalidResponse.json().catch(() => ({}));
  expect(invalidBody?.error).toBeTruthy();

  const expiredIssuedAt = Date.now() - 25 * 60 * 60 * 1000;
  const expiredToken = `token_1_${expiredIssuedAt}`;
  const expiredResponse = await request.get('/api/auth/me', {
    headers: { Authorization: `Bearer ${expiredToken}` },
  });
  expect(expiredResponse.status()).toBe(401);
  const expiredBody = await expiredResponse.json().catch(() => ({}));
  expect(expiredBody?.error).toBeTruthy();

  await page.screenshot({ path: buildScreenshotPath('security-auth-me-invalid-step-2-responses') });
  expect(consoleErrors).toEqual([]);
});
