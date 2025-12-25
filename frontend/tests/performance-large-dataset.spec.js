import { test, expect } from '@playwright/test';

const buildDataset = (count, prefix) => {
  const pillars = {
    year: { stem: 'Jia', branch: 'Zi' },
    month: { stem: 'Yi', branch: 'Chou' },
    day: { stem: 'Bing', branch: 'Yin' },
    hour: { stem: 'Ding', branch: 'Mao' },
  };
  const fiveElements = {
    wood: 1,
    fire: 1,
    earth: 1,
    metal: 1,
    water: 1,
  };
  return Array.from({ length: count }, (_, index) => ({
    birthYear: 1991,
    birthMonth: 8,
    birthDay: 17,
    birthHour: index % 24,
    gender: index % 2 === 0 ? 'male' : 'female',
    birthLocation: `${prefix}-${index + 1}`,
    timezone: 'UTC',
    pillars,
    fiveElements,
  }));
};

test('Performance smoke flow with large dataset search', async ({ page, request }) => {
  test.setTimeout(200000);
  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
  });

  const testId = `perf_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const email = `${testId}@example.com`;
  const password = 'Passw0rd!';
  const name = `Seer ${testId}`;

  const registerResponse = await request.post('/api/register', {
    data: { email, password, name },
  });
  expect(registerResponse.ok()).toBeTruthy();

  const loginResponse = await request.post('/api/login', {
    data: { email, password },
  });
  expect(loginResponse.ok()).toBeTruthy();
  const loginData = await loginResponse.json();
  const { token } = loginData;

  const datasetPrefix = `PERF_${testId}`;
  const dataset = buildDataset(1000, datasetPrefix);
  const importResponse = await request.post('/api/bazi/records/import', {
    data: { records: dataset },
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(importResponse.ok()).toBeTruthy();

  const flowLocation = `${datasetPrefix}_FLOW`;
  const birth = { year: '1990', month: '5', day: '21', hour: '8' };
  const gender = 'male';

  await page.goto('/');
  await page.getByRole('link', { name: /login/i }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  const headerName = page.getByTestId('header-user-name');
  await expect(headerName).toBeVisible();
  await expect(headerName).toHaveText(new RegExp(name));

  await page.goto('/bazi');
  await page.getByLabel('Birth Year').fill(birth.year);
  await page.getByLabel('Birth Month').fill(birth.month);
  await page.getByLabel('Birth Day').fill(birth.day);
  await page.getByLabel('Birth Hour (0-23)').fill(birth.hour);
  await page.getByLabel('Gender').selectOption(gender);
  await page.getByLabel('Birth Location').fill(flowLocation);
  await page.getByLabel('Timezone').fill('UTC');

  await Promise.all([
    page.waitForResponse((resp) => resp.url().includes('/api/bazi/calculate') && resp.ok()),
    page.getByRole('button', { name: /calculate/i }).click(),
  ]);
  await expect(page.getByRole('heading', { name: 'Four Pillars' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Five Elements' })).toBeVisible();

  await Promise.all([
    page.waitForResponse((resp) => resp.url().includes('/api/bazi/full-analysis') && resp.ok()),
    page.getByRole('button', { name: /request full analysis/i }).click(),
  ]);
  await expect(page.getByRole('heading', { name: 'Ten Gods' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Major Luck Cycles' })).toBeVisible();

  await Promise.all([
    page.waitForResponse((resp) =>
      resp.url().includes('/api/bazi/records') && resp.request().method() === 'POST' && resp.ok()
    ),
    page.getByRole('button', { name: /save to history/i }).click(),
  ]);

  await Promise.all([
    page.waitForResponse((resp) =>
      resp.url().includes('/api/favorites') && resp.request().method() === 'POST' && resp.ok()
    ),
    page.getByRole('button', { name: /add to favorites/i }).click(),
  ]);

  await page.goto('/history');
  const searchInput = page.getByPlaceholder('Location, timezone, pillar');
  const searchStart = Date.now();
  const searchResponsePromise = page.waitForResponse(
    (resp) =>
      resp.url().includes('/api/bazi/records') &&
      resp.url().includes(`q=${encodeURIComponent(flowLocation)}`) &&
      resp.ok()
  );
  await searchInput.fill(flowLocation);
  await searchResponsePromise;
  const searchDuration = Date.now() - searchStart;
  expect(searchDuration).toBeLessThan(4000);

  const recordCard = page.getByTestId('history-record-card').filter({ hasText: flowLocation }).first();
  await expect(recordCard).toBeVisible();
  await expect(recordCard).toContainText(`${birth.year}-${birth.month}-${birth.day}`);
  await expect(recordCard).toContainText(gender);
  await expect(recordCard).toContainText('UTC');

  await page.goto('/favorites');
  await expect(page.getByText(flowLocation)).toBeVisible();

  const logoutButton = page.getByRole('button', { name: /logout/i });
  if (!(await logoutButton.isVisible())) {
    await page.getByRole('button', { name: 'Toggle Menu' }).click();
  }
  await logoutButton.click();
  await expect(page).toHaveURL(/\/login/);
});
