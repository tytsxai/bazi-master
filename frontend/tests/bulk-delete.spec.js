import { test, expect } from '@playwright/test';

test('Bulk operation flow for batch deletion', async ({ page }) => {
  test.setTimeout(150000);
  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
  });

  const timestamp = Date.now();
  const prefix = `E2E_Bulk_${timestamp}`;
  const recordA = {
    birth: { year: '1988', month: '4', day: '22', hour: '8' },
    gender: 'female',
    location: `${prefix}_Alpha`,
  };
  const recordB = {
    birth: { year: '1996', month: '9', day: '14', hour: '16' },
    gender: 'male',
    location: `${prefix}_Beta`,
  };

  await page.goto('/login');
  await page.evaluate(() => {
    localStorage.removeItem('bazi_token');
    localStorage.removeItem('bazi_user');
    localStorage.removeItem('bazi_last_activity');
  });
  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'password123');
  await page.locator('button[type="submit"]').first().click();
  await expect(page).toHaveURL(/\/profile/, { timeout: 20000 });

  const createRecord = async (record) => {
    await page.goto('/bazi');
    await page.getByLabel('Birth Year').fill(record.birth.year);
    await page.getByLabel('Birth Month').fill(record.birth.month);
    await page.getByLabel('Birth Day').fill(record.birth.day);
    await page.getByLabel('Birth Hour (0-23)').fill(record.birth.hour);
    await page.getByLabel('Gender').selectOption(record.gender);
    await page.getByLabel('Birth Location').fill(record.location);
    await page.getByLabel('Timezone').fill('UTC');

    await Promise.all([
      page.waitForResponse((res) => res.url().includes('/api/bazi/calculate') && res.ok()),
      page.getByRole('button', { name: /Calculate|开始排盘/ }).click(),
    ]);

    const saveButton = page.getByRole('button', { name: /Save to History|保存到历史/i });
    await expect(saveButton).toBeEnabled({ timeout: 20000 });
    await Promise.all([
      page.waitForResponse((res) => res.url().includes('/api/bazi/records')
        && res.request().method() === 'POST'
        && res.ok()),
      saveButton.click(),
    ]);
  };

  await createRecord(recordA);
  await createRecord(recordB);

  await page.goto('/history');
  const searchInput = page.getByPlaceholder('Location, timezone, pillar');
  await searchInput.fill(prefix);
  await expect(page).toHaveURL(new RegExp(`q=${encodeURIComponent(prefix)}`));
  await expect(page.getByText(recordA.location)).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(recordB.location)).toBeVisible({ timeout: 20000 });
  await page.screenshot({ path: 'verification/bulk-delete-01-filter.png', fullPage: true });

  await page.getByLabel('Select all').check();
  await expect(page.getByText('2 selected')).toBeVisible();
  await page.screenshot({ path: 'verification/bulk-delete-02-selected.png', fullPage: true });

  await page.getByRole('button', { name: 'Delete selected' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  await Promise.all([
    page.waitForResponse((res) => res.url().includes('/api/bazi/records/bulk-delete')
      && res.request().method() === 'POST'
      && res.ok()),
    dialog.getByRole('button', { name: 'Delete selected' }).click(),
  ]);

  await expect(page.getByText('Deleted 2 records.')).toBeVisible();
  await expect(page.getByTestId('history-record-card').filter({ hasText: prefix })).toHaveCount(0);
  await expect(page.getByTestId('history-deleted-card').filter({ hasText: recordA.location })).toBeVisible();
  await expect(page.getByTestId('history-deleted-card').filter({ hasText: recordB.location })).toBeVisible();
  await page.screenshot({ path: 'verification/bulk-delete-03-deleted.png', fullPage: true });

  await page.reload();
  await searchInput.fill(prefix);
  await expect(page.getByText('No results found')).toBeVisible();
  await page.screenshot({ path: 'verification/bulk-delete-04-empty.png', fullPage: true });
});
