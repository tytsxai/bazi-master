import { test, expect } from './fixtures.js';
import path from 'path';

const buildScreenshotPath = (name) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(process.cwd(), '..', 'verification', `${stamp}-${name}.png`);
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('[A] Security: Zodiac monthly horoscope from /tarot matches backend data', async ({
  page,
}) => {
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

  await page.goto('/tarot', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Tarot Sanctuary' })).toBeVisible({
    timeout: 15000,
  });
  await page.screenshot({
    path: buildScreenshotPath('security-zodiac-monthly-tarot-step-1-tarot'),
  });

  await page.getByLabel('Sign').selectOption('libra');
  await page.getByLabel('Period').selectOption('monthly');

  const horoscopeResponsePromise = page.waitForResponse(
    (resp) =>
      resp.url().includes('/api/zodiac/libra/horoscope?period=monthly') &&
      resp.request().method() === 'GET'
  );
  await page.getByRole('button', { name: /Get monthly horoscope/i }).click();
  const horoscopeResponse = await horoscopeResponsePromise;
  expect(horoscopeResponse.ok()).toBeTruthy();
  const horoscopeData = await horoscopeResponse.json();

  const snapshotSection = page
    .getByRole('heading', { name: /Weekly Zodiac Snapshot/i })
    .locator('xpath=ancestor::section[1]');

  await expect(
    snapshotSection.getByRole('heading', { name: /Libra Monthly Horoscope/i })
  ).toBeVisible();

  const horoscope = horoscopeData.horoscope || {};
  const fields = ['overview', 'love', 'career', 'wellness'];
  for (const key of fields) {
    if (horoscope[key]) {
      await expect(snapshotSection.getByText(horoscope[key], { exact: true })).toBeVisible();
    }
  }

  if (horoscope.lucky?.colors?.length) {
    const colorsText = `Lucky colors: ${horoscope.lucky.colors.join(', ')}`;
    await expect(snapshotSection.getByText(new RegExp(escapeRegExp(colorsText)))).toBeVisible();
  }

  if (horoscope.lucky?.numbers?.length) {
    const numbersText = `Lucky numbers: ${horoscope.lucky.numbers.join(', ')}`;
    await expect(snapshotSection.getByText(new RegExp(escapeRegExp(numbersText)))).toBeVisible();
  }

  if (horoscope.mantra) {
    const mantraText = `Mantra: ${horoscope.mantra}`;
    await expect(snapshotSection.getByText(new RegExp(escapeRegExp(mantraText)))).toBeVisible();
  }

  await page.screenshot({
    path: buildScreenshotPath('security-zodiac-monthly-tarot-step-2-horoscope'),
  });

  expect(consoleErrors).toEqual([]);
});
