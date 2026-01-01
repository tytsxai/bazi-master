import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = 'http://localhost:3000/';
const apiBase = 'http://localhost:4000';
const outDir = path.resolve(process.cwd(), 'verification');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');

await fs.mkdir(outDir, { recursive: true });

const testId = `TEST_${Date.now()}`;
const email = `${testId.toLowerCase()}@example.com`;
const password = 'Passw0rd!';
const name = `History Profile ${testId}`;
const desiredSettings = {
  locale: 'en-US',
  preferences: {
    dailyGuidance: false,
    ritualReminders: true,
    researchUpdates: false,
    profileName: `Display ${testId}`,
    aiProvider: '',
  },
};

const consoleErrors = [];
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', (msg) => {
  if (msg.type() === 'error') {
    consoleErrors.push(msg.text());
  }
});

const shot = async (name) => {
  await page.screenshot({ path: path.join(outDir, `${stamp}-${name}.png`), fullPage: true });
};

const registerUser = async () => {
  const res = await fetch(`${apiBase}/api/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name }),
  });
  if (!res.ok && res.status !== 409) {
    const err = await res.text();
    throw new Error(`Register failed: ${res.status} ${err}`);
  }
};

try {
  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
  });

  await registerUser();

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`${baseUrl}login`, { waitUntil: 'networkidle' });
  await shot('step-1-login');

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await shot('step-2-login-filled');
  await page.getByRole('button', { name: 'Sign In' }).click();

  await expect(page).toHaveURL(/\/profile/);
  await shot('step-3-profile-landing');

  const token = await page.evaluate(() => localStorage.getItem('bazi_token'));
  if (!token) {
    throw new Error('Missing auth token after login.');
  }

  const settingsRes = await fetch(`${apiBase}/api/user/settings`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(desiredSettings),
  });
  if (!settingsRes.ok) {
    const err = await settingsRes.text();
    throw new Error(`Settings update failed: ${settingsRes.status} ${err}`);
  }

  await page.goto(`${baseUrl}history`, { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();
  await shot('step-4-history');

  const profileRequest = page.waitForResponse(
    (resp) => resp.url().includes('/api/auth/me') && resp.status() === 200
  );
  const settingsRequest = page.waitForResponse(
    (resp) => resp.url().includes('/api/user/settings') && resp.status() === 200
  );

  await page.getByRole('link', { name: 'Profile' }).click();
  await profileRequest;
  await settingsRequest;

  await expect(page).toHaveURL(/\/profile/);
  await shot('step-5-profile');

  const authRes = await fetch(`${apiBase}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!authRes.ok) {
    const err = await authRes.text();
    throw new Error(`Auth check failed: ${authRes.status} ${err}`);
  }
  const authData = await authRes.json();
  const user = authData?.user || {};

  const settingsGetRes = await fetch(`${apiBase}/api/user/settings`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!settingsGetRes.ok) {
    const err = await settingsGetRes.text();
    throw new Error(`Settings fetch failed: ${settingsGetRes.status} ${err}`);
  }
  const settingsData = await settingsGetRes.json();
  const prefs = settingsData?.settings?.preferences || {};

  await expect(page.getByText(user.name)).toBeVisible();
  await expect(page.getByText(user.email)).toBeVisible();

  await expect(page.getByLabel('Locale')).toHaveValue(settingsData?.settings?.locale || 'en-US');
  await expect(page.getByLabel('Display name (optional)')).toHaveValue(prefs.profileName || '');

  const dailyGuidance = page.getByRole('checkbox', { name: 'Daily guidance' });
  const ritualReminders = page.getByRole('checkbox', { name: 'Ritual reminders' });
  const researchUpdates = page.getByRole('checkbox', { name: 'Research updates' });

  if (prefs.dailyGuidance) {
    await expect(dailyGuidance).toBeChecked();
  } else {
    await expect(dailyGuidance).not.toBeChecked();
  }
  if (prefs.ritualReminders) {
    await expect(ritualReminders).toBeChecked();
  } else {
    await expect(ritualReminders).not.toBeChecked();
  }
  if (prefs.researchUpdates) {
    await expect(researchUpdates).toBeChecked();
  } else {
    await expect(researchUpdates).not.toBeChecked();
  }

  if (consoleErrors.length) {
    throw new Error(`Console errors detected: ${consoleErrors.join(' | ')}`);
  }
} finally {
  await browser.close();
}

console.log('Profile flow from history verified.');
