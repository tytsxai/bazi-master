import { test, expect } from './fixtures.js';
import path from 'path';

test('Failure handling with network interruption and retry in BaZi flow', async ({ page }) => {
  const uniqueLocation = `E2E_RETRY_${Date.now()}`;
  const consoleErrors = [];

  const screenshotPath = (name) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return path.join(process.cwd(), '..', 'verification', `${stamp}-${name}.png`);
  };

  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (text.includes('net::ERR_FAILED')) return;
      consoleErrors.push(text);
    }
  });

  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
    localStorage.removeItem('bazi_retry_action');
  });

  await page.goto('/');
  await page.screenshot({ path: screenshotPath('failure-retry-01-home') });

  await page.goto('/login');
  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/profile/);
  await expect(page.getByTestId('header-user-name')).toBeVisible();
  await page.screenshot({ path: screenshotPath('failure-retry-02-profile') });

  await page.goto('/bazi');
  await page.getByLabel('Birth Year').fill('1991');
  await page.getByLabel('Birth Month').fill('11');
  await page.getByLabel('Birth Day').fill('9');
  await page.getByLabel('Birth Hour (0-23)').fill('9');
  await page.locator('#gender').selectOption('male');
  await page.getByLabel('Birth Location').fill(uniqueLocation);
  await page.getByLabel('Timezone').fill('UTC+8');
  await page.screenshot({ path: screenshotPath('failure-retry-03-form-filled') });

  let shouldFail = true;
  await page.route('**/api/bazi/calculate', async (route) => {
    if (shouldFail) {
      shouldFail = false;
      await route.abort('failed');
      return;
    }
    await route.continue();
  });

  await page.getByRole('button', { name: 'Calculate' }).click();
  await expect(page.getByTestId('retry-banner')).toBeVisible();
  await page.screenshot({ path: screenshotPath('failure-retry-04-retry-banner') });

  const calcResponse = page.waitForResponse(
    (resp) =>
      resp.url().includes('/api/bazi/calculate') && resp.request().method() === 'POST' && resp.ok()
  );
  await page.getByTestId('retry-action').click();
  await calcResponse;
  await expect(page.getByTestId('retry-banner')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Four Pillars' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Five Elements' })).toBeVisible();
  await page.screenshot({ path: screenshotPath('failure-retry-05-calculated') });

  const fullResponse = page.waitForResponse(
    (resp) =>
      resp.url().includes('/api/bazi/full-analysis') &&
      resp.request().method() === 'POST' &&
      resp.ok()
  );
  await page.getByRole('button', { name: /request full analysis/i }).click();
  await fullResponse;
  await expect(page.getByRole('heading', { name: 'Ten Gods' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Luck Cycles' })).toBeVisible();
  await page.screenshot({ path: screenshotPath('failure-retry-06-full-analysis') });

  const saveResponse = page.waitForResponse(
    (resp) =>
      resp.url().includes('/api/bazi/records') && resp.request().method() === 'POST' && resp.ok()
  );
  await page.getByRole('button', { name: 'Save to History' }).click();
  await saveResponse;
  await expect(page.getByText('Record saved to history.')).toBeVisible();
  await page.screenshot({ path: screenshotPath('failure-retry-07-saved') });

  const favoriteResponse = page.waitForResponse(
    (resp) =>
      resp.url().includes('/api/favorites') && resp.request().method() === 'POST' && resp.ok()
  );
  await page.getByRole('button', { name: 'Add to Favorites' }).click();
  await favoriteResponse;
  await expect(page.getByText('Favorite saved. View it in Favorites.')).toBeVisible();
  await page.screenshot({ path: screenshotPath('failure-retry-08-favorited') });

  await page.goto('/history');
  await expect(page.getByRole('heading', { name: 'History', exact: true })).toBeVisible();
  await expect(page.getByText(uniqueLocation)).toBeVisible();
  await page.screenshot({ path: screenshotPath('failure-retry-09-history') });

  await page.goto('/favorites');
  await expect(page.getByRole('heading', { name: 'Favorites' })).toBeVisible();
  await expect(page.getByText(uniqueLocation)).toBeVisible();
  await page.screenshot({ path: screenshotPath('failure-retry-10-favorites') });

  const favoriteCard = page
    .getByText(uniqueLocation)
    .locator('xpath=ancestor::div[contains(@class,\"rounded-2xl\")]')
    .first();
  await favoriteCard.getByRole('button', { name: 'Remove' }).click();

  await page.goto('/history');
  const recordCard = page
    .getByText(uniqueLocation)
    .locator('xpath=ancestor::div[contains(@data-testid,\"history-record-card\")][1]');
  await recordCard.getByRole('button', { name: 'Delete' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Record deleted.')).toBeVisible();
  await page.screenshot({ path: screenshotPath('failure-retry-11-cleanup') });

  await page.getByRole('button', { name: 'Logout' }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.screenshot({ path: screenshotPath('failure-retry-12-logout') });

  expect(consoleErrors).toEqual([]);
});
