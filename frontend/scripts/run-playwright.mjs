import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const UNSAFE_BROWSER_PORTS = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102,
  103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 179, 389, 427, 465, 512,
  513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 993, 995, 2049, 3659,
  4045, 6000, 6665, 6666, 6667, 6668, 6669, 6697, 10080,
]);

const isSafeBrowserPort = (port) => !UNSAFE_BROWSER_PORTS.has(port);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isPortFree = (port) =>
  new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
  });

const pickPort = async () => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const candidate = 3000 + Math.floor(Math.random() * 800);
    if (!isSafeBrowserPort(candidate)) continue;
    if (await isPortFree(candidate)) return candidate;
  }
  return 3000;
};

if (process.env.E2E_WEB_PORT) {
  const explicitPort = Number(process.env.E2E_WEB_PORT);
  if (Number.isFinite(explicitPort) && !isSafeBrowserPort(explicitPort)) {
    console.error(
      `[playwright] E2E_WEB_PORT ${explicitPort} is blocked by Chromium as an unsafe port. Choose another port.`
    );
    process.exit(1);
  }
}

if (!process.env.E2E_WEB_PORT) {
  process.env.E2E_WEB_PORT = String(await pickPort());
}
if (!process.env.E2E_SERVER) {
  process.env.E2E_SERVER = '1';
}
if (!process.env.VITE_E2E) {
  process.env.VITE_E2E = '1';
}

const isWindows = process.platform === 'win32';
const playwrightBin = path.join(
  __dirname,
  '..',
  'node_modules',
  '.bin',
  isWindows ? 'playwright.cmd' : 'playwright'
);

const args = process.argv.slice(2);
const child = spawn(playwrightBin, ['test', ...args], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(typeof code === 'number' ? code : 1);
});
