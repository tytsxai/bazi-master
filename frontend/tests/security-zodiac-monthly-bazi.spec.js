import { test, expect } from './fixtures.js';
import path from 'path';

const buildScreenshotPath = (name) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(process.cwd(), '..', 'verification', `${stamp}-${name}.png`);
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const waitForZodiacSign = async (page, sign) => {
  const signResponsePromise = page.waitForResponse(
    (resp) => resp.url().includes(`/api/zodiac/${sign}`) && resp.request().method() === 'GET'
  );
  await page.getByRole('button', { name: new RegExp(sign, 'i') }).click();
  const signResponse = await signResponsePromise;
  expect(signResponse.ok()).toBeTruthy();
};

test('Security: Zodiac monthly horoscope from /bazi matches backend data', async ({ page }) => {
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

  await page.goto('/bazi');
  await page.screenshot({ path: buildScreenshotPath('security-zodiac-monthly-step-1-bazi') });

  await page.getByRole('link', { name: /Zodiac/i }).click();
  await expect(page).toHaveURL(/\/zodiac/);
  await expect(page.getByRole('heading', { name: /Zodiac Chronicles/i })).toBeVisible();

  await waitForZodiacSign(page, 'scorpio');

  await page.getByRole('button', { name: 'Monthly' }).click();

  const horoscopeResponsePromise = page.waitForResponse(
    (resp) =>
      resp.url().includes('/api/zodiac/scorpio/horoscope?period=monthly') &&
      resp.request().method() === 'GET'
  );
  await page.getByRole('button', { name: 'Get Horoscope' }).click();
  const horoscopeResponse = await horoscopeResponsePromise;
  expect(horoscopeResponse.ok()).toBeTruthy();
  const horoscopeData = await horoscopeResponse.json();

  await expect(page.getByRole('heading', { name: /Scorpio Monthly Horoscope/ })).toBeVisible();

  const rangeText = horoscopeData.range;
  if (rangeText) {
    await expect(page.getByText(rangeText, { exact: false })).toBeVisible();
  }

  const horoscope = horoscopeData.horoscope || {};
  const fields = ['overview', 'love', 'career', 'wellness'];
  for (const key of fields) {
    if (horoscope[key]) {
      await expect(page.getByText(horoscope[key], { exact: true })).toBeVisible();
    }
  }

  if (horoscope.lucky?.colors?.length) {
    const colorsText = `Lucky colors: ${horoscope.lucky.colors.join(', ')}`;
    await expect(page.getByText(new RegExp(escapeRegExp(colorsText)))).toBeVisible();
  }

  if (horoscope.lucky?.numbers?.length) {
    const numbersText = `Lucky numbers: ${horoscope.lucky.numbers.join(', ')}`;
    await expect(page.getByText(new RegExp(escapeRegExp(numbersText)))).toBeVisible();
  }

  if (horoscope.mantra) {
    const mantraText = `Mantra: ${horoscope.mantra}`;
    await expect(page.getByText(new RegExp(escapeRegExp(mantraText)))).toBeVisible();
  }

  await page.screenshot({ path: buildScreenshotPath('security-zodiac-monthly-step-2-horoscope') });

  expect(consoleErrors).toEqual([]);
});
