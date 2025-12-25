import { test, expect } from '@playwright/test';

test('User can fetch a zodiac horoscope for a selected sign and period', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
    localStorage.removeItem('bazi_token');
    localStorage.removeItem('bazi_user');
    localStorage.removeItem('bazi_last_activity');
  });

  await page.goto('/zodiac');

  await expect(page.getByRole('heading', { name: 'Zodiac Chronicles' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sign Profile' })).toBeVisible();

  const signResponsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/zodiac/leo') && resp.request().method() === 'GET'
  );
  await page.getByRole('button', { name: /Leo/ }).click();
  const signResponse = await signResponsePromise;
  expect(signResponse.ok()).toBeTruthy();

  const focusBlock = page.getByText('Focus').locator('..');
  await expect(focusBlock.getByText(/Leo\s+•\s+Jul 23 - Aug 22/)).toBeVisible();

  await page.getByRole('button', { name: 'Weekly' }).click();

  const horoscopeResponsePromise = page.waitForResponse(
    (resp) =>
      resp.url().includes('/api/zodiac/leo/horoscope?period=weekly') &&
      resp.request().method() === 'GET'
  );
  await page.getByRole('button', { name: 'Get Horoscope' }).click();
  const horoscopeResponse = await horoscopeResponsePromise;
  expect(horoscopeResponse.ok()).toBeTruthy();

  await expect(page.getByRole('heading', { name: /Leo Weekly Horoscope/ })).toBeVisible();
  await expect(page.getByText('Overview', { exact: true })).toBeVisible();
  await expect(page.getByText('Love', { exact: true })).toBeVisible();
  await expect(page.getByText('Career', { exact: true })).toBeVisible();
  await expect(page.getByText('Wellness', { exact: true })).toBeVisible();
  await expect(page.getByText('Lucky colors:')).toBeVisible();
});
