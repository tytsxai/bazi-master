import { Prisma } from '@prisma/client';

import { initAppConfig } from '../config/app.js';
import { prisma, initPrismaConfig } from '../config/prisma.js';
import { hashPassword, isHashedPassword, verifyPassword } from '../utils/passwords.js';

const resolveSchemaFlags = ({
  env = process.env,
  appConfig = initAppConfig(),
  prismaConfig = initPrismaConfig(),
} = {}) => {
  const IS_PRODUCTION = Boolean(appConfig?.IS_PRODUCTION);
  const IS_SQLITE = Boolean(prismaConfig?.IS_SQLITE);
  const IS_POSTGRES = Boolean(prismaConfig?.IS_POSTGRES);

  const ALLOW_RUNTIME_SCHEMA_SYNC =
    !IS_PRODUCTION && (IS_SQLITE || IS_POSTGRES) && env.ALLOW_RUNTIME_SCHEMA_SYNC !== 'false';
  const SHOULD_SEED_DEFAULT_USER =
    env.NODE_ENV !== 'production' && env.SEED_DEFAULT_USER !== 'false';

  return {
    IS_PRODUCTION,
    IS_SQLITE,
    IS_POSTGRES,
    ALLOW_RUNTIME_SCHEMA_SYNC,
    SHOULD_SEED_DEFAULT_USER,
  };
};

const ensureSoftDeleteTables = async ({
  prismaClient = prisma,
  env = process.env,
  appConfig,
  prismaConfig,
} = {}) => {
  const { IS_PRODUCTION, IS_SQLITE, IS_POSTGRES } = resolveSchemaFlags({ env, appConfig, prismaConfig });
  if (IS_PRODUCTION || env.ALLOW_RUNTIME_SCHEMA_SYNC === 'false') return;

  if (IS_SQLITE) {
    await prismaClient.$executeRaw(Prisma.sql`
      CREATE TABLE IF NOT EXISTS BaziRecordTrash (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        recordId INTEGER NOT NULL,
        deletedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(userId, recordId)
      );
    `);
  } else if (IS_POSTGRES) {
    await prismaClient.$executeRaw(Prisma.sql`
      CREATE TABLE IF NOT EXISTS "BaziRecordTrash" (
        "id" SERIAL NOT NULL,
        "userId" INTEGER NOT NULL,
        "recordId" INTEGER NOT NULL,
        "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "BaziRecordTrash_pkey" PRIMARY KEY ("id")
      );
    `);
  }
};

const ensureBaziRecordTrashTable = async ({
  prismaClient = prisma,
  env = process.env,
  appConfig,
  prismaConfig,
  logger = console,
} = {}) => {
  const { IS_PRODUCTION, IS_SQLITE, IS_POSTGRES } = resolveSchemaFlags({ env, appConfig, prismaConfig });
  if (IS_SQLITE) return;
  if (!IS_POSTGRES) return;
  try {
    await prismaClient.$executeRaw(Prisma.sql`
      CREATE TABLE IF NOT EXISTS "BaziRecordTrash" (
        "id" SERIAL NOT NULL,
        "userId" INTEGER NOT NULL,
        "recordId" INTEGER NOT NULL,
        "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "BaziRecordTrash_pkey" PRIMARY KEY ("id")
      );
    `);
    await prismaClient.$executeRaw(Prisma.sql`
      CREATE UNIQUE INDEX IF NOT EXISTS "BaziRecordTrash_userId_recordId_key"
      ON "BaziRecordTrash" ("userId", "recordId");
    `);
  } catch (error) {
    logger.error('Failed to ensure BaziRecordTrash table:', error);
    if (IS_PRODUCTION) {
      throw error;
    }
  }
};

const createEnsureSoftDeleteReady = (deps = {}) => {
  let ready = null;
  return () => {
    if (!ready) {
      ready = (async () => {
        await ensureSoftDeleteTables(deps);
        await ensureBaziRecordTrashTable(deps);
      })().catch((error) => {
        (deps.logger || console).error('Failed to ensure soft delete tables:', error);
        throw error;
      });
    }
    return ready;
  };
};

const ensureSoftDeleteReady = createEnsureSoftDeleteReady();

