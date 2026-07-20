import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ensureLocalPostgres, stopLocalPostgres } from './local-postgres.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(here, '..');
const repoRoot = path.resolve(backendDir, '..');
const schemaPath = path.resolve(repoRoot, 'prisma', 'schema.prisma');
const dataDir = path.resolve(repoRoot, '.tmp', 'pg-test', 'data');
const logFile = path.resolve(repoRoot, '.tmp', 'pg-test', 'postgres.log');

const spawnCommand = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      ...options,
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => resolve({ code: code ?? 1, signal }));
  });

const testArgs = process.argv.slice(2);
const nodeCmd = process.execPath;
const testEnv = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV || 'test',
  SESSION_TOKEN_SECRET: process.env.SESSION_TOKEN_SECRET || 'test-session-secret-for-auth-me-test',
  ADMIN_EMAILS: process.env.ADMIN_EMAILS || 'test@example.com',
};

let postgresStartedByScript = false;
let shouldResetDatabase = false;
let exitCode = 0;
let exitSignal = null;

try {
  if (!testEnv.DATABASE_URL) {
    // 端口和库名都必须避开开发栈（5433 / bazi_master）。下面紧接着就是
    // `migrate reset --force`：只要这两个默认值指向开发库，开发栈开着的时候
    // ensureLocalPostgres 会复用那个实例、认领那个同名库，然后把它清空。
    // 库名是最后一道闸——端口万一被显式改回 5433，不同名也不会误伤。
    const result = await ensureLocalPostgres({
      dataDir,
      host: '127.0.0.1',
      port: Number(process.env.PG_TEST_PORT || 5435),
      dbName: process.env.PG_TEST_DB || 'bazi_master_test',
      logFile,
    });
    testEnv.DATABASE_URL = result.url;
    postgresStartedByScript = result.started;
    shouldResetDatabase = true;
  }

  const prismaArgs = shouldResetDatabase
    ? ['scripts/prisma.mjs', 'migrate', 'reset', '--force', '--skip-seed', `--schema=${schemaPath}`]
    : ['scripts/prisma.mjs', 'migrate', 'deploy', `--schema=${schemaPath}`];

  const prismaResult = await spawnCommand(nodeCmd, prismaArgs, {
    cwd: backendDir,
    env: testEnv,
  });
  exitSignal = prismaResult.signal;
  if (prismaResult.code !== 0) {
    exitCode = prismaResult.code;
  } else {
    const testResult = await spawnCommand(nodeCmd, testArgs, {
      cwd: backendDir,
      env: testEnv,
    });
    exitSignal = testResult.signal;
    exitCode = testResult.code;
  }
} finally {
  if (postgresStartedByScript && process.env.PG_TEST_KEEP_RUNNING !== '1') {
    stopLocalPostgres({ dataDir });
  }
}

if (exitSignal) {
  process.kill(process.pid, exitSignal);
}
process.exit(exitCode);
