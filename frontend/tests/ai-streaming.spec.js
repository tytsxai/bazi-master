import { test, expect } from './fixtures.js';
import path from 'path';

const screenshotPath = (name) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(process.cwd(), '..', 'verification', `${stamp}-${name}.png`);
};

test('AI streaming via WebSocket flow (connect, stream, disconnect)', async ({ page }) => {
  test.setTimeout(120000);
  const uniqueLocation = `AI_STREAM_${Date.now()}`;
  const consoleErrors = [];
  const email = 'test@example.com';
  const password = 'password123';
  const name = 'Test User';
  let token = null;
  let user = null;
  const loginViaApi = async () => {
    let response = await page.request.post('/api/auth/login', {
      data: { email, password },
    });

    if (!response.ok()) {
      await page.request.post('/api/auth/register', {
        data: { email, password, name },
      });
      response = await page.request.post('/api/auth/login', {
        data: { email, password },
      });
    }

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    token = data?.token;
    user = data?.user;
    expect(token).toBeTruthy();
  };

  const applyAuthToLocalStorage = async () => {
    await page.evaluate(
      ({ tokenValue, userValue }) => {
        localStorage.setItem('bazi_token', tokenValue);
        localStorage.setItem('bazi_token_origin', 'backend');
        localStorage.setItem('bazi_user', JSON.stringify(userValue));
        localStorage.setItem('bazi_last_activity', String(Date.now()));
        localStorage.removeItem('bazi_session_expired');
      },
      { tokenValue: token, userValue: user }
    );
  };

  const ensureLoggedIn = async () => {
    if (!page.url().includes('/login')) return;
    await loginViaApi();
    await applyAuthToLocalStorage();
    const nextPath = new URL(page.url()).searchParams.get('next') || '/profile';
    await page.goto(nextPath, { waitUntil: 'domcontentloaded' });
    await expect(page).not.toHaveURL(/\/login/);
  };

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });
  page.on('pageerror', (error) => {
    consoleErrors.push(error.message);
  });

  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
    localStorage.setItem('bazi_ai_provider', 'mock');
    localStorage.removeItem('bazi_token');
    localStorage.removeItem('bazi_user');
    localStorage.removeItem('bazi_last_activity');
  });

  await loginViaApi();

  await page.addInitScript(
    ({ tokenValue, userValue }) => {
      localStorage.setItem('bazi_token', tokenValue);
      localStorage.setItem('bazi_token_origin', 'backend');
      localStorage.setItem('bazi_user', JSON.stringify(userValue));
      localStorage.setItem('bazi_last_activity', String(Date.now()));
      localStorage.removeItem('bazi_session_expired');
    },
    { tokenValue: token, userValue: user }
  );

  await page.goto('/');
  await expect(page.getByRole('link', { name: 'BaZi Master' })).toBeVisible();
  await page.screenshot({ path: screenshotPath('ai-streaming-step-1-home') });

  await page.goto('/profile');
  await expect(page).toHaveURL(/\/profile/);
  await expect(page.getByTestId('header-user-name')).toHaveText('Test User');
  const tokenValue = await page.evaluate(() => localStorage.getItem('bazi_token'));
  expect(tokenValue).toBeTruthy();
  await page.screenshot({ path: screenshotPath('ai-streaming-step-3-profile') });

  await page.goto('/bazi');
  await expect(page.getByRole('heading', { name: 'BaZi Destiny Chart' })).toBeVisible();
  await page.screenshot({ path: screenshotPath('ai-streaming-step-4-bazi') });

  await page.getByLabel('Birth Year').fill('1991');
  await page.getByLabel('Birth Month').fill('11');
  await page.getByLabel('Birth Day').fill('9');
  await page.getByLabel('Birth Hour (0-23)').fill('9');
  await page.getByLabel('Gender').selectOption('male');
  await page.getByLabel('Birth Location').fill(uniqueLocation);
  await page.getByLabel('Timezone').fill('UTC+8');
  await page.screenshot({ path: screenshotPath('ai-streaming-step-5-form') });

  const calcResponse = page.waitForResponse(
    (resp) => resp.url().includes('/api/bazi/calculate') && resp.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Calculate' }).click();
  await calcResponse;
  await expect(page.getByTestId('pillars-empty')).toHaveCount(0);
  await expect(page.getByTestId('elements-empty')).toHaveCount(0);
  await page.screenshot({ path: screenshotPath('ai-streaming-step-6-calculated') });

  await expect(page.getByTestId('bazi-full-analysis')).toBeEnabled();
  await page.getByTestId('bazi-full-analysis').click();
  await expect.poll(
    async () => page.getByTestId('ten-god-item').count(),
    { timeout: 60000 }
  ).toBeGreaterThan(0);
  await expect.poll(
    async () => page.getByTestId('luck-cycle-item').count(),
    { timeout: 60000 }
  ).toBeGreaterThan(0);
  await expect(page.getByTestId('bazi-ai-interpret')).toBeEnabled({ timeout: 60000 });
  await page.screenshot({ path: screenshotPath('ai-streaming-step-7-full-analysis') });

  const wsEvents = {
    connected: false,
    started: false,
    done: false,
    errored: false,
    closed: false,
    chunks: 0,
  };
  const wsPromise = new Promise((resolve) => {
    page.on('websocket', (ws) => {
      if (!ws.url().includes('/ws/ai')) return;
      wsEvents.connected = true;
      ws.on('framereceived', (frame) => {
        try {
          const message = JSON.parse(frame.payload);
          if (message?.type === 'start') wsEvents.started = true;
          if (message?.type === 'chunk') wsEvents.chunks += 1;
          if (message?.type === 'done') wsEvents.done = true;
          if (message?.type === 'error') wsEvents.errored = true;
        } catch {
          // Ignore non-JSON frames.
        }
      });
      ws.on('close', () => {
        wsEvents.closed = true;
      });
      resolve(ws);
    });
  });

  await page.getByTestId('bazi-ai-interpret').click();
  await page.getByRole('button', { name: 'Request AI' }).click();
  await wsPromise;
  await expect(page.getByText('AI BaZi Analysis')).toBeVisible();
  await page.screenshot({ path: screenshotPath('ai-streaming-step-8-ai-started') });

  await expect.poll(() => wsEvents.done || wsEvents.errored, { timeout: 15000 }).toBeTruthy();
  await expect.poll(() => wsEvents.closed, { timeout: 15000 }).toBeTruthy();

  expect(wsEvents.connected).toBeTruthy();
  expect(wsEvents.started).toBeTruthy();
  expect(wsEvents.errored).toBeFalsy();
  expect(wsEvents.chunks).toBeGreaterThan(0);
  expect(wsEvents.done).toBeTruthy();
  expect(wsEvents.closed).toBeTruthy();

  await expect(page.getByTestId('bazi-ai-result')).not.toBeEmpty();
  await page.screenshot({ path: screenshotPath('ai-streaming-step-9-ai-complete') });

  const saveResponse = page.waitForResponse(
    (resp) => resp.url().includes('/api/bazi/records') && resp.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Save to History' }).click();
  await saveResponse;
  await page.screenshot({ path: screenshotPath('ai-streaming-step-10-saved') });

  const favoriteResponse = page.waitForResponse(
    (resp) => resp.url().includes('/api/favorites') && resp.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Add to Favorites' }).click();
  await favoriteResponse;
  await page.screenshot({ path: screenshotPath('ai-streaming-step-11-favorited') });

  await page.goto('/history');
  await ensureLoggedIn();
  await expect(page.getByRole('heading', { name: 'History', exact: true })).toBeVisible();
  await expect(page.getByText(uniqueLocation)).toBeVisible();
  await page.screenshot({ path: screenshotPath('ai-streaming-step-12-history') });

  await page.goto('/favorites');
  await ensureLoggedIn();
  await expect(page.getByRole('heading', { name: 'Favorites' })).toBeVisible();
  await expect(page.getByText(uniqueLocation)).toBeVisible();
  await page.screenshot({ path: screenshotPath('ai-streaming-step-13-favorites') });

  const favoriteCard = page
    .getByText(uniqueLocation)
    .locator('xpath=ancestor::div[contains(@class,"rounded-2xl")]')
    .first();
  const removeFavorite = page.waitForResponse(
    (resp) => resp.url().includes('/api/favorites/') && resp.request().method() === 'DELETE'
  );
  await favoriteCard.getByRole('button', { name: 'Remove' }).click();
  await removeFavorite;
  await page.screenshot({ path: screenshotPath('ai-streaming-step-14-favorites-removed') });

  await page.goto('/history');
  await ensureLoggedIn();
  await expect(page.getByRole('heading', { name: 'History', exact: true })).toBeVisible();
  const historyCard = page
    .getByText(uniqueLocation)
    .locator('xpath=ancestor::div[contains(@data-testid,"history-record-card")][1]');
  await historyCard.getByRole('button', { name: 'Delete' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const deleteResponse = page.waitForResponse(
    (resp) => resp.url().includes('/api/bazi/records/') && resp.request().method() === 'DELETE'
  );
  await dialog.getByRole('button', { name: 'Delete' }).click();
  const deleteResult = await deleteResponse;
  expect(deleteResult.ok()).toBeTruthy();
  await expect(historyCard).toHaveCount(0);
  await page.screenshot({ path: screenshotPath('ai-streaming-step-15-history-deleted') });

  await page.getByRole('button', { name: 'Logout' }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.screenshot({ path: screenshotPath('ai-streaming-step-16-logout') });

  expect(consoleErrors).toEqual([]);
});
