import { PrismaClient, Prisma } from '@prisma/client';
import { deleteBaziRecordHard } from '../recordCleanup.js';

const prisma = new PrismaClient();

const ensureTrashTable = async () => {
  await prisma.$executeRaw(Prisma.sql`
    CREATE TABLE IF NOT EXISTS BaziRecordTrash (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      recordId INTEGER NOT NULL,
      deletedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(userId, recordId)
    );
  `);
};

const buildTestUser = () => {
  const stamp = Date.now();
  return {
    email: `hard_delete_${stamp}@example.com`,
    password: 'Passw0rd!',
    name: `Hard Delete ${stamp}`,
  };
};

const assertZero = (label, count) => {
  if (count !== 0) {
    throw new Error(`${label} expected 0 but got ${count}`);
  }
};

let userId = null;

try {
  await ensureTrashTable();
  const user = await prisma.user.create({ data: buildTestUser() });
  userId = user.id;

  const record = await prisma.baziRecord.create({
    data: {
      userId: user.id,
      birthYear: 1991,
      birthMonth: 8,
      birthDay: 12,
      birthHour: 10,
      gender: 'female',
      birthLocation: `HARD_DELETE_${Date.now()}`,
      timezone: 'UTC+8',
      pillars: JSON.stringify({ year: 'Xin-Wei' }),
      fiveElements: JSON.stringify({ Wood: 1, Fire: 2, Earth: 1, Metal: 1, Water: 0 }),
      tenGods: JSON.stringify({ dayMaster: 'Xin' }),
      luckCycles: JSON.stringify([{ startAge: 8, pillars: 'Ren-Shen' }]),
    },
  });

  await prisma.favorite.create({
    data: {
      userId: user.id,
      recordId: record.id,
    },
  });

  await prisma.$executeRaw`
    INSERT OR IGNORE INTO BaziRecordTrash (userId, recordId)
    VALUES (${user.id}, ${record.id})
  `;

  const { deletedCount } = await deleteBaziRecordHard({
    prisma,
    userId: user.id,
    recordId: record.id,
  });

  if (deletedCount !== 1) {
    throw new Error(`Expected deletedCount 1 but got ${deletedCount}`);
  }

  const [recordCount, favoriteCount] = await Promise.all([
    prisma.baziRecord.count({ where: { id: record.id } }),
    prisma.favorite.count({ where: { recordId: record.id } }),
  ]);

  assertZero('baziRecord', recordCount);
  assertZero('favorite', favoriteCount);

  const trashRows = await prisma.$queryRaw`
    SELECT id FROM BaziRecordTrash WHERE userId = ${user.id} AND recordId = ${record.id}
  `;
  if (trashRows.length !== 0) {
    throw new Error(`BaziRecordTrash expected 0 but got ${trashRows.length}`);
  }

  console.log('Bazi hard delete verified.');
} finally {
  if (userId) {
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  }
  await prisma.$disconnect();
}
