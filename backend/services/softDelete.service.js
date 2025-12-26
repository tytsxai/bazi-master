import { Prisma } from '@prisma/client';

import { initAppConfig } from '../config/app.js';
import { prisma, initPrismaConfig } from '../config/prisma.js';

const { IS_PRODUCTION } = initAppConfig();
const { IS_SQLITE, IS_POSTGRES } = initPrismaConfig();

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

const fetchDeletedRecordIds = async (userId) => {
  await ensureSoftDeleteReady();
  const rows = await prisma.baziRecordTrash.findMany({
    where: { userId },
    select: { recordId: true },
  });
  return rows.map((row) => row.recordId);
};

const isRecordSoftDeleted = async (userId, recordId) => {
  try {
    await ensureSoftDeleteReady();
    const row = await prisma.baziRecordTrash.findUnique({
      where: {
        userId_recordId: {
          userId,
          recordId,
        },
      },
      select: { id: true },
    });
    return Boolean(row);
  } catch (error) {
    console.error('Soft delete check failed:', error);
    return false;
  }
};

const markRecordsSoftDeleted = async (userId, recordIds) => {
  const uniqueIds = Array.from(
    new Set((Array.isArray(recordIds) ? recordIds : []).filter((id) => Number.isInteger(id)))
  );
  if (!uniqueIds.length) return;

  await ensureSoftDeleteReady();

  const existing = await prisma.baziRecordTrash.findMany({
    where: {
      userId,
      recordId: { in: uniqueIds },
    },
    select: { recordId: true },
  });
  const existingSet = new Set(existing.map((row) => row.recordId));
  const missingIds = uniqueIds.filter((id) => !existingSet.has(id));
  if (!missingIds.length) return;

  await prisma.baziRecordTrash.createMany({
    data: missingIds.map((recordId) => ({ userId, recordId })),
  });
};

export {
  ensureSoftDeleteTables,
  ensureBaziRecordTrashTable,
  fetchDeletedRecordIds,
  isRecordSoftDeleted,
  markRecordsSoftDeleted,
};
