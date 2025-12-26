import { test, expect } from './fixtures.js';

test('Zodiac rising sign from /iching is idempotent and matches backend data', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
    localStorage.removeItem('bazi_token');
    localStorage.removeItem('bazi_user');
    localStorage.removeItem('bazi_last_activity');
  });

  await page.goto('/iching', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'I Ching Oracle' })).toBeVisible();

  await page.getByRole('link', { name: 'Zodiac' }).click();
  await expect(page).toHaveURL(/\/zodiac/);
  await expect(page.getByRole('heading', { name: 'Calculate Your Rising Sign' })).toBeVisible();

  await page.fill('input[name="birthDate"]', '1992-08-14');
  await page.fill('input[name="birthTime"]', '09:15');
  await page.fill('input[name="timezoneOffset"]', '-5');
  await page.fill('input[name="latitude"]', '40.7128');
  await page.fill('input[name="longitude"]', '-74.0060');

  const responsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/zodiac/rising') && resp.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Reveal Rising Sign' }).dblclick();
  const response = await responsePromise;
  expect(response.ok()).toBeTruthy();
  const data = await response.json();

  await expect(page.getByTestId('rising-sign-name')).toHaveText(data.rising.name);
  await expect(page.getByTestId('rising-sign-range')).toHaveText(data.rising.dateRange);
  await expect(page.getByTestId('rising-ascendant-longitude')).toHaveText(
    `${data.ascendant.longitude}°`
  );
  await expect(page.getByTestId('rising-local-sidereal-time')).toHaveText(
    `${data.ascendant.localSiderealTime}h`
  );
});
