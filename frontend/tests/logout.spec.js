import { test, expect } from '@playwright/test';

const screenshotPath = (name) => `verification/logout-clear-${name}.png`;

test('User can log out and return to login', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
  });

  await page.goto('/login');
  await page.screenshot({ path: screenshotPath('01-login') });
  await page.evaluate(() => {
    localStorage.removeItem('bazi_token');
    localStorage.removeItem('bazi_user');
    localStorage.removeItem('bazi_last_activity');
  });
  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/profile/);
  await page.screenshot({ path: screenshotPath('02-profile') });

  const logoutButton = page.getByRole('button', { name: /Logout|退出登录/ });
  if (!(await logoutButton.isVisible())) {
    await page.getByRole('button', { name: 'Toggle Menu' }).click();
  }
  await expect(logoutButton).toBeVisible();
  await page.evaluate(() => {
    localStorage.setItem('bazi_session_expired', '1');
    localStorage.setItem('bazi_retry_action', JSON.stringify({ action: 'bazi_save' }));
    localStorage.setItem('bazi_profile_name', 'Logout Test');
    localStorage.setItem('bazi_token_origin', 'backend');
    sessionStorage.setItem('bazi_temp', '1');
  });
  await logoutButton.click();
  await page.screenshot({ path: screenshotPath('03-logout') });

  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('heading', { name: /Welcome Back|欢迎回来/ })).toBeVisible();
  await page.screenshot({ path: screenshotPath('04-login-redirect') });

  const storageState = await page.evaluate(() => ({
    token: localStorage.getItem('bazi_token'),
    user: localStorage.getItem('bazi_user'),
    lastActivity: localStorage.getItem('bazi_last_activity'),
    sessionExpired: localStorage.getItem('bazi_session_expired'),
    retryAction: localStorage.getItem('bazi_retry_action'),
    profileName: localStorage.getItem('bazi_profile_name'),
    tokenOrigin: localStorage.getItem('bazi_token_origin'),
    sessionKeys: Object.keys(sessionStorage),
  }));

  await expect(storageState.token).toBeNull();
  await expect(storageState.user).toBeNull();
  await expect(storageState.lastActivity).toBeNull();
  await expect(storageState.sessionExpired).toBeNull();
  await expect(storageState.retryAction).toBeNull();
  await expect(storageState.profileName).toBeNull();
  await expect(storageState.tokenOrigin).toBeNull();
  await expect(storageState.sessionKeys.length).toBe(0);

  await page.goto('/profile');
  await expect(page).toHaveURL(/\/login/);
  await page.screenshot({ path: screenshotPath('05-profile-redirect') });
});
