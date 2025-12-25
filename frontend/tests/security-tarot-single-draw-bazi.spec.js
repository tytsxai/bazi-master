import { test, expect } from '@playwright/test';
import path from 'path';

const buildScreenshotPath = (name) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(process.cwd(), '..', 'verification', `${stamp}-${name}.png`);
};

const snippet = (value, length = 28) => (value ? value.slice(0, length) : '');

test('Security: tarot single draw from /bazi matches backend data', async ({ page }) => {
  const consoleErrors = [];

  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
    localStorage.removeItem('bazi_token');
    localStorage.removeItem('bazi_user');
    localStorage.removeItem('bazi_last_activity');
  });

  await page.goto('/bazi', { waitUntil: 'domcontentloaded' });
  await expect(page.getByLabel(/Birth Year|出生年份/i)).toBeVisible();
  await page.screenshot({ path: buildScreenshotPath('security-tarot-single-step-1-bazi') });

  await page.getByRole('link', { name: /Tarot/i }).click();
  await expect(page).toHaveURL(/\/tarot/);
  await expect(page.getByRole('heading', { name: 'Tarot Sanctuary' })).toBeVisible();

  const responsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/tarot/draw') && resp.request().method() === 'POST'
  );

  await page.getByRole('button', { name: /Draw Single Card/i }).click();
  const response = await responsePromise;
  expect(response.ok()).toBeTruthy();

  const requestHeaders = response.request().headers();
  expect(requestHeaders.authorization || requestHeaders.Authorization).toBeFalsy();

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
  if (card.positionMeaning) {
    await expect(cardLocator).toContainText(snippet(card.positionMeaning));
  }

  await expect(cardLocator.getByText(card.name, { exact: true })).toBeVisible();
  if (card.isReversed) {
    await expect(cardLocator.getByText('Reversed', { exact: true })).toBeVisible();
  }

  const meaningText = card.isReversed ? card.meaningRev : card.meaningUp;
  if (meaningText) {
    await expect(cardLocator).toContainText(snippet(meaningText));
  }

  await page.screenshot({ path: buildScreenshotPath('security-tarot-single-step-2-drawn') });

  expect(consoleErrors).toEqual([]);
});
