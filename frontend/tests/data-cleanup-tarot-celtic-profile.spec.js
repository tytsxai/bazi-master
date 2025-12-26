import { test, expect } from './fixtures.js';
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
  });

  const email = 'test@example.com';
  const password = 'password123';
  let loginResponse = await page.request.post('/api/auth/login', {
    data: { email, password },
  });
  if (!loginResponse.ok()) {
    await page.request.post('/api/auth/register', {
      data: { email, password, name: 'Test User' },
    });
    loginResponse = await page.request.post('/api/auth/login', {
      data: { email, password },
    });
  }
  expect(loginResponse.ok()).toBeTruthy();
  const loginData = await loginResponse.json();

  await page.addInitScript(
    ({ token, user }) => {
      localStorage.setItem('bazi_token', token);
      localStorage.setItem('bazi_token_origin', 'backend');
      localStorage.setItem('bazi_user', JSON.stringify(user));
      localStorage.setItem('bazi_last_activity', String(Date.now()));
      localStorage.removeItem('bazi_session_expired');
    },
    { token: loginData.token, user: loginData.user }
  );

  await page.goto('/profile');
  await expect(page.getByRole('button', { name: /Logout/i })).toBeVisible();
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
    const positionsSection = page
      .getByRole('heading', { name: 'Celtic Cross Positions' })
      .locator('xpath=ancestor::section[1]');
    await expect(positionsSection.getByText(`Position ${first.position}`, { exact: true })).toBeVisible();
    await expect(positionsSection.getByText(first.label, { exact: true })).toBeVisible();
    await expect(positionsSection.getByText(first.meaning, { exact: true })).toBeVisible();
    await expect(positionsSection.getByText(`Position ${last.position}`, { exact: true })).toBeVisible();
    await expect(positionsSection.getByText(last.label, { exact: true })).toBeVisible();
    await expect(positionsSection.getByText(last.meaning, { exact: true })).toBeVisible();
  }

  await page.screenshot({ path: buildScreenshotPath('data-cleanup-profile-step-2-tarot-celtic') });

  expect(consoleErrors).toEqual([]);
});
