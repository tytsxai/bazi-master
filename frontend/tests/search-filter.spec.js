import { test, expect } from '@playwright/test';

test('History search and filter flow', async ({ page }) => {
  test.setTimeout(120000);
  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
  });

  const timestamp = Date.now();
  const locations = {
    alpha: `E2E_Search_${timestamp}_Alpha`,
    beta: `E2E_Search_${timestamp}_Beta`,
  };
  const records = [
    {
      birth: { year: '1994', month: '5', day: '12', hour: '9' },
      gender: 'female',
      location: locations.alpha,
    },
    {
      birth: { year: '1992', month: '8', day: '3', hour: '15' },
      gender: 'male',
      location: locations.beta,
    },
  ];

  await page.goto('/login');
  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/profile/);

  await page.goto('/bazi');
  await expect(page.locator('#birthYear')).toBeVisible();

  for (const record of records) {
    await page.fill('#birthYear', record.birth.year);
    await page.fill('#birthMonth', record.birth.month);
    await page.fill('#birthDay', record.birth.day);
    await page.fill('#birthHour', record.birth.hour);
    await page.selectOption('#gender', record.gender);
    await page.fill('#birthLocation', record.location);
    await page.fill('#timezone', 'UTC');

    await Promise.all([
      page.waitForResponse((res) => res.url().includes('/api/bazi/calculate') && res.ok()),
      page.locator('form button[type="submit"]').first().click(),
    ]);

    const saveButton = page.getByRole('button', { name: /Save to History|保存到历史/i });
    await expect(saveButton).toBeEnabled({ timeout: 30000 });
    await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes('/api/bazi/records')
          && res.request().method() === 'POST'
          && res.ok()
      ),
      saveButton.click(),
    ]);
  }

  await page.goto('/history');
  await expect(page.getByText(locations.alpha)).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(locations.beta)).toBeVisible({ timeout: 20000 });

  const searchInput = page.getByPlaceholder('Location, timezone, pillar');
  await searchInput.fill(locations.alpha);
  await expect(page).toHaveURL(new RegExp(`q=${encodeURIComponent(locations.alpha)}`));
  await expect(page.getByText(locations.alpha)).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(locations.beta)).toHaveCount(0);

  await searchInput.fill('');
  await expect(page).not.toHaveURL(/q=/);
  await expect(page.getByText(locations.alpha)).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(locations.beta)).toBeVisible({ timeout: 20000 });

  const genderSelect = page.getByRole('combobox', { name: /^Gender/i });
  await genderSelect.selectOption('male');
  await expect(page).toHaveURL(/gender=male/);
  await expect(page.getByText(locations.beta)).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(locations.alpha)).toHaveCount(0);

  await page.getByRole('button', { name: 'Reset filters' }).click();
  await expect(page).not.toHaveURL(/gender=|q=/);
  await expect(page.getByText(locations.alpha)).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(locations.beta)).toBeVisible({ timeout: 20000 });
});
