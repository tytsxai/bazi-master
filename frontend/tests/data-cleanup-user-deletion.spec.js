import { test, expect } from '@playwright/test';
import path from 'path';

test('Data cleanup cascade after user deletion removes history and favorites', async ({ page }) => {
  const uniqueStamp = Date.now();
  const uniqueEmail = `cleanup_${uniqueStamp}@example.com`;
  const password = 'password123';
  const uniqueLocation = `CLEANUP_DELETE_${uniqueStamp}`;
  const consoleErrors = [];

  const screenshotPath = (name) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return path.join(process.cwd(), '..', 'verification', `${stamp}-${name}.png`);
  };

  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
  });

  await page.goto('/register');
  await page.fill('input[type="email"]', uniqueEmail);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/profile/);
  await page.screenshot({ path: screenshotPath('user-delete-step-1-registered') });

  await page.goto('/bazi');
  await page.getByLabel('Birth Year').fill('1992');
  await page.getByLabel('Birth Month').fill('8');
  await page.getByLabel('Birth Day').fill('14');
  await page.getByLabel('Birth Hour (0-23)').fill('9');
  await page.getByLabel('Gender').selectOption('male');
  await page.getByLabel('Birth Location').fill(uniqueLocation);
  await page.getByLabel('Timezone').fill('UTC');
  await page.screenshot({ path: screenshotPath('user-delete-step-2-form-filled') });

  const calculateResponse = page.waitForResponse(
    (resp) => resp.url().includes('/api/bazi/calculate') && resp.status() === 200,
  );
  await page.getByRole('button', { name: 'Calculate' }).click();
  await calculateResponse;
  await expect(page.getByRole('heading', { name: 'Four Pillars' })).toBeVisible();
  await page.screenshot({ path: screenshotPath('user-delete-step-3-calculated') });

  const fullAnalysisResponse = page.waitForResponse(
    (resp) => resp.url().includes('/api/bazi/full-analysis') && resp.status() === 200,
  );
  await page.getByTestId('bazi-full-analysis').click();
  await fullAnalysisResponse;
  await expect(page.getByRole('heading', { name: 'Ten Gods' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Luck Cycles' })).toBeVisible();
  await page.screenshot({ path: screenshotPath('user-delete-step-4-full-analysis') });

  const saveResponse = page.waitForResponse(
    (resp) =>
      resp.url().includes('/api/bazi/records') &&
      resp.request().method() === 'POST' &&
      resp.status() === 200,
  );
  await page.getByTestId('bazi-save-record').click();
  await saveResponse;
  await expect(page.getByText('Record saved to history.')).toBeVisible();
  await page.screenshot({ path: screenshotPath('user-delete-step-5-saved') });

  const favoriteResponse = page.waitForResponse(
    (resp) =>
      resp.url().includes('/api/favorites') &&
      resp.request().method() === 'POST' &&
      resp.status() === 200,
  );
  await page.getByRole('button', { name: 'Add to Favorites' }).click();
  await favoriteResponse;
  await expect(page.getByText('Favorite saved. View it in Favorites.')).toBeVisible();
  await page.screenshot({ path: screenshotPath('user-delete-step-6-favorited') });

  await page.goto('/history');
  await expect(page.getByRole('heading', { name: 'History', exact: true })).toBeVisible();
  await expect(page.getByText(uniqueLocation)).toBeVisible();
  await page.screenshot({ path: screenshotPath('user-delete-step-7-history') });

  await page.goto('/favorites');
  await expect(page.getByRole('heading', { name: 'Favorites' })).toBeVisible();
  await expect(page.getByText(uniqueLocation)).toBeVisible();
  await page.screenshot({ path: screenshotPath('user-delete-step-8-favorites') });

  await page.goto('/profile');
  await page.getByRole('button', { name: 'Delete Account' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete your account?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Confirm Delete' }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.screenshot({ path: screenshotPath('user-delete-step-9-deleted') });

  await page.fill('input[type="email"]', uniqueEmail);
  await page.fill('input[type="password"]', password);
  const loginResponsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/auth/login') && resp.request().method() === 'POST'
  );
  await page.click('button[type="submit"]');
  const loginResponse = await loginResponsePromise;
  expect(loginResponse.status()).toBe(401);
  await page.screenshot({ path: screenshotPath('user-delete-step-10-login-fails') });

  await page.goto('/register');
  await page.fill('input[type="email"]', uniqueEmail);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/profile/);
  await page.screenshot({ path: screenshotPath('user-delete-step-11-re-registered') });

  await page.goto('/history');
  await expect(page.getByText('No history yet')).toBeVisible();
  await page.screenshot({ path: screenshotPath('user-delete-step-12-history-empty') });

  await page.goto('/favorites');
  await expect(page.getByText('No favorites yet')).toBeVisible();
  await page.screenshot({ path: screenshotPath('user-delete-step-13-favorites-empty') });

  const allowedConsolePatterns = [
    /Failed to load resource: the server responded with a status of 401/i,
    /Login error:/i,
  ];
  const unexpectedErrors = consoleErrors.filter(
    (message) => !allowedConsolePatterns.some((pattern) => pattern.test(message))
  );
  expect(unexpectedErrors).toEqual([]);
});
