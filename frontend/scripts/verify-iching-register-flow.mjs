import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = 'http://localhost:3000/';
const apiBase = 'http://localhost:4000';
const outDir = path.resolve(process.cwd(), 'verification');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');

await fs.mkdir(outDir, { recursive: true });

const testId = `ICHING_REGISTER_${Date.now()}`;
const email = `${testId.toLowerCase()}@example.com`;
const password = 'Passw0rd!';
const name = `Oracle ${testId}`;

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

try {
  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
  });

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`${baseUrl}iching`, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.removeItem('bazi_token');
    localStorage.removeItem('bazi_user');
    localStorage.removeItem('bazi_last_activity');
  });
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Unlock the full oracle' })).toBeVisible();
  await shot('iching-register-step-1-landing');

  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/register/);
  await shot('iching-register-step-2-register-page');

  await page.getByLabel('Display name (optional)').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByLabel('Confirm password').fill(password);
  await shot('iching-register-step-3-filled');

  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/iching/);
  await shot('iching-register-step-4-iching-after-register');

  const token = await page.evaluate(() => localStorage.getItem('bazi_token'));
  const userRaw = await page.evaluate(() => localStorage.getItem('bazi_user'));
  if (!token || !userRaw) {
    throw new Error('Missing auth data in localStorage after registration.');
  }
  const localUser = JSON.parse(userRaw);

  const res = await fetch(`${apiBase}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Auth me failed: ${res.status} ${err}`);
  }
  const data = await res.json();

  expect(data.user.email.toLowerCase()).toBe(localUser.email.toLowerCase());
  expect(data.user.id).toBe(localUser.id);
  expect(data.user.name).toBe(localUser.name);

  await expect(page.getByRole('button', { name: /Logout/ })).toBeVisible();

  if (consoleErrors.length) {
    throw new Error(`Console errors detected: ${consoleErrors.join(' | ')}`);
  }
} finally {
  await browser.close();
}

console.log('I Ching register flow verified.');
