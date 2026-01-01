import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = 'http://localhost:3000/';
const apiBase = 'http://localhost:4000';
const outDir = path.resolve(process.cwd(), 'verification');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');

await fs.mkdir(outDir, { recursive: true });

const testId = `AI_STREAM_${Date.now()}`;
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
page.on('pageerror', (error) => {
  consoleErrors.push(error.message);
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

  await expect(page.getByRole('button', { name: new RegExp(name) })).toBeVisible();
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
  await shot('step-7-submit-calculation');

  await expect(page.getByRole('heading', { name: 'Four Pillars' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Five Elements' })).toBeVisible();
  await expect(page.getByTestId('pillars-empty')).toHaveCount(0);
  await expect(page.getByTestId('elements-empty')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Request Full Analysis' })).toBeEnabled();
  await shot('step-8-pillars-elements');

  await page.getByRole('button', { name: 'Request Full Analysis' }).click();
  await shot('step-9-request-full-analysis');
  await expect(page.getByRole('heading', { name: 'Ten Gods' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Major Luck Cycles' })).toBeVisible();
  await shot('step-10-ten-gods-luck');

  const wsEvents = {
    connected: false,
    started: false,
    done: false,
    errored: false,
    closed: false,
    chunks: 0,
  };

  const wsPromise = new Promise((resolve) => {
    page.on('websocket', (ws) => {
      if (!ws.url().includes('/ws/ai')) return;
      wsEvents.connected = true;
      ws.on('framereceived', (frame) => {
        try {
          const message = JSON.parse(frame.payload);
          if (message?.type === 'start') wsEvents.started = true;
          if (message?.type === 'chunk') wsEvents.chunks += 1;
          if (message?.type === 'done') wsEvents.done = true;
          if (message?.type === 'error') wsEvents.errored = true;
        } catch {
          // Ignore non-JSON frames.
        }
      });
      ws.on('close', () => {
        wsEvents.closed = true;
      });
      resolve(ws);
    });
  });

  await page.getByTestId('bazi-ai-interpret').click();
  await page.getByRole('button', { name: 'Request AI' }).click();
  await wsPromise;

  await expect(page.getByText('AI BaZi Analysis')).toBeVisible();
  await expect
    .poll(() => wsEvents.done || wsEvents.errored, {
      timeout: 15000,
    })
    .toBeTruthy();
  await expect.poll(() => wsEvents.closed, { timeout: 15000 }).toBeTruthy();

  if (!wsEvents.connected) {
    throw new Error('WebSocket did not connect.');
  }
  if (wsEvents.errored) {
    throw new Error('WebSocket returned an error response.');
  }
  if (wsEvents.chunks === 0) {
    throw new Error('WebSocket did not stream any chunks.');
  }
  if (!wsEvents.started) {
    throw new Error('WebSocket did not send start event.');
  }
  if (!wsEvents.done) {
    throw new Error('WebSocket did not send done event.');
  }
  if (!wsEvents.closed) {
    throw new Error('WebSocket did not close after streaming.');
  }

  const saveResponsePromise = page.waitForResponse((resp) =>
    resp.url().includes('/api/bazi/records')
  );
  await page.getByRole('button', { name: 'Save to History' }).click();
  const saveResponse = await saveResponsePromise;
  if (saveResponse.status() !== 200) {
    throw new Error(`Save failed: ${saveResponse.status()} ${await saveResponse.text()}`);
  }
  await shot('step-11-saved');

  const favResponsePromise = page.waitForResponse((resp) => resp.url().includes('/api/favorites'));
  await page.getByRole('button', { name: 'Add to Favorites' }).click();
  const favResponse = await favResponsePromise;
  if (favResponse.status() !== 200) {
    throw new Error(`Favorite failed: ${favResponse.status()} ${await favResponse.text()}`);
  }
  await shot('step-12-favorited');

  await page.goto(`${baseUrl}history`, { waitUntil: 'networkidle' });
  await expect(page.getByText(birthData.birthLocation)).toBeVisible();
  await shot('step-13-history');

  await expect(
    page.getByText(`${birthData.birthYear}-${birthData.birthMonth}-${birthData.birthDay}`)
  ).toBeVisible();
  await expect(page.getByText(birthData.gender)).toBeVisible();
  await shot('step-14-history-metadata');

  await page.goto(`${baseUrl}favorites`, { waitUntil: 'networkidle' });
  await expect(page.getByText(birthData.birthLocation)).toBeVisible();
  await shot('step-15-favorites');

  await page.getByRole('button', { name: new RegExp('Logout') }).click();
  await expect(page.getByRole('link', { name: 'Login' })).toBeVisible();
  await shot('step-16-logout');

  if (consoleErrors.length) {
    throw new Error(`Console errors detected: ${consoleErrors.join(' | ')}`);
  }
} finally {
  await browser.close();
}

console.log('AI streaming BaZi flow verified.');
