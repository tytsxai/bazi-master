import { test, expect } from './fixtures.js';
import path from 'path';

const buildScreenshotPath = (name) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(process.cwd(), '..', 'verification', `${stamp}-${name}.png`);
};

const buildPalaceSnippet = (palace) => {
  const palaceName = palace?.palace?.cn || palace?.palace?.name || '';
  const branchName = palace?.branch?.name || '';
  return palaceName && branchName ? `${palaceName} · ${branchName}` : palaceName || branchName;
};

test('Security: Ziwei V2 chart from /zodiac matches backend data', async ({ page }) => {
  const consoleErrors = [];

  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.addInitScript(() => {
    const key = '__e2e_ziwei_zodiac_bootstrap__';
    localStorage.setItem('locale', 'en-US');
    if (localStorage.getItem(key) !== '1') {
      localStorage.setItem(key, '1');
      localStorage.removeItem('bazi_token');
      localStorage.removeItem('bazi_user');
      localStorage.removeItem('bazi_last_activity');
      localStorage.removeItem('bazi_session_expired');
    }
  });

  await page.goto('/zodiac', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/zodiac/);

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

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: /Logout/i })).toBeVisible();
  await page.screenshot({ path: buildScreenshotPath('security-ziwei-zodiac-step-1') });

  const ziweiLink = page.locator('#main-content').getByRole('link', { name: /Zi Wei/i }).first();
  await ziweiLink.click();
  await expect(page).toHaveURL(/\/ziwei/);
  await page.screenshot({ path: buildScreenshotPath('security-ziwei-zodiac-step-2') });

  await page.getByLabel('Birth Year').fill('1993');
  await page.getByLabel('Birth Month').fill('6');
  await page.getByLabel('Birth Day').fill('18');
  await page.getByLabel('Birth Hour').selectOption('9');
  await page.locator('#gender').selectOption('female');

  const responsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/ziwei/calculate') && resp.request().method() === 'POST'
  );
  await page.getByRole('button', { name: /Generate Zi Wei Chart|生成紫微命盘/i }).click();
  const response = await responsePromise;
  expect(response.ok()).toBeTruthy();
  const data = await response.json();

  const resultCard = page.getByTestId('ziwei-result');
  await expect(resultCard).toBeVisible();

  const lunar = data?.lunar;
  if (lunar?.year && lunar?.month && lunar?.day) {
    const lunarRegex = new RegExp(`${lunar.year}.*${lunar.month}.*${lunar.day}`);
    await expect(resultCard).toContainText(lunarRegex);
  }

  const mingSnippet = buildPalaceSnippet(data?.mingPalace);
  if (mingSnippet) {
    await expect(resultCard).toContainText(mingSnippet);
  }

  const shenSnippet = buildPalaceSnippet(data?.shenPalace);
  if (shenSnippet) {
    await expect(resultCard).toContainText(shenSnippet);
  }

  if (data?.birthIso) {
    await expect(resultCard).toContainText(data.birthIso);
  }

  if (Number.isFinite(data?.timezoneOffsetMinutes)) {
    await expect(resultCard).toContainText(`${data.timezoneOffsetMinutes} mins`);
  }

  await page.screenshot({ path: buildScreenshotPath('security-ziwei-zodiac-step-3') });

  expect(consoleErrors).toEqual([]);
});
