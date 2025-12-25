import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = 'http://localhost:3000/';
const apiBase = 'http://localhost:4000';
const outDir = path.resolve(process.cwd(), 'verification');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');

await fs.mkdir(outDir, { recursive: true });

const testId = `ZIWEI_${Date.now()}`;
const email = `${testId.toLowerCase()}@example.com`;
const password = 'Passw0rd!';
const name = `Atlas ${testId}`;
const birthData = {
  birthYear: 1991,
  birthMonth: 7,
  birthDay: 12,
  birthHour: 14,
  gender: 'female',
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
  await shot('ziwei-step-1-home');

  await page.getByRole('link', { name: 'Login' }).click();
  await page.waitForLoadState('networkidle');
  await shot('ziwei-step-2-login');

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await shot('ziwei-step-3-login-filled');
  await page.getByRole('button', { name: 'Sign In' }).click();

  await expect(page.getByTestId('header-user-name')).toContainText(name);
  await shot('ziwei-step-4-logged-in');

  await page.goto(`${baseUrl}ziwei`, { waitUntil: 'networkidle' });
  await shot('ziwei-step-5-ziwei');

  await page.getByLabel('Birth Year').fill(String(birthData.birthYear));
  await page.getByLabel('Birth Month').fill(String(birthData.birthMonth));
  await page.getByLabel('Birth Day').fill(String(birthData.birthDay));
  await page.getByLabel('Birth Hour (0-23)').selectOption(String(birthData.birthHour));
  await page.getByLabel('Gender').selectOption(birthData.gender);
  await shot('ziwei-step-6-ziwei-filled');

  const calcResponsePromise = page.waitForResponse((resp) => resp.url().includes('/api/ziwei/calculate'));
  await page.getByRole('button', { name: 'Generate Zi Wei Chart' }).click();
  const calcResponse = await calcResponsePromise;
  if (calcResponse.status() !== 200) {
    throw new Error(`Calculation failed: ${calcResponse.status()} ${await calcResponse.text()}`);
  }
  await expect(page.getByRole('heading', { name: 'Four Transformations' })).toBeVisible();
  await shot('ziwei-step-7-chart');

  const saveResponsePromise = page.waitForResponse((resp) => resp.url().includes('/api/ziwei/history'));
  await page.getByRole('button', { name: 'Save to History' }).click();
  const saveResponse = await saveResponsePromise;
  if (saveResponse.status() !== 200) {
    throw new Error(`Save failed: ${saveResponse.status()} ${await saveResponse.text()}`);
  }
  const savePayload = await saveResponse.json();
  const savedRecord = savePayload.record;
  if (!savedRecord?.id) {
    throw new Error('Save response missing record id.');
  }
  await shot('ziwei-step-8-saved');

  const token = await page.evaluate(() => localStorage.getItem('bazi_token'));
  const historyRes = await fetch(`${apiBase}/api/ziwei/history`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!historyRes.ok) {
    throw new Error(`History fetch failed: ${historyRes.status()} ${await historyRes.text()}`);
  }
  const historyData = await historyRes.json();
  const backendRecord = (historyData.records || []).find((record) => record.id === savedRecord.id);
  if (!backendRecord) {
    throw new Error('Saved Ziwei record not found in backend history.');
  }

  const expectedMingPalace = `${backendRecord.chart.mingPalace.palace.cn}·${backendRecord.chart.mingPalace.branch.name}`;
  const card = page.locator(
    `[data-testid=\"ziwei-history-card\"][data-record-id=\"${savedRecord.id}\"]`
  );
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('data-ming-palace', expectedMingPalace);
  await shot('ziwei-step-9-history-verified');

  if (consoleErrors.length) {
    throw new Error(`Console errors detected: ${consoleErrors.join(' | ')}`);
  }
} finally {
  await browser.close();
}

console.log('Ziwei history flow verified.');
