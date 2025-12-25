import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = 'http://localhost:3000/';
const apiBase = 'http://localhost:4000';
const outDir = path.resolve(process.cwd(), 'verification');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');

await fs.mkdir(outDir, { recursive: true });

const testId = `PERF_${Date.now()}`;
const email = `${testId.toLowerCase()}@example.com`;
const password = 'Passw0rd!';
const name = `Seer ${testId}`;
const flowLocation = `${testId}_FLOW`;
const birthData = {
  birthYear: 1990,
  birthMonth: 5,
  birthDay: 21,
  birthHour: 8,
  gender: 'male',
  birthLocation: flowLocation,
  timezone: 'UTC',
};
const datasetPrefix = `${testId}_DATA`;

const buildDataset = (count, prefix) => {
  const pillars = {
    year: { stem: 'Jia', branch: 'Zi' },
    month: { stem: 'Yi', branch: 'Chou' },
    day: { stem: 'Bing', branch: 'Yin' },
    hour: { stem: 'Ding', branch: 'Mao' },
  };
  const fiveElements = {
    wood: 1,
    fire: 1,
    earth: 1,
    metal: 1,
    water: 1,
  };
  return Array.from({ length: count }, (_, index) => ({
    birthYear: 1991,
    birthMonth: 8,
    birthDay: 17,
    birthHour: index % 24,
    gender: index % 2 === 0 ? 'male' : 'female',
    birthLocation: `${prefix}-${index + 1}`,
    timezone: 'UTC',
    pillars,
    fiveElements,
  }));
};

const shot = async (page, name) => {
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

const loginUser = async () => {
  const res = await fetch(`${apiBase}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Login failed: ${res.status} ${err}`);
  }
  return res.json();
};

const importDataset = async (token, records) => {
  const res = await fetch(`${apiBase}/api/bazi/records/import`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ records }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Import failed: ${res.status} ${err}`);
  }
};

const consoleErrors = [];
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (error) => consoleErrors.push(error.message));
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});

try {
  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
  });

  await registerUser();
  const { token } = await loginUser();
  const dataset = buildDataset(1000, datasetPrefix);
  await importDataset(token, dataset);

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.removeItem('bazi_token');
    localStorage.removeItem('bazi_user');
    localStorage.removeItem('bazi_last_activity');
  });
  await page.reload({ waitUntil: 'networkidle' });
  await shot(page, 'step-1-home');

  await page.getByRole('link', { name: 'Login' }).click();
  await page.waitForLoadState('networkidle');
  await shot(page, 'step-2-login');

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await shot(page, 'step-3-login-filled');
  await page.getByRole('button', { name: 'Sign In' }).click();

  await expect(page.getByRole('button', { name: new RegExp(name) })).toBeVisible();
  await shot(page, 'step-4-logged-in');

  await page.goto(`${baseUrl}bazi`, { waitUntil: 'networkidle' });
  await shot(page, 'step-5-bazi');

  await page.getByLabel('Birth Year').fill(String(birthData.birthYear));
  await page.getByLabel('Birth Month').fill(String(birthData.birthMonth));
  await page.getByLabel('Birth Day').fill(String(birthData.birthDay));
  await page.getByLabel('Birth Hour (0-23)').fill(String(birthData.birthHour));
  await page.getByLabel('Gender').selectOption(birthData.gender);
  await page.getByLabel('Birth Location').fill(birthData.birthLocation);
  await page.getByLabel('Timezone').fill(birthData.timezone);
  await shot(page, 'step-6-bazi-filled');

  const calcResponsePromise = page.waitForResponse((resp) => resp.url().includes('/api/bazi/calculate'));
  await page.getByRole('button', { name: 'Calculate' }).click();
  const calcResponse = await calcResponsePromise;
  if (calcResponse.status() !== 200) {
    throw new Error(`Calculation failed: ${calcResponse.status()} ${await calcResponse.text()}`);
  }
  await expect(page.getByRole('heading', { name: 'Four Pillars' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Five Elements' })).toBeVisible();
  await shot(page, 'step-7-basic-result');

  await page.getByRole('button', { name: 'Request Full Analysis' }).click();
  await expect(page.getByRole('heading', { name: 'Ten Gods' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Major Luck Cycles' })).toBeVisible();
  await shot(page, 'step-8-full-analysis');

  const saveResponsePromise = page.waitForResponse((resp) => resp.url().includes('/api/bazi/records'));
  await page.getByRole('button', { name: 'Save to History' }).click();
  const saveResponse = await saveResponsePromise;
  if (saveResponse.status() !== 200) {
    throw new Error(`Save failed: ${saveResponse.status()} ${await saveResponse.text()}`);
  }
  await shot(page, 'step-9-saved');

  const favResponsePromise = page.waitForResponse((resp) => resp.url().includes('/api/favorites'));
  await page.getByRole('button', { name: 'Add to Favorites' }).click();
  const favResponse = await favResponsePromise;
  if (favResponse.status() !== 200) {
    throw new Error(`Favorite failed: ${favResponse.status()} ${await favResponse.text()}`);
  }
  await shot(page, 'step-10-favorited');

  await page.goto(`${baseUrl}history`, { waitUntil: 'networkidle' });
  await expect(page.getByText(flowLocation)).toBeVisible();

  const searchInput = page.getByPlaceholder('Location, timezone, pillar');
  const searchStart = Date.now();
  const searchResponsePromise = page.waitForResponse((resp) =>
    resp.url().includes('/api/bazi/records') &&
    resp.url().includes(`q=${encodeURIComponent(flowLocation)}`) &&
    resp.status() === 200
  );
  await searchInput.fill(flowLocation);
  await searchResponsePromise;
  const searchDuration = Date.now() - searchStart;
  if (searchDuration > 4000) {
    throw new Error(`Search took too long: ${searchDuration}ms`);
  }
  await expect(page.getByText(flowLocation)).toBeVisible();

  const recordCard = page.getByTestId('history-record-card').filter({ hasText: flowLocation }).first();
  await expect(recordCard).toContainText(`${birthData.birthYear}-${birthData.birthMonth}-${birthData.birthDay}`);
  await expect(recordCard).toContainText(birthData.gender);
  await expect(recordCard).toContainText('UTC');
  await shot(page, 'step-11-history-search');

  await page.goto(`${baseUrl}favorites`, { waitUntil: 'networkidle' });
  await expect(page.getByText(flowLocation)).toBeVisible();
  await shot(page, 'step-12-favorites');

  await page.getByRole('button', { name: new RegExp('Logout') }).click();
  await expect(page.getByRole('link', { name: 'Login' })).toBeVisible();
  await shot(page, 'step-13-logout');

  if (consoleErrors.length) {
    throw new Error(`Console errors detected: ${consoleErrors.join(' | ')}`);
  }
} finally {
  await browser.close();
}

console.log('Performance large-dataset smoke flow verified.');
