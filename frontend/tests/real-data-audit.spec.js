import { test, expect } from './fixtures.js';
import path from 'path';

test('Real data audit flow with unique BaZi record and cleanup', async ({ page }) => {
  const uniqueLocation = `TEST_${Date.now()}_VERIFY_ME`;
  const consoleErrors = [];

  const screenshotPath = (name) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return path.join(process.cwd(), '..', 'verification', `${stamp}-real-data-${name}.png`);
  };

  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
  });

  await page.goto('/');
  await page.screenshot({ path: screenshotPath('step-1-home') });

  await page.goto('/login');
  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/profile/);
  await expect(page.getByTestId('header-user-name')).toHaveText('Test User');
  await page.screenshot({ path: screenshotPath('step-2-profile') });

  await page.goto('/bazi');
  await page.getByLabel('Birth Year').fill('1994');
  await page.getByLabel('Birth Month').fill('7');
  await page.getByLabel('Birth Day').fill('19');
  await page.getByLabel('Birth Hour (0-23)').fill('16');
  await page.getByLabel('Gender').selectOption('female');
  await page.getByLabel('Birth Location').fill(uniqueLocation);
  await page.getByLabel('Timezone').fill('UTC+8');
  await page.screenshot({ path: screenshotPath('step-3-form') });

  const calcResponsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/bazi/calculate') && resp.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Calculate' }).click();
  const calcResponse = await calcResponsePromise;
  expect(calcResponse.ok()).toBeTruthy();

  await expect(page.getByRole('heading', { name: 'Four Pillars' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Five Elements' })).toBeVisible();
  await page.screenshot({ path: screenshotPath('step-4-calculated') });

  const fullResponsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/bazi/full-analysis') && resp.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Request Full Analysis' }).click();
  const fullResponse = await fullResponsePromise;
  expect(fullResponse.ok()).toBeTruthy();

  await expect(page.getByRole('heading', { name: 'Ten Gods' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Major Luck Cycles' })).toBeVisible();
  await page.screenshot({ path: screenshotPath('step-5-full-analysis') });

  const saveResponsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/bazi/records') && resp.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Save to History' }).click();
  const saveResponse = await saveResponsePromise;
  expect(saveResponse.ok()).toBeTruthy();
  await expect(page.getByText('Record saved to history.')).toBeVisible();
  await page.screenshot({ path: screenshotPath('step-6-saved') });

  const favoriteResponsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/favorites') && resp.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Add to Favorites' }).click();
  const favoriteResponse = await favoriteResponsePromise;
  expect(favoriteResponse.ok()).toBeTruthy();
  await expect(page.getByText('Favorite saved. View it in Favorites.')).toBeVisible();
  await page.screenshot({ path: screenshotPath('step-7-favorited') });

  await page.goto('/history');
  await expect(page.getByRole('heading', { name: 'History', exact: true })).toBeVisible();
  await page.getByPlaceholder('Location, timezone, pillar').fill(uniqueLocation);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('history-record-card').filter({ hasText: uniqueLocation })).toHaveCount(1);
  await page.screenshot({ path: screenshotPath('step-8-history-filtered') });

  await page.reload();
  await expect(page.getByTestId('history-record-card').filter({ hasText: uniqueLocation })).toHaveCount(1);
  await page.screenshot({ path: screenshotPath('step-9-history-refresh') });

  await page.goto('/favorites');
  await expect(page.getByRole('heading', { name: 'Favorites' })).toBeVisible();
  await expect(page.getByText(uniqueLocation)).toBeVisible();
  await page.screenshot({ path: screenshotPath('step-10-favorites') });

  const favoriteCard = page
    .getByText(uniqueLocation)
    .locator('xpath=ancestor::div[contains(@class,"rounded-2xl")]')
    .first();
  await favoriteCard.getByRole('button', { name: 'Remove' }).click();
  await page.screenshot({ path: screenshotPath('step-11-favorite-removed') });

  await page.reload();
  await expect(page.getByText(uniqueLocation)).toHaveCount(0);
  await page.screenshot({ path: screenshotPath('step-12-favorites-refresh') });

  await page.goto('/history');
  await page.getByPlaceholder('Location, timezone, pillar').fill(uniqueLocation);
  await page.keyboard.press('Enter');
  const recordCard = page
    .getByTestId('history-record-card')
    .filter({ hasText: uniqueLocation })
    .first();
  await recordCard.getByRole('button', { name: 'Delete' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Record deleted.')).toBeVisible();
  await expect(page.getByTestId('history-record-card').filter({ hasText: uniqueLocation })).toHaveCount(0);
  await page.screenshot({ path: screenshotPath('step-13-history-deleted') });

  await page.reload();
  await expect(page.getByTestId('history-record-card').filter({ hasText: uniqueLocation })).toHaveCount(0);
  await page.screenshot({ path: screenshotPath('step-14-history-refresh') });

  await page.getByRole('button', { name: 'Logout' }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.screenshot({ path: screenshotPath('step-15-logout') });

  expect(consoleErrors).toEqual([]);
});
