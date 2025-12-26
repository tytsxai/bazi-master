/**
 * Global setup for Playwright tests
 * Ensures all tests run with English locale
 */
export default async function globalSetup() {
  // Set environment variable to ensure English locale
  process.env.TEST_LOCALE = 'en-US';
}
