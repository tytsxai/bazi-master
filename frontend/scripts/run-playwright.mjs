import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
    if (await isPortFree(candidate)) return candidate;
  }
  return 3000;
};

if (!process.env.E2E_WEB_PORT) {
  process.env.E2E_WEB_PORT = String(await pickPort());
}
if (!process.env.E2E_SERVER) {
  process.env.E2E_SERVER = '1';
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
