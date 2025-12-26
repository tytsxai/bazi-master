import { test, expect } from './fixtures.js';

test('History pagination flow', async ({ page, request }) => {
  const testId = `e2e_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
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
  const { token, user } = loginData;

  const prefix = `E2E_Pagination_${testId}`;
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

  const records = Array.from({ length: 105 }, (_, index) => ({
    birthYear: 1992,
    birthMonth: 4,
    birthDay: 12,
    birthHour: index % 24,
    gender: 'male',
    birthLocation: `${prefix}-${index + 1}`,
    timezone: 'UTC',
    pillars,
    fiveElements,
  }));

  const importResponse = await request.post('/api/bazi/records/import', {
    data: { records },
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(importResponse.ok()).toBeTruthy();

  await page.addInitScript(({ authToken, authUser }) => {
    localStorage.setItem('bazi_token', authToken);
    localStorage.setItem('bazi_user', JSON.stringify(authUser));
    localStorage.setItem('bazi_last_activity', String(Date.now()));
  }, { authToken: token, authUser: user });

  await page.goto(`/history?q=${encodeURIComponent(prefix)}`);
  await expect(page.getByText('Page 1 of 2')).toBeVisible();

  await page.getByRole('link', { name: 'Next' }).click();
  await expect(page).toHaveURL(new RegExp(`\\?q=${prefix}.*page=2`));
  await expect(page.getByText('Page 2 of 2')).toBeVisible();

  await page.getByRole('link', { name: 'Prev' }).click();
  await expect(page).toHaveURL(new RegExp(`\\?q=${prefix}`));
  await expect(page.getByText('Page 1 of 2')).toBeVisible();
});
