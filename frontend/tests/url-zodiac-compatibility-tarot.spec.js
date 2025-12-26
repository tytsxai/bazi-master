import { test, expect } from './fixtures.js';
import path from 'path';

const buildScreenshotPath = (name) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(process.cwd(), '..', 'verification', `${stamp}-${name}.png`);
};

test('URL: Zodiac compatibility from /tarot matches backend data', async ({ page }) => {
  const consoleErrors = [];

  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
    localStorage.removeItem('bazi_token');
    localStorage.removeItem('bazi_user');
    localStorage.removeItem('bazi_last_activity');
  });

  await page.goto('/tarot');
  await expect(page.getByRole('heading', { name: /Tarot Sanctuary/i })).toBeVisible();
  await page.screenshot({ path: buildScreenshotPath('url-zodiac-compat-tarot-step-1') });

  await page.getByRole('link', { name: /Check Compatibility/i }).click();
  await expect(page).toHaveURL(/\/zodiac/);
  await expect(page.getByRole('heading', { name: /Zodiac Chronicles/i })).toBeVisible();

  const signResponsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/zodiac/leo') && resp.request().method() === 'GET'
  );
  await page.getByRole('button', { name: 'Leo' }).click();
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

  await page.screenshot({ path: buildScreenshotPath('url-zodiac-compat-tarot-step-2') });

  expect(consoleErrors).toEqual([]);
});
