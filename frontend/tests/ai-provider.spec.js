import { test, expect } from './fixtures.js';
import path from 'path';

const screenshotPath = (name) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(process.cwd(), '..', 'verification', `${stamp}-${name}.png`);
};

test('AI provider selection with availability check and BaZi flow', async ({ page }) => {
  const uniqueLocation = `AI_PROVIDER_LOCATION_${Date.now()}`;
  const consoleErrors = [];
  const email = 'test@example.com';
  const password = 'password123';
  const name = 'Test User';
  const ensureLoggedIn = async (targetPath = null) => {
    if (page.url().includes('/login')) {
      await page.request.post('/api/auth/register', {
        data: { email, password, name },
      });
      await page.fill('input[type="email"]', 'test@example.com');
      await page.fill('input[type="password"]', 'password123');
      await page.click('button[type="submit"]');
      await expect(page).not.toHaveURL(/\/login/);
    }
    if (targetPath) {
      const pathname = new URL(page.url()).pathname;
      if (pathname !== targetPath) {
        await page.goto(targetPath);
      }
    }
  };

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });
  page.on('pageerror', (error) => {
    consoleErrors.push(error.message);
  });

  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'BaZi Master' })).toBeVisible();
  await page.screenshot({ path: screenshotPath('ai-provider-step-1-home') });

  await page.request.post('/api/auth/register', {
    data: { email, password, name },
  });

  await page.getByRole('link', { name: 'Login' }).click();
  await expect(page).toHaveURL(/\/login/);

  await page.evaluate(() => {
    localStorage.removeItem('bazi_token');
    localStorage.removeItem('bazi_user');
    localStorage.removeItem('bazi_last_activity');
    localStorage.removeItem('bazi_ai_provider');
  });

  await page.request.post('/api/auth/register', {
    data: { email, password, name },
  });
  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/profile/);
  await expect(page.getByTestId('header-user-name')).toHaveText('Test User');
  await page.screenshot({ path: screenshotPath('ai-provider-step-2-profile') });

  const providerSelect = page.getByLabel('Preferred provider');
  await expect(providerSelect).toBeVisible();
  const optionTexts = await providerSelect.locator('option').allTextContents();
  expect(optionTexts.some((text) => text.includes('MOCK'))).toBeTruthy();
  await providerSelect.selectOption('mock');
  await page.screenshot({ path: screenshotPath('ai-provider-step-3-provider-selected') });

  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();
  await page.screenshot({ path: screenshotPath('ai-provider-step-4-settings-saved') });

  const storedProvider = await page.evaluate(() => localStorage.getItem('bazi_ai_provider'));
  expect(storedProvider).toBe('mock');

  await page.goto('/bazi');
  await page.getByLabel('Birth Year').fill('1991');
  await page.getByLabel('Birth Month').fill('11');
  await page.getByLabel('Birth Day').fill('9');
  await page.getByLabel('Birth Hour (0-23)').fill('9');
  await page.getByLabel('Gender').selectOption('male');
  await page.getByLabel('Birth Location').fill(uniqueLocation);
  await page.getByLabel('Timezone').fill('UTC+8');
  await page.screenshot({ path: screenshotPath('ai-provider-step-5-bazi-form-filled') });

  const calcResponse = page.waitForResponse(
    (resp) => resp.url().includes('/api/bazi/calculate') && resp.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Calculate' }).click();
  await calcResponse;

  await expect(page.getByRole('heading', { name: 'Four Pillars' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Five Elements' })).toBeVisible();
  await page.screenshot({ path: screenshotPath('ai-provider-step-6-bazi-calculated') });

  const fullAnalysis = page.waitForResponse(
    (resp) => resp.url().includes('/api/bazi/full-analysis') && resp.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Request Full Analysis' }).click();
  await fullAnalysis;

  await expect(page.getByRole('heading', { name: 'Ten Gods' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Major Luck Cycles' })).toBeVisible();
  await page.screenshot({ path: screenshotPath('ai-provider-step-7-full-analysis') });

  await page.getByTestId('bazi-ai-interpret').click();
  await page.getByRole('button', { name: 'Request AI' }).click();
  await expect(page.getByText('AI BaZi Analysis')).toBeVisible();
  await page.screenshot({ path: screenshotPath('ai-provider-step-8-ai-interpretation') });

  const saveResponse = page.waitForResponse(
    (resp) => resp.url().includes('/api/bazi/records') && resp.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Save to History' }).click();
  await saveResponse;
  await page.screenshot({ path: screenshotPath('ai-provider-step-9-saved') });

  const favoriteResponse = page.waitForResponse(
    (resp) => resp.url().includes('/api/favorites') && resp.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Add to Favorites' }).click();
  await favoriteResponse;
  await page.screenshot({ path: screenshotPath('ai-provider-step-10-favorited') });

  await page.goto('/history');
  await ensureLoggedIn('/history');
  await expect(page).toHaveURL(/\/history(\?|$)/);
  await expect(page.getByRole('heading', { name: 'History', exact: true })).toBeVisible();
  await expect(page.getByText(uniqueLocation)).toBeVisible();
  await page.screenshot({ path: screenshotPath('ai-provider-step-11-history') });

  await page.goto('/favorites');
  await ensureLoggedIn('/favorites');
  await expect(page).toHaveURL(/\/favorites(\?|$)/);
  await expect(page.getByRole('heading', { name: 'Favorites' })).toBeVisible();
  await expect(page.getByText(uniqueLocation)).toBeVisible();
  await page.screenshot({ path: screenshotPath('ai-provider-step-12-favorites') });

  const favoriteCard = page
    .getByText(uniqueLocation)
    .locator('xpath=ancestor::div[contains(@class,"rounded-2xl")]')
    .first();
  const removeFavorite = page.waitForResponse(
    (resp) => resp.url().includes('/api/favorites/') && resp.request().method() === 'DELETE'
  );
  await favoriteCard.getByRole('button', { name: 'Remove' }).click();
  await removeFavorite;
  await page.screenshot({ path: screenshotPath('ai-provider-step-13-favorites-removed') });

  await page.goto('/history');
  await ensureLoggedIn('/history');
  await expect(page).toHaveURL(/\/history(\?|$)/);
  await expect(page.getByRole('heading', { name: 'History', exact: true })).toBeVisible();
  const historyCard = page
    .getByText(uniqueLocation)
    .locator('xpath=ancestor::div[contains(@data-testid,"history-record-card")][1]');
  await historyCard.getByRole('button', { name: 'Delete' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Record deleted.')).toBeVisible();
  await page.screenshot({ path: screenshotPath('ai-provider-step-14-history-deleted') });

  await page.getByRole('button', { name: 'Logout' }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.screenshot({ path: screenshotPath('ai-provider-step-15-logout') });

  expect(consoleErrors).toEqual([]);
});
