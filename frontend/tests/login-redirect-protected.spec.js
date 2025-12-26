import { test, expect } from '@playwright/test';

test('Login preserves intended protected page after switching auth modes', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
    localStorage.removeItem('bazi_token');
    localStorage.removeItem('bazi_user');
    localStorage.removeItem('bazi_last_activity');
    localStorage.removeItem('bazi_session_expired');
  });

  await page.goto('/history');
  await expect(page).toHaveURL(/\/login(\?|$)/);

  const loginUrl = new URL(page.url());
  expect(loginUrl.searchParams.get('next')).toBe('/history');

  await page.getByRole('button', { name: /Create an account|Create account/i }).click();
  await expect(page).toHaveURL(/\/register(\?|$)/);

  const registerUrl = new URL(page.url());
  expect(registerUrl.searchParams.get('next')).toBe('/history');

  await page.getByRole('button', { name: /Back to login/i }).click();
  await expect(page).toHaveURL(/\/login(\?|$)/);

  const returnLoginUrl = new URL(page.url());
  expect(returnLoginUrl.searchParams.get('next')).toBe('/history');

  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');

  await expect(page).toHaveURL(/\/history/);
  await expect(page.getByRole('heading', { name: 'History', exact: true })).toBeVisible();
});
