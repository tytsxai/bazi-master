import { test, expect } from './fixtures.js';
import path from 'path';

const screenshotPath = (name) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(process.cwd(), '..', 'verification', `${stamp}-${name}.png`);
};

const registerUser = async (page, { name, email, password }) => {
  await page.goto('/register');
  await page.getByLabel('Display name (optional)').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password').fill(password);

  const registerResponsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/auth/register') && resp.request().method() === 'POST'
  );
  await page.getByRole('button', { name: /Create account/i }).click();
  const registerResponse = await registerResponsePromise;
  expect(registerResponse.ok()).toBeTruthy();
  await expect(page).toHaveURL(/\/profile/);
};

const createBaziRecord = async (page, uniqueLocation) => {
  await page.goto('/bazi');
  await page.getByLabel('Birth Year').fill('1991');
  await page.getByLabel('Birth Month').fill('11');
  await page.getByLabel('Birth Day').fill('9');
  await page.getByLabel('Birth Hour (0-23)').fill('9');
  await page.locator('#gender').selectOption('male');
  await page.getByLabel('Birth Location').fill(uniqueLocation);
  await page.getByLabel('Timezone').fill('UTC+8');

  const calcResponsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/bazi/calculate') && resp.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Calculate' }).click();
  const calcResponse = await calcResponsePromise;
  expect(calcResponse.ok()).toBeTruthy();

  await expect(page.getByRole('heading', { name: 'Four Pillars' })).toBeVisible();

  const saveResponsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/bazi/records') && resp.request().method() === 'POST'
  );
  await page.getByTestId('bazi-save-record').click();
  const saveResponse = await saveResponsePromise;
  expect(saveResponse.ok()).toBeTruthy();
};

test('Security: direct URL access to another user record is blocked', async ({ page, request }) => {
  const consoleErrors = [];

  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const message = msg.text();
    if (/Failed to load resource: the server responded with a status of 404/i.test(message)) {
      return;
    }
    consoleErrors.push(message);
  });

  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
  });

  const now = Date.now();
  const userA = {
    name: `Access Owner ${now}`,
    email: `access_owner_${now}@example.com`,
    password: 'Pass1234',
  };
  const userB = {
    name: `Access Other ${now}`,
    email: `access_other_${now}@example.com`,
    password: 'Pass1234',
  };
  const uniqueLocation = `ACCESS_RECORD_${now}`;

  await registerUser(page, userA);
  await page.screenshot({
    path: screenshotPath('security-record-access-step-1-registered-user-a'),
  });

  await createBaziRecord(page, uniqueLocation);
  await page.screenshot({ path: screenshotPath('security-record-access-step-2-bazi-saved') });

  await page.goto('/history');
  await expect(page.getByRole('heading', { name: /History|历史/ })).toBeVisible();
  await page.screenshot({ path: screenshotPath('security-record-access-step-3-history') });

  const firstRecordCard = page.getByTestId('history-record-card').first();
  await expect(firstRecordCard).toBeVisible();
  const recordId = await firstRecordCard.getAttribute('data-record-id');
  expect(recordId).toBeTruthy();

  await page.getByRole('button', { name: /Logout|退出/ }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.screenshot({ path: screenshotPath('security-record-access-step-4-logout') });

  await registerUser(page, userB);
  await page.screenshot({
    path: screenshotPath('security-record-access-step-5-registered-user-b'),
  });

  await page.goto(`/history/${recordId}`);
  await expect(page.getByText('Record not found.', { exact: true })).toBeVisible();
  await expect(page.getByTestId('bazi-record-details')).toHaveCount(0);
  await page.screenshot({ path: screenshotPath('security-record-access-step-6-blocked') });

  const token = await page.evaluate(() => localStorage.getItem('bazi_token'));
  expect(token).toBeTruthy();
  const apiResponse = await request.get(`/api/bazi/records/${recordId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(apiResponse.status()).toBe(404);

  expect(consoleErrors).toEqual([]);
});
