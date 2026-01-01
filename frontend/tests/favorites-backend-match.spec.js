import { test, expect } from './fixtures.js';

const formatDate = (record) =>
  `${record.birthYear}-${record.birthMonth}-${record.birthDay} · ${record.birthHour}:00`;
const formatProfile = (record) => {
  const location = record.birthLocation || '—';
  const timezone = record.timezone || 'UTC';
  return `${record.gender} · ${location} · ${timezone}`;
};

test('Error handling: favorites flow matches backend data', async ({ page, request }) => {
  const uniqueLocation = `E2E_FAVORITES_BACKEND_${Date.now()}`;
  let recordId = null;
  let favoriteId = null;

  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
  });

  await page.goto('/');
  const loginResponse = await request.post('/api/auth/login', {
    data: { email: 'test@example.com', password: 'password123' },
  });
  expect(loginResponse.ok()).toBeTruthy();
  const loginData = await loginResponse.json();
  await page.evaluate(
    ({ token, user }) => {
      localStorage.setItem('bazi_token', token);
      localStorage.setItem('bazi_token_origin', 'backend');
      localStorage.setItem('bazi_user', JSON.stringify(user));
      localStorage.setItem('bazi_last_activity', String(Date.now()));
      localStorage.removeItem('bazi_session_expired');
    },
    { token: loginData.token, user: loginData.user }
  );

  try {
    await page.goto('/bazi');
    await page.getByLabel('Birth Year').fill('1992');
    await page.getByLabel('Birth Month').fill('9');
    await page.getByLabel('Birth Day').fill('21');
    await page.getByLabel('Birth Hour (0-23)').fill('6');
    await page.locator('#gender').selectOption('female');
    await page.getByLabel('Birth Location').fill(uniqueLocation);
    await page.getByLabel('Timezone').fill('UTC');

    const calculateResponse = page.waitForResponse(
      (resp) => resp.url().includes('/api/bazi/calculate') && resp.request().method() === 'POST'
    );
    await page.getByRole('button', { name: 'Calculate' }).click();
    await calculateResponse;
    await expect(page.getByRole('heading', { name: 'Four Pillars' })).toBeVisible();

    const saveResponsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/bazi/records') && resp.request().method() === 'POST'
    );
    await page.getByRole('button', { name: 'Save to History' }).click();
    const saveResponse = await saveResponsePromise;
    expect(saveResponse.ok()).toBeTruthy();
    const saveData = await saveResponse.json();
    recordId = saveData?.record?.id || null;

    const favoriteResponsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/favorites') && resp.request().method() === 'POST'
    );
    await page.getByRole('button', { name: 'Add to Favorites' }).click();
    const favoriteResponse = await favoriteResponsePromise;
    expect(favoriteResponse.ok()).toBeTruthy();
    const favoriteData = await favoriteResponse.json();
    favoriteId = favoriteData?.favorite?.id || null;

    const token = await page.evaluate(() => localStorage.getItem('bazi_token'));
    expect(token).toBeTruthy();

    const favoritesRes = await request.get('/api/favorites', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(favoritesRes.ok()).toBeTruthy();
    const favoritesData = await favoritesRes.json();
    const backendFavorite = (favoritesData.favorites || []).find(
      (favorite) =>
        favorite.record?.birthLocation === uniqueLocation || favorite.recordId === recordId
    );

    expect(backendFavorite).toBeTruthy();

    const record = backendFavorite.record;
    await page.goto('/favorites');

    const favoriteCard = page.locator(
      `[data-testid="favorite-record-card"][data-record-id="${record.id}"]`
    );
    await expect(favoriteCard).toBeVisible();
    await expect(favoriteCard).toContainText(formatDate(record));
    await expect(favoriteCard).toContainText(formatProfile(record));

    await favoriteCard.getByRole('button', { name: 'View' }).click();
    await expect(favoriteCard).toContainText(
      `${record.pillars.year.stem} · ${record.pillars.year.branch}`
    );
    await expect(favoriteCard).toContainText(
      `${record.pillars.day.stem} · ${record.pillars.day.branch}`
    );
    await expect(favoriteCard).toContainText(
      `${record.pillars.month.stem} · ${record.pillars.month.branch}`
    );
    await expect(favoriteCard).toContainText(
      `${record.pillars.hour.stem} · ${record.pillars.hour.branch}`
    );
  } finally {
    const token = await page.evaluate(() => localStorage.getItem('bazi_token'));
    if (token && favoriteId) {
      await request.delete(`/api/favorites/${favoriteId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }
    if (token && recordId) {
      await request.delete(`/api/bazi/records/${recordId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  }
});
