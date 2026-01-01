import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    ...options,
  });
  if (result.error) throw result.error;
  if (typeof result.status === 'number' && result.status !== 0) {
    throw new Error(`${command} exited with code ${result.status}`);
  }
};

const runCapture = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
  if (result.error) throw result.error;
  return {
    status: result.status ?? 1,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  };
};

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

const waitForPort = async (port, host, timeoutMs = 15_000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await checkPort(port, host)) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
};

const ensureDataDirInitialized = (dataDir) => {
  const versionFile = path.join(dataDir, 'PG_VERSION');
  if (fs.existsSync(versionFile)) return;
  fs.mkdirSync(dataDir, { recursive: true });
  run('initdb', ['-D', dataDir, '--auth=trust']);
};

const ensureDatabaseExists = ({ host, port, dbName }) => {
  const createResult = runCapture('createdb', ['-h', host, '-p', String(port), dbName]);
  if (createResult.status === 0) return;

  const check = runCapture('psql', [
    '-h',
    host,
    '-p',
    String(port),
    '-d',
    'postgres',
    '-tAc',
    `SELECT 1 FROM pg_database WHERE datname='${dbName.replace(/'/g, "''")}'`,
  ]);
  if (check.status !== 0 || check.stdout !== '1') {
    throw new Error(`Unable to create or detect database ${dbName}`);
  }
};

export const ensureLocalPostgres = async ({
  dataDir,
  host = '127.0.0.1',
  port = 5433,
  dbName = 'bazi_master',
  logFile,
} = {}) => {
  if (!dataDir) {
    throw new Error('ensureLocalPostgres requires a dataDir');
  }

  ensureDataDirInitialized(dataDir);

  const alreadyRunning = await checkPort(port, host);
  if (!alreadyRunning) {
    const resolvedLogFile = logFile || path.join(dataDir, 'postgres.log');
    run('pg_ctl', ['-D', dataDir, '-o', `-p ${port} -h ${host}`, '-l', resolvedLogFile, 'start']);
    const ready = await waitForPort(port, host, 20_000);
    if (!ready) {
      throw new Error(`PostgreSQL did not start listening on ${host}:${port}`);
    }
  }

  ensureDatabaseExists({ host, port, dbName });

  const user = process.env.PGUSER || process.env.USER || 'postgres';
  const encodedUser = encodeURIComponent(user);
  const url = `postgresql://${encodedUser}@${host}:${port}/${dbName}?schema=public`;
  return { url, started: !alreadyRunning };
};

export const stopLocalPostgres = ({ dataDir, mode = 'fast' } = {}) => {
  if (!dataDir) return;
  try {
    run('pg_ctl', ['-D', dataDir, 'stop', '-m', mode]);
  } catch {
    // Ignore stop failures.
  }
};
