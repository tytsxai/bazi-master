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
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(500);
  await evidence.shot(page, 'home-initial', { fullPage: false });

  const homeLink = page.getByRole('link', { name: /Home|首页/ });
  await expect(homeLink).toBeVisible();

  const toggleButton = page.getByRole('button', { name: /EN|中文/ });
  await expect(toggleButton).toBeVisible();

  const initialLabel = await toggleButton.textContent();
  await toggleButton.click();

  if (initialLabel?.includes('EN')) {
    await expect(page.getByRole('link', { name: 'Home' })).toBeVisible();
  } else {
    await expect(page.getByRole('link', { name: '首页' })).toBeVisible();
  }

  await page.waitForTimeout(300);
  await evidence.shot(page, 'home-after-toggle', { fullPage: false });

  const storedLocale = await page.evaluate(() => localStorage.getItem('locale'));
  if (!storedLocale) {
    throw new Error('Expected locale to be stored in localStorage.');
  }

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  await evidence.shot(page, 'home-after-reload', { fullPage: false });

  if (storedLocale === 'zh-CN') {
    await expect(page.getByRole('link', { name: '首页' })).toBeVisible();
  } else {
    await expect(page.getByRole('link', { name: 'Home' })).toBeVisible();
  }

  if (consoleErrors.length) {
    throw new Error(`Console errors detected: ${consoleErrors.join(' | ')}`);
  }
} finally {
  await browser.close();
}

console.log('Language toggle verification completed.');
