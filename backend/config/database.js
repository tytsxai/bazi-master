import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

export const readPrismaDatasourceInfo = () => {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const schemaPath = path.resolve(here, '..', '..', 'prisma', 'schema.prisma');
    const raw = fs.readFileSync(schemaPath, 'utf8');
    const datasourceMatch = raw.match(/datasource\s+db\s*{([\s\S]*?)}/m);
    const block = datasourceMatch?.[1] ?? '';
    const provider = (block.match(/\bprovider\s*=\s*"([^"]+)"/)?.[1] ?? '')
      .trim()
      .toLowerCase();
    const urlExpr = (block.match(/\burl\s*=\s*([^\n\r]+)/)?.[1] ?? '').trim();
    const urlUsesDatabaseUrlEnv = /env\(\s*"DATABASE_URL"\s*\)/.test(urlExpr);
    return { provider, urlUsesDatabaseUrlEnv };
  } catch {
    return { provider: '', urlUsesDatabaseUrlEnv: false };
  }
};

export const ensureDatabaseUrl = () => {
  if (process.env.DATABASE_URL) return;
  const nodeEnv = process.env.NODE_ENV || '';
  if (nodeEnv === 'production') return;

  // Force SQLite for development
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const sqlitePath = path.resolve(here, '..', '..', 'prisma', 'dev.db');
    process.env.DATABASE_URL = `file:${sqlitePath}`;
  } catch {
    process.env.DATABASE_URL = 'file:./dev.db';
  }
};
