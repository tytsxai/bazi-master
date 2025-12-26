import { test, expect } from './fixtures.js';

test('Profile flow from zodiac matches backend data', async ({ page, request }) => {
  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
  });

  const loginRes = await request.post('/api/auth/login', {
    data: { email: 'test@example.com', password: 'password123' },
  });
  expect(loginRes.ok()).toBeTruthy();
  const loginData = await loginRes.json();
  const token = loginData?.token;
  const loginUser = loginData?.user;
  expect(token).toBeTruthy();

  await page.addInitScript(
    ({ tokenValue, userValue }) => {
      localStorage.setItem('bazi_token', tokenValue);
      localStorage.setItem('bazi_token_origin', 'backend');
      localStorage.setItem('bazi_user', JSON.stringify(userValue));
      localStorage.setItem('bazi_last_activity', String(Date.now()));
      localStorage.removeItem('bazi_session_expired');
    },
    { tokenValue: token, userValue: loginUser }
  );

  await page.goto('/zodiac', { waitUntil: 'domcontentloaded' });
  await page.getByRole('link', { name: /Profile|个人资料|プロフィール|프로필/ }).click();
  await expect(page).toHaveURL(/\/profile/);

  const storedToken = await page.evaluate(() => localStorage.getItem('bazi_token'));
  expect(storedToken).toBeTruthy();

  const meRes = await request.get('/api/auth/me', {
    headers: { Authorization: `Bearer ${storedToken}` },
  });
  expect(meRes.ok()).toBeTruthy();
  const meData = await meRes.json();
  const user = meData?.user || {};

  const profileCard = page.getByText('Name', { exact: true }).locator('..');
  await expect(profileCard.getByText(user.name || '—', { exact: true })).toBeVisible();
  const emailCard = page.getByText('Email', { exact: true }).locator('..');
  await expect(emailCard.getByText(user.email || '—', { exact: true })).toBeVisible();

  const settingsRes = await request.get('/api/user/settings', {
    headers: { Authorization: `Bearer ${storedToken}` },
  });
  expect(settingsRes.ok()).toBeTruthy();
  const settingsData = await settingsRes.json();
  const settings = settingsData?.settings || {};
  const preferences = settings?.preferences || {};

  const expectedProfileName = typeof preferences.profileName === 'string'
    ? preferences.profileName.trim()
    : '';
  await expect(page.getByLabel('Display name (optional)')).toHaveValue(expectedProfileName);

  const localeValue = await page.getByLabel('Locale').inputValue();
  if (settings?.locale) {
    expect(localeValue).toBe(settings.locale);
  } else {
    expect(localeValue).toBe('en-US');
  }

  const expectedDaily = preferences.dailyGuidance ?? true;
  const expectedRitual = preferences.ritualReminders ?? false;
  const expectedResearch = preferences.researchUpdates ?? true;

  await expect(page.getByRole('checkbox', { name: 'Daily guidance' })).toHaveJSProperty('checked', expectedDaily);
  await expect(page.getByRole('checkbox', { name: 'Ritual reminders' })).toHaveJSProperty('checked', expectedRitual);
  await expect(page.getByRole('checkbox', { name: 'Research updates' })).toHaveJSProperty('checked', expectedResearch);
});
