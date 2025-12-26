import { test, expect } from './fixtures.js';
import path from 'path';

const screenshotPath = (name) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(process.cwd(), '..', 'verification', `${stamp}-${name}.png`);
};

test('Security: Role-based menu items hidden for guests', async ({ page }) => {
  const consoleErrors = [];

  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.screenshot({ path: screenshotPath('security-guest-menu-desktop-home') });

  const header = page.locator('header');
  await expect(header.getByRole('link', { name: /Login|登录/ })).toBeVisible();

  await expect(header.getByRole('link', { name: /Profile|个人资料/ })).toHaveCount(0);
  await expect(header.getByRole('link', { name: /History|历史/ })).toHaveCount(0);
  await expect(header.getByRole('link', { name: /Favorites|收藏/ })).toHaveCount(0);
  await expect(header.getByRole('link', { name: /Zi\s*Wei|紫微/ })).toHaveCount(0);

  await expect(page.locator('[data-testid="home-module-ziwei"]')).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: /Toggle Menu/i }).click();
  await page.screenshot({ path: screenshotPath('security-guest-menu-mobile-open') });

  const mobileNav = page.locator('.mobile-nav');
  await expect(mobileNav).toBeVisible();
  await expect(mobileNav.getByRole('link', { name: /Login|登录/ })).toBeVisible();
  await expect(mobileNav.getByRole('link', { name: /Profile|个人资料/ })).toHaveCount(0);
  await expect(mobileNav.getByRole('link', { name: /History|历史/ })).toHaveCount(0);
  await expect(mobileNav.getByRole('link', { name: /Favorites|收藏/ })).toHaveCount(0);
  await expect(mobileNav.getByRole('link', { name: /Zi\s*Wei|紫微/ })).toHaveCount(0);

  expect(consoleErrors).toEqual([]);
});
