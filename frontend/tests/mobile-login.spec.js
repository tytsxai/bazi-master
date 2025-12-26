import { test, expect } from './fixtures.js';

test.use({ viewport: { width: 390, height: 844 } });

test('Mobile login flow keeps responsive navigation working', async ({ page }) => {
  await page.goto('/login');

  const menuButton = page.getByRole('button', { name: 'Toggle Menu' });
  await expect(menuButton).toBeVisible();

  await menuButton.click();
  const mobileNav = page.locator('.mobile-nav');
  await expect(mobileNav).toBeVisible();
  await expect(mobileNav.locator('a[href="/login"]')).toBeVisible();

  await menuButton.click();
  await expect(mobileNav).toBeHidden();

  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');

  await expect(page).toHaveURL(/\/profile/);
  await expect(page.locator('body')).toContainText('Test User');

  await menuButton.click();
  await expect(mobileNav).toBeVisible();
  await expect(mobileNav.getByRole('button', { name: /Test User/ })).toBeVisible();
});
