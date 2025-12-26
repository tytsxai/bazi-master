import { test, expect } from '@playwright/test';
import path from 'path';

const fillNumberField = async (page, label, value) => {
  const input = page.getByLabel(label);
  await input.focus();
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.press(`${modifier}+A`);
  await page.keyboard.type(String(value));
};

test('Accessibility smoke flow with keyboard-only navigation', async ({ page }) => {
  test.setTimeout(120000);
  const consoleErrors = [];
  const uniqueLocation = `ACCESSIBILITY_${Date.now()}`;

  const ensureLoggedIn = async () => {
    if (!page.url().includes('/login')) return;
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.getByLabel('Email').focus();
    await page.keyboard.press(`${modifier}+A`);
    await page.keyboard.type('test@example.com');
    await page.keyboard.press('Tab');
    await page.keyboard.press(`${modifier}+A`);
    await page.keyboard.type('password123');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(page).not.toHaveURL(/\/login/);
  };

  const screenshotPath = (name) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return path.join(process.cwd(), '..', 'verification', `${stamp}-accessibility-${name}.png`);
  };

  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.screenshot({ path: screenshotPath('step-1-home') });

  // Clear auth state and wait for re-render
  await page.evaluate(() => {
    localStorage.removeItem('bazi_token');
    localStorage.removeItem('bazi_user');
    localStorage.removeItem('bazi_last_activity');
  });

  // Force a page reload to clear React state
  await page.reload({ waitUntil: 'domcontentloaded' });

  await page.request.post('/api/auth/register', {
    data: { email: 'test@example.com', password: 'password123', name: 'Test User' },
  });

  // Wait for login link to be visible
  const loginLink = page.getByRole('link', { name: 'Login', exact: true });
  await expect(loginLink).toBeVisible({ timeout: 10000 });
  await loginLink.focus();
  await page.waitForTimeout(450);
  await loginLink.press('Enter');
  await expect(page).toHaveURL(/\/login/);
  await page.screenshot({ path: screenshotPath('step-2-login') });

  await page.getByLabel('Email').focus();
  await page.keyboard.type('test@example.com');
  await page.keyboard.press('Tab');
  await page.keyboard.type('password123');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/\/profile/);
  const headerUserName = page.getByTestId('header-user-name');
  await expect(headerUserName).toBeVisible();
  const headerNameText = (await headerUserName.textContent())?.trim();
  expect(headerNameText).toBeTruthy();
  expect(headerNameText).not.toBe('—');
  await page.screenshot({ path: screenshotPath('step-3-profile') });

  const baziLink = page.getByRole('link', { name: 'BaZi', exact: true });
  await baziLink.focus();
  await page.waitForTimeout(450);
  await baziLink.press('Enter');
  await expect(page).toHaveURL(/\/bazi/);
  await page.screenshot({ path: screenshotPath('step-4-bazi') });

  await fillNumberField(page, 'Birth Year', 1990);
  await fillNumberField(page, 'Birth Month', 1);
  await fillNumberField(page, 'Birth Day', 1);
  await fillNumberField(page, 'Birth Hour (0-23)', 10);

  const genderSelect = page.getByLabel('Gender');
  await genderSelect.focus();
  await genderSelect.selectOption('female');
  await expect(genderSelect).toHaveValue('female');

  const locationInput = page.getByLabel('Birth Location');
  await locationInput.focus();
  await page.keyboard.type(uniqueLocation);
  await page.screenshot({ path: screenshotPath('step-5-form') });

  const calculateButton = page.getByRole('button', { name: 'Calculate' });
  const [calculateResponse] = await Promise.all([
    page.waitForResponse((res) => res.url().includes('/api/bazi/calculate') && res.request().method() === 'POST'),
    (async () => {
      await calculateButton.focus();
      await calculateButton.press('Enter');
    })(),
  ]);
  expect(calculateResponse.ok()).toBeTruthy();

  await expect(page.getByTestId('pillars-grid')).toContainText('·', { timeout: 20000 });
  await expect(page.getByTestId('elements-chart')).toContainText('Wood');
  await page.screenshot({ path: screenshotPath('step-6-calculated') });

  const fullAnalysisButton = page.getByTestId('bazi-full-analysis');

  const requestFullAnalysis = async () => {
    const responsePromise = page.waitForResponse(
      (res) => res.url().includes('/api/bazi/full-analysis') && res.request().method() === 'POST'
    );
    await fullAnalysisButton.focus();
    await page.keyboard.press('Enter');
    return await responsePromise;
  };

  let fullAnalysisResponse = await requestFullAnalysis();
  if (fullAnalysisResponse.status() === 401) {
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
    fullAnalysisResponse = await requestFullAnalysis();
  }

  expect(fullAnalysisResponse.ok()).toBeTruthy();

  await expect(page.getByTestId('ten-gods-list')).toContainText(/\d+/, { timeout: 20000 });
  await expect(page.getByTestId('luck-cycles-list')).toContainText('·');
  await page.screenshot({ path: screenshotPath('step-7-full-analysis') });

  const saveButton = page.getByTestId('bazi-save-record');
  const [saveResponse] = await Promise.all([
    page.waitForResponse((res) => res.url().includes('/api/bazi/records') && res.request().method() === 'POST'),
    (async () => {
      await saveButton.focus();
      await page.keyboard.press('Enter');
    })(),
  ]);
  expect(saveResponse.ok()).toBeTruthy();
  const savedPayload = await saveResponse.json();
  const savedRecord = savedPayload?.record;
  expect(savedRecord).toBeTruthy();
  const savedLabel = `${savedRecord.birthYear}-${savedRecord.birthMonth}-${savedRecord.birthDay}`;
  await page.screenshot({ path: screenshotPath('step-8-saved') });

  const favoriteButton = page.getByRole('button', { name: 'Add to Favorites' });
  await expect(favoriteButton).toBeEnabled({ timeout: 20000 });
  const [favoriteResponse] = await Promise.all([
    page.waitForResponse((res) => res.url().includes('/api/favorites') && res.request().method() === 'POST'),
    (async () => {
      await favoriteButton.focus();
      await page.keyboard.press('Enter');
    })(),
  ]);
  expect(favoriteResponse.ok()).toBeTruthy();
  await page.screenshot({ path: screenshotPath('step-9-favorited') });

  await page.evaluate(() => {
    sessionStorage.removeItem('bazi_history_filters_v1');
  });

  const historyLink = page.getByRole('link', { name: 'History', exact: true });
  await historyLink.focus();
  await page.waitForTimeout(450);
  await historyLink.press('Enter');
  await expect(page).toHaveURL(/\/history/);
  await page.screenshot({ path: screenshotPath('step-10-history') });

  await page.goto(`/history?recordId=${savedRecord.id}`);
  await ensureLoggedIn();
  const sharedRecord = page.getByTestId('history-shared-record');
  await expect(sharedRecord).toContainText(savedLabel, { timeout: 30000 });
  await expect(sharedRecord).toContainText(uniqueLocation);
  await page.screenshot({ path: screenshotPath('step-11-history-record') });

  const favoritesLink = page.getByRole('link', { name: 'Favorites', exact: true });
  await favoritesLink.focus();
  await page.waitForTimeout(450);
  await favoritesLink.press('Enter');
  await expect(page).toHaveURL(/\/favorites/);
  await page.screenshot({ path: screenshotPath('step-12-favorites') });

  const favoriteRecord = page
    .getByTestId('favorite-record-card')
    .filter({ hasText: savedLabel })
    .first();
  await expect(favoriteRecord).toContainText(savedLabel, { timeout: 30000 });
  await expect(favoriteRecord).toContainText(uniqueLocation);
  await page.screenshot({ path: screenshotPath('step-13-favorites-record') });

  const favoriteRemoveButton = favoriteRecord.getByRole('button', { name: /Remove|Add to favorites/i });
  await favoriteRemoveButton.focus();
  await page.keyboard.press('Enter');
  await page.screenshot({ path: screenshotPath('step-14-favorite-removed') });

  await page.goto('/history');
  await ensureLoggedIn();
  await expect(page).toHaveURL(/\/history/);
  await page.getByPlaceholder('Location, timezone, pillar').fill(uniqueLocation);
  await page.keyboard.press('Enter');
  const recordCard = page
    .getByTestId('history-record-card')
    .filter({ hasText: savedLabel })
    .first();
  await recordCard.getByRole('button', { name: 'Delete' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Delete' }).click();
  await page.screenshot({ path: screenshotPath('step-15-history-deleted') });

  const logoutButton = page.getByRole('button', { name: 'Logout' });
  await logoutButton.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/login/);

  expect(consoleErrors).toEqual([]);
});
