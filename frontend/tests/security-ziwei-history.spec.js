import { test, expect } from './fixtures.js';
import path from 'path';

const buildScreenshotPath = (name) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(process.cwd(), '..', 'verification', `${stamp}-${name}.png`);
};

test('Security: Ziwei history flow from /ziwei matches backend data and supports delete', async ({
  page,
}) => {
  const consoleErrors = [];

  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  const runId = Date.now();
  const birthDay = (runId % 27) + 1;
  const birthHour = runId % 23;
  const birthYear = 1991;
  const birthMonth = 7;
  const birthKey = `${birthYear}-${birthMonth}-${birthDay}-${birthHour}`;

  await page.addInitScript(() => {
    const key = '__e2e_ziwei_history_bootstrap__';
    localStorage.setItem('locale', 'en-US');
    if (localStorage.getItem(key) !== '1') {
      localStorage.setItem(key, '1');
      localStorage.removeItem('bazi_token');
      localStorage.removeItem('bazi_user');
      localStorage.removeItem('bazi_last_activity');
      localStorage.removeItem('bazi_session_expired');
    }
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });

  let loginResponse = await page.request.post('/api/auth/login', {
    data: { email: 'test@example.com', password: 'password123' },
  });
  if (!loginResponse.ok()) {
    await page.request.post('/api/auth/register', {
      data: { email: 'test@example.com', password: 'password123', name: 'Test User' },
    });
    loginResponse = await page.request.post('/api/auth/login', {
      data: { email: 'test@example.com', password: 'password123' },
    });
  }
  expect(loginResponse.ok()).toBeTruthy();
  const loginData = await loginResponse.json();

  await page.evaluate(
    ({ token, user }) => {
      localStorage.setItem('bazi_token', token);
      localStorage.setItem('bazi_token_origin', 'backend');
      localStorage.setItem('bazi_user', JSON.stringify(user));
      localStorage.setItem('bazi_last_activity', String(Date.now()));
      localStorage.removeItem('bazi_session_expired');
    },
    { token: loginData.token, user: loginData.user }
  );

  await page.goto('/ziwei', { waitUntil: 'domcontentloaded' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: /Logout/i })).toBeVisible();
  await page.screenshot({ path: buildScreenshotPath('security-ziwei-history-step-1') });

  await page.getByLabel('Birth Year').fill(String(birthYear));
  await page.getByLabel('Birth Month').fill(String(birthMonth));
  await page.getByLabel('Birth Day').fill(String(birthDay));
  await page.getByLabel('Birth Hour').selectOption(String(birthHour));
  await page.locator('#gender').selectOption('female');

  const calculateResponsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/ziwei/calculate') && resp.request().method() === 'POST'
  );
  await page.getByRole('button', { name: /Generate Zi Wei Chart|生成紫微命盘/i }).click();
  const calculateResponse = await calculateResponsePromise;
  expect(calculateResponse.ok()).toBeTruthy();

  const resultCard = page.getByTestId('ziwei-result');
  await expect(resultCard).toBeVisible();
  await page.screenshot({ path: buildScreenshotPath('security-ziwei-history-step-2') });

  const saveResponsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/ziwei/history') && resp.request().method() === 'POST'
  );
  await page.getByRole('button', { name: /Save to History/i }).click();
  const saveResponse = await saveResponsePromise;
  expect(saveResponse.ok()).toBeTruthy();
  const saveData = await saveResponse.json();
  const record = saveData?.record;
  expect(record?.id).toBeTruthy();

  const recordSelector = `[data-testid="ziwei-history-card"][data-record-id="${record.id}"]`;
  const recordCard = page.locator(recordSelector);
  await expect(recordCard).toBeVisible();
  await expect(recordCard).toHaveAttribute('data-birth', birthKey);
  await expect(recordCard).toHaveAttribute('data-gender', 'female');

  await page.screenshot({ path: buildScreenshotPath('security-ziwei-history-step-3') });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: /Logout/i })).toBeVisible();
  const persistedCard = page.locator(recordSelector);
  await expect(persistedCard).toBeVisible();
  await page.screenshot({ path: buildScreenshotPath('security-ziwei-history-step-4') });

  const deleteButton = persistedCard.getByTestId('ziwei-history-delete');
  await deleteButton.click();
  const deleteResponsePromise = page.waitForResponse(
    (resp) =>
      resp.url().includes(`/api/ziwei/history/${record.id}`) && resp.request().method() === 'DELETE'
  );
  const deleteDialog = page.getByRole('dialog', { name: /Delete this Zi Wei chart/i });
  await deleteDialog.getByRole('button', { name: /^Delete$/i }).click();
  const deleteResponse = await deleteResponsePromise;
  expect(deleteResponse.ok()).toBeTruthy();

  await expect(page.locator(recordSelector)).toHaveCount(0);
  await page.screenshot({ path: buildScreenshotPath('security-ziwei-history-step-5') });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator(recordSelector)).toHaveCount(0);

  expect(consoleErrors).toEqual([]);
});
