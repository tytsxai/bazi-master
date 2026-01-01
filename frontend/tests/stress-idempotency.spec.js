import { test, expect } from './fixtures.js';
import path from 'path';

test('Stress flow with rapid submissions remains idempotent', async ({ page }) => {
  const uniqueLocation = `STRESS_${Date.now()}`;
  const consoleErrors = [];

  const screenshotPath = (name) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return path.join(process.cwd(), '..', 'verification', `${stamp}-${name}.png`);
  };

  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
  });

  await page.goto('/login');
  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/profile/);
  await expect(page.getByTestId('header-user-name')).toHaveText('Test User');
  await page.screenshot({ path: screenshotPath('stress-step-1-profile') });

  await page.goto('/bazi');
  await page.getByLabel('Birth Year').fill('1990');
  await page.getByLabel('Birth Month').fill('5');
  await page.getByLabel('Birth Day').fill('21');
  await page.getByLabel('Birth Hour (0-23)').fill('8');
  await page.locator('#gender').selectOption('male');
  await page.getByLabel('Birth Location').fill(uniqueLocation);
  await page.getByLabel('Timezone').fill('UTC+8');
  await page.screenshot({ path: screenshotPath('stress-step-2-form') });

  const calcResponse = page.waitForResponse(
    (resp) => resp.url().includes('/api/bazi/calculate') && resp.status() === 200
  );
  const calcButton = page.getByRole('button', { name: 'Calculate' });
  await Promise.all([calcResponse, calcButton.click(), calcButton.click(), calcButton.click()]);
  await expect(page.getByRole('heading', { name: 'Four Pillars' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Five Elements' })).toBeVisible();
  await page.screenshot({ path: screenshotPath('stress-step-3-calculated') });

  const fullResponse = page.waitForResponse(
    (resp) => resp.url().includes('/api/bazi/full-analysis') && resp.status() === 200
  );
  const fullButton = page.getByRole('button', { name: 'Request Full Analysis' });
  await Promise.all([fullResponse, fullButton.click(), fullButton.click()]);
  await expect(page.getByRole('heading', { name: 'Ten Gods' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Major Luck Cycles' })).toBeVisible();
  await page.screenshot({ path: screenshotPath('stress-step-4-full-analysis') });

  const saveResponse = page.waitForResponse(
    (resp) =>
      resp.url().includes('/api/bazi/records') &&
      resp.request().method() === 'POST' &&
      resp.status() === 200
  );
  const saveButton = page.getByRole('button', { name: 'Save to History' });
  await Promise.all([saveResponse, saveButton.click(), saveButton.click()]);
  await expect(page.getByText('Record saved to history.')).toBeVisible();
  await page.screenshot({ path: screenshotPath('stress-step-5-saved') });

  const favoriteResponse = page.waitForResponse(
    (resp) =>
      resp.url().includes('/api/favorites') &&
      resp.request().method() === 'POST' &&
      resp.status() === 200
  );
  const favoriteButton = page.getByRole('button', { name: 'Add to Favorites' });
  await Promise.all([favoriteResponse, favoriteButton.click(), favoriteButton.click()]);
  await expect(page.getByText('Favorite saved. View it in Favorites.')).toBeVisible();
  await page.screenshot({ path: screenshotPath('stress-step-6-favorited') });

  await page.goto('/history');
  await expect(page.getByRole('heading', { name: 'History', exact: true })).toBeVisible();
  const historyFilterResponse = page.waitForResponse(
    (resp) => resp.url().includes('/api/bazi/records') && resp.url().includes('q=')
  );
  await page.getByPlaceholder('Location, timezone, pillar').fill(uniqueLocation);
  await historyFilterResponse;
  const historyCards = page.getByTestId('history-record-card').filter({ hasText: uniqueLocation });
  await expect(historyCards).toHaveCount(1);
  await page.screenshot({ path: screenshotPath('stress-step-7-history') });

  await page.goto('/favorites');
  await expect(page.getByRole('heading', { name: 'Favorites' })).toBeVisible();
  await expect(page.getByText(uniqueLocation)).toHaveCount(1);
  await page.screenshot({ path: screenshotPath('stress-step-8-favorites') });

  const logoutButton = page.getByRole('button', { name: /Logout|退出登录/ });
  if (!(await logoutButton.isVisible())) {
    await page.getByRole('button', { name: 'Toggle Menu' }).click();
  }
  await logoutButton.click();
  await expect(page).toHaveURL(/\/login/);
  await page.screenshot({ path: screenshotPath('stress-step-9-logout') });

  expect(consoleErrors).toEqual([]);
});
