import { test, expect } from './fixtures.js';

test('Zodiac compatibility flow from /zodiac matches backend data', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
    localStorage.removeItem('bazi_token');
    localStorage.removeItem('bazi_user');
    localStorage.removeItem('bazi_last_activity');
  });

  await page.goto('/zodiac');
  await expect(page.getByRole('heading', { name: /Zodiac Chronicles/i })).toBeVisible();

  const signResponsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/zodiac/leo') && resp.request().method() === 'GET'
  );
  await page.getByRole('button', { name: /Leo/ }).click();
  const signResponse = await signResponsePromise;
  expect(signResponse.ok()).toBeTruthy();

  await page.getByLabel(/Match with/i).selectOption('libra');

  const compatibilityResponsePromise = page.waitForResponse(
    (resp) =>
      resp.url().includes('/api/zodiac/compatibility') &&
      resp.url().includes('primary=leo') &&
      resp.url().includes('secondary=libra') &&
      resp.request().method() === 'GET'
  );
  await page.getByRole('button', { name: /Check Compatibility/i }).click();
  const compatibilityResponse = await compatibilityResponsePromise;
  expect(compatibilityResponse.ok()).toBeTruthy();

  const compatibilityData = await compatibilityResponse.json();

  await expect(page.getByText(String(compatibilityData.score))).toBeVisible();
  await expect(page.getByText(compatibilityData.level, { exact: true })).toBeVisible();
  await expect(page.getByText(compatibilityData.summary, { exact: true })).toBeVisible();
  if (Array.isArray(compatibilityData.highlights)) {
    for (const item of compatibilityData.highlights) {
      await expect(page.getByText(item, { exact: true })).toBeVisible();
    }
  }

  expect(consoleErrors).toEqual([]);
});
