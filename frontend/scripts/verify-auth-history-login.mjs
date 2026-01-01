import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = 'http://localhost:3000/';
const apiBase = 'http://localhost:4000';
const outDir = path.resolve(process.cwd(), 'verification');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');

await fs.mkdir(outDir, { recursive: true });

const testId = `AUTH_HISTORY_${Date.now()}`;
const email = `${testId.toLowerCase()}@example.com`;
const password = 'Passw0rd!';
const name = `Gatekeeper ${testId}`;
const birthData = {
  birthYear: 1998,
  birthMonth: 4,
  birthDay: 22,
  birthHour: 9,
  gender: 'female',
  birthLocation: `${testId}_LIMA`,
  timezone: 'UTC+08:00',
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

const loginApi = async () => {
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

const createHistoryRecord = async (token) => {
  const res = await fetch(`${apiBase}/api/bazi/records`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(birthData),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Record create failed: ${res.status} ${err}`);
  }
  const payload = await res.json();
  if (!payload?.record?.id) {
    throw new Error('Record create response missing id.');
  }
  return payload.record;
};

try {
  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
  });

  await registerUser();
  const loginPayload = await loginApi();
  const token = loginPayload.token;
  if (!token) {
    throw new Error('Login response missing token.');
  }
  const createdRecord = await createHistoryRecord(token);

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`${baseUrl}history`, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.removeItem('bazi_token');
    localStorage.removeItem('bazi_user');
    localStorage.removeItem('bazi_last_activity');
    sessionStorage.clear();
  });
  await page.reload({ waitUntil: 'networkidle' });

  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
  await shot('auth-history-step-1-login');

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await shot('auth-history-step-2-login-filled');
  await page.getByRole('button', { name: 'Sign In' }).click();

  await expect(page).toHaveURL(/\/history/);
  await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();
  await shot('auth-history-step-3-history');

  const uiToken = await page.evaluate(() => localStorage.getItem('bazi_token'));
  if (!uiToken) {
    throw new Error('UI login did not store token.');
  }

  const historyRes = await fetch(`${apiBase}/api/bazi/records`, {
    headers: { Authorization: `Bearer ${uiToken}` },
  });
  if (!historyRes.ok) {
    throw new Error(`History fetch failed: ${historyRes.status} ${await historyRes.text()}`);
  }
  const historyData = await historyRes.json();
  const backendRecord = (historyData.records || []).find(
    (record) => record.id === createdRecord.id
  );
  if (!backendRecord) {
    throw new Error('Created record not found in backend history.');
  }

  const card = page.locator(
    `[data-testid="history-record-card"][data-record-id="${backendRecord.id}"]`
  );
  await expect(card).toBeVisible();
  await expect(card).toContainText(
    `${backendRecord.birthYear}-${backendRecord.birthMonth}-${backendRecord.birthDay} · ${backendRecord.birthHour}:00`
  );
  await expect(card).toContainText(
    `${backendRecord.gender} · ${backendRecord.birthLocation || '—'} · ${backendRecord.timezone || 'UTC'}`
  );
  await shot('auth-history-step-4-backend-match');

  if (consoleErrors.length) {
    throw new Error(`Console errors detected: ${consoleErrors.join(' | ')}`);
  }
} finally {
  await browser.close();
}

console.log('Auth login history flow verified.');
