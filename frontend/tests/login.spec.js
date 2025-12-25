import { test, expect } from '@playwright/test';

test('User can log in and redirect to profile', async ({ page }) => {
    // 1. Go to Login page
    await page.goto('/login');

    // 2. Fill credentials
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password123');

    // 3. Click Login
    await page.click('button[type="submit"]');

    // 4. Verification
    // Should redirect to /profile
    await expect(page).toHaveURL(/\/profile/);

    // Profile should show the user's name
    // Note: Our real API login returns name="Test User" for "test@example.com"
    await expect(page.locator('body')).toContainText('Test User');
});
