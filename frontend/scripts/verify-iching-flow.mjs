import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = 'http://localhost:3000/';
const apiBase = 'http://localhost:4000';
const outDir = path.resolve(process.cwd(), 'verification');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');

await fs.mkdir(outDir, { recursive: true });

const testId = `ICHING_${Date.now()}`;
const email = `${testId.toLowerCase()}@example.com`;
const password = 'Passw0rd!';
const name = `Seer ${testId}`;
const question = `Question ${testId} VERIFY_ME`;

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
  await shot('iching-step-1-home');

  await page.getByRole('link', { name: 'Login' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await shot('iching-step-2-login-filled');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('button', { name: new RegExp(name) })).toBeVisible();
  await shot('iching-step-3-logged-in');

  await page.goto(`${baseUrl}iching`, { waitUntil: 'networkidle' });
  await shot('iching-step-4-page');

  await page.getByLabel('First number').fill('12');
  await page.getByLabel('Second number').fill('27');
  await page.getByLabel('Third number').fill('44');
  await page.getByLabel('Your question (optional)').fill(question);
  await shot('iching-step-5-filled');

  await page.getByRole('button', { name: 'Divine with Numbers' }).click();
  await expect(page.getByRole('heading', { name: 'Primary Hexagram' })).toBeVisible();
  await expect(page.getByText('Changing lines:')).toBeVisible();
  await shot('iching-step-6-divined');

  await page.getByRole('button', { name: 'Reveal AI Interpretation' }).click();
  await expect(page.getByRole('heading', { name: 'Oracle Reflection' })).toBeVisible();
  await shot('iching-step-7-ai');

  await page.getByRole('button', { name: 'Save to History' }).click();
  await expect(page.getByText('Reading saved to history.')).toBeVisible();
  await expect(page.getByText(question)).toBeVisible();
  await shot('iching-step-8-saved');

  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByText(question)).toBeVisible();
  await shot('iching-step-9-history-refresh');

  await page.getByRole('button', { name: 'Delete' }).first().click();
  await shot('iching-step-10-history-deleted');

  await page.getByRole('button', { name: new RegExp('Logout') }).click();
  await expect(page.getByRole('link', { name: 'Login' })).toBeVisible();
  await shot('iching-step-11-logout');

  if (consoleErrors.length) {
    throw new Error(`Console errors detected: ${consoleErrors.join(' | ')}`);
  }
} finally {
  await browser.close();
}

console.log('I Ching flow verified.');
