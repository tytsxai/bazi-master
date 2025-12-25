import { test, expect } from '@playwright/test';

test('Non-admin user is redirected to 403 when accessing admin area', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
    localStorage.setItem('bazi_token', 'token_user_123');
    localStorage.setItem(
      'bazi_user',
      JSON.stringify({ id: 123, email: 'user@example.com', name: 'Regular User', isAdmin: false })
    );
    localStorage.setItem('bazi_last_activity', String(Date.now()));
  });

  await page.goto('/admin', { waitUntil: 'domcontentloaded' });

  await expect(page).toHaveURL(/\/403$/);
  await expect(page.getByRole('heading', { name: '403 - Forbidden' })).toBeVisible();
});

test('Admin user can access admin area', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
    localStorage.setItem('bazi_token', 'token_admin_456');
    localStorage.setItem(
      'bazi_user',
      JSON.stringify({ id: 456, email: 'admin@example.com', name: 'Admin User', isAdmin: true })
    );
    localStorage.setItem('bazi_last_activity', String(Date.now()));
  });

  await page.goto('/admin', { waitUntil: 'domcontentloaded' });

  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Admin' })).toBeVisible();
});
