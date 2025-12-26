import { test, expect } from '@playwright/test';
import path from 'path';

const screenshotPath = (name) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(process.cwd(), '..', 'verification', `${stamp}-${name}.png`);
};

test('Form validation across key forms', async ({ page }) => {
  const consoleErrors = [];

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
    localStorage.removeItem('bazi_token');
    localStorage.removeItem('bazi_user');
    localStorage.removeItem('bazi_last_activity');
  });

  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    const form = document.querySelector('form');
    if (form) form.noValidate = true;
  });
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.locator('#login-email-error')).toBeVisible();
  await expect(page.locator('#login-password-error')).toBeVisible();
  await page.screenshot({ path: screenshotPath('form-validation-login-required') });

  await page.fill('input[type="email"]', 'invalid');
  await page.fill('input[type="password"]', 'password123');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.locator('#login-email-error')).toBeVisible();
  await page.screenshot({ path: screenshotPath('form-validation-login-invalid-email') });

  await page.fill('input[type="email"]', 'test@example.com');
  await expect(page.locator('#login-email-error')).toBeHidden();

  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/register/);
  await page.evaluate(() => {
    const form = document.querySelector('form');
    if (form) form.noValidate = true;
  });
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.locator('#register-email-error')).toBeVisible();
  await expect(page.locator('#register-password-error')).toBeVisible();
  await page.screenshot({ path: screenshotPath('form-validation-register-required') });

  await page.fill('#register-name', 'A');
  await page.fill('#register-email', 'bad');
  await page.fill('#register-password', 'short');
  await page.fill('#register-confirm', 'different');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.locator('#register-name-error')).toBeVisible();
  await expect(page.locator('#register-email-error')).toBeVisible();
  await expect(page.locator('#register-password-error')).toBeVisible();
  await expect(page.locator('#register-confirm-error')).toBeVisible();
  await page.screenshot({ path: screenshotPath('form-validation-register-invalid') });

  await page.goto('/bazi');
  await page.evaluate(() => {
    const form = document.querySelector('form');
    if (form) form.noValidate = true;
  });
  await page.fill('#birthYear', '');
  await page.fill('#birthMonth', '');
  await page.fill('#birthDay', '');
  await page.fill('#birthHour', '');
  await page.fill('#birthLocation', '   ');
  await page.fill('#timezone', '   ');
  await page.getByRole('button', { name: 'Calculate' }).click();
  await expect(page.locator('#bazi-birthYear-error')).toBeVisible();
  await expect(page.locator('#bazi-birthMonth-error')).toBeVisible();
  await expect(page.locator('#bazi-birthDay-error')).toBeVisible();
  await expect(page.locator('#bazi-birthHour-error')).toBeVisible();
  await expect(page.locator('#bazi-gender-error')).toBeVisible();
  await expect(page.locator('#bazi-birthLocation-error')).toBeVisible();
  await expect(page.locator('#bazi-timezone-error')).toBeVisible();
  await page.screenshot({ path: screenshotPath('form-validation-bazi-required') });

  await page.fill('#birthYear', '1990');
  await page.fill('#birthMonth', '6');
  await page.fill('#birthDay', '12');
  await page.fill('#birthHour', '10');
  await page.selectOption('#gender', 'male');
  await page.fill('#birthLocation', 'London');
  await page.fill('#timezone', 'UTC+0');
  await page.getByRole('button', { name: 'Calculate' }).click();
  await expect(page.locator('#bazi-birthYear-error')).toBeHidden();
  await expect(page.locator('#bazi-birthMonth-error')).toBeHidden();
  await expect(page.locator('#bazi-birthDay-error')).toBeHidden();
  await expect(page.locator('#bazi-birthHour-error')).toBeHidden();
  await expect(page.locator('#bazi-gender-error')).toBeHidden();
  await page.screenshot({ path: screenshotPath('form-validation-bazi-corrected') });

  await page.goto('/iching');
  await page.evaluate(() => {
    const form = document.querySelector('form');
    if (form) form.noValidate = true;
  });
  await page.getByRole('button', { name: 'Divine with Numbers' }).click();
  await expect(page.locator('#iching-first-error')).toBeVisible();
  await expect(page.locator('#iching-second-error')).toBeVisible();
  await expect(page.locator('#iching-third-error')).toBeVisible();
  await page.screenshot({ path: screenshotPath('form-validation-iching-required') });

  await page.fill('input[placeholder="12"]', '0');
  await page.fill('input[placeholder="27"]', '0');
  await page.fill('input[placeholder="44"]', '3');
  await page.getByRole('button', { name: 'Divine with Numbers' }).click();
  await expect(page.locator('#iching-first-error')).toBeVisible();
  await expect(page.locator('#iching-second-error')).toBeVisible();
  await page.screenshot({ path: screenshotPath('form-validation-iching-invalid') });

  await page.goto('/zodiac');
  await page.evaluate(() => {
    const form = document.querySelector('form');
    if (form) form.noValidate = true;
  });
  await page.getByRole('button', { name: 'Reveal Rising Sign' }).click();
  await expect(page.locator('#rising-birthDate-error')).toBeVisible();
  await expect(page.locator('#rising-birthTime-error')).toBeVisible();
  await expect(page.locator('#rising-timezoneOffset-error')).toBeVisible();
  await expect(page.locator('#rising-latitude-error')).toBeVisible();
  await expect(page.locator('#rising-longitude-error')).toBeVisible();
  await page.screenshot({ path: screenshotPath('form-validation-zodiac-rising-required') });

  expect(consoleErrors).toEqual([]);
});
