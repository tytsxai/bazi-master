import { test, expect } from '@playwright/test';

const SESSION_IDLE_MS = 30 * 60 * 1000;

test('Session expires after inactivity and forces re-login', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
  });

  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    const token = `token_1_${Date.now()}`;
    localStorage.setItem('bazi_token', token);
    localStorage.setItem('bazi_user', JSON.stringify({
      id: 1,
      email: 'test@example.com',
      name: 'Test User',
    }));
    localStorage.setItem('bazi_last_activity', String(Date.now()));
  });

  await page.goto('/profile', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/profile/);

  await page.evaluate((idleMs) => {
    const past = Date.now() - idleMs - 1000;
    localStorage.setItem('bazi_last_activity', String(past));
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
  }, SESSION_IDLE_MS);

  await expect(page).toHaveURL(/\/login\?reason=session_expired/, { timeout: 10000 });
  await expect(
    page.getByText('Your session expired. Please sign in again to continue.')
  ).toBeVisible();

  const token = await page.evaluate(() => localStorage.getItem('bazi_token'));
  expect(token).toBeNull();
});
