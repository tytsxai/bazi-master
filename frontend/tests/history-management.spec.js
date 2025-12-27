import { test, expect } from './fixtures.js';

test('History management flow: filter, sort, delete, restore', async ({ page }) => {
  test.setTimeout(150000);
  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
  });

  const timestamp = Date.now();
  const recordA = {
    birth: { year: '1989', month: '6', day: '12', hour: '9' },
    gender: 'female',
    location: `E2E_History_${timestamp}_Alpha`,
  };
  const recordB = {
    birth: { year: '1999', month: '2', day: '3', hour: '15' },
    gender: 'male',
    location: `E2E_History_${timestamp}_Beta`,
  };

  await page.goto('/login');
  await page.evaluate(() => {
    localStorage.removeItem('bazi_token');
    localStorage.removeItem('bazi_user');
    localStorage.removeItem('bazi_last_activity');
  });
  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/profile/);

  const createRecord = async (record) => {
    await page.goto('/bazi');
    await page.getByLabel('Birth Year').fill(record.birth.year);
    await page.getByLabel('Birth Month').fill(record.birth.month);
    await page.getByLabel('Birth Day').fill(record.birth.day);
    await page.getByLabel('Birth Hour (0-23)').fill(record.birth.hour);
    await page.locator('#gender').selectOption(record.gender);
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
  const recordCards = page.getByTestId('history-record-card');
  await expect(recordCards.filter({ hasText: recordA.location }).first()).toBeVisible({ timeout: 20000 });
  await expect(recordCards.filter({ hasText: recordB.location }).first()).toBeVisible({ timeout: 20000 });
  await page.screenshot({ path: 'verification/history-management-01-list.png', fullPage: true });

  const searchInput = page.getByPlaceholder('Location, timezone, pillar');
  await searchInput.fill(recordA.location);
  await expect(page).toHaveURL(new RegExp(`q=${encodeURIComponent(recordA.location)}`));
  await expect(recordCards.filter({ hasText: recordA.location }).first()).toBeVisible({ timeout: 20000 });
  await expect(recordCards.filter({ hasText: recordB.location })).toHaveCount(0, { timeout: 20000 });
  await page.screenshot({ path: 'verification/history-management-02-search.png', fullPage: true });

  await searchInput.fill('');
  await expect(page).not.toHaveURL(/q=/);

  const genderSelect = page.getByRole('combobox', { name: /^Gender/i });
  await genderSelect.selectOption('male');
  await expect(page).toHaveURL(/gender=male/);
  await expect(recordCards.filter({ hasText: recordB.location }).first()).toBeVisible({ timeout: 20000 });
  await expect(recordCards.filter({ hasText: recordA.location })).toHaveCount(0, { timeout: 20000 });
  await page.screenshot({ path: 'verification/history-management-03-gender-filter.png', fullPage: true });

  await page.getByRole('button', { name: 'Reset filters' }).click();
  await expect(page).not.toHaveURL(/gender=|q=/);

  await expect(recordCards.filter({ hasText: recordA.location }).first()).toBeVisible({ timeout: 20000 });
  await expect(recordCards.filter({ hasText: recordB.location }).first()).toBeVisible({ timeout: 20000 });

  const sortSelect = page.getByRole('combobox', { name: /^Sort/i });
  await sortSelect.selectOption('birth-asc');
  await expect(page).toHaveURL(/sort=birth-asc/);
  await expect(recordCards.filter({ hasText: recordA.location }).first()).toBeVisible({ timeout: 20000 });
  await expect(recordCards.filter({ hasText: recordB.location }).first()).toBeVisible({ timeout: 20000 });
  const cardTexts = await recordCards.allTextContents();
  const indexA = cardTexts.findIndex((text) => text.includes(recordA.location));
  const indexB = cardTexts.findIndex((text) => text.includes(recordB.location));
  expect(indexA).toBeGreaterThan(-1);
  expect(indexB).toBeGreaterThan(-1);
  expect(indexA).toBeLessThan(indexB);
  await page.screenshot({ path: 'verification/history-management-04-sort.png', fullPage: true });

  const recordCard = recordCards.filter({ hasText: recordA.location }).first();
  await recordCard.getByRole('button', { name: 'Delete' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const deleteResponsePromise = page.waitForResponse(
    (res) => res.url().includes('/api/bazi/records/') && res.request().method() === 'DELETE'
  );
  await dialog.getByRole('button', { name: 'Delete' }).click();
  const deleteResponse = await deleteResponsePromise;
  expect(deleteResponse.ok()).toBeTruthy();
  await expect(page.getByText('Record deleted.')).toBeVisible();
  await expect(page.getByTestId('history-record-card').filter({ hasText: recordA.location })).toHaveCount(0);
  await page.screenshot({ path: 'verification/history-management-05-deleted.png', fullPage: true });

  const deletedRecordText = `${recordA.birth.year}-${recordA.birth.month}-${recordA.birth.day} · ${recordA.birth.hour}:00 · ${recordA.location}`;
  const deletedSection = page.getByText('Deleted records')
    .locator('xpath=ancestor::div[contains(@class,"border-amber")]');
  const deletedRow = deletedSection
    .getByTestId('history-deleted-card')
    .filter({ hasText: deletedRecordText })
    .first();
  await expect(deletedRow).toBeVisible();
  const restoreResponsePromise = page.waitForResponse(
    (res) =>
      res.url().includes('/api/bazi/records/') &&
      res.url().includes('/restore') &&
      res.request().method() === 'POST'
  );
  await deletedRow.getByRole('button', { name: 'Restore' }).click();
  const restoreResponse = await restoreResponsePromise;
  expect(restoreResponse.ok()).toBeTruthy();
  await expect(deletedSection.getByTestId('history-deleted-card').filter({ hasText: deletedRecordText })).toHaveCount(0);
  await page.reload();
  await expect(recordCards.filter({ hasText: recordA.location }).first()).toBeVisible({ timeout: 20000 });
  await page.screenshot({ path: 'verification/history-management-06-restored.png', fullPage: true });
});
