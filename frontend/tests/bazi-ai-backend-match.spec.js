import { test, expect } from './fixtures.js';

const normalizeText = (value) => (value || '').replace(/\r\n/g, '\n').trim();

test('Flow integrity: BaZi AI interpretation matches backend data', async ({ page, request }) => {
  const uniqueLocation = `AI_BACKEND_MATCH_${Date.now()}`;

  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
  });

  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/profile/);

  await page.goto('/bazi');
  await page.getByLabel('Birth Year').fill('1994');
  await page.getByLabel('Birth Month').fill('4');
  await page.getByLabel('Birth Day').fill('12');
  await page.getByLabel('Birth Hour (0-23)').fill('9');
  await page.locator('#gender').selectOption('female');
  await page.getByLabel('Birth Location').fill(uniqueLocation);
  await page.getByLabel('Timezone').fill('UTC+8');

  const calcResponsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/bazi/calculate') && resp.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Calculate' }).click();
  const calcResponse = await calcResponsePromise;
  expect(calcResponse.ok()).toBeTruthy();

  const fullAnalysisResponsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/bazi/full-analysis') && resp.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Request Full Analysis' }).click();
  const fullAnalysisResponse = await fullAnalysisResponsePromise;
  expect(fullAnalysisResponse.ok()).toBeTruthy();
  const fullAnalysisData = await fullAnalysisResponse.json();

  await page.getByTestId('bazi-ai-interpret').click();
  await page.getByRole('button', { name: 'Request AI' }).click();

  const aiResultLocator = page.getByTestId('bazi-ai-result');
  await expect(aiResultLocator).toBeVisible();
  await expect(page.getByText('AI interpretation ready.')).toBeVisible({ timeout: 15000 });
  await expect.poll(async () => normalizeText(await aiResultLocator.innerText()), {
    timeout: 15000,
  }).not.toBe('Consulting the oracle...');

  const uiText = normalizeText(await aiResultLocator.innerText());
  expect(uiText.length).toBeGreaterThan(0);

  const token = await page.evaluate(() => localStorage.getItem('bazi_token'));
  expect(token).toBeTruthy();

  const provider = await page.evaluate(() => localStorage.getItem('bazi_ai_provider'));
  const aiPayload = {
    pillars: fullAnalysisData.pillars,
    fiveElements: fullAnalysisData.fiveElements,
    tenGods: fullAnalysisData.tenGods,
    luckCycles: fullAnalysisData.luckCycles,
    strength: fullAnalysisData.strength,
  };

  const aiResponse = await request.post('/api/bazi/ai-interpret', {
    data: provider ? { ...aiPayload, provider } : aiPayload,
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(aiResponse.ok()).toBeTruthy();
  const aiBackend = await aiResponse.json();
  const backendText = normalizeText(aiBackend?.content || '');

  expect(backendText.length).toBeGreaterThan(0);
  expect(uiText).toBe(backendText);
});
