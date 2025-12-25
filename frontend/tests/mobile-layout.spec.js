import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 375, height: 667 } });

test('Mobile layout and navigation', async ({ page }) => {
  await page.goto('/');

  // Check if hamburger button is visible
  const menuBtn = page.locator('.mobile-menu-btn');
  await expect(menuBtn).toBeVisible();

  // Check if navigation links are initially hidden (Desktop hidden, Mobile closed)
  // We use 'BaZi' as a representative link.
  // Note: We need to ensure we are checking visibility.
  // Since desktop nav is 'hidden' (display: none), it is hidden.
  // Mobile nav is not rendered yet.
  const baziLink = page.getByRole('link', { name: 'BaZi', exact: true });
  await expect(baziLink).toBeHidden();

  // Open menu
  await menuBtn.click();

  // Check if mobile menu opens and link becomes visible
  const mobileNav = page.locator('.mobile-nav');
  await expect(mobileNav).toBeVisible();
  await expect(mobileNav.getByRole('link', { name: 'BaZi', exact: true })).toBeVisible();
  
  // Close menu
  await menuBtn.click();
  await expect(mobileNav).toBeHidden();
});