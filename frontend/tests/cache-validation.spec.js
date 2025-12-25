import { test, expect } from '@playwright/test';

test('Cache validation flow for Redis session and calculation cache', async ({ page }) => {
  const uniqueLocation = `CACHE_LOCATION_${Date.now()}`;
  const runId = Date.now();
  const uniqueBirthYear = 1900 + (runId % 100);
  const uniqueBirthMonth = 1 + (Math.floor(runId / 100) % 12);
  const uniqueBirthDay = 1 + (Math.floor(runId / 1000) % 28);
  const uniqueBirthHour = Math.floor(runId / 10000) % 24;
  const snap = async (label) => {
    await page.screenshot({ path: `../verification/cache-validation-${runId}-${label}.png`, fullPage: true });
  };

  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
  });

  await page.goto('/');
  await snap('01-home');

  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await snap('02-login');
  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/profile/);
  await expect(page.getByTestId('header-user-name')).toBeVisible();
  await snap('03-profile');

  const token = await page.evaluate(() => localStorage.getItem('bazi_token'));
  const cacheStatusResponse = await page.request.get('/api/system/cache-status', {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(cacheStatusResponse.ok()).toBeTruthy();
  const cacheStatus = await cacheStatusResponse.json();
  expect(cacheStatus.redis?.ok).toBeTruthy();
  expect(cacheStatus.sessionCache?.mirror).toBeTruthy();
  expect(cacheStatus.baziCache?.mirror).toBeTruthy();

  await page.goto('/bazi');
  await snap('04-bazi');

  await page.getByLabel('Birth Year').fill(String(uniqueBirthYear));
  await page.getByLabel('Birth Month').fill(String(uniqueBirthMonth));
  await page.getByLabel('Birth Day').fill(String(uniqueBirthDay));
  await page.getByLabel('Birth Hour (0-23)').fill(String(uniqueBirthHour));
  await page.getByLabel('Gender').selectOption('male');
  await page.getByLabel('Birth Location').fill(uniqueLocation);
  await page.getByLabel('Timezone').fill('UTC+8');
  await snap('05-inputs');

  const calcResponsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/bazi/calculate') && resp.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Calculate' }).click();
  const calcResponse = await calcResponsePromise;
  expect(calcResponse.ok()).toBeTruthy();
  expect(calcResponse.headers()['x-bazi-cache']).toBe('miss');

  await expect(page.getByRole('heading', { name: 'Four Pillars' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Five Elements' })).toBeVisible();
  await snap('06-basic-results');

  const calcResponsePromise2 = page.waitForResponse(
    (resp) => resp.url().includes('/api/bazi/calculate') && resp.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Calculate' }).click();
  const calcResponse2 = await calcResponsePromise2;
  expect(calcResponse2.ok()).toBeTruthy();
  expect(calcResponse2.headers()['x-bazi-cache']).toBe('hit');

  const fullResponsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/bazi/full-analysis') && resp.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Request Full Analysis' }).click();
  const fullResponse = await fullResponsePromise;
  expect(fullResponse.ok()).toBeTruthy();

  await expect(page.getByRole('heading', { name: 'Ten Gods' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Major Luck Cycles' })).toBeVisible();
  await snap('07-full-analysis');

  await page.getByRole('button', { name: 'Save to History' }).click();
  await expect(page.getByText('Record saved to history.')).toBeVisible();
  await page.getByRole('button', { name: 'Add to Favorites' }).click();
  await expect(page.getByText('Added to favorites.')).toBeVisible();
  await snap('08-saved');

  await page.goto('/history');
  await expect(page.getByText(uniqueLocation)).toBeVisible();
  await snap('09-history');

  await page.goto('/favorites');
  await expect(page.getByText(uniqueLocation)).toBeVisible();
  await snap('10-favorites');

  await page.getByRole('button', { name: 'Logout' }).click();
  await expect(page).toHaveURL(/\/login/);
  await snap('11-logout');
});
