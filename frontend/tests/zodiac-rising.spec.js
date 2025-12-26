import { test, expect } from './fixtures.js';

const takeShot = async (page, label) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  await page.screenshot({ path: `../verification/${stamp}-${label}.png`, fullPage: true });
};

test('Zodiac rising sign calculation using birth time and location', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });
  page.on('pageerror', (error) => {
    consoleErrors.push(error.message);
  });

  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
    localStorage.removeItem('bazi_token');
    localStorage.removeItem('bazi_user');
    localStorage.removeItem('bazi_last_activity');
  });

  await page.goto('/zodiac');
  await expect(page.getByRole('heading', { name: 'Calculate Your Rising Sign' })).toBeVisible();

  await page.fill('input[name="birthDate"]', '1992-08-14');
  await page.fill('input[name="birthTime"]', '09:15');
  await page.fill('input[name="timezoneOffset"]', '-5');
  await page.fill('input[name="latitude"]', '40.7128');
  await page.fill('input[name="longitude"]', '-74.0060');

  await takeShot(page, 'zodiac-rising-form-filled');

  const responsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/zodiac/rising') && resp.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Reveal Rising Sign' }).click();
  const response = await responsePromise;
  expect(response.ok()).toBeTruthy();

  await expect(page.getByText('Rising Sign', { exact: true })).toBeVisible();
  await expect(page.getByText('Ascendant Longitude', { exact: true })).toBeVisible();
  await expect(page.getByText('Local Sidereal Time', { exact: true })).toBeVisible();

  await takeShot(page, 'zodiac-rising-result');

  expect(consoleErrors).toEqual([]);
});
