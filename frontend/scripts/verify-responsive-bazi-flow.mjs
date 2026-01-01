import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = 'http://localhost:3000/';
const outDir = path.resolve(process.cwd(), 'verification');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');

await fs.mkdir(outDir, { recursive: true });

const credentials = {
  email: 'test@example.com',
  password: 'password123',
  name: 'Test User',
};

const viewports = [
  { label: 'desktop', width: 1280, height: 720 },
  { label: 'tablet', width: 834, height: 1112 },
  { label: 'mobile', width: 390, height: 844 },
];

const browser = await chromium.launch();

const shot = async (page, name) => {
  await page.screenshot({ path: path.join(outDir, `${stamp}-${name}.png`), fullPage: true });
};

const ensureMenuOpen = async (page) => {
  const menuButton = page.getByRole('button', { name: 'Toggle Menu' });
  if (await menuButton.isVisible()) {
    const mobileNav = page.locator('.mobile-nav');
    if (!(await mobileNav.isVisible())) {
      await menuButton.click();
    }
  }
};

const ensureNavLinkVisible = async (page, name) => {
  const link = page.getByRole('link', { name });
  if (!(await link.isVisible())) {
    await ensureMenuOpen(page);
  }
  return link;
};

const expectProfileNameInHeader = async (page) => {
  const headerName = page.getByTestId('header-user-name');
  if (await headerName.isVisible()) {
    await expect(headerName).toContainText(credentials.name);
    return;
  }

  await ensureMenuOpen(page);
  const logoutButton = page.getByRole('button', { name: new RegExp(credentials.name) });
  await expect(logoutButton).toBeVisible();
};

const logout = async (page) => {
  const logoutButton = page.getByRole('button', { name: /Logout|退出登录/ });
  if (!(await logoutButton.isVisible())) {
    await ensureMenuOpen(page);
  }
  await expect(logoutButton).toBeVisible();
  await logoutButton.click();
  await expect(page.getByRole('heading', { name: /Welcome Back|欢迎回来/ })).toBeVisible();
};

