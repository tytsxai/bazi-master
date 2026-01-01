import { test, expect } from './fixtures.js';
import path from 'path';

test('Deep link flow loads shared history record with filters', async ({ page }) => {
  const uniqueLocation = `TEST_DEEPLINK_${Date.now()}`;
  const consoleErrors = [];

  const screenshotPath = (name) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return path.join(process.cwd(), '..', 'verification', `${stamp}-deep-link-${name}.png`);
  };

  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
  });

  await page.goto('/');
  await page.screenshot({ path: screenshotPath('step-1-home') });

  await page.request.post('/api/auth/register', {
    data: { email: 'test@example.com', password: 'password123', name: 'Test User' },
  });

  await page.goto('/login');
  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/profile/);
  await expect(page.getByTestId('header-user-name')).toHaveText('Test User');
  await page.screenshot({ path: screenshotPath('step-2-profile') });

  await page.goto('/bazi');
  await page.getByLabel('Birth Year').fill('1992');
  await page.getByLabel('Birth Month').fill('6');
  await page.getByLabel('Birth Day').fill('12');
  await page.getByLabel('Birth Hour (0-23)').fill('9');
  await page.locator('#gender').selectOption('female');
  await page.getByLabel('Birth Location').fill(uniqueLocation);
  await page.getByLabel('Timezone').fill('UTC+8');
  await page.screenshot({ path: screenshotPath('step-3-form') });

  const calcResponsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/bazi/calculate') && resp.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Calculate' }).click();
  const calcResponse = await calcResponsePromise;
  expect(calcResponse.ok()).toBeTruthy();
  await expect(page.getByRole('heading', { name: 'Four Pillars' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Five Elements' })).toBeVisible();
  await page.screenshot({ path: screenshotPath('step-4-calculated') });

  const fullResponsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/bazi/full-analysis') && resp.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Request Full Analysis' }).click();
  const fullResponse = await fullResponsePromise;
  expect(fullResponse.ok()).toBeTruthy();
  await expect(page.getByRole('heading', { name: 'Ten Gods' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Major Luck Cycles' })).toBeVisible();
  await page.screenshot({ path: screenshotPath('step-5-full-analysis') });

  const saveResponsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/bazi/records') && resp.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Save to History' }).click();
  const saveResponse = await saveResponsePromise;
  expect(saveResponse.ok() || saveResponse.status() === 409).toBeTruthy();
  await page.screenshot({ path: screenshotPath('step-6-saved') });

  const favoriteResponsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/favorites') && resp.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Add to Favorites' }).click();
  const favoriteResponse = await favoriteResponsePromise;
  expect(favoriteResponse.ok() || favoriteResponse.status() === 409).toBeTruthy();
  await page.screenshot({ path: screenshotPath('step-7-favorited') });

  await page.goto('/favorites');
  await expect(page.getByRole('heading', { name: 'Favorites' })).toBeVisible();
  const favoriteCard = page
    .getByText(uniqueLocation)
    .locator('xpath=ancestor::div[contains(@class,"rounded-2xl")]')
    .first();
  const shareButton = favoriteCard.getByRole('button', { name: 'Share' });
  const shareUrl = await shareButton.getAttribute('data-share-url');
  expect(shareUrl).toBeTruthy();
  await page.screenshot({ path: screenshotPath('step-8-favorites') });

  const logoutButton = page.getByRole('button', { name: /Logout|退出登录/ });
  if (!(await logoutButton.isVisible())) {
    await page.getByRole('button', { name: 'Toggle Menu' }).click();
  }
  await expect(logoutButton).toBeVisible();
  await logoutButton.click();
  await expect(page).toHaveURL(/\/login/);
  await page.screenshot({ path: screenshotPath('step-9-logout') });

  const deepLinkUrl = new URL(shareUrl);
  deepLinkUrl.searchParams.set('q', uniqueLocation);
  await page.goto(deepLinkUrl.toString());
  await expect(page).toHaveURL(/\/login/);

  await page.request.post('/api/auth/register', {
    data: { email: 'test@example.com', password: 'password123', name: 'Test User' },
  });

  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/history/);
  await expect(page.getByTestId('history-shared-record')).toBeVisible();
  await expect(page.getByPlaceholder('Location, timezone, pillar')).toHaveValue(uniqueLocation);
  await expect(
    page.getByTestId('history-record-card').filter({ hasText: uniqueLocation })
  ).toHaveCount(1);
  await page.screenshot({ path: screenshotPath('step-10-deeplink-history') });

  await page.goto('/favorites');
  await expect(page.getByRole('heading', { name: 'Favorites' })).toBeVisible();
  const removeButton = page
    .getByText(uniqueLocation)
    .locator('xpath=ancestor::div[contains(@class,"rounded-2xl")]')
    .first()
    .getByRole('button', { name: 'Remove' });
  await removeButton.click();
  await page.screenshot({ path: screenshotPath('step-11-favorite-removed') });

  await page.goto('/history');
  await page.getByPlaceholder('Location, timezone, pillar').fill(uniqueLocation);
  await page.keyboard.press('Enter');
  const recordCard = page
    .getByTestId('history-record-card')
    .filter({ hasText: uniqueLocation })
    .first();
  await recordCard.getByRole('button', { name: 'Delete' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Delete' }).click();
  await page.screenshot({ path: screenshotPath('step-12-history-deleted') });

  const logoutButtonAfter = page.getByRole('button', { name: /Logout|退出登录/ });
  if (!(await logoutButtonAfter.isVisible())) {
    await page.getByRole('button', { name: 'Toggle Menu' }).click();
  }
  await logoutButtonAfter.click();
  await expect(page).toHaveURL(/\/login/);
  await page.screenshot({ path: screenshotPath('step-13-logout') });

  expect(consoleErrors).toEqual([]);
});
