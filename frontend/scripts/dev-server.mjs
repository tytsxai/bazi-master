import { execSync, spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');
const backendDir = path.join(rootDir, 'backend');
const frontendDir = path.join(rootDir, 'frontend');

const frontendPort = Number(process.env.PW_PORT || 3000);
process.env.PORT = process.env.PORT || '4000';

const isWindows = process.platform === 'win32';
const nodeCmd = isWindows ? 'node.exe' : 'node';

const checkPort = (port, host = '127.0.0.1') =>
  new Promise((resolve) => {
    const socket = new net.Socket();
    const finalize = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(500);
    socket.once('error', () => finalize(false));
    socket.once('timeout', () => finalize(false));
    socket.connect(port, host, () => finalize(true));
  });

const forceRestart = process.env.PW_SERVER === '1';

const checkBackendHealth = async () => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1000);
  try {
    const res = await fetch('http://127.0.0.1:4000/health', { signal: controller.signal });
    if (!res.ok) return false;
    const data = await res.json().catch(() => null);
    return data?.status === 'ok';
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
};

const waitForBackendHealth = async (timeoutMs = 30_000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const healthy = await checkBackendHealth();
    if (healthy) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
};

const killPort = (port) => {
  if (isWindows) return false;
  try {
    const output = execSync(`lsof -tiTCP:${port} -sTCP:LISTEN`, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    if (!output) return false;
    const pids = output.split(/\s+/).filter(Boolean);
    pids.forEach((pid) => {
      try {
        process.kill(Number(pid), 'SIGTERM');
      } catch {
        // Ignore kill failures.
      }
    });
    return pids.length > 0;
  } catch {
    return false;
  }
};

const run = (command, args, options) =>
  spawn(command, args, { stdio: 'inherit', ...options });

const waitForPort = async (port, timeoutMs = 15000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const available = await checkPort(port);
    if (available) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
};

const waitForPortClosed = async (port, timeoutMs = 5000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const available = await checkPort(port);
    if (!available) return true;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
};

const startBackendIfNeeded = async () => {
  const isRunning = await checkPort(4000);
  if (isRunning) {
    if (forceRestart) {
      if (killPort(4000)) {
        console.warn('[dev-server] Force-restarting backend on port 4000.');
      }
      const closed = await waitForPortClosed(4000);
      if (!closed) {
        console.error('[dev-server] Unable to stop existing backend on port 4000.');
        process.exit(1);
      }
    } else {
    const healthy = await checkBackendHealth();
    if (healthy) {
      console.log('[dev-server] Backend already running on port 4000.');
      return null;
    }
    const killed = killPort(4000);
      if (killed) {
        console.warn('[dev-server] Restarting unresponsive backend on port 4000.');
      } else {
        console.warn('[dev-server] Port 4000 in use; unable to terminate existing process.');
      }
    }
  }
  console.log('[dev-server] Starting backend server...');
  return run(nodeCmd, ['server.js'], { cwd: backendDir, env: process.env });
};

const startFrontend = async () => {
  const running = await checkPort(frontendPort);
  if (running) {
    if (forceRestart) {
      if (killPort(frontendPort)) {
        console.warn(`[dev-server] Force-restarting frontend on port ${frontendPort}.`);
      }
      const closed = await waitForPortClosed(frontendPort);
      if (!closed) {
        console.error(`[dev-server] Unable to stop existing frontend on port ${frontendPort}.`);
        process.exit(1);
      }
    } else {
      console.log(`[dev-server] Frontend already running on port ${frontendPort}.`);
      return null;
    }
  }
  const viteCmd = path.join(
    frontendDir,
    'node_modules',
    '.bin',
    isWindows ? 'vite.cmd' : 'vite'
  );
  console.log('[dev-server] Starting frontend dev server...');
  return run(
    viteCmd,
    ['--port', String(frontendPort), '--strictPort', '--host', '127.0.0.1'],
    { cwd: frontendDir, env: process.env }
  );
};

let backendProcess = null;
let frontendProcess = null;
let keepAliveTimer = null;
let shuttingDown = false;

const shutdown = () => {
  if (shuttingDown) return;
  shuttingDown = true;
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
  if (frontendProcess) frontendProcess.kill('SIGTERM');
  if (backendProcess) backendProcess.kill('SIGTERM');
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('exit', shutdown);

if (forceRestart && process.env.PW_SKIP_RESET !== '1') {
  const backendRunning = await checkPort(4000);
  if (backendRunning) {
    if (killPort(4000)) {
      console.warn('[dev-server] Stopping existing backend before resetting E2E database.');
    }
    const closed = await waitForPortClosed(4000, 10_000);
    if (!closed) {
      console.error('[dev-server] Unable to stop existing backend on port 4000 before DB reset.');
      process.exit(1);
    }
  }

  const e2eDbPath = path.join(rootDir, 'prisma', 'e2e.db');
  process.env.DATABASE_URL = `file:${e2eDbPath}`;
  console.log(`[dev-server] Resetting E2E SQLite database at ${e2eDbPath}`);
  try {
    fs.rmSync(e2eDbPath, { force: true });
    fs.rmSync(`${e2eDbPath}-wal`, { force: true });
    fs.rmSync(`${e2eDbPath}-shm`, { force: true });
    execSync(
      `${nodeCmd} scripts/prisma.mjs db push --force-reset --schema=../prisma/schema.prisma`,
      { cwd: backendDir, stdio: 'inherit', env: process.env }
    );
  } catch {
    console.error('[dev-server] Failed to reset E2E database.');
    process.exit(1);
  }
}

backendProcess = await startBackendIfNeeded();
const backendListening = await waitForPort(4000, 20_000);
if (!backendListening) {
  console.error('[dev-server] Backend did not start listening on port 4000 in time.');
  shutdown();
  process.exit(1);
}
const backendHealthy = await waitForBackendHealth(30_000);
if (!backendHealthy) {
  console.error('[dev-server] Backend /health did not become ready in time.');
  shutdown();
  process.exit(1);
}

frontendProcess = await startFrontend();
const frontendListening = await waitForPort(frontendPort, 30_000);
if (!frontendListening) {
  console.error(`[dev-server] Frontend did not start listening on port ${frontendPort} in time.`);
  shutdown();
  process.exit(1);
}

if (!frontendProcess && !backendProcess) {
  // Keep the process alive when reusing already-running services.
  keepAliveTimer = setInterval(() => {}, 1000);
}

if (backendProcess) {
  backendProcess.on('exit', (code, signal) => {
    if (code && code !== 0) {
      console.error(`[dev-server] Backend exited with code ${code} (${signal || 'signal'})`);
    }
  });
}

if (frontendProcess) {
  frontendProcess.on('exit', (code) => {
    if (code && code !== 0) {
      console.error(`[dev-server] Frontend exited with code ${code}`);
    }
    shutdown();
    process.exit(code ?? 0);
  });
}
