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
  birthYear: 1993,
  birthMonth: 6,
  birthDay: 18,
  birthHour: 14,
  gender: 'female',
  birthLocation: `${testId}_VERIFY_ME`,
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
  await shot('step-1-home');

  await page.getByRole('link', { name: 'Login' }).click();
  await page.waitForLoadState('networkidle');
  await shot('step-2-login');

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await shot('step-3-login-filled');
  await page.getByRole('button', { name: 'Sign In' }).click();

  await expect(page.getByTestId('header-user-name')).toHaveText(name);
  await shot('step-4-logged-in');

  await page.goto(`${baseUrl}bazi`, { waitUntil: 'networkidle' });
  await shot('step-5-bazi');

  await page.getByLabel('Birth Year').fill(String(birthData.birthYear));
  await page.getByLabel('Birth Month').fill(String(birthData.birthMonth));
  await page.getByLabel('Birth Day').fill(String(birthData.birthDay));
  await page.getByLabel('Birth Hour (0-23)').fill(String(birthData.birthHour));
  await page.getByLabel('Gender').selectOption(birthData.gender);
  await page.getByLabel('Birth Location').fill(birthData.birthLocation);
  await page.getByLabel('Timezone').fill(birthData.timezone);
  await shot('step-6-bazi-filled');

  const calcResponsePromise = page.waitForResponse((resp) =>
    resp.url().includes('/api/bazi/calculate')
  );
  await page.getByRole('button', { name: 'Calculate' }).click();
  const calcResponse = await calcResponsePromise;
  if (calcResponse.status() !== 200) {
    throw new Error(`Calculation failed: ${calcResponse.status()} ${await calcResponse.text()}`);
  }
  await expect(page.getByRole('heading', { name: 'Four Pillars' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Five Elements' })).toBeVisible();
  await expect(page.getByTestId('pillars-empty')).toHaveCount(0);
  await expect(page.getByTestId('elements-empty')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Request Full Analysis' })).toBeEnabled();
  await shot('step-7-basic-result');

  await page.getByRole('button', { name: 'Request Full Analysis' }).click();
  await expect(page.getByRole('heading', { name: 'Ten Gods' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Major Luck Cycles' })).toBeVisible();
  await shot('step-8-full-analysis');

  const saveResponsePromise = page.waitForResponse((resp) =>
    resp.url().includes('/api/bazi/records')
  );
  await page.getByRole('button', { name: 'Save to History' }).click();
  const saveResponse = await saveResponsePromise;
  if (saveResponse.status() !== 200) {
    throw new Error(`Save failed: ${saveResponse.status()} ${await saveResponse.text()}`);
  }
  await shot('step-9-saved');

  const favResponsePromise = page.waitForResponse((resp) => resp.url().includes('/api/favorites'));
  await page.getByRole('button', { name: 'Add to Favorites' }).click();
  const favResponse = await favResponsePromise;
  if (favResponse.status() !== 200) {
    throw new Error(`Favorite failed: ${favResponse.status()} ${await favResponse.text()}`);
  }
  await shot('step-10-favorited');

  await page.goto(`${baseUrl}history`, { waitUntil: 'networkidle' });
  await expect(page.getByText(birthData.birthLocation)).toBeVisible();
  await shot('step-11-history');

  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByText(birthData.birthLocation)).toBeVisible();
  await shot('step-12-history-refresh');

  await page.goto(`${baseUrl}favorites`, { waitUntil: 'networkidle' });
  await expect(page.getByText(birthData.birthLocation)).toBeVisible();
  await shot('step-13-favorites');

  await page.getByRole('button', { name: 'Remove' }).first().click();
  await shot('step-14-favorite-removed');

  await page.goto(`${baseUrl}history`, { waitUntil: 'networkidle' });
  await expect(page.getByText(birthData.birthLocation)).toBeVisible();
  await page.getByRole('button', { name: 'Delete', exact: true }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText(birthData.birthLocation)).toHaveCount(0);
  await shot('step-15-history-deleted');

  await page.getByRole('button', { name: new RegExp('Logout') }).click();
  await expect(page.getByRole('link', { name: 'Login' })).toBeVisible();
  await shot('step-16-logout');

  if (consoleErrors.length) {
    throw new Error(`Console errors detected: ${consoleErrors.join(' | ')}`);
  }
} finally {
  await browser.close();
}

console.log('Registered user Bazi flow verified.');
