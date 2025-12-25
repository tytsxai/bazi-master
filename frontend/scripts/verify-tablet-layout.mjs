import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = 'http://localhost:3000/';
const outDir = path.resolve(process.cwd(), 'verification');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');

await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();

try {
  await page.setViewportSize({ width: 768, height: 1024 });
  
  // Home Page
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(outDir, `${stamp}-tablet-home.png`), fullPage: true });
  console.log('Captured tablet home page.');

  // Bazi Page
  await page.goto(`${baseUrl}bazi`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(outDir, `${stamp}-tablet-bazi.png`), fullPage: true });
  console.log('Captured tablet bazi page.');

  // Check if mobile menu button is visible
  const menuBtn = page.locator('button[aria-label="Toggle Menu"]');
  await expect(menuBtn).toBeVisible();
  console.log('Mobile menu button visible at 768px.');

  // Open menu
  await menuBtn.click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, `${stamp}-tablet-menu-open.png`), fullPage: false });
  console.log('Captured tablet menu open.');

} finally {
  await browser.close();
}

console.log('Tablet layout verification complete.');
