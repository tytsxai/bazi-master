import { test, expect } from '@playwright/test';
import path from 'path';

const buildScreenshotPath = (name) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(process.cwd(), '..', 'verification', `${stamp}-${name}.png`);
};

const buildLunarText = (lunar) => {
  if (!lunar) return '';
  const leapSuffix = lunar.isLeap ? ' (Leap)' : '';
  return `${lunar.year}年 ${lunar.month}月 ${lunar.day}日${leapSuffix}`;
};

const buildPalaceText = (label, palace) =>
  `${label}: ${palace?.palace?.cn || palace?.palace?.name || ''} · ${palace?.branch?.name || ''}`;

test('Security: Ziwei V2 quick chart from /profile matches backend data', async ({ page }) => {
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

  await page.goto('/profile');
  await expect(page).toHaveURL(/\/login/);

  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'password123');
  const loginResponsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/login') && resp.request().method() === 'POST'
  );
  await page.click('button[type="submit"]');
  const loginResponse = await loginResponsePromise;
  expect(loginResponse.ok()).toBeTruthy();
  await expect(page).toHaveURL(/\/profile/, { timeout: 15000 });
  await page.screenshot({ path: buildScreenshotPath('security-ziwei-profile-step-1') });

  const token = await page.evaluate(() => localStorage.getItem('bazi_token'));
  expect(token).toBeTruthy();

  const recordPayload = {
    birthYear: 1991,
    birthMonth: 8,
    birthDay: 21,
    birthHour: 14,
    gender: 'female',
    birthLocation: 'SECURITY_PROFILE',
    timezone: 'UTC+8',
  };

  const recordResponse = await page.request.post('/api/bazi/records', {
    data: recordPayload,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  expect(recordResponse.ok()).toBeTruthy();

  await page.reload();
  await expect(page.getByText('Zi Wei (V2) quick chart')).toBeVisible();

  const responsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/ziwei/calculate') && resp.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Generate Zi Wei Chart' }).click();
  const response = await responsePromise;
  expect(response.ok()).toBeTruthy();
  const data = await response.json();

  const resultCard = page.getByTestId('profile-ziwei-result');
  await expect(page.getByTestId('profile-ziwei-status')).toContainText('Zi Wei chart generated');
  await expect(resultCard).toContainText(buildLunarText(data.lunar));
  await expect(resultCard).toContainText(buildPalaceText('命宫', data.mingPalace));
  await expect(resultCard).toContainText(buildPalaceText('身宫', data.shenPalace));

  const birthIsoText = data.birthIso || '—';
  await expect(resultCard).toContainText(birthIsoText);

  const offsetText = Number.isFinite(data.timezoneOffsetMinutes)
    ? `UTC offset: ${data.timezoneOffsetMinutes} mins`
    : 'UTC offset: —';
  await expect(resultCard).toContainText(offsetText);

  await page.screenshot({ path: buildScreenshotPath('security-ziwei-profile-step-2') });

  expect(consoleErrors).toEqual([]);
});
