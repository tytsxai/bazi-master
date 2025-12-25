import { test, expect } from '@playwright/test';

const pad = (value) => String(value).padStart(2, '0');

const formatTimeContext = (context) => {
  if (!context) return '';
  return `${context.year}-${pad(context.month)}-${pad(context.day)} ${pad(context.hour)}:${pad(context.minute)}`;
};

test('I Ching time divination from tarot matches backend data', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
  });

  await page.goto('/tarot', { waitUntil: 'domcontentloaded' });
  await page.getByRole('link', { name: 'I Ching' }).click();
  await expect(page).toHaveURL(/\/iching/);

  const responsePromise = page.waitForResponse((response) => {
    if (!response.url().includes('/api/iching/divine')) return false;
    if (response.request().method() !== 'POST') return false;
    const postData = response.request().postData();
    if (!postData) return false;
    try {
      const body = JSON.parse(postData);
      return body?.method === 'time';
    } catch (error) {
      return false;
    }
  });

  await page.getByRole('button', { name: 'Use Current Time' }).click();
  const response = await responsePromise;
  expect(response.ok()).toBeTruthy();
  const raw = await response.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Expected JSON from /api/iching/divine but received: ${raw || '[empty body]'}`);
  }

  await expect(page.getByRole('heading', { name: 'Primary Hexagram' })).toBeVisible();

  const primarySection = page.getByRole('heading', { name: 'Primary Hexagram' }).locator('..');
  await expect(primarySection).toContainText(data.hexagram.name);
  if (data.hexagram.title) {
    await expect(primarySection).toContainText(data.hexagram.title);
  }

  if (data.timeContext) {
    await expect(primarySection).toContainText(`Time used: ${formatTimeContext(data.timeContext)}`);
  }

  const changingLinesText = data.changingLines?.length ? data.changingLines.join(', ') : 'None';
  await expect(primarySection).toContainText(`Changing lines: ${changingLinesText}`);

  const resultingSection = page.getByRole('heading', { name: 'Resulting Hexagram' }).locator('..');
  if (data.resultingHexagram?.name) {
    await expect(resultingSection).toContainText(data.resultingHexagram.name);
  } else {
    await expect(resultingSection).toContainText('No resulting hexagram yet.');
  }
});
