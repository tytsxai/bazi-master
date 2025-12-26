import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureLocalPostgres, stopLocalPostgres } from '../../backend/scripts/local-postgres.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');
const backendDir = path.join(rootDir, 'backend');
const frontendDir = path.join(rootDir, 'frontend');
const prismaSourceSchemaPath = path.join(rootDir, 'prisma', 'schema.prisma');
const prismaGeneratedSchemaPath = path.join(rootDir, 'node_modules', '.prisma', 'client', 'schema.prisma');
const prismaSchemaCandidates = [
  prismaGeneratedSchemaPath,
  prismaSourceSchemaPath,
];

const readPrismaProvider = (schemaPath) => {
  try {
    if (!fs.existsSync(schemaPath)) return '';
    const raw = fs.readFileSync(schemaPath, 'utf8');
    const datasourceMatch = raw.match(/datasource\s+db\s*{([\s\S]*?)}/m);
    const block = datasourceMatch?.[1] ?? '';
    return (block.match(/\bprovider\s*=\s*"([^"]+)"/)?.[1] ?? '').trim().toLowerCase();
  } catch {
    return '';
  }
};

const resolvePrismaProvider = () => {
  for (const schemaPath of prismaSchemaCandidates) {
    const provider = readPrismaProvider(schemaPath);
    if (provider) return provider;
  }
  return '';
};

const prismaProvider = resolvePrismaProvider();
const sourceProvider = readPrismaProvider(prismaSourceSchemaPath);
const generatedProvider = readPrismaProvider(prismaGeneratedSchemaPath);
if (sourceProvider && generatedProvider && sourceProvider !== generatedProvider) {
  console.warn(
    `[dev-server] Prisma provider mismatch (generated=${generatedProvider}, source=${sourceProvider}); using generated client provider.`
  );
}
const isSqliteProvider = prismaProvider === 'sqlite';
const isPostgresProvider = prismaProvider === 'postgresql' || prismaProvider === 'postgres';

const ensureSqliteDatabaseUrl = () => {
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('file:')) return;
  const sqlitePath = path.join(rootDir, 'prisma', 'dev.db');
  process.env.DATABASE_URL = `file:${sqlitePath}`;
};

const resolvePort = (value) => {
  const parsed = Number(value);
  const port = Number.isFinite(parsed) ? Math.trunc(parsed) : NaN;
  if (!Number.isFinite(port) || port <= 0) return null;
  return port;
};

const frontendPort =
  resolvePort(process.env.E2E_WEB_PORT) ?? resolvePort(process.env.PW_PORT) ?? 3000;

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

const forceRestart = process.env.E2E_SERVER === '1' || process.env.PW_SERVER === '1';

const pickFreePort = async (host = '127.0.0.1') =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, host, () => {
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

const readExplicitBackendPort = () => {
  const raw = process.env.E2E_API_PORT || process.env.BACKEND_PORT;
  return resolvePort(raw);
};

const explicitBackendPort = readExplicitBackendPort();

const pickBackendPort = async () => {
  let port = await pickFreePort('127.0.0.1');
  while (port === frontendPort) {
    port = await pickFreePort('127.0.0.1');
  }
  return port;
};

const backendPort =
  explicitBackendPort ?? (forceRestart
    ? await pickBackendPort()
    : resolvePort(process.env.PORT) ?? 4000);

if (backendPort === frontendPort) {
  console.error(`[dev-server] Backend port ${backendPort} conflicts with frontend port ${frontendPort}.`);
  console.error('[dev-server] Set E2E_API_PORT or E2E_WEB_PORT to avoid the collision.');
  process.exit(1);
}

process.env.BACKEND_PORT = String(backendPort);
process.env.E2E_API_PORT = process.env.E2E_API_PORT || String(backendPort);
process.env.PORT = String(backendPort);
process.env.VITE_BACKEND_PORT = process.env.VITE_BACKEND_PORT || String(backendPort);
process.env.FRONTEND_URL = process.env.FRONTEND_URL || `http://127.0.0.1:${frontendPort}`;

process.env.AI_PROVIDER = process.env.AI_PROVIDER || 'mock';

console.log(`[dev-server] Using ports: frontend=${frontendPort}, backend=${backendPort}`);

const checkBackendHealth = async () => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1000);
  try {
    const res = await fetch(`http://127.0.0.1:${backendPort}/api/health`, { signal: controller.signal });
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

const readApiErrorMessage = async (response, fallback) => {
  try {
    const data = await response.json();
    if (data?.error) return String(data.error);
    if (data?.message) return String(data.message);
  } catch {
    // Ignore JSON parse failures.
  }
  return fallback;
};

const ensureE2EDefaultUser = async () => {
  if (!forceRestart) return;
  if (process.env.E2E_SKIP_SEED === '1' || process.env.PW_SKIP_SEED === '1') return;

  const email = process.env.E2E_DEFAULT_EMAIL || 'test@example.com';
  const password = process.env.E2E_DEFAULT_PASSWORD || 'password123';
  const name = process.env.E2E_DEFAULT_NAME || 'Test User';
  const baseUrl = `http://127.0.0.1:${backendPort}`;

  const tryLogin = async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) return false;
    const data = await res.json().catch(() => null);
    return Boolean(data?.token);
  };

  if (await tryLogin()) return;

  const registerRes = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name }),
  });

  if (!registerRes.ok && registerRes.status !== 409) {
    const message = await readApiErrorMessage(registerRes, 'Unable to seed E2E default user');
    throw new Error(`[dev-server] ${message}`);
  }

  if (!(await tryLogin())) {
    throw new Error('[dev-server] E2E default user seed succeeded but login still fails.');
  }
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

