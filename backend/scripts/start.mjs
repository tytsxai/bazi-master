import { spawn } from 'node:child_process';

const normalizeBoolean = (value, fallback = true) => {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  return fallback;
};

const run = (command, args, { env = process.env } = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', env });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (signal) {
        return reject(new Error(`Process exited with signal ${signal}`));
      }
      if (code === 0) return resolve();
      return reject(new Error(`Process exited with code ${code}`));
    });
  });

const main = async () => {
  if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = 'production';
  }

  const runMigrations = normalizeBoolean(process.env.RUN_MIGRATIONS_ON_START, true);
  if (runMigrations) {
    await run('node', [
      'scripts/prisma.mjs',
      'migrate',
      'deploy',
      '--schema=../prisma/schema.prisma',
    ]);
  }

  await run('node', ['server.js']);
};

main().catch((error) => {
  console.error('[startup] Failed to start server:', error?.message || error);
  process.exit(1);
});