const ensureUserSettingsTable = async ({
  prismaClient = prisma,
  env = process.env,
  appConfig,
  prismaConfig,
  logger = console,
} = {}) => {
  const { ALLOW_RUNTIME_SCHEMA_SYNC, IS_SQLITE, IS_POSTGRES } = resolveSchemaFlags({ env, appConfig, prismaConfig });
  if (!ALLOW_RUNTIME_SCHEMA_SYNC) return;
  try {
    if (IS_SQLITE) {
      await prismaClient.$executeRaw(Prisma.sql`
        CREATE TABLE IF NOT EXISTS UserSettings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          userId INTEGER NOT NULL UNIQUE,
          locale TEXT,
          preferences TEXT,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
    } else if (IS_POSTGRES) {
      await prismaClient.$executeRaw(Prisma.sql`
        CREATE TABLE IF NOT EXISTS "UserSettings" (
          "id" SERIAL NOT NULL,
          "userId" INTEGER NOT NULL UNIQUE,
          "locale" TEXT,
          "preferences" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }
  } catch (error) {
    logger.error('Failed to ensure UserSettings table:', error);
  }
};

const ensureZiweiHistoryTable = async ({
  prismaClient = prisma,
  env = process.env,
  appConfig,
  prismaConfig,
  logger = console,
} = {}) => {
  const { ALLOW_RUNTIME_SCHEMA_SYNC, IS_SQLITE, IS_POSTGRES } = resolveSchemaFlags({ env, appConfig, prismaConfig });
  if (!ALLOW_RUNTIME_SCHEMA_SYNC) return;
  try {
    if (IS_SQLITE) {
      await prismaClient.$executeRaw(Prisma.sql`
        CREATE TABLE IF NOT EXISTS ZiweiRecord (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          userId INTEGER NOT NULL,
          birthYear INTEGER NOT NULL,
          birthMonth INTEGER NOT NULL,
          birthDay INTEGER NOT NULL,
          birthHour INTEGER NOT NULL,
          gender TEXT NOT NULL,
          chart TEXT NOT NULL,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
    } else if (IS_POSTGRES) {
      await prismaClient.$executeRaw(Prisma.sql`
        CREATE TABLE IF NOT EXISTS "ZiweiRecord" (
          "id" SERIAL NOT NULL,
          "userId" INTEGER NOT NULL,
          "birthYear" INTEGER NOT NULL,
          "birthMonth" INTEGER NOT NULL,
          "birthDay" INTEGER NOT NULL,
          "birthHour" INTEGER NOT NULL,
          "gender" TEXT NOT NULL,
          "chart" TEXT NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }
  } catch (error) {
    logger.error('Failed to ensure ZiweiRecord table:', error);
  }
};

const ensureBaziRecordUpdatedAt = async ({
  prismaClient = prisma,
  env = process.env,
  appConfig,
  prismaConfig,
  logger = console,
} = {}) => {
  const { ALLOW_RUNTIME_SCHEMA_SYNC, IS_SQLITE, IS_POSTGRES } = resolveSchemaFlags({ env, appConfig, prismaConfig });
  if (!ALLOW_RUNTIME_SCHEMA_SYNC) return;
  try {
    let hasUpdatedAt = false;

    if (IS_SQLITE) {
      const columns = await prismaClient.$queryRaw(Prisma.sql`PRAGMA table_info(BaziRecord);`);
      hasUpdatedAt = Array.isArray(columns)
        && columns.some((column) => column?.name === 'updatedAt');
    } else if (IS_POSTGRES) {
      const result = await prismaClient.$queryRaw(Prisma.sql`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'BaziRecord' AND column_name = 'updatedAt'
      `);
      hasUpdatedAt = Array.isArray(result) && result.length > 0;
    }

    if (hasUpdatedAt) return;

    if (IS_SQLITE) {
      await prismaClient.$executeRaw(Prisma.sql`ALTER TABLE BaziRecord ADD COLUMN updatedAt DATETIME`);
    } else if (IS_POSTGRES) {
      await prismaClient.$executeRaw(Prisma.sql`ALTER TABLE "BaziRecord" ADD COLUMN "updatedAt" TIMESTAMP(3)`);
    }
    await prismaClient.$executeRaw(Prisma.sql`UPDATE BaziRecord SET updatedAt = createdAt WHERE updatedAt IS NULL`);
  } catch (error) {
    logger.error('Failed to ensure BaziRecord updatedAt column:', error);
  }
};

const ensureDefaultUser = async ({
  prismaClient = prisma,
  env = process.env,
  appConfig,
  prismaConfig,
  logger = console,
  hashPasswordFn = hashPassword,
  verifyPasswordFn = verifyPassword,
  isHashedPasswordFn = isHashedPassword,
} = {}) => {
  const { SHOULD_SEED_DEFAULT_USER } = resolveSchemaFlags({ env, appConfig, prismaConfig });
  if (!SHOULD_SEED_DEFAULT_USER) return;
  const email = env.SEED_USER_EMAIL;
  const password = env.SEED_USER_PASSWORD;
  const name = env.SEED_USER_NAME || 'Test User';
  if (!email || !password) {
    logger.warn('Skipping default user seed: SEED_USER_EMAIL/SEED_USER_PASSWORD not set.');
    return;
  }
  try {
    const existing = await prismaClient.user.findUnique({ where: { email } });
    if (!existing) {
      const hashed = await hashPasswordFn(password);
      if (!hashed) return;
      await prismaClient.user.create({ data: { email, password: hashed, name } });
      return;
    }
    const passwordMatches = await verifyPasswordFn(password, existing.password);
    if (!passwordMatches || existing.name !== name || !isHashedPasswordFn(existing.password)) {
      const hashed = await hashPasswordFn(password);
      if (!hashed) return;
      await prismaClient.user.update({ where: { email }, data: { password: hashed, name } });
    }
  } catch (error) {
    logger.error('Failed to ensure default user:', error);
  }
};

export {
  ensureSoftDeleteTables,
  ensureBaziRecordTrashTable,
  createEnsureSoftDeleteReady,
  ensureSoftDeleteReady,
  ensureUserSettingsTable,
  ensureZiweiHistoryTable,
  ensureBaziRecordUpdatedAt,
  ensureDefaultUser,
};
