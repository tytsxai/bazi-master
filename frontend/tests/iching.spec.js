import { test, expect } from '@playwright/test';

test('I Ching divination flow with AI interpretation and history save', async ({ page }) => {
  const uniqueQuestion = `E2E_ICHING_${Date.now()}`;
  const runId = Date.now();
  const snap = async (label) => {
    await page.screenshot({ path: `../verification/iching-flow-${runId}-${label}.png`, fullPage: true });
  };

  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
  });

  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/profile/);
  await snap('01-profile');

  await page.goto('/iching');
  await snap('02-iching');

  await page.getByLabel('First number').fill('12');
  await page.getByLabel('Second number').fill('27');
  await page.getByLabel('Third number').fill('44');
  await page.getByLabel('Your question (optional)').fill(uniqueQuestion);
  await snap('03-inputs');

  await page.getByRole('button', { name: 'Divine with Numbers' }).click();
  await expect(page.getByRole('heading', { name: 'Primary Hexagram' })).toBeVisible();
  await expect(page.getByText('Changing lines:')).toBeVisible();
  await snap('04-result');

  await page.getByRole('button', { name: 'Reveal AI Interpretation' }).click();
  await page.getByRole('button', { name: 'Request AI' }).click();
  await expect(page.getByRole('heading', { name: 'Oracle Reflection' })).toBeVisible({ timeout: 60000 });
  await snap('05-ai');

  await page.getByRole('button', { name: 'Save to History' }).click();
  await expect(page.getByText('Reading saved to history.')).toBeVisible();
  await expect(page.getByText(new RegExp(`Question:\\s*${uniqueQuestion}`))).toBeVisible();
  await snap('06-saved');
});
