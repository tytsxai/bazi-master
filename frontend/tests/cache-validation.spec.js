import { test, expect } from './fixtures.js';

test('Cache validation flow for Redis session and calculation cache', async ({
  page,
}, testInfo) => {
  const uniqueLocation = `CACHE_LOCATION_${Date.now()}`;
  const runId = Date.now();
  const uniqueBirthYear = 1900 + (runId % 100);
  const uniqueBirthMonth = 1 + (Math.floor(runId / 100) % 12);
  const uniqueBirthDay = 1 + (Math.floor(runId / 1000) % 28);
  const uniqueBirthHour = Math.floor(runId / 10000) % 24;
  const snap = async (label) => {
    await page.screenshot({
      path: testInfo.outputPath(`cache-validation-${runId}-${label}.png`),
      fullPage: true,
    });
  };

  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
  });

  await page.goto('/');
  await snap('01-home');

  const email = 'test@example.com';
  const password = 'password123';
  let loginResponse = await page.request.post('/api/auth/login', {
    data: { email, password },
  });
  if (!loginResponse.ok()) {
    await page.request.post('/api/auth/register', {
      data: { email, password, name: 'Test User' },
    });
    loginResponse = await page.request.post('/api/auth/login', {
      data: { email, password },
    });
  }
  expect(loginResponse.ok()).toBeTruthy();
  const loginData = await loginResponse.json();

  await page.addInitScript(
    ({ token, user }) => {
      localStorage.setItem('bazi_token', token);
      localStorage.setItem('bazi_token_origin', 'backend');
      localStorage.setItem('bazi_user', JSON.stringify(user));
      localStorage.setItem('bazi_last_activity', String(Date.now()));
      localStorage.removeItem('bazi_session_expired');
    },
    { token: loginData.token, user: loginData.user }
  );

  await page.goto('/profile', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('header-user-name')).toBeVisible();
  await snap('03-profile');

  const token = loginData.token;
  const cacheStatusResponse = await page.request.get('/api/system/cache-status', {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(cacheStatusResponse.ok()).toBeTruthy();
  const cacheStatus = await cacheStatusResponse.json();
  expect(cacheStatus.redis?.ok).toBeTruthy();
  if (cacheStatus.redis?.status !== 'disabled') {
    expect(cacheStatus.sessionCache?.mirror).toBeTruthy();
    expect(cacheStatus.baziCache?.mirror).toBeTruthy();
  }

  await page.goto('/bazi');
  await snap('04-bazi');

  await page.getByLabel('Birth Year').fill(String(uniqueBirthYear));
  await page.getByLabel('Birth Month').fill(String(uniqueBirthMonth));
  await page.getByLabel('Birth Day').fill(String(uniqueBirthDay));
  await page.getByLabel('Birth Hour (0-23)').fill(String(uniqueBirthHour));
  await page.locator('#gender').selectOption('male');
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

  const saveResponsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/bazi/records') && resp.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Save to History' }).click();
  const saveResponse = await saveResponsePromise;
  expect(saveResponse.ok() || saveResponse.status() === 409).toBeTruthy();

  const favoriteResponsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/favorites') && resp.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Add to Favorites' }).click();
  const favoriteResponse = await favoriteResponsePromise;
  expect(favoriteResponse.ok() || favoriteResponse.status() === 409).toBeTruthy();
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
