import { test, expect } from './fixtures.js';
import path from 'path';

const screenshotPath = (name) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(process.cwd(), '..', 'verification', `${stamp}-${name}.png`);
};

const resolvePort = (value) => {
  const parsed = Number(value);
  const port = Number.isFinite(parsed) ? Math.trunc(parsed) : NaN;
  return Number.isFinite(port) && port > 0 ? port : null;
};

const backendPort = resolvePort(process.env.E2E_API_PORT) ?? resolvePort(process.env.BACKEND_PORT);
const apiBase =
  process.env.PW_API_BASE ||
  (backendPort ? `http://127.0.0.1:${backendPort}` : 'http://127.0.0.1:4000');

test('Security: Profile flow from /tarot matches backend data', async ({ page, request }) => {
  const consoleErrors = [];

  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
  });

  await page.goto('/tarot', { waitUntil: 'domcontentloaded' });
  await page.screenshot({ path: screenshotPath('security-profile-tarot-step-1-tarot') });

  if (page.url().includes('/login')) {
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(profile|tarot)/);
    await page.goto('/tarot');
  }

  await expect(page).toHaveURL(/\/tarot/);
  await expect(page.getByRole('link', { name: /Tarot|塔罗/ }).first()).toBeVisible();

  const profileLink = page.getByRole('link', { name: /Profile|个人资料|プロフィール|프로필/ });
  const profileLinkCount = await profileLink.count();
  if (!profileLinkCount || !(await profileLink.first().isVisible())) {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/profile/);
    await page.goto('/tarot');
    await expect(profileLink.first()).toBeVisible();
  }

  const profileRequest = page.waitForResponse(
    (resp) => resp.url().includes('/api/auth/me') && resp.status() === 200
  );
  const settingsRequest = page.waitForResponse(
    (resp) => resp.url().includes('/api/user/settings') && resp.status() === 200
  );

  await profileLink.first().click();
  await profileRequest;
  await settingsRequest;

  await expect(page).toHaveURL(/\/profile/);
  await page.screenshot({ path: screenshotPath('security-profile-tarot-step-2-profile') });

  const token = await page.evaluate(() => localStorage.getItem('bazi_token'));
  expect(token).toBeTruthy();

  const meRes = await request.get(`${apiBase}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(meRes.ok()).toBeTruthy();
  const meData = await meRes.json();
  const user = meData?.user || {};

  const profileCard = page.getByText('Name', { exact: true }).locator('..');
  await expect(profileCard.getByText(user.name || '—', { exact: true })).toBeVisible();
  const emailCard = page.getByText('Email', { exact: true }).locator('..');
  await expect(emailCard.getByText(user.email || '—', { exact: true })).toBeVisible();

  const settingsRes = await request.get(`${apiBase}/api/user/settings`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(settingsRes.ok()).toBeTruthy();
  const settingsData = await settingsRes.json();
  const settings = settingsData?.settings || {};
  const preferences = settings?.preferences || {};

  const expectedProfileName =
    typeof preferences.profileName === 'string' ? preferences.profileName.trim() : '';
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

  await expect(page.getByRole('checkbox', { name: 'Daily guidance' })).toHaveJSProperty(
    'checked',
    expectedDaily
  );
  await expect(page.getByRole('checkbox', { name: 'Ritual reminders' })).toHaveJSProperty(
    'checked',
    expectedRitual
  );
  await expect(page.getByRole('checkbox', { name: 'Research updates' })).toHaveJSProperty(
    'checked',
    expectedResearch
  );

  expect(consoleErrors).toEqual([]);
});
