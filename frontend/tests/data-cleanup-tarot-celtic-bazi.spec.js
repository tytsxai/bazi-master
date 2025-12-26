import { test, expect } from './fixtures.js';
import path from 'path';

const buildScreenshotPath = (name) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(process.cwd(), 'verification', `${stamp}-${name}.png`);
};

const snippet = (value, length = 28) => (value ? value.slice(0, length) : '');

const assertCardMatches = async (locator, card) => {
  await locator.hover();

  if (card.positionLabel) {
    await expect(locator.getByText(card.positionLabel, { exact: true })).toBeVisible();
  }
  if (card.positionMeaning) {
    await expect(locator).toContainText(snippet(card.positionMeaning));
  }

  await expect(locator.getByText(card.name, { exact: true })).toBeVisible();
  if (card.isReversed) {
    await expect(locator.getByText('Reversed', { exact: true })).toBeVisible();
  }

  const meaningText = card.isReversed ? card.meaningRev : card.meaningUp;
  if (meaningText) {
    await expect(locator).toContainText(snippet(meaningText));
  }
};

test('[J] Data cleanup: Tarot Celtic cross from /bazi matches backend data', async ({ page }) => {
  const consoleErrors = [];

  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
  });

  await page.goto('/bazi');
  await expect(page.getByLabel(/Birth Year|出生年份/)).toBeVisible();
  await page.screenshot({ path: buildScreenshotPath('data-cleanup-tarot-celtic-step-1-bazi') });

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

  await page.goto('/bazi');
  await page.getByRole('link', { name: /Tarot/i }).click();
  await expect(page).toHaveURL(/\/tarot/);
  await expect(page.getByRole('heading', { name: 'Tarot Sanctuary' })).toBeVisible();

  const spreadSelect = page.locator('#tarot-spread');
  await expect(spreadSelect).toBeVisible();
  await expect(page.locator('#tarot-spread option[value="CelticCross"]')).toBeEnabled();
  await spreadSelect.selectOption('CelticCross');
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

  const cards = page.getByTestId('tarot-card');
  await expect(cards).toHaveCount(10);

  for (const card of data.cards) {
    const cardIndex = Math.max(0, (card.position || 1) - 1);
    const cardLocator = cards.nth(cardIndex);
    await assertCardMatches(cardLocator, card);
  }

  if (Array.isArray(data.spreadMeta?.positions)) {
    const positionsSection = page
      .getByRole('heading', { name: /Celtic Cross Positions/i })
      .locator('xpath=ancestor::section[1]');

    for (const position of data.spreadMeta.positions) {
      if (position.label) {
        await expect(positionsSection.getByText(position.label, { exact: true })).toBeVisible();
      }
      if (position.meaning) {
        await expect(positionsSection).toContainText(snippet(position.meaning));
      }
    }
  }

  await page.screenshot({ path: buildScreenshotPath('data-cleanup-tarot-celtic-step-2-drawn') });
  expect(consoleErrors).toEqual([]);
});
