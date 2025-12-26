import { test, expect } from './fixtures.js';

test('Home card navigates to Zodiac page', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('home-module-zodiac').click();
  await expect(page).toHaveURL(/\/zodiac/);
  await expect(page.getByRole('heading', { name: /Zodiac Chronicles/i })).toBeVisible();
});
