import { chromium, expect } from '@playwright/test';
import { createEvidence } from './lib/evidence.mjs';

const baseUrl = 'http://localhost:3000/';
const evidence = await createEvidence();

const browser = await chromium.launch();
const page = await browser.newPage();

try {
  await page.setViewportSize({ width: 768, height: 1024 });

  // Home Page
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await evidence.shot(page, 'tablet-home');
  console.log('Captured tablet home page.');

  // Bazi Page
  await page.goto(`${baseUrl}bazi`, { waitUntil: 'networkidle' });
  await evidence.shot(page, 'tablet-bazi');
  console.log('Captured tablet bazi page.');

  // Check if mobile menu button is visible
  const menuBtn = page.locator('button[aria-label="Toggle Menu"]');
  await expect(menuBtn).toBeVisible();
  console.log('Mobile menu button visible at 768px.');

  // Open menu
  await menuBtn.click();
  await page.waitForTimeout(500);
  await evidence.shot(page, 'tablet-menu-open', { fullPage: false });
  console.log('Captured tablet menu open.');
} finally {
  await browser.close();
}

console.log('Tablet layout verification complete.');
