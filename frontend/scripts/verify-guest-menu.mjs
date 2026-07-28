import { chromium, expect } from '@playwright/test';
import { createEvidence } from './lib/evidence.mjs';

const baseUrl = 'http://localhost:3000/';
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

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });

  await expect(page.getByRole('link', { name: 'Login' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Profile' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'History' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Favorites' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Zi Wei' })).toHaveCount(0);

  await evidence.shot(page, 'guest-menu-hidden');

  if (consoleErrors.length) {
    throw new Error(`Console errors detected: ${consoleErrors.join(' | ')}`);
  }
} finally {
  await browser.close();
}

console.log('Guest menu items hidden verified.');
