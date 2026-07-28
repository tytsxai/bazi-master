import { chromium, expect } from '@playwright/test';
import { createEvidence } from './lib/evidence.mjs';

const baseUrl = 'http://localhost:3000/history';
const evidence = await createEvidence();

const browser = await chromium.launch();
const page = await browser.newPage();
const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') {
    consoleErrors.push(msg.text());
  }
});

try {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('locale', 'en-US');
  });

  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
  await evidence.shot(page, 'auth-guard-login');

  if (consoleErrors.length) {
    throw new Error(`Console errors detected: ${consoleErrors.join(' | ')}`);
  }
} finally {
  await browser.close();
}

console.log('Auth guard verified.');