const waitForPortOnHost = async (port, host, timeoutMs = 20_000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const available = await checkPort(port, host);
    if (available) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
};

const startBackendIfNeeded = async () => {
  if (forceRestart) {
    if (killPort(backendPort)) {
      console.warn(`[dev-server] Force-restarting backend on port ${backendPort}.`);
    }
    const closed = await waitForPortClosed(backendPort, 10_000);
    if (!closed) {
      console.error(`[dev-server] Unable to stop existing backend on port ${backendPort}.`);
      process.exit(1);
    }
  } else {
    const isRunning = await checkPort(backendPort);
    if (isRunning) {
      const healthy = await checkBackendHealth();
      if (healthy) {
        console.log(`[dev-server] Backend already running on port ${backendPort}.`);
        return null;
      }
      const killed = killPort(backendPort);
      if (killed) {
        console.warn(`[dev-server] Restarting unresponsive backend on port ${backendPort}.`);
      } else {
        console.warn(`[dev-server] Port ${backendPort} in use; unable to terminate existing process.`);
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
let backendRestarting = false;
let frontendRestarting = false;
let postgresStartedByScript = false;
const postgresDataDir = path.join(rootDir, 'prisma', '.pgdata-e2e');

const wireBackendExitHandler = () => {
  if (!backendProcess) return;
  backendProcess.on('exit', (code, signal) => {
    if (shuttingDown) return;
    const codeLabel = typeof code === 'number' ? String(code) : 'null';
    const signalLabel = signal || 'null';
    console.error(`[dev-server] Backend exited (code=${codeLabel}, signal=${signalLabel})`);
    void restartBackend(`exit code=${codeLabel}, signal=${signalLabel}`);
  });
};

const restartBackend = async (reason) => {
  if (shuttingDown || backendRestarting) return;
  backendRestarting = true;
  try {
    console.warn(`[dev-server] Restarting backend (${reason})...`);
    let attempt = 0;
    while (!shuttingDown) {
      attempt += 1;
      if (attempt > 1) {
        const delayMs = Math.min(5000, 250 * 2 ** Math.min(5, attempt - 2));
        console.warn(`[dev-server] Backend restart attempt ${attempt} in ${delayMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      backendProcess = await startBackendIfNeeded();

      const backendListening = await waitForPort(backendPort, 30_000);
      if (!backendListening) {
        console.error(`[dev-server] Backend did not start listening on port ${backendPort} in time.`);
        continue;
      }

      const backendHealthy = await waitForBackendHealth(30_000);
      if (!backendHealthy) {
        console.error('[dev-server] Backend /api/health did not become ready in time.');
        continue;
      }

      wireBackendExitHandler();
      return;
    }
  } finally {
    backendRestarting = false;
  }
};

const wireFrontendExitHandler = () => {
  if (!frontendProcess) return;
  frontendProcess.on('exit', (code, signal) => {
    if (shuttingDown) return;
    const codeLabel = typeof code === 'number' ? String(code) : 'null';
    const signalLabel = signal || 'null';
    console.error(`[dev-server] Frontend exited (code=${codeLabel}, signal=${signalLabel})`);
    void restartFrontend(`exit code=${codeLabel}, signal=${signalLabel}`);
  });
};

const restartFrontend = async (reason) => {
  if (shuttingDown || frontendRestarting) return;
  frontendRestarting = true;
  try {
    console.warn(`[dev-server] Restarting frontend (${reason})...`);
    let attempt = 0;
    while (!shuttingDown) {
      attempt += 1;
      if (attempt > 1) {
        const delayMs = Math.min(5000, 250 * 2 ** Math.min(5, attempt - 2));
        console.warn(`[dev-server] Frontend restart attempt ${attempt} in ${delayMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      if (killPort(frontendPort)) {
        console.warn(`[dev-server] Force-restarting frontend on port ${frontendPort}.`);
      }
      const closed = await waitForPortClosed(frontendPort, 10_000);
      if (!closed) {
        console.error(`[dev-server] Unable to stop existing frontend on port ${frontendPort}.`);
        continue;
      }

      frontendProcess = await startFrontend();
      const frontendListening = await waitForPort(frontendPort, 30_000);
      if (!frontendListening) {
        console.error(`[dev-server] Frontend did not start listening on port ${frontendPort} in time.`);
        continue;
      }

      wireFrontendExitHandler();
      return;
    }
  } finally {
    frontendRestarting = false;
  }
};

const shutdown = () => {
  if (shuttingDown) return;
  shuttingDown = true;
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
  if (frontendProcess) frontendProcess.kill('SIGTERM');
  if (backendProcess) backendProcess.kill('SIGTERM');
  if (postgresStartedByScript) {
    stopLocalPostgres({ dataDir: postgresDataDir, mode: 'fast' });
  }
};

const shutdownAndExit = () => {
  shutdown();
  const timer = setTimeout(() => process.exit(0), 250);
  timer.unref?.();
};

process.on('SIGINT', shutdownAndExit);
process.on('SIGTERM', shutdownAndExit);
process.on('exit', shutdown);

if (
  forceRestart
  && process.env.E2E_SKIP_RESET !== '1'
  && process.env.PW_SKIP_RESET !== '1'
  && isPostgresProvider
) {
  const backendRunning = await checkPort(backendPort);
  if (backendRunning) {
    if (killPort(backendPort)) {
      console.warn('[dev-server] Stopping existing backend before resetting E2E database.');
    }
    const closed = await waitForPortClosed(backendPort, 10_000);
    if (!closed) {
      console.error(`[dev-server] Unable to stop existing backend on port ${backendPort} before DB reset.`);
      process.exit(1);
    }
  }

  const providedE2eDatabaseUrl = process.env.E2E_DATABASE_URL;
  let e2eDatabaseUrl = providedE2eDatabaseUrl;
  const pgPort = Number(process.env.PG_E2E_PORT || 5433);
  const pgDbName = process.env.PG_E2E_DB || 'bazi_master_e2e';
  if (!e2eDatabaseUrl) {
    const result = await ensureLocalPostgres({
      dataDir: postgresDataDir,
      port: pgPort,
      dbName: pgDbName,
    });
    postgresStartedByScript = result.started;
    e2eDatabaseUrl = result.url;
  }

  process.env.DATABASE_URL = e2eDatabaseUrl;

  if (providedE2eDatabaseUrl) {
    try {
      const url = new URL(providedE2eDatabaseUrl);
      const host = url.hostname || '127.0.0.1';
      const port = Number(url.port || 5432);
      const ready = await waitForPortOnHost(port, host, 20_000);
      if (!ready) {
        console.error(`[dev-server] E2E database not reachable at ${host}:${port}`);
        process.exit(1);
      }
    } catch {
      // Ignore URL parsing failures; Prisma will report a connection error.
    }
  } else {
    console.log(`[dev-server] Resetting E2E PostgreSQL database ${pgDbName} on 127.0.0.1:${pgPort}`);
  }
  console.log('[dev-server] Resetting E2E database via Prisma migrations...');
  try {
    const prismaEnv = { ...process.env, DATABASE_URL: e2eDatabaseUrl };
    execSync(
      `${nodeCmd} scripts/prisma.mjs migrate reset --force --schema=../prisma/schema.prisma`,
      { cwd: backendDir, stdio: 'inherit', env: prismaEnv }
    );
  } catch {
    console.error('[dev-server] Failed to reset E2E database.');
    process.exit(1);
  }
}

if (isSqliteProvider) {
  ensureSqliteDatabaseUrl();
  if (forceRestart && process.env.E2E_SKIP_RESET !== '1' && process.env.PW_SKIP_RESET !== '1') {
    console.log('[dev-server] SQLite provider detected; skipping Postgres reset.');
  }
}

backendProcess = await startBackendIfNeeded();
const backendListening = await waitForPort(backendPort, 60_000);
if (!backendListening) {
  console.error(`[dev-server] Backend did not start listening on port ${backendPort} in time.`);
  shutdown();
  process.exit(1);
}
const backendHealthy = await waitForBackendHealth(60_000);
if (!backendHealthy) {
  console.error('[dev-server] Backend /api/health did not become ready in time.');
  shutdown();
  process.exit(1);
}

try {
  await ensureE2EDefaultUser();
} catch (error) {
  console.error(error);
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

if (!keepAliveTimer) {
  keepAliveTimer = setInterval(() => {}, 1000);
}

if (backendProcess) {
  wireBackendExitHandler();
}

if (frontendProcess) {
  wireFrontendExitHandler();
}
