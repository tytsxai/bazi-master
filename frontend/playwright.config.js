import { defineConfig, devices } from '@playwright/test';
import net from 'node:net';

const fallbackPort = 3100 + Math.floor(Math.random() * 800);
const resolvePort = (value) => {
    const parsed = Number(value);
    const port = Number.isFinite(parsed) ? Math.trunc(parsed) : NaN;
    return Number.isFinite(port) && port > 0 ? port : null;
};

const pickFreePort = async () =>
    new Promise((resolve, reject) => {
        const server = net.createServer();
        server.unref();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            server.close(() => {
                if (!address || typeof address === 'string') {
                    reject(new Error('Unable to allocate a free TCP port'));
                    return;
                }
                resolve(address.port);
            });
        });
    });

const noWebServer = process.env.PW_NO_WEB_SERVER === '1';
const webPort = resolvePort(process.env.E2E_WEB_PORT)
    ?? resolvePort(process.env.PW_PORT)
    ?? fallbackPort;
const baseURL = `http://127.0.0.1:${webPort}`;

const pickBackendPort = async () => {
    let port = await pickFreePort();
    while (port === webPort) {
        port = await pickFreePort();
    }
    return port;
};

const explicitBackendPort = resolvePort(process.env.E2E_API_PORT)
    ?? resolvePort(process.env.BACKEND_PORT);
const backendPort = explicitBackendPort ?? (noWebServer ? 4000 : await pickBackendPort());
const backendBaseUrl = process.env.PW_API_BASE || `http://127.0.0.1:${backendPort}`;

if (!process.env.PW_API_BASE) {
    process.env.PW_API_BASE = backendBaseUrl;
}
if (!noWebServer && backendPort === webPort) {
    throw new Error(`E2E API port ${backendPort} conflicts with web port ${webPort}.`);
}
if (!noWebServer) {
    process.env.E2E_API_PORT = process.env.E2E_API_PORT || String(backendPort);
    process.env.BACKEND_PORT = process.env.BACKEND_PORT || String(backendPort);
    process.env.PORT = process.env.PORT || String(backendPort);
}

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
    webServer: noWebServer ? undefined : {
        command: 'node scripts/dev-server.mjs',
        url: `${baseURL}/api/health`,
        reuseExistingServer: false,
        timeout: 120 * 1000,
        env: {
            ...process.env,
            NODE_ENV: 'development',
            E2E_SERVER: '1',
            E2E_WEB_PORT: String(webPort),
            E2E_API_PORT: String(backendPort),
            BACKEND_PORT: String(backendPort),
            PORT: String(backendPort),
            BIND_HOST: '127.0.0.1',
            AI_PROVIDER: 'mock',
            OPENAI_API_KEY: '',
            ANTHROPIC_API_KEY: '',
            REDIS_URL: process.env.REDIS_URL || '',
        },
    },
});
