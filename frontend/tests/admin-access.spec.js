import { test, expect } from '@playwright/test';

test('Non-admin user is redirected to 403 when accessing admin area', async ({ page }) => {
  const screenshotPath = (name) => `verification/admin-access-non-admin-${name}.png`;

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
  await page.screenshot({ path: screenshotPath('step-1-admin-redirect') });

  await expect(page).toHaveURL(/\/403$/);
  await expect(page.getByRole('heading', { name: '403 - Forbidden' })).toBeVisible();
  await page.screenshot({ path: screenshotPath('step-2-403-visible') });
});

test('Admin user can access admin area', async ({ page }) => {
  const screenshotPath = (name) => `verification/admin-access-admin-${name}.png`;

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
  await page.screenshot({ path: screenshotPath('step-1-admin-page') });

  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Admin' })).toBeVisible();
  await page.screenshot({ path: screenshotPath('step-2-admin-heading') });
});
