import { test, expect } from '@playwright/test';

const snippet = (value, length = 28) => (value ? value.slice(0, length) : '');

test('Security: Tarot single draw from /ziwei matches backend data', async ({ page }) => {
  test.setTimeout(60_000);
  const consoleErrors = [];
  const shouldIgnoreError = (message) =>
    message.includes('Failed to load resource') && message.includes('ERR_CONNECTION_REFUSED');

  page.on('pageerror', (error) => {
    if (!shouldIgnoreError(error.message)) consoleErrors.push(error.message);
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !shouldIgnoreError(msg.text())) {
      consoleErrors.push(msg.text());
    }
  });

  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
    localStorage.removeItem('bazi_token');
    localStorage.removeItem('bazi_user');
    localStorage.removeItem('bazi_last_activity');
  });

  await page.goto('/ziwei');
  await expect(page).toHaveURL(/\/login/);

  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => Boolean(localStorage.getItem('bazi_token')));

  if (!page.url().includes('/ziwei')) {
    await page.goto('/ziwei');
  }
  await expect(page.getByRole('heading', { name: 'Zi Wei Atlas' })).toBeVisible();

  await page.getByRole('link', { name: /Tarot/i }).click();
  await expect(page).toHaveURL(/\/tarot/);
  await expect(page.getByRole('heading', { name: 'Tarot Sanctuary' })).toBeVisible();

  await page.selectOption('#tarot-spread', 'SingleCard');

  const responsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/tarot/draw') && resp.request().method() === 'POST'
  );
  await page.getByRole('button', { name: /Draw Single Card/i }).click();
  const response = await responsePromise;
  expect(response.ok()).toBeTruthy();
  const data = await response.json();

  expect(data.spreadType).toBe('SingleCard');
  expect(Array.isArray(data.cards)).toBeTruthy();
  expect(data.cards).toHaveLength(1);

  const card = data.cards[0];
  const cardLocator = page.getByTestId('tarot-card').first();
  await expect(page.getByTestId('tarot-card')).toHaveCount(1);

  await cardLocator.hover();

  if (card.positionLabel) {
    await expect(cardLocator.getByText(card.positionLabel, { exact: true })).toBeVisible();
  }
  await expect(cardLocator.getByText(card.name, { exact: true })).toBeVisible();

  if (card.isReversed) {
    await expect(cardLocator.getByText('Reversed', { exact: true })).toBeVisible();
  }

  const meaningText = card.isReversed ? card.meaningRev : card.meaningUp;
  if (meaningText) {
    await expect(cardLocator).toContainText(snippet(meaningText));
  }

  expect(consoleErrors).toEqual([]);
});
