import { PrismaClient } from '@prisma/client';
import { readPrismaDatasourceInfo } from './database.js';

const PRISMA_DATASOURCE = readPrismaDatasourceInfo();
export const PRISMA_PROVIDER = PRISMA_DATASOURCE.provider;
export const PRISMA_URL_USES_DATABASE_URL_ENV = PRISMA_DATASOURCE.urlUsesDatabaseUrlEnv;

export const initPrismaConfig = () => {
  const IS_SQLITE = PRISMA_PROVIDER
    ? PRISMA_PROVIDER === 'sqlite'
    : (!process.env.DATABASE_URL || process.env.DATABASE_URL.startsWith('file:') || process.env.DATABASE_URL.includes('sqlite'));
  const IS_POSTGRES = PRISMA_PROVIDER
    ? PRISMA_PROVIDER === 'postgresql' || PRISMA_PROVIDER === 'postgres'
    : (process.env.DATABASE_URL && (process.env.DATABASE_URL.startsWith('postgresql://') || process.env.DATABASE_URL.startsWith('postgres://')));
  const STRIP_SEARCH_MODE = IS_SQLITE;

  return {
    IS_SQLITE,
    IS_POSTGRES,
    STRIP_SEARCH_MODE,
  };
};

export const prisma = new PrismaClient();
