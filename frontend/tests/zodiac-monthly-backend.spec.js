import { test, expect } from './fixtures.js';

test('Flow integrity: zodiac monthly horoscope matches backend data', async ({ page, request }) => {
  test.setTimeout(60000);
  const loginResponse = await request.post('/api/login', {
    data: { email: 'test@example.com', password: 'password123' },
  });
  expect(loginResponse.ok()).toBeTruthy();
  const loginData = await loginResponse.json();
  expect(loginData?.token).toBeTruthy();
  expect(loginData?.user).toBeTruthy();

  await page.addInitScript(
    ({ token, user }) => {
      localStorage.setItem('locale', 'en-US');
      localStorage.setItem('bazi_token', token);
      localStorage.setItem('bazi_user', JSON.stringify(user));
      localStorage.removeItem('bazi_last_activity');
      localStorage.removeItem('bazi_session_expired');
    },
    { token: loginData.token, user: loginData.user }
  );

  await page.goto('/ziwei');
  await expect(page).toHaveURL(/\/ziwei/, { timeout: 15000 });
  await expect(page.getByRole('heading', { name: 'Zi Wei Atlas' })).toBeVisible({ timeout: 15000 });

  await page.getByRole('link', { name: 'Zodiac' }).click();
  await expect(page).toHaveURL(/\/zodiac/);
  await expect(page.getByRole('heading', { name: 'Zodiac Chronicles' })).toBeVisible();

  const signResponsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/zodiac/libra') && resp.request().method() === 'GET'
  );
  await page.getByRole('button', { name: /Libra/ }).click();
  const signResponse = await signResponsePromise;
  expect(signResponse.ok()).toBeTruthy();

  await page.getByRole('button', { name: 'Monthly' }).click();

  const horoscopeResponsePromise = page.waitForResponse(
    (resp) =>
      resp.url().includes('/api/zodiac/libra/horoscope?period=monthly') &&
      resp.request().method() === 'GET'
  );
  await page.getByRole('button', { name: 'Get Horoscope' }).click();
  const horoscopeResponse = await horoscopeResponsePromise;
  expect(horoscopeResponse.ok()).toBeTruthy();
  const horoscopeData = await horoscopeResponse.json();

  await expect(
    page.getByRole('heading', {
      name: new RegExp(`${horoscopeData.sign.name}\\s+Monthly\\s+Horoscope`, 'i'),
    })
  ).toBeVisible();

  await expect(page.getByText(horoscopeData.range)).toBeVisible();

  const overviewBlock = page.getByText('Overview', { exact: true }).locator('..');
  await expect(overviewBlock).toContainText(horoscopeData.horoscope.overview);

  const loveBlock = page.getByText('Love', { exact: true }).locator('..');
  await expect(loveBlock).toContainText(horoscopeData.horoscope.love);

  const careerBlock = page.getByText('Career', { exact: true }).locator('..');
  await expect(careerBlock).toContainText(horoscopeData.horoscope.career);

  const wellnessBlock = page.getByText('Wellness', { exact: true }).locator('..');
  await expect(wellnessBlock).toContainText(horoscopeData.horoscope.wellness);

  const luckyColors = horoscopeData.horoscope.lucky.colors.join(', ');
  const luckyNumbers = horoscopeData.horoscope.lucky.numbers.join(', ');

  await expect(page.getByText(`Lucky colors: ${luckyColors}`)).toBeVisible();
  await expect(page.getByText(`Lucky numbers: ${luckyNumbers}`)).toBeVisible();
  await expect(page.getByText(`Mantra: ${horoscopeData.horoscope.mantra}`)).toBeVisible();
});
