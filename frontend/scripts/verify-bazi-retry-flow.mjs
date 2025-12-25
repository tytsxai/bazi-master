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
const name = `Seer ${testId}`;
const birthData = {
  birthYear: 1992,
  birthMonth: 11,
  birthDay: 5,
  birthHour: 9,
  gender: 'male',
  birthLocation: `${testId}_RETRY_ME`,
  timezone: 'UTC+8',
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

const failOnce = (pattern) => {
  let hasFailed = false;
  page.route(pattern, (route) => {
    if (!hasFailed) {
      hasFailed = true;
      route.abort('failed');
      return;
    }
    route.continue();
  });
};

try {
  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
  });

  await registerUser();

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.removeItem('bazi_token');
    localStorage.removeItem('bazi_user');
    localStorage.removeItem('bazi_last_activity');
  });
  await page.reload({ waitUntil: 'networkidle' });
  await shot('retry-step-1-home');

  await page.getByRole('link', { name: 'Login' }).click();
  await page.waitForLoadState('networkidle');
  await shot('retry-step-2-login');

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await shot('retry-step-3-login-filled');
  await page.getByRole('button', { name: 'Sign In' }).click();

  await expect(page.getByRole('button', { name: new RegExp(name) })).toBeVisible();
  await shot('retry-step-4-logged-in');

  await page.goto(`${baseUrl}bazi`, { waitUntil: 'networkidle' });
  await shot('retry-step-5-bazi');

  await page.getByLabel('Birth Year').fill(String(birthData.birthYear));
  await page.getByLabel('Birth Month').fill(String(birthData.birthMonth));
  await page.getByLabel('Birth Day').fill(String(birthData.birthDay));
  await page.getByLabel('Birth Hour (0-23)').fill(String(birthData.birthHour));
  await page.getByLabel('Gender').selectOption(birthData.gender);
  await page.getByLabel('Birth Location').fill(birthData.birthLocation);
  await page.getByLabel('Timezone').fill(birthData.timezone);
  await shot('retry-step-6-bazi-filled');

  failOnce('**/api/bazi/calculate');
  await page.getByRole('button', { name: 'Calculate' }).click();
  await expect(page.getByTestId('retry-banner')).toBeVisible();
  await shot('retry-step-7-calc-failed');

  await page.getByTestId('retry-action').click();
  await expect(page.getByRole('heading', { name: 'Four Pillars' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Five Elements' })).toBeVisible();
  await expect(page.getByTestId('retry-banner')).toHaveCount(0);
  await shot('retry-step-8-calc-retried');

  failOnce('**/api/bazi/full-analysis');
  await page.getByRole('button', { name: 'Request Full Analysis' }).click();
  await expect(page.getByTestId('retry-banner')).toBeVisible();
  await shot('retry-step-9-full-failed');

  await page.getByTestId('retry-action').click();
  await expect(page.getByRole('heading', { name: 'Ten Gods' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Major Luck Cycles' })).toBeVisible();
  await expect(page.getByTestId('retry-banner')).toHaveCount(0);
  await shot('retry-step-10-full-retried');

  const saveResponsePromise = page.waitForResponse((resp) => resp.url().includes('/api/bazi/records'));
  await page.getByRole('button', { name: 'Save to History' }).click();
  const saveResponse = await saveResponsePromise;
  if (saveResponse.status() !== 200) {
    throw new Error(`Save failed: ${saveResponse.status()} ${await saveResponse.text()}`);
  }
  await shot('retry-step-11-saved');

  const favResponsePromise = page.waitForResponse((resp) => resp.url().includes('/api/favorites'));
  await page.getByRole('button', { name: 'Add to Favorites' }).click();
  const favResponse = await favResponsePromise;
  if (favResponse.status() !== 200) {
    throw new Error(`Favorite failed: ${favResponse.status()} ${await favResponse.text()}`);
  }
  await shot('retry-step-12-favorited');

  await page.goto(`${baseUrl}history`, { waitUntil: 'networkidle' });
  await expect(page.getByText(birthData.birthLocation)).toBeVisible();
  await shot('retry-step-13-history');

  await page.goto(`${baseUrl}favorites`, { waitUntil: 'networkidle' });
  await expect(page.getByText(birthData.birthLocation)).toBeVisible();
  await shot('retry-step-14-favorites');

  await page.getByRole('button', { name: new RegExp('Logout') }).click();
  await expect(page.getByRole('link', { name: 'Login' })).toBeVisible();
  await shot('retry-step-15-logout');

  if (consoleErrors.length) {
    throw new Error(`Console errors detected: ${consoleErrors.join(' | ')}`);
  }
} finally {
  await browser.close();
}

console.log('Failure handling retry flow verified.');
