import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = 'http://localhost:3000/';
const apiBase = 'http://localhost:4000';
const outDir = path.resolve(process.cwd(), 'verification');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');

await fs.mkdir(outDir, { recursive: true });

const testId = `DIRECT_URL_${Date.now()}`;
const userA = {
  email: `${testId.toLowerCase()}_a@example.com`,
  password: 'Passw0rd!',
  name: `Owner ${testId}`,
};
const userB = {
  email: `${testId.toLowerCase()}_b@example.com`,
  password: 'Passw0rd!',
  name: `Viewer ${testId}`,
};

const consoleErrors = [];

const shot = async (page, name) => {
  await page.screenshot({ path: path.join(outDir, `${stamp}-${name}.png`), fullPage: true });
};

const registerUser = async (user) => {
  const res = await fetch(`${apiBase}/api/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(user),
  });
  if (!res.ok && res.status !== 409) {
    const err = await res.text();
    throw new Error(`Register failed: ${res.status} ${err}`);
  }
};

const loginUser = async (user) => {
  const res = await fetch(`${apiBase}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: user.email, password: user.password }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Login failed: ${res.status} ${err}`);
  }
  return res.json();
};

const createRecord = async (token) => {
  const payload = {
    birthYear: 1991,
    birthMonth: 7,
    birthDay: 18,
    birthHour: 9,
    gender: 'female',
    birthLocation: `Access Test ${testId}`,
    timezone: 'UTC+8',
  };
  const res = await fetch(`${apiBase}/api/bazi/records`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Record creation failed: ${res.status} ${err}`);
  }
  const data = await res.json();
  if (!data?.record?.id) {
    throw new Error('Record creation returned no id.');
  }
  return data.record;
};

let browser;
try {
  await registerUser(userA);
  await registerUser(userB);

  const loginA = await loginUser(userA);
  const record = await createRecord(loginA.token);

  const loginB = await loginUser(userB);
  const directRes = await fetch(`${apiBase}/api/bazi/records/${record.id}`, {
    headers: { Authorization: `Bearer ${loginB.token}` },
  });
  if (directRes.status !== 404) {
    const err = await directRes.text();
    throw new Error(`Expected 404 for unauthorized record access, got ${directRes.status}: ${err}`);
  }

  browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
  });

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`${baseUrl}login`, { waitUntil: 'networkidle' });
  await shot(page, 'direct-url-step-1-login');

  await page.getByLabel('Email').fill(userB.email);
  await page.getByLabel('Password').fill(userB.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/profile/);
  await shot(page, 'direct-url-step-2-profile');

  await page.goto(`${baseUrl}history?recordId=${record.id}`, { waitUntil: 'networkidle' });
  await expect(page.getByText('Record not found')).toBeVisible();
  await expect(page.locator('[data-testid="history-shared-record"]')).toHaveCount(0);
  await shot(page, 'direct-url-step-3-blocked');

  if (consoleErrors.length) {
    throw new Error(`Console errors detected: ${consoleErrors.join(' | ')}`);
  }
  console.log('Direct URL access to another user\'s record is blocked.');

} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  if (browser) {
    await browser.close();
  }
}
