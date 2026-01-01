import { test, expect } from './fixtures.js';

test('User can delete their own account', async ({ page }) => {
  const uniqueEmail = `delete_me_${Date.now()}@example.com`;
  const password = 'password123';

  // 1. Register
  await page.goto('/register');
  await page.fill('input[type="email"]', uniqueEmail);
  await page.fill('input[type="password"]', password);

  const registerResponsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/auth/register') && resp.request().method() === 'POST'
  );
  await page.click('button[type="submit"]');
  const registerResponse = await registerResponsePromise;

  if (!registerResponse.ok()) {
    console.log('Register Response Status:', registerResponse.status());
    console.log('Register Response Body:', await registerResponse.text());
  }

  // Check for any error messages
  const errorLocator = page.locator('[role="alert"]');
  if (await errorLocator.isVisible()) {
    console.log('Register Error:', await errorLocator.textContent());
  }

  // Wait for URL to be /profile or check for "Profile settings" heading
  await expect(page).toHaveURL(/\/profile/, { timeout: 10000 });
  await expect(page.getByRole('heading', { name: 'Profile settings' })).toBeVisible();

  // 2. Click Delete Account
  await page.getByRole('button', { name: 'Delete Account' }).click();

  // 3. Confirm
  const dialog = page.getByRole('dialog', { name: 'Delete your account?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Confirm Delete' }).click();

  // 4. Verify Redirect to Login
  await expect(page).toHaveURL(/\/login/);

  // 5. Verify Login Fails
  await page.fill('input[type="email"]', uniqueEmail);
  await page.fill('input[type="password"]', password);

  // Intercept login request to check for failure
  const loginResponsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/auth/login') && resp.request().method() === 'POST'
  );
  await page.click('button[type="submit"]');
  const loginResponse = await loginResponsePromise;

  expect(loginResponse.status()).toBe(401);
});
