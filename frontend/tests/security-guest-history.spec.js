import { test, expect } from '@playwright/test';

test('Guest is redirected to login when visiting history', async ({ page }) => {
  const screenshotPath = (name) => `verification/security-guest-history-${name}.png`;

  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('locale', 'en-US');
  });

  await page.goto('/history');
  await page.screenshot({ path: screenshotPath('step-1-history-redirect') });

  await expect(page).toHaveURL(/\/login(\?|$)/);
  await expect(page).toHaveURL(/next=%2Fhistory/);
  await expect(page.getByLabel('Email')).toBeVisible();
  await page.screenshot({ path: screenshotPath('step-2-login-visible') });
});
