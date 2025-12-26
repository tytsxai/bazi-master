import { Prisma } from '@prisma/client';

import { initAppConfig } from '../config/app.js';
import { prisma, initPrismaConfig } from '../config/prisma.js';
import { hashPassword, isHashedPassword, verifyPassword } from '../passwords.js';

const { IS_PRODUCTION } = initAppConfig();
const { IS_SQLITE, IS_POSTGRES } = initPrismaConfig();

const ALLOW_RUNTIME_SCHEMA_SYNC =
  !IS_PRODUCTION && IS_SQLITE && process.env.ALLOW_RUNTIME_SCHEMA_SYNC !== 'false';
const SHOULD_SEED_DEFAULT_USER =
  process.env.NODE_ENV !== 'production' && process.env.SEED_DEFAULT_USER !== 'false';

const ensureSoftDeleteTables = async () => {
  if (IS_PRODUCTION || process.env.ALLOW_RUNTIME_SCHEMA_SYNC === 'false') return;

  if (IS_SQLITE) {
    await prisma.$executeRaw(Prisma.sql`
      CREATE TABLE IF NOT EXISTS BaziRecordTrash (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        recordId INTEGER NOT NULL,
        deletedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(userId, recordId)
      );
    `);
  } else if (IS_POSTGRES) {
    await prisma.$executeRaw(Prisma.sql`
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

const ensureBaziRecordTrashTable = async () => {
  if (IS_SQLITE) return;
  if (!IS_POSTGRES) return;
  try {
    await prisma.$executeRaw(Prisma.sql`
      CREATE TABLE IF NOT EXISTS "BaziRecordTrash" (
        "id" SERIAL NOT NULL,
        "userId" INTEGER NOT NULL,
        "recordId" INTEGER NOT NULL,
        "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "BaziRecordTrash_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRaw(Prisma.sql`
      CREATE UNIQUE INDEX IF NOT EXISTS "BaziRecordTrash_userId_recordId_key"
      ON "BaziRecordTrash" ("userId", "recordId");
    `);
  } catch (error) {
    console.error('Failed to ensure BaziRecordTrash table:', error);
    if (IS_PRODUCTION) {
      throw error;
    }
  }
};

const ensureSoftDeleteReady = (() => {
  let ready = null;
  return async () => {
    if (!ready) {
      ready = (async () => {
        await ensureSoftDeleteTables();
        await ensureBaziRecordTrashTable();
      })().catch((error) => {
        console.error('Failed to ensure soft delete tables:', error);
        throw error;
      });
    }
    return ready;
  };
})();

const ensureUserSettingsTable = async () => {
  if (!ALLOW_RUNTIME_SCHEMA_SYNC) return;
  try {
    if (IS_SQLITE) {
      await prisma.$executeRaw(Prisma.sql`
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
      await prisma.$executeRaw(Prisma.sql`
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
    console.error('Failed to ensure UserSettings table:', error);
  }
};

const ensureZiweiHistoryTable = async () => {
  if (!ALLOW_RUNTIME_SCHEMA_SYNC) return;
  try {
    if (IS_SQLITE) {
      await prisma.$executeRaw(Prisma.sql`
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
      await prisma.$executeRaw(Prisma.sql`
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
    console.error('Failed to ensure ZiweiRecord table:', error);
  }
};

const ensureBaziRecordUpdatedAt = async () => {
  if (!ALLOW_RUNTIME_SCHEMA_SYNC) return;
  try {
    let hasUpdatedAt = false;

    if (IS_SQLITE) {
      const columns = await prisma.$queryRaw(Prisma.sql`PRAGMA table_info(BaziRecord);`);
      hasUpdatedAt = Array.isArray(columns)
        && columns.some((column) => column?.name === 'updatedAt');
    } else if (IS_POSTGRES) {
      const result = await prisma.$queryRaw(Prisma.sql`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'BaziRecord' AND column_name = 'updatedAt'
      `);
      hasUpdatedAt = Array.isArray(result) && result.length > 0;
    }

    if (hasUpdatedAt) return;

    if (IS_SQLITE) {
      await prisma.$executeRaw(Prisma.sql`ALTER TABLE BaziRecord ADD COLUMN updatedAt DATETIME`);
    } else if (IS_POSTGRES) {
      await prisma.$executeRaw(Prisma.sql`ALTER TABLE "BaziRecord" ADD COLUMN "updatedAt" TIMESTAMP(3)`);
    }
    await prisma.$executeRaw(Prisma.sql`UPDATE BaziRecord SET updatedAt = createdAt WHERE updatedAt IS NULL`);
  } catch (error) {
    console.error('Failed to ensure BaziRecord updatedAt column:', error);
  }
};

const ensureDefaultUser = async () => {
  if (!SHOULD_SEED_DEFAULT_USER) return;
  const email = process.env.SEED_USER_EMAIL;
  const password = process.env.SEED_USER_PASSWORD;
  const name = process.env.SEED_USER_NAME || 'Test User';
  if (!email || !password) {
    console.warn('Skipping default user seed: SEED_USER_EMAIL/SEED_USER_PASSWORD not set.');
    return;
  }
  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (!existing) {
      const hashed = await hashPassword(password);
      if (!hashed) return;
      await prisma.user.create({ data: { email, password: hashed, name } });
      return;
    }
    const passwordMatches = await verifyPassword(password, existing.password);
    if (!passwordMatches || existing.name !== name || !isHashedPassword(existing.password)) {
      const hashed = await hashPassword(password);
      if (!hashed) return;
      await prisma.user.update({ where: { email }, data: { password: hashed, name } });
    }
  } catch (error) {
    console.error('Failed to ensure default user:', error);
  }
};

export {
  ensureSoftDeleteTables,
  ensureBaziRecordTrashTable,
  ensureSoftDeleteReady,
  ensureUserSettingsTable,
  ensureZiweiHistoryTable,
  ensureBaziRecordUpdatedAt,
  ensureDefaultUser,
};
