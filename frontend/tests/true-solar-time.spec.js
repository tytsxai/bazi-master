import { test, expect } from './fixtures.js';
import path from 'path';

const screenshotPath = (name) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(process.cwd(), '..', 'verification', `${stamp}-${name}.png`);
};

test('Bazi calculation applies true solar time correction from location', async ({ page }) => {
  const uniqueLocation = `Beijing TEST_SOLAR_${Date.now()}`;

  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
  });

  const loginRes = await page.request.post('/api/auth/login', {
    data: { email: 'test@example.com', password: 'password123' },
  });
  expect(loginRes.ok()).toBeTruthy();
  const loginData = await loginRes.json();
  const token = loginData?.token;
  const user = loginData?.user;
  expect(token).toBeTruthy();

  await page.addInitScript(
    ({ tokenValue, userValue }) => {
      localStorage.setItem('bazi_token', tokenValue);
      localStorage.setItem('bazi_token_origin', 'backend');
      localStorage.setItem('bazi_user', JSON.stringify(userValue));
      localStorage.setItem('bazi_last_activity', String(Date.now()));
      localStorage.removeItem('bazi_session_expired');
    },
    { tokenValue: token, userValue: user }
  );

  await page.goto('/profile', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/profile/);
  await page.screenshot({ path: screenshotPath('solar-step-1-profile') });

  await page.goto('/bazi');
  await page.getByLabel('Birth Year').fill('1992');
  await page.getByLabel('Birth Month').fill('6');
  await page.getByLabel('Birth Day').fill('15');
  await page.getByLabel('Birth Hour (0-23)').fill('9');
  await page.locator('#gender').selectOption('female');
  await page.getByLabel('Birth Location').fill(uniqueLocation);
  await page.getByLabel('Timezone').fill('UTC+08:00');
  await page.screenshot({ path: screenshotPath('solar-step-2-form-filled') });

  const calcResponse = page.waitForResponse(
    (resp) => resp.url().includes('/api/bazi/calculate') && resp.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Calculate' }).click();
  await calcResponse;

  await expect(page.getByRole('heading', { name: 'Four Pillars' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Five Elements' })).toBeVisible();
  await expect(page.getByTestId('true-solar-time')).not.toHaveText('Not available (location not recognized)');
  await expect(page.getByTestId('true-solar-location')).toContainText('Beijing');
  await expect(page.getByTestId('true-solar-correction')).toContainText('min');
  await page.screenshot({ path: screenshotPath('solar-step-3-calculated') });

  const fullAnalysis = page.waitForResponse(
    (resp) => resp.url().includes('/api/bazi/full-analysis') && resp.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Request Full Analysis' }).click();
  await fullAnalysis;
  await expect(page.getByRole('heading', { name: 'Ten Gods' })).toBeVisible({ timeout: 60000 });
  await expect(page.getByRole('heading', { name: 'Major Luck Cycles' })).toBeVisible({ timeout: 60000 });
  await page.screenshot({ path: screenshotPath('solar-step-4-full-analysis') });

  const saveResponse = page.waitForResponse(
    (resp) => resp.url().includes('/api/bazi/records') && resp.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Save to History' }).click();
  await saveResponse;
  await page.screenshot({ path: screenshotPath('solar-step-5-saved') });

  const favoriteResponse = page.waitForResponse(
    (resp) => resp.url().includes('/api/favorites') && resp.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Add to Favorites' }).click();
  await favoriteResponse;
  await expect(page.getByText('Favorite saved. View it in Favorites.')).toBeVisible();
  await page.screenshot({ path: screenshotPath('solar-step-6-favorited') });

  await page.goto('/history');
  await expect(page.getByRole('heading', { name: 'History', exact: true })).toBeVisible();
  await expect(page.getByText(uniqueLocation)).toBeVisible();
  await page.screenshot({ path: screenshotPath('solar-step-7-history') });

  await page.goto('/favorites');
  await expect(page.getByRole('heading', { name: 'Favorites' })).toBeVisible();
  await expect(page.getByText(uniqueLocation)).toBeVisible();
  await page.screenshot({ path: screenshotPath('solar-step-8-favorites') });

  const favoriteCard = page
    .getByText(uniqueLocation)
    .locator('xpath=ancestor::div[contains(@class,"rounded-2xl")]')
    .first();
  const removeFavorite = page.waitForResponse(
    (resp) => resp.url().includes('/api/favorites/') && resp.request().method() === 'DELETE'
  );
  await favoriteCard.getByRole('button', { name: 'Remove' }).click();
  await removeFavorite;
  await page.screenshot({ path: screenshotPath('solar-step-9-favorites-removed') });

  await page.goto('/history');
  const historyCardAfter = page
    .getByText(uniqueLocation)
    .locator('xpath=ancestor::div[contains(@class,"rounded-2xl")]')
    .first();
  const deleteHistory = page.waitForResponse(
    (resp) => resp.url().includes('/api/bazi/records/') && resp.request().method() === 'DELETE'
  );
  await historyCardAfter.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await deleteHistory;
  await expect(page.getByText(uniqueLocation)).toHaveCount(0);
  await page.screenshot({ path: screenshotPath('solar-step-10-history-deleted') });

  await page.getByRole('button', { name: /Logout/ }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.screenshot({ path: screenshotPath('solar-step-11-logout') });
});
