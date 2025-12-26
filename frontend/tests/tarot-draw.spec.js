import { test, expect } from './fixtures.js';

test('Tarot draw flow for single and three card spreads', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/profile/);

  await page.goto('/tarot');

  const drawButton = page.getByRole('button', { name: /Draw/ });

  await page.selectOption('#tarot-spread', 'SingleCard');
  await expect(drawButton).toContainText('Draw Single Card');
  await drawButton.click();

  const cards = page.locator('[data-testid="tarot-card"]');
  await expect(page.getByRole('heading', { name: 'Your Spread' })).toBeVisible();
  await expect(cards).toHaveCount(1);

  await page.selectOption('#tarot-spread', 'ThreeCard');
  await expect(drawButton).toContainText('Draw Three Card');
  await drawButton.click();
  await expect(cards).toHaveCount(3);
});
