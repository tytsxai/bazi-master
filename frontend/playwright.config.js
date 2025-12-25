import { defineConfig, devices } from '@playwright/test';

const fallbackPort = 3100 + Math.floor(Math.random() * 800);
const webPort = Number(process.env.E2E_WEB_PORT || process.env.PW_PORT || fallbackPort);
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
        url: baseURL,
        reuseExistingServer: false,
        timeout: 120 * 1000,
        env: {
            ...process.env,
            E2E_SERVER: process.env.E2E_SERVER || process.env.PW_SERVER || '1',
            E2E_WEB_PORT: String(webPort),
            PW_SERVER: '1',
            PW_PORT: String(webPort),
            AI_PROVIDER: 'mock',
            OPENAI_API_KEY: '',
            ANTHROPIC_API_KEY: '',
        },
    },
});
