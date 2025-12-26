import { test, expect } from '@playwright/test';
import path from 'path';

const buildScreenshotPath = (name) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(process.cwd(), 'verification', `${stamp}-${name}.png`);
};

test('[J] Data cleanup: Bazi full analysis from /iching matches backend data', async ({ page }) => {
  test.setTimeout(60_000);
  const consoleErrors = [];

  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
  });

  await page.goto('/iching');
  await page.screenshot({ path: buildScreenshotPath('data-cleanup-iching-step-1') });

  const email = 'test@example.com';
  const password = 'password123';
  let loginResponse = await page.request.post('/api/auth/login', {
    data: { email, password },
  });

  if (!loginResponse.ok()) {
    await page.request.post('/api/auth/register', {
      data: { email, password, name: 'Test User' },
    });
    loginResponse = await page.request.post('/api/auth/login', {
      data: { email, password },
    });
  }

  expect(loginResponse.ok()).toBeTruthy();
  const loginData = await loginResponse.json();

  await page.addInitScript(
    ({ token, user }) => {
      localStorage.setItem('bazi_token', token);
      localStorage.setItem('bazi_token_origin', 'backend');
      localStorage.setItem('bazi_user', JSON.stringify(user));
      localStorage.setItem('bazi_last_activity', String(Date.now()));
      localStorage.removeItem('bazi_session_expired');
    },
    { token: loginData.token, user: loginData.user }
  );

  await page.goto('/bazi');
  await page.getByLabel(/Birth Year|出生年份/).fill('1992');
  await page.getByLabel(/Birth Month|出生月份/).fill('6');
  await page.getByLabel(/Birth Day|出生日/).fill('11');
  await page.getByLabel(/Birth Hour|出生时辰/).fill('9');
  await page.getByLabel(/Gender|性别/).selectOption('male');
  await page.getByLabel(/Birth Location|出生地/).fill('DATA_CLEANUP_SCENARIO_2');
  await page.getByLabel(/Timezone|时区/).fill('UTC+8');

  const calcResponsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/bazi/calculate') && resp.request().method() === 'POST'
  );
  await page.getByRole('button', { name: /Calculate|开始排盘/ }).click();
  const calcResponse = await calcResponsePromise;
  expect(calcResponse.ok()).toBeTruthy();

  await expect(page.getByTestId('bazi-full-analysis')).toBeEnabled();

  const fullRequestPromise = page.waitForRequest(
    (req) => req.url().includes('/api/bazi/full-analysis') && req.method() === 'POST'
  );
  await page.getByTestId('bazi-full-analysis').click();
  await expect(page.getByTestId('bazi-full-analysis')).toBeDisabled();
  const fullRequest = await fullRequestPromise;
  const fullResponse = await fullRequest.response();
  if (!fullResponse) {
    throw new Error(`Full analysis request failed: ${fullRequest.failure()?.errorText || 'no response'}`);
  }
  expect(fullResponse.ok()).toBeTruthy();
  const fullData = await fullResponse.json();

  await expect(page.getByRole('heading', { name: /Ten Gods|十神/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Major Luck Cycles|大运/ })).toBeVisible();
  await page.screenshot({ path: buildScreenshotPath('data-cleanup-iching-step-2-full-analysis') });

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
