import { test, expect } from './fixtures.js';

test('User can register via API and log in', async ({ page, request }) => {
    const testId = `e2e_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const email = `${testId}@example.com`;
    const password = 'Passw0rd!';
    const name = `Seer ${testId}`;

    const registerResponse = await request.post('/api/register', {
        data: { email, password, name },
    });

    expect(registerResponse.ok()).toBeTruthy();

    await page.goto('/');
    await page.evaluate(() => {
        localStorage.removeItem('bazi_token');
        localStorage.removeItem('bazi_user');
        localStorage.removeItem('bazi_last_activity');
    });

    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page).toHaveURL(/\/profile/);
    const profileCard = page.getByText('Name', { exact: true }).locator('..');
    await expect(profileCard.getByText(name, { exact: true })).toBeVisible();
    await expect(page.getByText('Email', { exact: true }).locator('..').getByText(email, { exact: true })).toBeVisible();
});
