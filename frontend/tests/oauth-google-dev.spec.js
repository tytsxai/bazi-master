import { test, expect } from '@playwright/test';
import path from 'path';

const screenshotPath = (name) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(process.cwd(), '..', 'verification', `${stamp}-${name}.png`);
};

const resolvePort = (value) => {
  const parsed = Number(value);
  const port = Number.isFinite(parsed) ? Math.trunc(parsed) : NaN;
  return Number.isFinite(port) && port > 0 ? port : null;
};

const backendPort = resolvePort(process.env.E2E_API_PORT) ?? resolvePort(process.env.BACKEND_PORT);
const apiBase = process.env.PW_API_BASE
  || (backendPort ? `http://127.0.0.1:${backendPort}` : 'http://127.0.0.1:4000');

test('Auth: Google OAuth dev flow redirects to profile and saves settings', async ({ page, request }) => {
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
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.screenshot({ path: screenshotPath('oauth-google-dev-step-1-home') });

  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: /Continue with Google/i })).toBeVisible();
  await page.screenshot({ path: screenshotPath('oauth-google-dev-step-2-login') });

  await page.getByRole('button', { name: /Continue with Google/i }).click();
  await page.waitForURL(/\/profile/, { timeout: 15000 });
  await page.screenshot({ path: screenshotPath('oauth-google-dev-step-3-profile') });

  const token = await page.evaluate(() => localStorage.getItem('bazi_token'));
  expect(token).toBeTruthy();

  const meRes = await request.get(`${apiBase}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(meRes.ok()).toBeTruthy();
  const meData = await meRes.json();
  const user = meData?.user || {};

  const profileCard = page.getByText('Name', { exact: true }).locator('..');
  await expect(profileCard.getByText(user.name || '—', { exact: true })).toBeVisible();
  const emailCard = page.getByText('Email', { exact: true }).locator('..');
  await expect(emailCard.getByText(user.email || '—', { exact: true })).toBeVisible();

  const uniqueName = `TEST_OAUTH_${Date.now()}_VERIFY_ME`;
  await page.getByLabel('Display name (optional)').fill(uniqueName);

  const saveRequest = page.waitForResponse(
    (resp) => resp.url().includes('/api/user/settings') && resp.status() === 200
  );
  await page.getByRole('button', { name: /Save settings/i }).click();
  await saveRequest;
  await expect(page.getByText('Settings saved.', { exact: true })).toBeVisible();
  await page.screenshot({ path: screenshotPath('oauth-google-dev-step-4-settings-saved') });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByLabel('Display name (optional)')).toHaveValue(uniqueName);
  await page.screenshot({ path: screenshotPath('oauth-google-dev-step-5-settings-persisted') });

  await page.getByRole('button', { name: /Delete Account/i }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.screenshot({ path: screenshotPath('oauth-google-dev-step-6-delete-dialog') });

  await page.getByRole('button', { name: /Confirm Delete/i }).click();
  await page.waitForURL(/\/login\?reason=deleted/, { timeout: 15000 });
  await page.screenshot({ path: screenshotPath('oauth-google-dev-step-7-deleted') });

  const tokenAfterDelete = await page.evaluate(() => localStorage.getItem('bazi_token'));
  expect(tokenAfterDelete).toBeFalsy();

  expect(consoleErrors).toEqual([]);
});
