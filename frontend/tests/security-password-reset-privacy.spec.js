import { test, expect } from '@playwright/test';
import path from 'path';

const buildScreenshotPath = (name) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(process.cwd(), '..', 'verification', `${stamp}-${name}.png`);
};

test('Security: password reset request does not reveal whether email exists', async ({ page, request }) => {
  const consoleErrors = [];
  const email = `reset-privacy-${Date.now()}@example.com`;
  const password = 'Password123';

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

  const registerResponse = await request.post('/api/auth/register', {
    data: { email, password, name: 'Reset Privacy' },
  });
  if (![200, 409].includes(registerResponse.status())) {
    throw new Error(`Unexpected register status: ${registerResponse.status()}`);
  }

  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
  await page.screenshot({ path: buildScreenshotPath('security-password-reset-privacy-step-1-login') });

  await page.getByRole('button', { name: /forgot password/i }).click();
  await expect(page.getByRole('heading', { name: /reset password/i })).toBeVisible();

  const resetEmail = page.getByLabel('Email');
  await resetEmail.fill(email);
  await page.getByRole('button', { name: /send reset link/i }).click();

  const statusMessage = page.getByRole('status');
  await expect(statusMessage).toBeVisible();
  const firstMessage = (await statusMessage.textContent())?.trim();
  expect(firstMessage).toMatch(/if an account exists/i);

  await page.screenshot({ path: buildScreenshotPath('security-password-reset-privacy-step-2-existing') });

  const unknownEmail = `unknown-${Date.now()}@example.com`;
  await resetEmail.fill(unknownEmail);
  await page.getByRole('button', { name: /send reset link/i }).click();

  await expect(statusMessage).toBeVisible();
  const secondMessage = (await statusMessage.textContent())?.trim();
  expect(secondMessage).toBe(firstMessage);

  await page.screenshot({ path: buildScreenshotPath('security-password-reset-privacy-step-3-unknown') });
  expect(consoleErrors).toEqual([]);
});
