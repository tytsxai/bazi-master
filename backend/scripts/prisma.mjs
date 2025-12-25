import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(here, '..');
const repoRoot = path.resolve(backendDir, '..');

const args = process.argv.slice(2);

const resolveSchemaPath = () => {
  const schemaArg = args.find((arg) => typeof arg === 'string' && arg.startsWith('--schema='));
  if (schemaArg) {
    const raw = schemaArg.slice('--schema='.length);
    return path.resolve(backendDir, raw);
  }
  const flagIndex = args.findIndex((arg) => arg === '--schema');
  if (flagIndex >= 0 && typeof args[flagIndex + 1] === 'string') {
    return path.resolve(backendDir, args[flagIndex + 1]);
  }
  return path.resolve(repoRoot, 'prisma', 'schema.prisma');
};

const readPrismaProvider = (schemaPath) => {
  try {
    const raw = fs.readFileSync(schemaPath, 'utf8');
    const datasourceMatch = raw.match(/datasource\s+db\s*{([\s\S]*?)\n}\s*/m);
    const block = datasourceMatch?.[1] ?? '';
    return (block.match(/\bprovider\s*=\s*"([^"]+)"/)?.[1] ?? '').trim().toLowerCase();
  } catch {
    return '';
  }
};

const PRISMA_SCHEMA_PATH = resolveSchemaPath();
const PRISMA_PROVIDER = readPrismaProvider(PRISMA_SCHEMA_PATH);

if (!process.env.DATABASE_URL && (process.env.NODE_ENV || '') !== 'production') {
  if (!PRISMA_PROVIDER || PRISMA_PROVIDER === 'sqlite') {
    const sqlitePath = path.join(repoRoot, 'prisma', 'dev.db');
    process.env.DATABASE_URL = `file:${sqlitePath}`;
  } else if (PRISMA_PROVIDER === 'postgresql') {
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/bazi_master?schema=public';
  }
}
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
