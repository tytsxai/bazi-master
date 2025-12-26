import { test, expect } from './fixtures.js';
import path from 'path';

test('User can add and remove a BaZi favorite', async ({ page }) => {
  const uniqueLocation = `E2E_FAVORITE_${Date.now()}`;
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

  await page.goto('/login');
  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/profile/);
  await page.screenshot({ path: screenshotPath('favorites-step-1-profile') });

  await page.goto('/bazi');
  await page.getByLabel('Birth Year').fill('1993');
  await page.getByLabel('Birth Month').fill('6');
  await page.getByLabel('Birth Day').fill('18');
  await page.getByLabel('Birth Hour (0-23)').fill('14');
  await page.getByLabel('Gender').selectOption('female');
  await page.getByLabel('Birth Location').fill(uniqueLocation);
  await page.getByLabel('Timezone').fill('UTC');
  await page.screenshot({ path: screenshotPath('favorites-step-2-form-filled') });

  const calculateResponse = page.waitForResponse(
    (resp) => resp.url().includes('/api/bazi/calculate') && resp.status() === 200,
  );
  await page.getByRole('button', { name: 'Calculate' }).click();
  await calculateResponse;
  await expect(page.getByRole('heading', { name: 'Four Pillars' })).toBeVisible();
  await page.screenshot({ path: screenshotPath('favorites-step-3-calculated') });

  const saveResponse = page.waitForResponse(
    (resp) =>
      resp.url().includes('/api/bazi/records') &&
      resp.request().method() === 'POST' &&
      resp.status() === 200,
  );
  await page.getByRole('button', { name: 'Save to History' }).click();
  await saveResponse;
  await expect(page.getByText('Record saved to history.')).toBeVisible();
  await page.screenshot({ path: screenshotPath('favorites-step-4-saved') });

  const favoriteButton = page.getByRole('button', { name: 'Add to Favorites' });
  await expect(favoriteButton).toBeEnabled();
  const favoriteResponse = page.waitForResponse(
    (resp) =>
      resp.url().includes('/api/favorites') &&
      resp.request().method() === 'POST' &&
      resp.status() === 200,
  );
  await favoriteButton.click();
  await favoriteResponse;
  await expect(page.getByText('Favorite saved. View it in Favorites.')).toBeVisible();
  await page.screenshot({ path: screenshotPath('favorites-step-5-favorited') });

  await page.goto('/favorites');
  await expect(page.getByRole('heading', { name: 'Favorites' })).toBeVisible();
  await expect(page.getByText(uniqueLocation)).toBeVisible();
  await page.screenshot({ path: screenshotPath('favorites-step-6-favorites') });

  const favoriteCard = page
    .getByText(uniqueLocation)
    .locator('xpath=ancestor::div[contains(@class,"rounded-2xl")]')
    .first();
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await favoriteCard.getByRole('button', { name: 'Share' }).click();
  await expect(page.getByText(/Copied to clipboard|Shared successfully|Share failed/i)).toBeVisible();
  await page.screenshot({ path: screenshotPath('favorites-step-7-share') });

  await favoriteCard.getByRole('button', { name: 'Remove' }).click();

  const addBackCard = page
    .getByText(uniqueLocation)
    .locator('xpath=ancestor::div[contains(@class,"rounded-2xl")]')
    .first();
  await expect(addBackCard.getByRole('button', { name: 'Add to favorites' })).toBeVisible();
  await page.screenshot({ path: screenshotPath('favorites-step-8-removed') });

  await page.reload();
  await expect(page.getByText(uniqueLocation)).toBeVisible();
  await page.screenshot({ path: screenshotPath('favorites-step-9-refresh') });

  await page.goto('/history');
  await expect(page.getByRole('heading', { name: 'History', exact: true })).toBeVisible();
  await expect(page.getByText(uniqueLocation)).toBeVisible();
  await page.screenshot({ path: screenshotPath('favorites-step-10-history') });

  const recordCard = page
    .getByText(uniqueLocation)
    .locator('xpath=ancestor::div[contains(@data-testid,\"history-record-card\")][1]');
  await recordCard.getByRole('button', { name: 'Delete' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Record deleted.')).toBeVisible();
  await expect(page.getByTestId('history-record-card').filter({ hasText: uniqueLocation })).toHaveCount(0);
  await page.screenshot({ path: screenshotPath('favorites-step-11-history-deleted') });

  expect(consoleErrors).toEqual([]);
});
