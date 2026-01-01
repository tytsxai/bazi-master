import { test, expect } from './fixtures.js';

test('Zodiac weekly horoscope from /tarot matches backend data', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
    localStorage.removeItem('bazi_token');
    localStorage.removeItem('bazi_user');
    localStorage.removeItem('bazi_last_activity');
  });

  await page.goto('/tarot', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Tarot Sanctuary' })).toBeVisible({
    timeout: 15000,
  });

  await page.getByLabel('Sign').selectOption('leo');
  await page.getByLabel('Period').selectOption('weekly');

  const horoscopeResponsePromise = page.waitForResponse(
    (resp) =>
      resp.url().includes('/api/zodiac/leo/horoscope?period=weekly') &&
      resp.request().method() === 'GET'
  );
  await page.getByRole('button', { name: /Get weekly horoscope/i }).click();
  const horoscopeResponse = await horoscopeResponsePromise;
  expect(horoscopeResponse.ok()).toBeTruthy();
  const data = await horoscopeResponse.json();

  const snapshotSection = page
    .getByRole('heading', { name: /Weekly Zodiac Snapshot/ })
    .locator('xpath=ancestor::section[1]');

  await expect(
    snapshotSection.getByRole('heading', { name: /Leo Weekly Horoscope/ })
  ).toBeVisible();
  await expect(snapshotSection.getByText(data.range)).toBeVisible();
  await expect(snapshotSection.getByText(data.horoscope.overview)).toBeVisible();
  await expect(snapshotSection.getByText(data.horoscope.love)).toBeVisible();
  await expect(snapshotSection.getByText(data.horoscope.career)).toBeVisible();
  await expect(snapshotSection.getByText(data.horoscope.wellness)).toBeVisible();
  await expect(
    snapshotSection.getByText(`Lucky colors: ${data.horoscope.lucky.colors.join(', ')}`)
  ).toBeVisible();
  await expect(
    snapshotSection.getByText(`Lucky numbers: ${data.horoscope.lucky.numbers.join(', ')}`)
  ).toBeVisible();
  await expect(snapshotSection.getByText(`Mantra: ${data.horoscope.mantra}`)).toBeVisible();
});
