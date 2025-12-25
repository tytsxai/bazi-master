import { test, expect } from '@playwright/test';
import path from 'path';

test('Guest cannot access /profile and is redirected to /login', async ({ page }) => {
  const screenshotPath = (name) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return path.join(process.cwd(), '..', 'verification', `${stamp}-guest-profile-${name}.png`);
  };

  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('locale', 'en-US');
  });

  await page.goto('/profile');
  await expect(page).toHaveURL(/\/login/);

  const currentUrl = new URL(page.url());
  expect(currentUrl.searchParams.get('next')).toBe('/profile');
  await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
  await page.screenshot({ path: screenshotPath('redirected') });
});
