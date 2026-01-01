import { test, expect } from './fixtures.js';
import path from 'path';

const screenshotPath = (name) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(process.cwd(), '..', 'verification', `${stamp}-${name}.png`);
};

const resolvePort = (value) => {
  const parsed = Number(value);
  const port = Number.isFinite(parsed) ? Math.trunc(parsed) : NaN;
  return Number.isFinite(port) && port > 0 ? port : null;
};

const backendPort = resolvePort(process.env.E2E_API_PORT) ?? resolvePort(process.env.BACKEND_PORT);
const apiBase =
  process.env.PW_API_BASE ||
  (backendPort ? `http://127.0.0.1:${backendPort}` : 'http://127.0.0.1:4000');

test('Auth: WeChat OAuth dev flow redirects to profile', async ({ page, request }) => {
  const consoleErrors = [];

  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
    localStorage.removeItem('bazi_token');
    localStorage.removeItem('bazi_user');
    localStorage.removeItem('bazi_last_activity');
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.screenshot({ path: screenshotPath('oauth-wechat-dev-step-1-home') });

  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: /Continue with WeChat/i })).toBeVisible();
  await page.screenshot({ path: screenshotPath('oauth-wechat-dev-step-2-login') });

  await page.getByRole('button', { name: /Continue with WeChat/i }).click();

  // Should redirect to profile via dev oauth flow
  await page.waitForURL(/\/profile/, { timeout: 15000 });
  await page.screenshot({ path: screenshotPath('oauth-wechat-dev-step-3-profile') });

  const token = await page.evaluate(() => localStorage.getItem('bazi_token'));
  expect(token).toBeTruthy();

  const meRes = await request.get(`${apiBase}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(meRes.ok()).toBeTruthy();
  const meData = await meRes.json();
  expect(meData.user.email).toContain('wechat');

  expect(consoleErrors).toEqual([]);
});
