import { test, expect } from './fixtures.js';

test('Sensitive actions require confirmation (delete, AI request)', async ({ page }) => {
  test.setTimeout(150000);

  const uniqueLocation = `CONFIRM_DIALOG_${Date.now()}`;

  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
  });

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

  await page.goto('/bazi');
  await page.getByLabel('Birth Year').fill('1993');
  await page.getByLabel('Birth Month').fill('7');
  await page.getByLabel('Birth Day').fill('19');
  await page.getByLabel('Birth Hour (0-23)').fill('11');
  await page.locator('#gender').selectOption('female');
  await page.getByLabel('Birth Location').fill(uniqueLocation);
  await page.getByLabel('Timezone').fill('UTC');

  await Promise.all([
    page.waitForResponse((res) => res.url().includes('/api/bazi/calculate') && res.ok()),
    page.getByRole('button', { name: /Calculate|开始排盘/ }).click(),
  ]);

  await Promise.all([
    page.waitForResponse((res) => res.url().includes('/api/bazi/full-analysis') && res.ok()),
    page.getByRole('button', { name: /Request Full Analysis|完整分析/ }).click(),
  ]);

  await page.getByTestId('bazi-ai-interpret').click();
  const aiDialog = page.getByRole('dialog', { name: 'Request AI interpretation?' });
  await expect(aiDialog).toBeVisible();
  await page.screenshot({
    path: 'verification/security-confirmation-01-ai-dialog.png',
    fullPage: true,
  });

  await aiDialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(aiDialog).toHaveCount(0);

  await page.getByTestId('bazi-ai-interpret').click();
  const aiDialogAgain = page.getByRole('dialog', { name: 'Request AI interpretation?' });
  await aiDialogAgain.getByRole('button', { name: 'Request AI' }).click();
  await expect(page.getByText('AI BaZi Analysis')).toBeVisible();
  await page.screenshot({
    path: 'verification/security-confirmation-02-ai-requested.png',
    fullPage: true,
  });

  await Promise.all([
    page.waitForResponse((res) => res.url().includes('/api/bazi/records') && res.ok()),
    page.getByRole('button', { name: /Save to History|保存到历史/ }).click(),
  ]);

  await page.goto('/history');
  const recordCard = page
    .getByTestId('history-record-card')
    .filter({ hasText: uniqueLocation })
    .first();
  await expect(recordCard).toBeVisible({ timeout: 20000 });

  await recordCard.getByRole('button', { name: 'Delete' }).click();
  const deleteDialog = page.getByRole('dialog');
  await expect(deleteDialog).toBeVisible();
  await page.screenshot({
    path: 'verification/security-confirmation-03-delete-dialog.png',
    fullPage: true,
  });

  await deleteDialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(recordCard).toBeVisible({ timeout: 20000 });

  await recordCard.getByRole('button', { name: 'Delete' }).click();
  const deleteResponse = page.waitForResponse(
    (res) => res.url().includes('/api/bazi/records/') && res.request().method() === 'DELETE'
  );
  await deleteDialog.getByRole('button', { name: 'Delete' }).click();
  await deleteResponse;
  await expect(
    page.getByTestId('history-record-card').filter({ hasText: uniqueLocation })
  ).toHaveCount(0);
  await page.screenshot({
    path: 'verification/security-confirmation-04-deleted.png',
    fullPage: true,
  });
});
