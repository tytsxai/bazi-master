import { test, expect } from './fixtures.js';

const screenshotPath = (name) => `verification/security-register-iching-${name}.png`;

test('Register flow from I Ching redirects back and matches backend user data', async ({
  page,
  request,
}) => {
  const testId = `iching_register_${Date.now()}`;
  const name = `IChing User ${testId}`;
  const email = `${testId}@example.com`;
  const password = 'Passw0rd!';

  await page.addInitScript(() => {
    localStorage.removeItem('bazi_token');
    localStorage.removeItem('bazi_user');
    localStorage.removeItem('bazi_last_activity');
    localStorage.removeItem('bazi_token_origin');
  });

  await page.goto('/iching');
  await page.screenshot({ path: screenshotPath('step-1-iching-guest') });

  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/register/);
  const registerUrl = new URL(page.url());
  expect(registerUrl.searchParams.get('next')).toBe('/iching');
  await page.screenshot({ path: screenshotPath('step-2-register-page') });

  await page.fill('#register-name', name);
  await page.fill('#register-email', email);
  await page.fill('#register-password', password);
  await page.fill('#register-confirm', password);
  await page.getByRole('button', { name: /create account/i }).click();

  await expect(page).toHaveURL(/\/iching/);
  await page.screenshot({ path: screenshotPath('step-3-iching-registered') });

  const token = await page.evaluate(() => localStorage.getItem('bazi_token'));
  expect(token).toBeTruthy();

  const meResponse = await request.get('/api/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(meResponse.ok()).toBeTruthy();
  const meData = await meResponse.json();
  expect(meData.user?.email).toBe(email);
  expect(meData.user?.name).toBe(name);

  await expect(page.getByTestId('header-user-name')).toHaveText(name);
});
