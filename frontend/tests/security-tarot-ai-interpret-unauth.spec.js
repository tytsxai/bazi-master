import { test, expect } from '@playwright/test';
import path from 'path';

const buildScreenshotPath = (name) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(process.cwd(), '..', 'verification', `${stamp}-${name}.png`);
};

test('Security: /api/tarot/ai-interpret rejects unauthenticated requests with 401', async ({ page, request }) => {
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
    localStorage.removeItem('bazi_session_expired');
  });

  await page.goto('/tarot', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Tarot Sanctuary' })).toBeVisible();
  await page.screenshot({ path: buildScreenshotPath('security-tarot-ai-interpret-unauth-step-1-tarot') });

  const response = await request.post('/api/tarot/ai-interpret', {
    data: {
      spreadType: 'SingleCard',
      userQuestion: 'SECURITY_UNAUTH_AI',
      cards: [
        {
          position: 1,
          name: 'The Fool',
          meaningUp: 'Beginnings, innocence, spontaneity, a free spirit',
          meaningRev: 'Holding back, recklessness, risk-taking',
          isReversed: false,
        },
      ],
    },
  });

  expect(response.status()).toBe(401);
  const body = await response.json().catch(() => ({}));
  expect(body && typeof body).toBe('object');

  await page.screenshot({ path: buildScreenshotPath('security-tarot-ai-interpret-unauth-step-2-response') });
  expect(consoleErrors).toEqual([]);
});
