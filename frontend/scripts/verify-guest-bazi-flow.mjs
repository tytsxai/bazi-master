import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = 'http://localhost:3000/';
const outDir = path.resolve(process.cwd(), 'verification');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');

await fs.mkdir(outDir, { recursive: true });

const testId = `GUEST_${Date.now()}`;
const birthData = {
  birthYear: 1991,
  birthMonth: 11,
  birthDay: 9,
  birthHour: 9,
  gender: 'male',
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

try {
  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
    localStorage.removeItem('bazi_token');
    localStorage.removeItem('bazi_user');
  });

  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.setViewportSize({ width: 1280, height: 720 });
  await shot('guest-step-1-home');

  await page.getByRole('link', { name: /BaZi.*Four Pillars/ }).click();
  await page.waitForLoadState('networkidle');
  await shot('guest-step-2-bazi');

  await page.getByLabel('Birth Year').fill(String(birthData.birthYear));
  await page.getByLabel('Birth Month').fill(String(birthData.birthMonth));
  await page.getByLabel('Birth Day').fill(String(birthData.birthDay));
  await page.getByLabel('Birth Hour (0-23)').fill(String(birthData.birthHour));
  await page.getByLabel('Gender').selectOption('male');
  await page.getByLabel('Birth Location').fill(birthData.birthLocation);
  await page.getByLabel('Timezone').fill(birthData.timezone);
  await shot('guest-step-3-bazi-filled');

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
  await shot('guest-step-4-basic-result');

  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByTestId('pillars-empty')).toHaveCount(0);
  await expect(page.getByTestId('elements-empty')).toHaveCount(0);
  await expect(page.getByLabel('Birth Location')).toHaveValue(birthData.birthLocation);
  await shot('guest-step-5-after-refresh');

  await page.getByRole('button', { name: 'Request Full Analysis' }).click();
  await expect(page.getByText('Please log in to access this feature.')).toBeVisible();
  await shot('guest-step-6-login-required');

  if (consoleErrors.length) {
    throw new Error(`Console errors detected: ${consoleErrors.join(' | ')}`);
  }
} finally {
  await browser.close();
}

console.log('Guest Bazi flow verified.');
