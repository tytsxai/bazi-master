import { test, expect } from '@playwright/test';
import path from 'path';

const buildScreenshotPath = (name) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(process.cwd(), 'verification', `${stamp}-${name}.png`);
};

test('[J] Data cleanup: I Ching time divination from /history matches backend data', async ({ page }) => {
  test.setTimeout(60_000);
  const consoleErrors = [];

  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
  });

  await page.goto('/');
  const email = 'test@example.com';
  const password = 'password123';
  let loginResponse = await page.request.post('/api/auth/login', {
    data: { email, password },
  });
  if (!loginResponse.ok()) {
    await page.request.post('/api/auth/register', {
      data: { email, password, name: 'Test User' },
    });
    loginResponse = await page.request.post('/api/auth/login', {
      data: { email, password },
    });
  }
  expect(loginResponse.ok()).toBeTruthy();
  const loginData = await loginResponse.json();
  await page.evaluate(({ token, user }) => {
    localStorage.setItem('bazi_token', token);
    localStorage.setItem('bazi_token_origin', 'backend');
    localStorage.setItem('bazi_user', JSON.stringify(user));
    localStorage.setItem('bazi_last_activity', String(Date.now()));
    localStorage.removeItem('bazi_session_expired');
  }, { token: loginData.token, user: loginData.user });

  await page.goto('/history');
  await expect(page.getByRole('heading', { name: 'History', exact: true })).toBeVisible();
  await page.screenshot({ path: buildScreenshotPath('data-cleanup-history-step-1') });

  const responsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/iching/divine') && resp.request().method() === 'POST'
  );

  await page.getByRole('button', { name: 'Reveal Time Hexagram' }).click();
  const response = await responsePromise;
  expect(response.ok()).toBeTruthy();
  const data = await response.json();

  await expect(page.getByTestId('iching-time-hexagram-name')).toHaveText(data.hexagram.name);
  await expect(page.getByTestId('iching-time-resulting-name')).toHaveText(
    data.resultingHexagram?.name || '—'
  );

  const changingLines = data.changingLines?.length ? data.changingLines.join(', ') : 'None';
  await expect(page.getByTestId('iching-time-changing-lines')).toHaveText(changingLines);

  if (data.timeContext?.iso) {
    await expect(page.getByTestId('iching-time-iso')).toHaveText(data.timeContext.iso);
  }

  await page.screenshot({ path: buildScreenshotPath('data-cleanup-history-step-2-iching-time') });

  expect(consoleErrors).toEqual([]);
});
