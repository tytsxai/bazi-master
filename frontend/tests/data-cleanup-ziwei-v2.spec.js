import { test, expect } from './fixtures.js';
import path from 'path';

const buildScreenshotPath = (name) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(process.cwd(), 'verification', `${stamp}-${name}.png`);
};

const buildLunarText = (lunar) => {
  if (!lunar) return '';
  const leapSuffix = lunar.isLeap ? ' (Leap)' : '';
  return `${lunar.year}年 ${lunar.month}月 ${lunar.day}日${leapSuffix}`;
};

const buildPalaceText = (label, palace) =>
  `${label}: ${palace?.palace?.cn || palace?.palace?.name || ''} · ${palace?.branch?.name || ''}`;

test('[J] Data cleanup: Ziwei V2 chart from /ziwei matches backend data', async ({ page }) => {
  const consoleErrors = [];

  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
  });

  await page.goto('/ziwei');
  await page.screenshot({ path: buildScreenshotPath('data-cleanup-ziwei-step-1') });

  if (page.url().includes('/login')) {
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
  }

  await expect(page).toHaveURL(/\/ziwei/);

  await page.getByLabel(/Birth Year|出生年份/).fill('1992');
  await page.getByLabel(/Birth Month|出生月份/).fill('7');
  await page.getByLabel(/Birth Day|出生日/).fill('15');
  await page.getByLabel(/Birth Hour|出生时辰/).selectOption('9');
  await page.getByLabel(/Gender|性别/).selectOption('female');

  const responsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/ziwei/calculate') && resp.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Generate Zi Wei Chart' }).click();
  const response = await responsePromise;
  expect(response.ok()).toBeTruthy();
  const data = await response.json();

  await expect(page.getByText(buildLunarText(data.lunar))).toBeVisible();
  await expect(page.getByText(buildPalaceText('命宫', data.mingPalace))).toBeVisible();
  await expect(page.getByText(buildPalaceText('身宫', data.shenPalace))).toBeVisible();

  if (data.birthIso) {
    await expect(page.getByText(data.birthIso)).toBeVisible();
  }

  const offsetText = Number.isFinite(data.timezoneOffsetMinutes)
    ? `UTC offset: ${data.timezoneOffsetMinutes} mins`
    : 'UTC offset: —';
  await expect(page.getByText(offsetText)).toBeVisible();

  await expect(page.getByTestId('ziwei-palace-card')).toHaveCount(data.palaces?.length || 0);
  await page.screenshot({ path: buildScreenshotPath('data-cleanup-ziwei-step-2-result') });

  expect(consoleErrors).toEqual([]);
});
