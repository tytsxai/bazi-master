import { test, expect } from './fixtures.js';

const loginWithSession = async (page, { email, password, name }) => {
  let loginResponse = await page.request.post('/api/auth/login', {
    data: { email, password },
  });
  if (!loginResponse.ok()) {
    await page.request.post('/api/auth/register', {
      data: { email, password, name },
    });
    loginResponse = await page.request.post('/api/auth/login', {
      data: { email, password },
    });
  }
  expect(loginResponse.ok()).toBeTruthy();
  return loginResponse.json();
};

test('Non-admin user is redirected to 403 when accessing admin area', async ({ page }) => {
  const screenshotPath = (name) => `verification/admin-access-non-admin-${name}.png`;
  const session = await loginWithSession(page, {
    email: `user-${Date.now()}@example.com`,
    password: 'password123',
    name: 'Regular User',
  });

  await page.addInitScript(({ token, user }) => {
    localStorage.setItem('locale', 'en-US');
    localStorage.setItem('bazi_token', token);
    localStorage.setItem('bazi_token_origin', 'backend');
    localStorage.setItem('bazi_user', JSON.stringify(user));
    localStorage.setItem('bazi_last_activity', String(Date.now()));
  }, session);

  await page.goto('/admin', { waitUntil: 'domcontentloaded' });
  await page.screenshot({ path: screenshotPath('step-1-admin-redirect') });

  await expect(page).toHaveURL(/\/403$/);
  await expect(page.getByRole('heading', { name: '403 - Forbidden' })).toBeVisible();
  await page.screenshot({ path: screenshotPath('step-2-403-visible') });
});

test('Admin user can access admin area', async ({ page }) => {
  const screenshotPath = (name) => `verification/admin-access-admin-${name}.png`;
  const session = await loginWithSession(page, {
    email: 'test@example.com',
    password: 'password123',
    name: 'Admin User',
  });

  await page.addInitScript(({ token, user }) => {
    localStorage.setItem('locale', 'en-US');
    localStorage.setItem('bazi_token', token);
    localStorage.setItem('bazi_token_origin', 'backend');
    localStorage.setItem('bazi_user', JSON.stringify(user));
    localStorage.setItem('bazi_last_activity', String(Date.now()));
  }, session);

  await page.goto('/admin', { waitUntil: 'domcontentloaded' });
  await page.screenshot({ path: screenshotPath('step-1-admin-page') });

  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Admin Area' })).toBeVisible();
  await page.screenshot({ path: screenshotPath('step-2-admin-heading') });
});
