import { test, expect } from '@playwright/test';

const takeShot = async (page, label) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  await page.screenshot({ path: `../verification/${stamp}-${label}.png`, fullPage: true });
};

test('Tarot Celtic Cross AI interpretation and history persistence', async ({ page }) => {
  const uniqueQuestion = `TEST_TAROT_${Date.now()}`;

  await page.goto('/login');
  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/profile/);

  await page.goto('/tarot');
  await page.selectOption('select', 'CelticCross');
  await page.fill('input[type="text"]', uniqueQuestion);
  await page.click('button:has-text("Draw")');

  const cards = page.locator('[data-testid="tarot-card"]');
  await expect(cards).toHaveCount(10);
  await takeShot(page, 'tarot-celtic-drawn');

  await page.click('button:has-text("Reveal AI")');
  await expect(page.getByText('Often the cards whisper...')).toBeVisible();
  await takeShot(page, 'tarot-celtic-ai');

  const historyEntries = page.locator('[data-testid="tarot-history-entry"]');
  await expect(historyEntries.first()).toContainText(uniqueQuestion);

  await page.reload();
  await expect(historyEntries.first()).toContainText(uniqueQuestion);
  await takeShot(page, 'tarot-celtic-history-refresh');
});
