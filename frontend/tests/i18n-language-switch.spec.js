import { test, expect } from './fixtures.js';

test('i18n language switch toggles and persists locale', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) {
      localStorage.setItem('locale', 'en-US');
    }
  });

  await page.goto('/');

  const homeHeading = page.getByRole('heading', { level: 1 });
  await expect(homeHeading).toHaveText('BaZi Master');

  const switchToChinese = page.getByRole('button', { name: /switch to chinese/i });
  await expect(switchToChinese).toBeVisible();
  await switchToChinese.click();

  await expect(homeHeading).toHaveText('八字大师');
  await expect(page.getByRole('link', { name: '首页', exact: true })).toBeVisible();

  const storedLocale = await page.evaluate(() => localStorage.getItem('locale'));
  expect(storedLocale).toBe('zh-CN');

  await page.reload();

  await expect(homeHeading).toHaveText('八字大师');
  await expect(page.getByRole('button', { name: /switch to english/i })).toBeVisible();
});
