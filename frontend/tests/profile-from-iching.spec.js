import { test, expect } from '@playwright/test';

test('Profile flow from iching matches backend data', async ({ page, request }) => {
  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
  });

  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/profile/);

  await page.goto('/iching', { waitUntil: 'domcontentloaded' });
  await page.getByRole('link', { name: /Profile|个人资料|プロフィール|프로필/ }).click();
  await expect(page).toHaveURL(/\/profile/);

  const token = await page.evaluate(() => localStorage.getItem('bazi_token'));
  expect(token).toBeTruthy();

  const meRes = await request.get('/api/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(meRes.ok()).toBeTruthy();
  const meData = await meRes.json();
  const user = meData?.user || {};

  const profileCard = page.getByText('Name', { exact: true }).locator('..');
  await expect(profileCard.getByText(user.name || '—', { exact: true })).toBeVisible();
  const emailCard = page.getByText('Email', { exact: true }).locator('..');
  await expect(emailCard.getByText(user.email || '—', { exact: true })).toBeVisible();

  const settingsRes = await request.get('/api/user/settings', {
    headers: { Authorization: `Bearer ${token}` },
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
