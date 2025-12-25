import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: 'line',
    use: {
        baseURL: 'http://127.0.0.1:3000',
        trace: 'on-first-retry',
        headless: true, // Explicitly requesting headless mode
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    // Run your local dev server before starting the tests (skip when PW_NO_WEB_SERVER=1).
    webServer: process.env.PW_NO_WEB_SERVER === '1' ? undefined : {
        command: 'node scripts/dev-server.mjs',
        url: 'http://127.0.0.1:3000',
        reuseExistingServer: true,
        timeout: 120 * 1000,
        env: {
            ...process.env,
            PW_SERVER: '1',
        },
    },
});
