import { test, expect } from './fixtures.js';

test('User can log in and redirect to profile', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
  });

  // 1. Go to Login page
  await page.goto('/login', { waitUntil: 'domcontentloaded' });

  // 2. Fill credentials
  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'password123');

  // 3. Click Login
  await page.click('button[type="submit"]');

  // 4. Verification
  // Should redirect to /profile
  await expect(page).toHaveURL(/\/profile/);

  // Profile should show the user's name
  // Note: Our real API login returns name="Test User" for "test@example.com"
  await expect(page.locator('body')).toContainText('Test User');
});

test('User can log in with Google OAuth redirect', async ({ page }) => {
  const oauthUser = {
    id: 'oauth-user-1',
    email: 'oauth.user@example.com',
    name: 'OAuth User',
  };
  const encodedUser = Buffer.from(JSON.stringify(oauthUser)).toString('base64url');

  await page.route('**/api/user/settings', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        settings: {
          locale: 'en-US',
          preferences: { profileName: '', aiProvider: '' },
        },
      }),
    });
  });

  await page.route('**/api/bazi/records**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ records: [], totalCount: 0, filteredCount: 0, hasMore: false }),
    });
  });

  await page.route('**/api/auth/me', async (route) => {
    const auth = route.request().headers()['authorization'] || '';
    if (auth.includes('oauth_token_')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: oauthUser }),
      });
      return;
    }
    await route.continue();
  });

  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
  });

  await page.route('**/api/auth/google?**', async (route) => {
    const requestUrl = new URL(route.request().url());
    const nextPath = requestUrl.searchParams.get('next') || '/profile';
    const redirectTarget = `/login?token=oauth_token_${Date.now()}&user=${encodedUser}&next=${encodeURIComponent(nextPath)}`;
    await route.fulfill({
      status: 302,
      headers: { Location: redirectTarget },
    });
  });

  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.removeItem('bazi_token');
    localStorage.removeItem('bazi_user');
    localStorage.removeItem('bazi_last_activity');
  });

  await page.getByRole('button', { name: 'Continue with Google' }).click();
  await expect(page).toHaveURL(/\/profile/, { timeout: 15000 });
  const profileCard = page.getByText('Name', { exact: true }).locator('..');
  await expect(profileCard.getByText(oauthUser.name, { exact: true })).toBeVisible();
  await expect(
    page
      .getByText('Email', { exact: true })
      .locator('..')
      .getByText(oauthUser.email, { exact: true })
  ).toBeVisible();
});

test('User can log in with WeChat OAuth redirect', async ({ page }) => {
  const oauthUser = {
    id: 'wechat-user-1',
    email: 'wechat.user@wechat.local',
    name: 'WeChat User',
  };
  const encodedUser = Buffer.from(JSON.stringify(oauthUser)).toString('base64url');

  await page.route('**/api/user/settings', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        settings: {
          locale: 'en-US',
          preferences: { profileName: '', aiProvider: '' },
        },
      }),
    });
  });

  await page.route('**/api/bazi/records**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ records: [], totalCount: 0, filteredCount: 0, hasMore: false }),
    });
  });

  await page.route('**/api/auth/me', async (route) => {
    const auth = route.request().headers()['authorization'] || '';
    if (auth.includes('wechat_token_')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: oauthUser }),
      });
      return;
    }
    await route.continue();
  });

  await page.route('**/api/auth/wechat/redirect?**', async (route) => {
    const requestUrl = new URL(route.request().url());
    const nextPath = requestUrl.searchParams.get('next') || '/profile';
    const redirectTarget = `/login?token=wechat_token_${Date.now()}&user=${encodedUser}&next=${encodeURIComponent(nextPath)}&provider=wechat`;
    await route.fulfill({
      status: 302,
      headers: { Location: redirectTarget },
    });
  });

  await page.goto('/login');
  await page.evaluate(() => {
    localStorage.removeItem('bazi_token');
    localStorage.removeItem('bazi_user');
    localStorage.removeItem('bazi_last_activity');
  });

  await page.getByRole('button', { name: 'Continue with WeChat' }).click();

  await expect(page).toHaveURL(/\/profile/);
  const profileCard = page.getByText('Name', { exact: true }).locator('..');
  await expect(profileCard.getByText(oauthUser.name, { exact: true })).toBeVisible();
  await expect(
    page
      .getByText('Email', { exact: true })
      .locator('..')
      .getByText(oauthUser.email, { exact: true })
  ).toBeVisible();
});

test('Shows error message on invalid login', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.removeItem('bazi_token');
    localStorage.removeItem('bazi_user');
    localStorage.removeItem('bazi_last_activity');
  });

  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Email').fill('test@example.com');
  await page.getByLabel('Password').fill('wrong-password');
  await page.getByRole('button', { name: 'Sign In' }).click();

  await expect(page).toHaveURL(/\/login/);
  await expect(page.locator('p[role="alert"]')).toContainText(
    /Incorrect email or password|Invalid credentials/
  );
});

test('Shows error message when WeChat OAuth is not configured', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
  });

  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.removeItem('bazi_token');
    localStorage.removeItem('bazi_user');
    localStorage.removeItem('bazi_last_activity');
  });

  await page.route('**/api/auth/wechat/redirect?**', async (route) => {
    await route.fulfill({
      status: 302,
      headers: { Location: '/login?error=wechat_not_configured&provider=wechat' },
    });
  });

  await page.getByRole('button', { name: 'Continue with WeChat' }).click();

  await expect(page).toHaveURL(/\/login/);
  await expect(page.locator('p[role="alert"]')).toContainText('WeChat sign-in is not configured.');
});
