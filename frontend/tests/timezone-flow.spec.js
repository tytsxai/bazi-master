import { test, expect } from '@playwright/test';
import path from 'path';

const screenshotPath = (name) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(process.cwd(), '..', 'verification', `${stamp}-${name}.png`);
};

test('Timezone change affects derived time metadata and full Bazi flow', async ({ page }) => {
  const uniqueLocation = `TEST_TZ_${Date.now()}`;

  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
  });

  await page.goto('/login');
  await page.evaluate(() => {
    localStorage.removeItem('bazi_token');
    localStorage.removeItem('bazi_user');
    localStorage.removeItem('bazi_last_activity');
  });
  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/profile/);
  await page.screenshot({ path: screenshotPath('tz-step-1-profile') });

  await page.goto('/bazi');
  await page.getByLabel('Birth Year').fill('1991');
  await page.getByLabel('Birth Month').fill('11');
  await page.getByLabel('Birth Day').fill('9');
  await page.getByLabel('Birth Hour (0-23)').fill('9');
  await page.getByLabel('Gender').selectOption('male');
  await page.getByLabel('Birth Location').fill(uniqueLocation);
  await page.getByLabel('Timezone').fill('America/New_York');
  await page.screenshot({ path: screenshotPath('tz-step-2-form-filled') });

  const firstCalc = page.waitForResponse(
    (resp) => resp.url().includes('/api/bazi/calculate') && resp.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Calculate' }).click();
  await firstCalc;

  await expect(page.getByRole('heading', { name: 'Four Pillars' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Five Elements' })).toBeVisible();
  await expect(page.getByTestId('timezone-resolved')).toHaveText('UTC-05:00');
  const firstBirthUtc = await page.getByTestId('birth-utc').innerText();
  await page.screenshot({ path: screenshotPath('tz-step-3-first-calc') });

  await page.getByLabel('Timezone').fill('UTC+08:00');
  const secondCalc = page.waitForResponse(
    (resp) => resp.url().includes('/api/bazi/calculate') && resp.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Calculate' }).click();
  await secondCalc;

  await expect(page.getByTestId('timezone-resolved')).toHaveText('UTC+08:00');
  const secondBirthUtc = await page.getByTestId('birth-utc').innerText();
  expect(secondBirthUtc).not.toEqual(firstBirthUtc);
  await page.screenshot({ path: screenshotPath('tz-step-4-timezone-change') });

  const fullAnalysis = page.waitForResponse(
    (resp) => resp.url().includes('/api/bazi/full-analysis') && resp.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Request Full Analysis' }).click();
  await fullAnalysis;
  await expect(page.getByRole('heading', { name: 'Ten Gods' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Major Luck Cycles' })).toBeVisible();
  await page.screenshot({ path: screenshotPath('tz-step-5-full-analysis') });

  const saveResponse = page.waitForResponse(
    (resp) => resp.url().includes('/api/bazi/records') && resp.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Save to History' }).click();
  await saveResponse;
  await page.screenshot({ path: screenshotPath('tz-step-6-saved') });

  const favoriteResponse = page.waitForResponse(
    (resp) => resp.url().includes('/api/favorites') && resp.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Add to Favorites' }).click();
  await favoriteResponse;
  await expect(page.getByText('Favorite saved. View it in Favorites.')).toBeVisible();
  await page.screenshot({ path: screenshotPath('tz-step-7-favorited') });

  await page.goto('/history');
  await expect(page.getByRole('heading', { name: 'History', exact: true })).toBeVisible();
  await expect(page.getByText(uniqueLocation)).toBeVisible();
  const historyCard = page
    .getByText(uniqueLocation)
    .locator('xpath=ancestor::div[contains(@class,"rounded-2xl")]')
    .first();
  await expect(historyCard).toContainText('UTC+08:00');
  await page.screenshot({ path: screenshotPath('tz-step-8-history') });

  await page.goto('/favorites');
  await expect(page.getByRole('heading', { name: 'Favorites' })).toBeVisible();
  await expect(page.getByText(uniqueLocation)).toBeVisible();
  await page.screenshot({ path: screenshotPath('tz-step-10-favorites') });

  const favoriteCard = page
    .getByText(uniqueLocation)
    .locator('xpath=ancestor::div[contains(@class,"rounded-2xl")]')
    .first();
  const removeFavorite = page.waitForResponse(
    (resp) => resp.url().includes('/api/favorites/') && resp.request().method() === 'DELETE'
  );
  await favoriteCard.getByRole('button', { name: 'Remove' }).click();
  await removeFavorite;
  const addBackCard = page
    .getByText(uniqueLocation)
    .locator('xpath=ancestor::div[contains(@class,"rounded-2xl")]')
    .first();
  await expect(addBackCard.getByRole('button', { name: 'Add to favorites' })).toBeVisible();
  await page.screenshot({ path: screenshotPath('tz-step-11-favorites-removed') });

  await page.goto('/history');
  await expect(page.getByRole('heading', { name: 'History', exact: true })).toBeVisible();
  const historyCardAfter = page
    .getByText(uniqueLocation)
    .locator('xpath=ancestor::div[contains(@class,"rounded-2xl")]')
    .first();
  const deleteHistory = page.waitForResponse(
    (resp) => resp.url().includes('/api/bazi/records/') && resp.request().method() === 'DELETE'
  );
  await historyCardAfter.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await deleteHistory;
  await expect(page.getByText(uniqueLocation)).toHaveCount(0);
  await page.screenshot({ path: screenshotPath('tz-step-12-history-deleted') });

  await page.getByRole('button', { name: /Logout/ }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.screenshot({ path: screenshotPath('tz-step-13-logout') });
});
