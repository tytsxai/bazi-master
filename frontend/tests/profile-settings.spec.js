import { test, expect } from '@playwright/test';

test('User can update profile settings and see them persisted', async ({ page }) => {
  const uniqueName = `E2E Profile ${Date.now()}`;

  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
  });

  await page.goto('/login');
  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'password123');
  const initialSettingsResponse = page.waitForResponse(
    (resp) =>
      resp.url().includes('/api/user/settings') &&
      resp.request().method() === 'GET' &&
      resp.status() === 200,
    { timeout: 15000 },
  );
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/profile/);

  await expect(page.getByRole('heading', { name: 'Profile settings' })).toBeVisible();
  await initialSettingsResponse;

  const localeSelect = page.getByLabel('Locale');
  await localeSelect.selectOption('zh-CN');

  const profileNameInput = page.getByLabel('Display name (optional)');
  await profileNameInput.fill(uniqueName);

  const dailyGuidance = page.getByRole('checkbox', { name: 'Daily guidance' });
  const ritualReminders = page.getByRole('checkbox', { name: 'Ritual reminders' });
  const researchUpdates = page.getByRole('checkbox', { name: 'Research updates' });

  const dailyInitial = await dailyGuidance.isChecked();
  const ritualInitial = await ritualReminders.isChecked();

  await dailyGuidance.click();
  await ritualReminders.click();

  if (dailyInitial) {
    await expect(dailyGuidance).not.toBeChecked();
  } else {
    await expect(dailyGuidance).toBeChecked();
  }

  if (ritualInitial) {
    await expect(ritualReminders).not.toBeChecked();
  } else {
    await expect(ritualReminders).toBeChecked();
  }

  const saveResponse = page.waitForResponse(
    (resp) =>
      resp.url().includes('/api/user/settings') &&
      resp.request().method() === 'PUT' &&
      resp.status() === 200,
  );
  await page.getByRole('button', { name: 'Save settings' }).click();
  await saveResponse;

  await expect(page.getByText('Settings saved.')).toBeVisible();
  await expect(page.locator('#profile-name')).toHaveValue(uniqueName);

  const settingsResponse = page.waitForResponse(
    (resp) => resp.url().includes('/api/user/settings') && resp.status() === 200,
  );
  await page.reload();
  await settingsResponse;

  await expect(localeSelect).toHaveValue('zh-CN');
  await expect(profileNameInput).toHaveValue(uniqueName);

  if (dailyInitial) {
    await expect(dailyGuidance).not.toBeChecked();
  } else {
    await expect(dailyGuidance).toBeChecked();
  }

  if (ritualInitial) {
    await expect(ritualReminders).not.toBeChecked();
  } else {
    await expect(ritualReminders).toBeChecked();
  }

  await expect(researchUpdates).toBeVisible();
});
