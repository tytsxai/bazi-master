import { test, expect } from './fixtures.js';

const snippet = (value, length = 28) => (value ? value.slice(0, length) : '');

test('Navigation integrity: tarot single draw matches backend data', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
    localStorage.removeItem('bazi_token');
    localStorage.removeItem('bazi_user');
    localStorage.removeItem('bazi_last_activity');
  });

  await page.goto('/tarot', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Tarot Sanctuary' })).toBeVisible();

  const drawButton = page.getByRole('button', { name: /Draw Single Card/i });
  const responsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/tarot/draw') && resp.request().method() === 'POST'
  );

  await drawButton.click();
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
});
