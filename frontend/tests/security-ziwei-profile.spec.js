import { test, expect } from './fixtures.js';
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
    const key = '__e2e_prep_security_ziwei_profile__';
    localStorage.setItem('locale', 'en-US');
    if (localStorage.getItem(key) !== '1') {
      localStorage.setItem(key, '1');
      localStorage.removeItem('bazi_token');
      localStorage.removeItem('bazi_user');
      localStorage.removeItem('bazi_last_activity');
      localStorage.removeItem('bazi_session_expired');
    }
  });

  await page.goto('/profile');
  await expect(page).toHaveURL(/\/login/);

  const loginResponse = await page.request.post('/api/auth/login', {
    data: { email: 'test@example.com', password: 'password123' },
  });
  expect(loginResponse.ok()).toBeTruthy();
  const loginData = await loginResponse.json();
  const token = loginData?.token;
  expect(token).toBeTruthy();

  await page.evaluate(
    ({ tokenValue, userValue }) => {
      localStorage.setItem('bazi_token', tokenValue);
      localStorage.setItem('bazi_token_origin', 'backend');
      localStorage.setItem('bazi_user', JSON.stringify(userValue));
      localStorage.setItem('bazi_last_activity', String(Date.now()));
      localStorage.removeItem('bazi_session_expired');
    },
    { tokenValue: token, userValue: loginData?.user }
  );

  await page.goto('/profile', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/profile/, { timeout: 15000 });
  await page.screenshot({ path: buildScreenshotPath('security-ziwei-profile-step-1') });

  await expect.poll(async () => page.evaluate(() => localStorage.getItem('bazi_token')), {
    timeout: 5000,
  }).toBeTruthy();

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
  if (!recordResponse.ok()) {
    const bodyText = await recordResponse.text().catch(() => '');
    throw new Error(
      `Expected /api/bazi/records to succeed, got ${recordResponse.status()} ${bodyText}`
    );
  }

  await page.reload();
  await expect(page.getByText(/Zi Wei \(V2\) quick chart|紫微 \(V2\) 快速排盘/)).toBeVisible();

  const responsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/ziwei/calculate') && resp.request().method() === 'POST'
  );
  await page.getByRole('button', { name: /Generate Zi Wei Chart|生成紫微命盘/i }).click();
  const response = await responsePromise;
  expect(response.ok()).toBeTruthy();
  const data = await response.json();

  const resultCard = page.getByTestId('profile-ziwei-result');
  await expect(page.getByTestId('profile-ziwei-status')).toContainText(
    /Zi Wei chart generated|已根据你最近的八字记录生成紫微命盘/,
  );
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
