import { defineConfig, devices } from '@playwright/test';

const webPort = Number(process.env.E2E_WEB_PORT || 3000);
const baseURL = `http://127.0.0.1:${webPort}`;

export default defineConfig({
    testDir: './tests',
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: 1,
    reporter: 'line',
    expect: {
        timeout: 15000,
    },
    use: {
        baseURL,
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
        url: `${baseURL}/api/health`,
        reuseExistingServer: false,
        timeout: 120 * 1000,
        env: {
            ...process.env,
            E2E_SERVER: '1',
            E2E_WEB_PORT: String(webPort),
            AI_PROVIDER: 'mock',
            OPENAI_API_KEY: '',
            ANTHROPIC_API_KEY: '',
        },
    },
});
