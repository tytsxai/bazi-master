import { test, expect } from '@playwright/test';

test('History export/import flow', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
  });

  const timestamp = Date.now();
  const uniqueLocation = `E2E_Export_${timestamp}`;

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
  await page.fill('#birthYear', '1992');
  await page.fill('#birthMonth', '6');
  await page.fill('#birthDay', '18');
  await page.fill('#birthHour', '7');
  await page.selectOption('#gender', 'female');
  await page.fill('#birthLocation', uniqueLocation);
  await page.fill('#timezone', 'UTC');
  await page.getByRole('button', { name: /Calculate|开始排盘/ }).click();
  await expect(page.getByText('Basic chart generated.')).toBeVisible({ timeout: 30000 });
  const saveButton = page.getByRole('button', { name: 'Save to History' });
  await expect(saveButton).toBeEnabled({ timeout: 20000 });
  await saveButton.click();

  await page.goto(`/history?q=${encodeURIComponent(uniqueLocation)}`);
  await expect(page.getByText(uniqueLocation)).toBeVisible({ timeout: 20000 });

  const exportButton = page.getByRole('button', { name: 'Export filtered' });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    exportButton.click(),
  ]);
  const downloadPath = testInfo.outputPath(`history-export-${timestamp}.json`);
  await download.saveAs(downloadPath);
  await expect(page.getByText('History exported.')).toBeVisible();

  await page.setInputFiles('input[type="file"]', downloadPath);
  await expect(page.getByText(/Imported \d+ record/)).toBeVisible({ timeout: 20000 });
});
