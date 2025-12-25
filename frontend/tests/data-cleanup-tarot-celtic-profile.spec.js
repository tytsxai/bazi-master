import { test, expect } from '@playwright/test';
import path from 'path';

const snippet = (value, length = 28) => (value ? value.slice(0, length) : '');

const buildScreenshotPath = (name) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(process.cwd(), 'verification', `${stamp}-${name}.png`);
};

test('[J] Data cleanup: Tarot Celtic cross from /profile matches backend data', async ({ page }) => {
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

  await page.goto('/profile');
  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/profile/);
  await page.screenshot({ path: buildScreenshotPath('data-cleanup-profile-step-1') });

  await page.goto('/tarot');
  await expect(page.getByRole('heading', { name: 'Tarot Sanctuary' })).toBeVisible();

  await page.selectOption('#tarot-spread', 'CelticCross');

  const responsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/tarot/draw') && resp.request().method() === 'POST'
  );

  await page.getByRole('button', { name: /Draw Celtic Cross/i }).click();
  const response = await responsePromise;
  expect(response.ok()).toBeTruthy();
  const data = await response.json();

  expect(data.spreadType).toBe('CelticCross');
  expect(Array.isArray(data.cards)).toBeTruthy();
  expect(data.cards).toHaveLength(10);

  const cardLocator = page.getByTestId('tarot-card');
  await expect(cardLocator).toHaveCount(10);

  for (const [index, card] of data.cards.entries()) {
    const cardSlot = cardLocator.nth(index);
    await cardSlot.hover();

    if (card.positionLabel) {
      await expect(cardSlot.getByText(card.positionLabel, { exact: true })).toBeVisible();
    }
    await expect(cardSlot.getByText(card.name, { exact: true })).toBeVisible();

    if (card.isReversed) {
      await expect(cardSlot.getByText('Reversed', { exact: true })).toBeVisible();
    }

    const meaningText = card.isReversed ? card.meaningRev : card.meaningUp;
    if (meaningText) {
      await expect(cardSlot).toContainText(snippet(meaningText));
    }
  }

  if (data.spreadMeta?.positions?.length) {
    const positions = data.spreadMeta.positions;
    const first = positions[0];
    const last = positions[positions.length - 1];
    await expect(page.getByText(`Position ${first.position}`, { exact: true })).toBeVisible();
    await expect(page.getByText(first.label, { exact: true })).toBeVisible();
    await expect(page.getByText(first.meaning, { exact: true })).toBeVisible();
    await expect(page.getByText(`Position ${last.position}`, { exact: true })).toBeVisible();
    await expect(page.getByText(last.label, { exact: true })).toBeVisible();
    await expect(page.getByText(last.meaning, { exact: true })).toBeVisible();
  }

  await page.screenshot({ path: buildScreenshotPath('data-cleanup-profile-step-2-tarot-celtic') });

  expect(consoleErrors).toEqual([]);
});
