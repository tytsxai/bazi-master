import { test, expect } from './fixtures.js';

test('Responsive layout verification across desktop/tablet/mobile in one run', async ({ page }) => {
  test.setTimeout(180000);
  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
  });

  const stamp = Date.now();
  const location = `E2E_Responsive_${stamp}`;

  const openNavItem = async (nameRegex, fallbackPath) => {
    const mobileMenuButton = page.locator('.mobile-menu-btn');
    if (await mobileMenuButton.isVisible()) {
      await mobileMenuButton.click();
    }
    const link = page.getByRole('link', { name: nameRegex }).first();
    if (await link.isVisible()) {
      try {
        await Promise.all([
          page.waitForURL((url) => url.pathname === fallbackPath, { timeout: 20000 }),
          link.click(),
        ]);
      } catch (error) {
        await page.goto(fallbackPath);
      }
      return;
    }
    await page.goto(fallbackPath);
  };

  const clickLogout = async () => {
    const mobileMenuButton = page.locator('.mobile-menu-btn');
    if (await mobileMenuButton.isVisible()) {
      await mobileMenuButton.click();
    }
    await page.getByRole('button', { name: /Logout|Log out/i }).click();
  };

  const ensureLoginVisible = async () => {
    const mobileMenuButton = page.locator('.mobile-menu-btn');
    if (await mobileMenuButton.isVisible()) {
      await mobileMenuButton.click();
    }
    await expect(page.getByRole('link', { name: /Login/i })).toBeVisible({ timeout: 10000 });
  };

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await openNavItem(/Login/i, '/login');

  await page.getByLabel('Email').fill('test@example.com');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: /Sign In/i }).click();
  await expect(page).toHaveURL(/\/profile/, { timeout: 20000 });
  await expect(page.getByTestId('header-user-name')).toContainText('Test');
  await page.screenshot({
    path: 'verification/responsive-flow-01-profile-desktop.png',
    fullPage: true,
  });

  await openNavItem(/BaZi|Bazi/i, '/bazi');
  await page.getByLabel('Birth Year').fill('1993');
  await page.getByLabel('Birth Month').fill('6');
  await page.getByLabel('Birth Day').fill('18');
  await page.getByLabel('Birth Hour (0-23)').fill('14');
  await page.locator('#gender').selectOption('female');
  await page.getByLabel('Birth Location').fill(location);
  await page.getByLabel('Timezone').fill('UTC+8');

  await Promise.all([
    page.waitForResponse((res) => res.url().includes('/api/bazi/calculate') && res.ok()),
    page.getByRole('button', { name: /Calculate|开始排盘/ }).click(),
  ]);
  await expect(page.getByRole('heading', { name: 'Four Pillars' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Five Elements' })).toBeVisible();

  await Promise.all([
    page.waitForResponse((res) => res.url().includes('/api/bazi/full-analysis') && res.ok()),
    page.getByRole('button', { name: /Full Analysis|完整分析/i }).click(),
  ]);
  await expect(page.getByRole('heading', { name: 'Ten Gods' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Major Luck Cycles' })).toBeVisible();

  const saveButton = page.getByRole('button', { name: /Save to History|保存到历史/i });
  await expect(saveButton).toBeEnabled({ timeout: 20000 });
  await Promise.all([
    page.waitForResponse(
      (res) =>
        res.url().includes('/api/bazi/records') && res.request().method() === 'POST' && res.ok()
    ),
    saveButton.click(),
  ]);

  await Promise.all([
    page.waitForResponse((res) => res.url().includes('/api/favorites') && res.ok()),
    page.getByRole('button', { name: /Add to Favorites|加入收藏/i }).click(),
  ]);
  await page.screenshot({
    path: 'verification/responsive-flow-02-bazi-desktop.png',
    fullPage: true,
  });

  await page.setViewportSize({ width: 834, height: 1112 });
  await page.goto('/history');
  await expect(page.getByText(location)).toBeVisible({ timeout: 20000 });
  await page.screenshot({
    path: 'verification/responsive-flow-03-history-tablet.png',
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/favorites');
  await expect(page.getByText(location)).toBeVisible({ timeout: 20000 });
  await page.screenshot({
    path: 'verification/responsive-flow-04-favorites-mobile.png',
    fullPage: true,
  });

  await clickLogout();
  await ensureLoginVisible();
  await page.screenshot({
    path: 'verification/responsive-flow-05-logout-mobile.png',
    fullPage: true,
  });
});
