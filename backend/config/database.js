import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

export const readPrismaDatasourceInfo = () => {
  // Determine provider from DATABASE_URL environment variable
  const databaseUrl = process.env.DATABASE_URL || '';

  let provider = 'postgresql'; // Default to PostgreSQL for production
  let urlUsesDatabaseUrlEnv = true;

  if (databaseUrl.startsWith('file:') || databaseUrl.includes('sqlite')) {
    provider = 'sqlite';
  } else if (databaseUrl.startsWith('postgresql://') || databaseUrl.startsWith('postgres://')) {
    provider = 'postgresql';
  }

  // Fallback: try to read from schema file if DATABASE_URL is not set
  if (!databaseUrl) {
    try {
      const here = path.dirname(fileURLToPath(import.meta.url));
      const schemaPath = path.resolve(here, '..', '..', 'prisma', 'schema.prisma');
      const raw = fs.readFileSync(schemaPath, 'utf8');
      const datasourceMatch = raw.match(/datasource\s+db\s*{([\s\S]*?)}/m);
      const block = datasourceMatch?.[1] ?? '';
      provider = (block.match(/\bprovider\s*=\s*"([^"]+)"/)?.[1] ?? '')
        .trim()
        .toLowerCase();
      const urlExpr = (block.match(/\burl\s*=\s*([^\n\r]+)/)?.[1] ?? '').trim();
      urlUsesDatabaseUrlEnv = /env\(\s*"DATABASE_URL"\s*\)/.test(urlExpr);
    } catch {
      // Ignore errors, use default
    }
  }

  return { provider, urlUsesDatabaseUrlEnv };
};

export const ensureDatabaseUrl = () => {
  if (process.env.DATABASE_URL) return;
  const nodeEnv = process.env.NODE_ENV || '';
  if (nodeEnv === 'production') return;

  const { provider } = readPrismaDatasourceInfo();
  if (provider === 'sqlite') {
    try {
      const here = path.dirname(fileURLToPath(import.meta.url));
      const sqlitePath = path.resolve(here, '..', '..', 'prisma', 'dev.db');
      process.env.DATABASE_URL = `file:${sqlitePath}`;
    } catch {
      process.env.DATABASE_URL = 'file:./dev.db';
    }
    return;
  }

  // Default local Postgres for development/test when schema provider is postgresql.
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/bazi_master?schema=public';
};
