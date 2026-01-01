import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = 'http://localhost:3000/';
const apiBase = 'http://localhost:4000';
const outDir = path.resolve(process.cwd(), 'verification');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');

await fs.mkdir(outDir, { recursive: true });

const testId = `TAROT_${Date.now()}`;
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
  await shot('tarot-step-1-home');

  await page.getByRole('link', { name: 'Login' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await shot('tarot-step-2-login-filled');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('button', { name: new RegExp(name) })).toBeVisible();
  await shot('tarot-step-3-logged-in');

  await page.goto(`${baseUrl}tarot`, { waitUntil: 'networkidle' });
  await shot('tarot-step-4-page');

  await page.getByLabel('Your question (optional)').fill(question);
  await page.getByRole('button', { name: /Draw/ }).click();
  await expect(page.getByTestId('tarot-card').first()).toBeVisible();
  await shot('tarot-step-5-drawn');

  await page.getByRole('button', { name: /Reveal AI Meaning/ }).click();
  await page
    .getByRole('dialog', { name: 'Request AI interpretation?' })
    .getByRole('button', { name: 'Request AI' })
    .click();
  await expect(page.getByRole('heading', { name: 'Often the cards whisper...' })).toBeVisible();
  await shot('tarot-step-6-ai');

  await expect(page.getByText(question)).toBeVisible();
  await shot('tarot-step-7-history');

  await page.getByRole('button', { name: 'Remove' }).first().click();
  await page
    .getByRole('dialog', { name: 'Delete this reading?' })
    .getByRole('button', { name: 'Delete' })
    .click();
  await shot('tarot-step-8-history-deleted');

  await page.getByRole('button', { name: new RegExp('Logout') }).click();
  await expect(page.getByRole('link', { name: 'Login' })).toBeVisible();
  await shot('tarot-step-9-logout');

  if (consoleErrors.length) {
    throw new Error(`Console errors detected: ${consoleErrors.join(' | ')}`);
  }
} finally {
  await browser.close();
}

console.log('Tarot flow verified.');
