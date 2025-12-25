import { test, expect } from '@playwright/test';

test('Guest is redirected to login when visiting history', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('locale', 'en-US');
  });

  await page.goto('/history');

  await expect(page).toHaveURL(/\/login(\?|$)/);
  await expect(page).toHaveURL(/next=%2Fhistory/);
  await expect(page.getByLabel('Email')).toBeVisible();
});
