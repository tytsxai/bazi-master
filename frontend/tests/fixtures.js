import { test as base } from '@playwright/test';

/**
 * Extended test fixture that ensures English locale is set
 * before each page navigation
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    // Set locale in localStorage before any navigation
    await page.addInitScript(() => {
      if (!localStorage.getItem('locale')) {
        localStorage.setItem('locale', 'en-US');
      }
    });
    await use(page);
  },
});

export { expect } from '@playwright/test';
