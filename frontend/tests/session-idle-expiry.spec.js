import { test, expect } from './fixtures.js';
import path from 'node:path';

const SESSION_IDLE_MS = 30 * 60 * 1000;
const screenshotPath = (name) => {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return path.join(process.cwd(), '..', 'verification', `${stamp}-session-idle-${name}.png`);
};

test('Session expires after inactivity and forces re-login', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
  });

  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/profile/);
  await page.screenshot({ path: screenshotPath('step-1-profile') });

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
  await page.screenshot({ path: screenshotPath('step-2-session-expired') });

  const token = await page.evaluate(() => localStorage.getItem('bazi_token'));
  expect(token).toBeNull();
});
