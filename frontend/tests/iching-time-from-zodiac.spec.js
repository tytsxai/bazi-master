import { test, expect } from '@playwright/test';

const takeShot = async (page, label) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  await page.screenshot({ path: `../verification/${stamp}-${label}.png`, fullPage: true });
};

test('I Ching time divination from /zodiac matches backend data', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
    localStorage.removeItem('bazi_token');
    localStorage.removeItem('bazi_user');
    localStorage.removeItem('bazi_last_activity');
  });

  await page.goto('/zodiac');
  await expect(page.getByRole('heading', { name: 'Zodiac Chronicles' })).toBeVisible();

  const responsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/iching/divine') && resp.request().method() === 'POST'
  );

  await page.getByRole('button', { name: 'Reveal Time Hexagram' }).click();
  const response = await responsePromise;
  expect(response.ok()).toBeTruthy();
  const data = await response.json();

  await expect(page.getByTestId('iching-time-hexagram-name')).toHaveText(data.hexagram.name);
  await expect(page.getByTestId('iching-time-resulting-name')).toHaveText(
    data.resultingHexagram?.name || '—'
  );

  const changingLines = data.changingLines?.length ? data.changingLines.join(', ') : 'None';
  await expect(page.getByTestId('iching-time-changing-lines')).toHaveText(changingLines);

  if (data.timeContext?.iso) {
    await expect(page.getByTestId('iching-time-iso')).toHaveText(data.timeContext.iso);
  }

  await takeShot(page, 'iching-time-zodiac-result');
});
