import { test, expect } from './fixtures.js';

test('Guest can calculate BaZi chart and see results persist', async ({ page }) => {
  const uniqueLocation = `TEST_LOCATION_${Date.now()}`;

  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
    localStorage.removeItem('bazi_token');
    localStorage.removeItem('bazi_user');
    localStorage.removeItem('bazi_last_activity');
  });

  await page.goto('/bazi');

  await page.getByLabel('Birth Year').fill('1991');
  await page.getByLabel('Birth Month').fill('11');
  await page.getByLabel('Birth Day').fill('9');
  await page.getByLabel('Birth Hour (0-23)').fill('9');
  await page.getByLabel('Gender').selectOption('male');
  await page.getByLabel('Birth Location').fill(uniqueLocation);
  await page.getByLabel('Timezone').fill('UTC+8');

  const calcResponsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/bazi/calculate') && resp.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Calculate' }).click();
  const calcResponse = await calcResponsePromise;
  expect(calcResponse.ok()).toBeTruthy();

  await expect(page.getByRole('heading', { name: 'Four Pillars' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Five Elements' })).toBeVisible();
  await expect(page.getByTestId('pillars-empty')).toHaveCount(0);
  await expect(page.getByTestId('elements-empty')).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId('pillars-empty')).toHaveCount(0);
  await expect(page.getByTestId('elements-empty')).toHaveCount(0);
  await expect(page.getByLabel('Birth Location')).toHaveValue(uniqueLocation);
});
