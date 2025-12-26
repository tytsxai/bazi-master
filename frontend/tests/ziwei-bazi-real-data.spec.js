import { test, expect } from './fixtures.js';

test('BaZi page can trigger Zi Wei (V2) flow and match backend data', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
  });

  await page.goto('/login');
  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/profile/);

  await page.goto('/bazi');
  await page.getByLabel('Birth Year').fill('1992');
  await page.getByLabel('Birth Month').fill('7');
  await page.getByLabel('Birth Day').fill('15');
  await page.getByLabel('Birth Hour (0-23)').fill('9');
  await page.getByLabel('Gender').selectOption('female');

  const responsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/ziwei/calculate') && resp.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Generate Zi Wei Chart' }).click();
  const response = await responsePromise;
  expect(response.ok()).toBeTruthy();
  const data = await response.json();

  await expect(page.getByTestId('bazi-ziwei-status')).toContainText('Zi Wei chart generated');
  const resultCard = page.getByTestId('bazi-ziwei-result');
  await expect(resultCard).toContainText(`${data.lunar.year}年`);
  await expect(resultCard).toContainText(`${data.lunar.month}月`);
  await expect(resultCard).toContainText(`${data.lunar.day}日`);
  expect(data?.mingPalace?.palace?.cn).toBeTruthy();
  expect(data?.shenPalace?.palace?.cn).toBeTruthy();
  await expect(resultCard).toContainText(data.mingPalace.palace.cn);
  await expect(resultCard).toContainText(data.shenPalace.palace.cn);
});
