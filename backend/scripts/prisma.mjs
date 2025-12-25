import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(here, '..');
const repoRoot = path.resolve(backendDir, '..');

if (!process.env.DATABASE_URL && (process.env.NODE_ENV || '') !== 'production') {
  const sqlitePath = path.join(repoRoot, 'prisma', 'dev.db');
  process.env.DATABASE_URL = `file:${sqlitePath}`;
}

const args = process.argv.slice(2);
const binName = process.platform === 'win32' ? 'prisma.cmd' : 'prisma';
const prismaBin = path.join(backendDir, 'node_modules', '.bin', binName);

const spawnPrisma = () => {
  if (fs.existsSync(prismaBin)) {
    return spawn(prismaBin, args, { stdio: 'inherit', env: process.env });
  }
  return spawn('npx', ['prisma', ...args], { stdio: 'inherit', env: process.env });
};

const child = spawnPrisma();
child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(typeof code === 'number' ? code : 1);
});
