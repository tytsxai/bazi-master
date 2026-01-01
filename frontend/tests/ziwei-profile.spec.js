import { test, expect } from './fixtures.js';

test('Profile can trigger Zi Wei (V2) quick chart and render backend data', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
  });

  await page.goto('/login');
  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/profile/);

  const token = await page.evaluate(() => localStorage.getItem('bazi_token'));
  expect(token).toBeTruthy();

  const recordPayload = {
    birthYear: 1990,
    birthMonth: 12,
    birthDay: 15,
    birthHour: 10,
    gender: 'female',
  };

  const recordResponse = await page.request.post('/api/bazi/records', {
    data: recordPayload,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  expect(recordResponse.ok()).toBeTruthy();

  await page.reload();
  await expect(page.getByText('Zi Wei (V2) quick chart')).toBeVisible();

  const ziweiResponsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/ziwei/calculate') && resp.request().method() === 'POST'
  );

  await page.getByRole('button', { name: 'Generate Zi Wei Chart' }).click();
  const ziweiResponse = await ziweiResponsePromise;
  expect(ziweiResponse.ok()).toBeTruthy();
  const ziweiData = await ziweiResponse.json();

  await expect(page.getByTestId('profile-ziwei-status')).toContainText('Zi Wei chart generated');
  const resultCard = page.getByTestId('profile-ziwei-result');
  await expect(resultCard).toContainText(`${ziweiData.lunar.year}年`);
  await expect(resultCard).toContainText(`${ziweiData.lunar.month}月`);
  await expect(resultCard).toContainText(`${ziweiData.lunar.day}日`);
  expect(ziweiData?.mingPalace?.palace?.cn).toBeTruthy();
  expect(ziweiData?.shenPalace?.palace?.cn).toBeTruthy();
  await expect(resultCard).toContainText(ziweiData.mingPalace.palace.cn);
  await expect(resultCard).toContainText(ziweiData.shenPalace.palace.cn);
});
