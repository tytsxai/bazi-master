import { test, expect } from './fixtures.js';

test('History CRUD flow', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
  });

  const timestamp = Date.now();
  const uniqueLocation = `E2E_Location_${timestamp}`;
  const birth = {
    year: '1994',
    month: '5',
    day: '12',
    hour: '9',
  };

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

  await page.goto('/bazi');
  await page.fill('#birthYear', birth.year);
  await page.fill('#birthMonth', birth.month);
  await page.fill('#birthDay', birth.day);
  await page.fill('#birthHour', birth.hour);
  await page.selectOption('#gender', 'female');
  await page.fill('#birthLocation', uniqueLocation);
  await page.fill('#timezone', 'UTC');

  await page.getByRole('button', { name: /Calculate|开始排盘/ }).click();
  await expect(page.getByText('Basic chart generated.')).toBeVisible({ timeout: 30000 });
  const saveButton = page.getByRole('button', { name: 'Save to History' });
  await expect(saveButton).toBeEnabled({ timeout: 20000 });

  await Promise.all([
    page.waitForResponse(
      (res) =>
        res.url().includes('/api/bazi/records') && res.request().method() === 'POST' && res.ok()
    ),
    saveButton.click(),
  ]);
  await expect(page.getByText(/Record saved to history\.|Record already saved\./)).toBeVisible({
    timeout: 20000,
  });

  await page.goto('/history');
  await page.waitForResponse(
    (res) => res.url().includes('/api/bazi/records') && res.request().method() === 'GET' && res.ok()
  );
  const locationText = page.getByText(uniqueLocation);
  await expect(locationText).toBeVisible({ timeout: 20000 });

  const recordCard = page
    .getByText(uniqueLocation)
    .locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');
  await recordCard.getByRole('button', { name: 'Delete' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Record deleted.')).toBeVisible();
  await expect(page.getByText(uniqueLocation)).toHaveCount(0);

  const deletedRecordText = `${birth.year}-${birth.month}-${birth.day} · ${birth.hour}:00`;
  await expect(page.getByText('Deleted records')).toBeVisible();
  const deletedRow = page.locator('div', { hasText: deletedRecordText }).first();
  await expect(deletedRow).toBeVisible();
  const restoreResponsePromise = page.waitForResponse(
    (res) =>
      res.url().includes('/api/bazi/records/') &&
      res.url().includes('/restore') &&
      res.request().method() === 'POST'
  );
  await deletedRow.getByRole('button', { name: 'Restore' }).click();
  const restoreResponse = await restoreResponsePromise;
  expect(restoreResponse.ok()).toBeTruthy();
  await expect(page.getByText(uniqueLocation)).toBeVisible({ timeout: 20000 });
});
