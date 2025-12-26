import { test, expect } from './fixtures.js';
import path from 'path';

const buildScreenshotPath = (name) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(process.cwd(), 'verification', `${stamp}-${name}.png`);
};

test('[J] Data cleanup: Zodiac weekly horoscope from /iching matches backend data', async ({ page, request }) => {
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
    localStorage.removeItem('bazi_profile_name');
  });

  await page.goto('/iching');
  await expect(page.getByRole('heading', { name: 'I Ching Oracle' })).toBeVisible();
  await page.screenshot({ path: buildScreenshotPath('data-cleanup-iching-step-1') });

  await page.getByRole('link', { name: 'Zodiac' }).click();
  await expect(page).toHaveURL(/\/zodiac/);
  await expect(page.getByRole('heading', { name: 'Zodiac Chronicles' })).toBeVisible();

  const signResponsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/zodiac/leo') && resp.request().method() === 'GET'
  );
  await page.getByRole('button', { name: 'Leo' }).click();
  const signResponse = await signResponsePromise;
  expect(signResponse.ok()).toBeTruthy();

  await page.getByRole('button', { name: 'Weekly' }).click();

  const horoscopeResponsePromise = page.waitForResponse(
    (resp) =>
      resp.url().includes('/api/zodiac/leo/horoscope?period=weekly') &&
      resp.request().method() === 'GET'
  );
  await page.getByRole('button', { name: 'Get Horoscope' }).click();
  const horoscopeResponse = await horoscopeResponsePromise;
  expect(horoscopeResponse.ok()).toBeTruthy();
  const data = await horoscopeResponse.json();

  const backendRes = await request.get('/api/zodiac/leo/horoscope?period=weekly');
  expect(backendRes.ok()).toBeTruthy();
  const backendData = await backendRes.json();

  expect(data).toMatchObject({
    sign: backendData.sign,
    period: backendData.period,
    range: backendData.range,
    horoscope: backendData.horoscope
  });
  expect(typeof data.generatedAt).toBe('string');
  expect(typeof backendData.generatedAt).toBe('string');
  const generatedDelta = Math.abs(
    new Date(data.generatedAt).getTime() - new Date(backendData.generatedAt).getTime()
  );
  expect(generatedDelta).toBeLessThan(10000);

  await expect(page.getByRole('heading', { name: /Leo Weekly Horoscope/ })).toBeVisible();
  await expect(page.getByText(backendData.range)).toBeVisible();
  await expect(page.getByText(backendData.horoscope.overview)).toBeVisible();
  await expect(page.getByText(backendData.horoscope.love)).toBeVisible();
  await expect(page.getByText(backendData.horoscope.career)).toBeVisible();
  await expect(page.getByText(backendData.horoscope.wellness)).toBeVisible();
  await expect(
    page.getByText(`Lucky colors: ${backendData.horoscope.lucky.colors.join(', ')}`)
  ).toBeVisible();
  await expect(
    page.getByText(`Lucky numbers: ${backendData.horoscope.lucky.numbers.join(', ')}`)
  ).toBeVisible();
  await expect(page.getByText(`Mantra: ${backendData.horoscope.mantra}`)).toBeVisible();

  await page.screenshot({ path: buildScreenshotPath('data-cleanup-iching-step-2-zodiac-weekly') });

  expect(consoleErrors).toEqual([]);
});
