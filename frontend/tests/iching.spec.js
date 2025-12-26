import { test, expect } from '@playwright/test';

test('I Ching divination flow with AI interpretation and history save', async ({ page }) => {
  const uniqueQuestion = `E2E_ICHING_${Date.now()}`;
  const runId = Date.now();
  const snap = async (label) => {
    await page.screenshot({ path: `../verification/iching-flow-${runId}-${label}.png`, fullPage: true });
  };

  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
  });

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

  await page.goto('/iching', { waitUntil: 'domcontentloaded' });
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
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: /Logout/i })).toBeVisible();
  await snap('01-profile');

  await page.goto('/iching');
  await snap('02-iching');

  await page.getByLabel('First number').fill('12');
  await page.getByLabel('Second number').fill('27');
  await page.getByLabel('Third number').fill('44');
  await page.getByLabel('Your question (optional)').fill(uniqueQuestion);
  await snap('03-inputs');

  await page.getByRole('button', { name: 'Divine with Numbers' }).click();
  await expect(page.getByRole('heading', { name: 'Primary Hexagram' })).toBeVisible();
  await expect(page.getByText('Changing lines:')).toBeVisible();
  await snap('04-result');

  await page.getByRole('button', { name: 'Reveal AI Interpretation' }).click();
  await page.getByRole('button', { name: /Open AI|Request AI/ }).click();
  await expect(page.getByRole('heading', { name: 'Oracle Reflection' })).toBeVisible({ timeout: 60000 });
  await snap('05-ai');

  await page.getByRole('button', { name: 'Save to History' }).click();
  await expect(page.getByText('Reading saved to history.')).toBeVisible();
  await expect(page.getByText(uniqueQuestion)).toBeVisible();
  await snap('06-saved');
});
