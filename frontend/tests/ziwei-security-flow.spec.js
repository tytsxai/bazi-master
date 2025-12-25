import { test, expect } from '@playwright/test';

const buildLunarText = (lunar) => {
  if (!lunar) return '';
  const leapSuffix = lunar.isLeap ? ' (Leap)' : '';
  return `${lunar.year}年 ${lunar.month}月 ${lunar.day}日${leapSuffix}`;
};

const buildPalaceText = (label, palace) =>
  `${label}: ${palace?.palace?.cn || palace?.palace?.name || ''} · ${palace?.branch?.name || ''}`;

test('Ziwei V2 flow from /zodiac uses protected access and matches backend data', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
    localStorage.removeItem('bazi_token');
    localStorage.removeItem('bazi_user');
    localStorage.removeItem('bazi_last_activity');
  });

  await page.goto('/zodiac');
  await expect(page.getByRole('heading', { name: 'Zodiac Chronicles' })).toBeVisible();

  await page.getByRole('link', { name: 'Zi Wei' }).click();
  await expect(page).toHaveURL(/\/login/);

  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');
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
});
