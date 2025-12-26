import { test, expect } from './fixtures.js';
import path from 'path';

test('Session expiry prompts re-authentication and retries the pending save', async ({ page }) => {
  const uniqueLocation = `SECURITY_${Date.now()}`;
  const consoleErrors = [];

  const screenshotPath = (name) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return path.join(process.cwd(), '..', 'verification', `${stamp}-${name}.png`);
  };

  page.on('pageerror', (error) => {
    consoleErrors.push(error.message);
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
  });

  await page.goto('/');
  await page.screenshot({ path: screenshotPath('security-step-1-home') });
  await page.getByRole('link', { name: /Login|登录/ }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.screenshot({ path: screenshotPath('security-step-2-login') });
  await page.evaluate(() => {
    localStorage.removeItem('bazi_token');
    localStorage.removeItem('bazi_user');
    localStorage.removeItem('bazi_last_activity');
  });

  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/profile/);
  await expect(page.getByText(/Test User|E2E Profile/).first()).toBeVisible();
  await page.screenshot({ path: screenshotPath('security-step-3-profile') });

  await page.goto('/bazi');
  await page.screenshot({ path: screenshotPath('security-step-4-bazi-arrival') });
  await page.waitForSelector('label[for="birthYear"]');
  await page.screenshot({ path: screenshotPath('security-step-4-bazi') });
  await page.getByLabel(/Birth Year|出生年份/).fill('1992');
  await page.getByLabel(/Birth Month|出生月份/).fill('7');
  await page.getByLabel(/Birth Day|出生日/).fill('15');
  await page.getByLabel(/Birth Hour|出生时辰/).fill('9');
  await page.getByLabel(/Gender|性别/).selectOption('female');
  await page.getByLabel(/Birth Location|出生地/).fill(uniqueLocation);
  await page.getByLabel(/Timezone|时区/).fill('UTC+8');
  await page.screenshot({ path: screenshotPath('security-step-4-form') });

  const calcResponse = page.waitForResponse(
    (resp) => resp.url().includes('/api/bazi/calculate') && resp.status() === 200,
  );
  await page.getByRole('button', { name: /Calculate|开始排盘/ }).click();
  await calcResponse;
  const tokenAfterCalc = await page.evaluate(() => localStorage.getItem('bazi_token'));
  expect(tokenAfterCalc).toBeTruthy();
  await expect(page.getByRole('heading', { name: /Four Pillars|四柱/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Five Elements|五行/ })).toBeVisible();
  await page.screenshot({ path: screenshotPath('security-step-5-calculated') });

  const fullAnalysis = page.waitForResponse(
    (resp) => resp.url().includes('/api/bazi/full-analysis') && resp.request().method() === 'POST'
  );
  const fullButton = page.getByRole('button', { name: 'Request Full Analysis' });
  await fullButton.scrollIntoViewIfNeeded();
  await fullButton.focus();
  await page.keyboard.press('Enter');
  await fullAnalysis;
  await expect(page.getByRole('heading', { name: /Ten Gods|十神/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Major Luck Cycles|大运/ })).toBeVisible();
  await page.screenshot({ path: screenshotPath('security-step-6-full-analysis') });

  await page.evaluate(() => {
    const token = localStorage.getItem('bazi_token');
    if (!token) return;
    const match = token.match(/^token_(\d+)_/);
    if (!match) return;
    const userId = match[1];
    const expiredToken = `token_${userId}_0`;
    localStorage.setItem('bazi_token', expiredToken);
    const event = new StorageEvent('storage', {
      key: 'bazi_token',
      oldValue: token,
      newValue: expiredToken,
      storageArea: localStorage,
      url: window.location.href,
    });
    window.dispatchEvent(event);
    window.dispatchEvent(new Event('focus'));
  });
  await page.waitForTimeout(500);

  const saveButton = page.getByRole('button', { name: 'Save to History' });
  await expect(saveButton).toBeEnabled();
  await saveButton.scrollIntoViewIfNeeded();
  const saveResponsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/bazi/records') && resp.request().method() === 'POST',
  );
  await saveButton.click({ force: true });
  const saveResponseAttempt = await saveResponsePromise.catch(() => null);
  if (saveResponseAttempt) {
    console.log('save response status:', saveResponseAttempt.status());
  }
  await expect(page).toHaveURL(/\/login\?reason=session_expired/);
  await expect(
    page.getByText(/Your session expired\. Please sign in again to continue\.|登录已过期，请重新登录以继续操作。/)
  ).toBeVisible();
  await page.screenshot({ path: screenshotPath('security-step-7-session-expired') });

  const saveResponse = page.waitForResponse(
    (resp) =>
      resp.url().includes('/api/bazi/records') &&
      resp.request().method() === 'POST' &&
      resp.status() === 200,
  );
  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');
  await saveResponse;
  await expect(page).toHaveURL(/\/bazi/);
  await expect(page.getByText(/Record saved to history\.|记录已保存到历史。/)).toBeVisible();
  await page.screenshot({ path: screenshotPath('security-step-8-retry-saved') });

  const favoriteResponse = page.waitForResponse(
    (resp) =>
      resp.url().includes('/api/favorites') &&
      resp.request().method() === 'POST' &&
      resp.status() === 200,
  );
  await page.getByRole('button', { name: /Add to Favorites|加入收藏/ }).click();
  await favoriteResponse;
  await expect(page.getByText(/Favorite saved\. View it in Favorites\.|收藏成功，可在收藏页查看。/)).toBeVisible();
  await page.screenshot({ path: screenshotPath('security-step-9-favorited') });

  await page.goto('/history');
  await expect(page.getByRole('heading', { name: /^(History|历史)$/ })).toBeVisible();
  const historyFilterResponse = page.waitForResponse(
    (resp) => resp.url().includes('/api/bazi/records') && resp.url().includes('q='),
  );
  await page.getByPlaceholder('Location, timezone, pillar').fill(uniqueLocation);
  await historyFilterResponse;
  const historyCards = page.getByTestId('history-record-card').filter({ hasText: uniqueLocation });
  await expect(historyCards).toHaveCount(1);
  await page.screenshot({ path: screenshotPath('security-step-10-history') });

  await page.goto('/favorites');
  await expect(page.getByRole('heading', { name: /Favorites|收藏/ })).toBeVisible();
  await expect(page.getByText(uniqueLocation)).toHaveCount(1);
  await page.screenshot({ path: screenshotPath('security-step-11-favorites') });

  const logoutButton = page.getByRole('button', { name: /Logout|退出登录/ });
  if (!(await logoutButton.isVisible())) {
    await page.getByRole('button', { name: 'Toggle Menu' }).click();
  }
  await logoutButton.click();
  await expect(page).toHaveURL(/\/login/);
  await page.screenshot({ path: screenshotPath('security-step-12-logout') });

  expect(consoleErrors).toEqual([]);
});