const runViewportFlow = async (viewport) => {
  const consoleErrors = [];
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
  });
  await context.addInitScript(() => {
    localStorage.setItem('locale', 'en-US');
  });
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  const birthData = {
    birthYear: 1993,
    birthMonth: 6,
    birthDay: 18,
    birthHour: 14,
    gender: 'female',
    birthLocation: `RESP_${viewport.label.toUpperCase()}_${Date.now()}_VERIFY_ME`,
    timezone: 'UTC+8',
  };

  try {
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      localStorage.removeItem('bazi_token');
      localStorage.removeItem('bazi_user');
      localStorage.removeItem('bazi_last_activity');
    });
    await page.reload({ waitUntil: 'networkidle' });

    const menuButton = page.getByRole('button', { name: 'Toggle Menu' });
    if (viewport.width >= 1024) {
      await expect(menuButton).toBeHidden();
    } else {
      await expect(menuButton).toBeVisible();
    }

    await shot(page, `responsive-${viewport.label}-step-1-home`);

    const loginLink = await ensureNavLinkVisible(page, 'Login');
    await loginLink.click();
    await page.waitForLoadState('networkidle');
    await shot(page, `responsive-${viewport.label}-step-2-login`);

    await page.getByLabel('Email').fill(credentials.email);
    await page.getByLabel('Password').fill(credentials.password);
    await shot(page, `responsive-${viewport.label}-step-3-login-filled`);
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expectProfileNameInHeader(page);
    await shot(page, `responsive-${viewport.label}-step-4-logged-in`);

    await page.goto(`${baseUrl}bazi`, { waitUntil: 'networkidle' });
    await shot(page, `responsive-${viewport.label}-step-5-bazi`);

    await page.getByLabel('Birth Year').fill(String(birthData.birthYear));
    await page.getByLabel('Birth Month').fill(String(birthData.birthMonth));
    await page.getByLabel('Birth Day').fill(String(birthData.birthDay));
    await page.getByLabel('Birth Hour (0-23)').fill(String(birthData.birthHour));
    await page.getByLabel('Gender').selectOption(birthData.gender);
    await page.getByLabel('Birth Location').fill(birthData.birthLocation);
    await page.getByLabel('Timezone').fill(birthData.timezone);
    await shot(page, `responsive-${viewport.label}-step-6-bazi-filled`);

    const calcResponsePromise = page.waitForResponse((resp) =>
      resp.url().includes('/api/bazi/calculate')
    );
    await page.getByRole('button', { name: 'Calculate' }).click();
    const calcResponse = await calcResponsePromise;
    if (!calcResponse.ok()) {
      throw new Error(`Calculation failed: ${calcResponse.status()} ${await calcResponse.text()}`);
    }

    await expect(page.getByRole('heading', { name: 'Four Pillars' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Five Elements' })).toBeVisible();
    await expect(page.getByTestId('pillars-empty')).toHaveCount(0);
    await expect(page.getByTestId('elements-empty')).toHaveCount(0);
    await shot(page, `responsive-${viewport.label}-step-7-basic-result`);

    await shot(page, `responsive-${viewport.label}-step-8-charts-rendered`);

    await page.getByRole('button', { name: 'Request Full Analysis' }).click();
    await shot(page, `responsive-${viewport.label}-step-9-request-full-analysis`);

    await expect(page.getByRole('heading', { name: 'Ten Gods' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Major Luck Cycles' })).toBeVisible();
    await shot(page, `responsive-${viewport.label}-step-10-full-analysis-sections`);

    const saveResponsePromise = page.waitForResponse((resp) =>
      resp.url().includes('/api/bazi/records')
    );
    await page.getByRole('button', { name: 'Save to History' }).click();
    const saveResponse = await saveResponsePromise;
    if (!saveResponse.ok()) {
      throw new Error(`Save failed: ${saveResponse.status()} ${await saveResponse.text()}`);
    }
    await shot(page, `responsive-${viewport.label}-step-11-saved`);

    const favResponsePromise = page.waitForResponse((resp) =>
      resp.url().includes('/api/favorites')
    );
    await page.getByRole('button', { name: 'Add to Favorites' }).click();
    const favResponse = await favResponsePromise;
    if (!favResponse.ok()) {
      throw new Error(`Favorite failed: ${favResponse.status()} ${await favResponse.text()}`);
    }
    await shot(page, `responsive-${viewport.label}-step-12-favorited`);

    await page.goto(`${baseUrl}history`, { waitUntil: 'networkidle' });
    const recordCard = page
      .getByTestId('history-record-card')
      .filter({ hasText: birthData.birthLocation });
    await expect(recordCard).toBeVisible();
    await expect(recordCard).toContainText(
      `${birthData.birthYear}-${birthData.birthMonth}-${birthData.birthDay} · ${birthData.birthHour}:00`
    );
    await expect(recordCard).toContainText(
      `${birthData.gender} · ${birthData.birthLocation} · ${birthData.timezone}`
    );
    await shot(page, `responsive-${viewport.label}-step-13-history`);

    await shot(page, `responsive-${viewport.label}-step-14-history-metadata`);

    await page.goto(`${baseUrl}favorites`, { waitUntil: 'networkidle' });
    await expect(page.getByText(birthData.birthLocation)).toBeVisible();
    await shot(page, `responsive-${viewport.label}-step-15-favorites`);

    await logout(page);
    await shot(page, `responsive-${viewport.label}-step-16-logout`);

    if (consoleErrors.length) {
      throw new Error(`Console errors detected: ${consoleErrors.join(' | ')}`);
    }
  } finally {
    await context.close();
  }
};

try {
  for (const viewport of viewports) {
    console.log(`Running responsive BaZi flow for ${viewport.label}...`);
    await runViewportFlow(viewport);
  }
} finally {
  await browser.close();
}

console.log('Responsive BaZi flow verified across desktop, tablet, and mobile.');
