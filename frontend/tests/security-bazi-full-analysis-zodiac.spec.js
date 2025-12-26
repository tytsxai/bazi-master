import { test, expect } from './fixtures.js';
import path from 'path';

const buildScreenshotPath = (name) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(process.cwd(), '..', 'verification', `${stamp}-${name}.png`);
};

test('Security: Bazi full analysis from /zodiac matches backend data', async ({ page }) => {
  const consoleErrors = [];

  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
  });

  await page.goto('/zodiac');
  await page.screenshot({ path: buildScreenshotPath('security-zodiac-step-1') });

  await page.goto('/login');
  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/profile/);

  await page.goto('/bazi');
  await page.getByLabel(/Birth Year|出生年份/).fill('1994');
  await page.getByLabel(/Birth Month|出生月份/).fill('7');
  await page.getByLabel(/Birth Day|出生日/).fill('19');
  await page.getByLabel(/Birth Hour|出生时辰/).fill('16');
  await page.getByLabel(/Gender|性别/).selectOption('female');
  await page.getByLabel(/Birth Location|出生地/).fill('SECURITY_ZODIAC');
  await page.getByLabel(/Timezone|时区/).fill('UTC+8');
  await page.screenshot({ path: buildScreenshotPath('security-zodiac-step-2-form') });

  const calcResponsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/bazi/calculate') && resp.request().method() === 'POST'
  );
  await page.getByRole('button', { name: /Calculate|开始排盘/ }).click();
  const calcResponse = await calcResponsePromise;
  expect(calcResponse.ok()).toBeTruthy();

  const fullResponsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/bazi/full-analysis') && resp.request().method() === 'POST'
  );
  await page.getByRole('button', { name: /Request Full Analysis|完整分析/ }).click();
  const fullResponse = await fullResponsePromise;
  expect(fullResponse.ok()).toBeTruthy();
  const fullData = await fullResponse.json();

  await expect(page.getByRole('heading', { name: /Ten Gods|十神/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Major Luck Cycles|大运/ })).toBeVisible();
  await page.screenshot({ path: buildScreenshotPath('security-zodiac-step-3-full-analysis') });

  expect(fullData).toBeTruthy();
  expect(fullData.pillars).toBeTruthy();
  expect(Array.isArray(fullData.tenGods)).toBeTruthy();
  expect(Array.isArray(fullData.luckCycles)).toBeTruthy();

  const pillarsGrid = page.getByTestId('pillars-grid');
  for (const pillar of Object.values(fullData.pillars)) {
    await expect(pillarsGrid).toContainText(`${pillar.stem} · ${pillar.branch}`);
  }

  const elementsChart = page.getByTestId('elements-chart');
  const elementOrder = ['Wood', 'Fire', 'Earth', 'Metal', 'Water'];
  const counts = fullData.fiveElements || {};
  const percents = fullData.fiveElementsPercent || null;
  const total = elementOrder.reduce((sum, key) => sum + (counts[key] ?? 0), 0);
  for (const element of elementOrder) {
    const count = counts[element] ?? 0;
    const percent = percents
      ? (percents[element] ?? 0)
      : total
        ? Math.round((count / total) * 100)
        : 0;
    await expect(elementsChart).toContainText(`${count} · ${percent}%`);
  }

  const tenGodItems = page.getByTestId('ten-god-item');
  await expect(tenGodItems).toHaveCount(fullData.tenGods.length);
  for (const item of fullData.tenGods) {
    const row = tenGodItems.filter({ hasText: item.name });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(String(item.strength));
  }

  const luckCycleItems = page.getByTestId('luck-cycle-item');
  await expect(luckCycleItems).toHaveCount(fullData.luckCycles.length);
  for (const cycle of fullData.luckCycles) {
    const row = luckCycleItems.filter({ hasText: cycle.range });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(`${cycle.stem} · ${cycle.branch}`);
  }

  expect(consoleErrors).toEqual([]);
});
