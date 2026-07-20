import { PrismaClient } from '@prisma/client';
import { buildAuthToken } from '../services/auth.service.js';
import { cleanupUserInMemory, deleteUserCascade } from '../userCleanup.js';
import { logger } from '../config/logger.js';
import { createSessionStore } from '../services/session.service.js';
import { ensureBaziRecordTrashTable, ensureSoftDeleteTables } from '../services/schema.service.js';

const prisma = new PrismaClient();

// 复用运行时的建表逻辑，避免脚本自己手搓 DDL 又跟 provider（postgresql）对不上。
const ensureTrashTable = async () => {
  await ensureSoftDeleteTables({ prismaClient: prisma });
  await ensureBaziRecordTrashTable({ prismaClient: prisma, logger });
};

const buildTestUser = () => {
  const stamp = Date.now();
  return {
    email: `cleanup_${stamp}@example.com`,
    password: 'Passw0rd!',
    name: `Cleanup ${stamp}`,
  };
};

const assertCount = (label, count) => {
  if (count !== 0) {
    throw new Error(`${label} expected 0 but got ${count}`);
  }
};

try {
  await ensureTrashTable();
  const userPayload = buildTestUser();
  const user = await prisma.user.create({ data: userPayload });

  const baziRecord = await prisma.baziRecord.create({
    data: {
      userId: user.id,
      birthYear: 1990,
      birthMonth: 5,
      birthDay: 20,
      birthHour: 14,
      gender: 'female',
      birthLocation: `Cleanup_${Date.now()}`,
      timezone: 'UTC+8',
      pillars: JSON.stringify({ year: 'Jia-Zi' }),
      fiveElements: JSON.stringify({ Wood: 2, Fire: 1, Earth: 1, Metal: 0, Water: 1 }),
      tenGods: JSON.stringify({ dayMaster: 'Jia' }),
      luckCycles: JSON.stringify([{ startAge: 10, pillars: 'Yi-Chou' }]),
    },
  });

  await prisma.favorite.create({
    data: {
      userId: user.id,
      recordId: baziRecord.id,
    },
  });

  await prisma.tarotRecord.create({
    data: {
      userId: user.id,
      spreadType: 'CelticCross',
      cards: JSON.stringify([{ card: 'The Fool', position: 1 }]),
      userQuestion: 'Cleanup test',
      aiInterpretation: 'Test interpretation',
    },
  });

  await prisma.ichingRecord.create({
    data: {
      userId: user.id,
      method: 'time',
      numbers: '123',
      hexagram: 'Qian',
      resultingHexagram: 'Kun',
      changingLines: '2,5',
      timeContext: 'Cleanup test',
      userQuestion: 'Cleanup question',
      aiInterpretation: 'Cleanup interpretation',
    },
  });

  await prisma.userSettings.create({
    data: {
      userId: user.id,
      locale: 'en-US',
      preferences: JSON.stringify({ theme: 'light' }),
    },
  });

  await prisma.baziRecordTrash.upsert({
    where: { userId_recordId: { userId: user.id, recordId: baziRecord.id } },
    create: { userId: user.id, recordId: baziRecord.id },
    update: {},
  });

  const sessionStore = createSessionStore();
  const resetTokenStore = new Map();
  const resetTokenByUser = new Map();
  const deletedClientIndex = new Map();
  const clientRecordIndex = new Map();
  const sessionTokenSecret = 'cleanup-test-secret';
  const token = buildAuthToken({ userId: user.id, secret: sessionTokenSecret });
  if (!token) {
    throw new Error('Unable to create test session token');
  }
  sessionStore.set(token, Date.now());
  resetTokenStore.set('reset_token', { userId: user.id, expiresAt: Date.now() + 10000 });
  resetTokenByUser.set(user.id, 'reset_token');
  deletedClientIndex.set(user.id, new Map([['client-a', new Set([baziRecord.id])]]));
  clientRecordIndex.set(user.id, new Map([['client-a', new Set([baziRecord.id])]]));

  const cleanupUserMemory = (userId) => {
    cleanupUserInMemory(userId, {
      sessionStore,
      resetTokenStore,
      resetTokenByUser,
      deletedClientIndex,
      clientRecordIndex,
      sessionTokenSecret,
    });
  };

  await deleteUserCascade({ prisma, userId: user.id, cleanupUserMemory });

  const [usersCount, baziCount, favCount, tarotCount, ichingCount, settingsCount] =
    await Promise.all([
      prisma.user.count({ where: { id: user.id } }),
      prisma.baziRecord.count({ where: { userId: user.id } }),
      prisma.favorite.count({ where: { userId: user.id } }),
      prisma.tarotRecord.count({ where: { userId: user.id } }),
      prisma.ichingRecord.count({ where: { userId: user.id } }),
      prisma.userSettings.count({ where: { userId: user.id } }),
    ]);

  assertCount('user', usersCount);
  assertCount('baziRecord', baziCount);
  assertCount('favorite', favCount);
  assertCount('tarotRecord', tarotCount);
  assertCount('ichingRecord', ichingCount);
  assertCount('userSettings', settingsCount);

  const trashCount = await prisma.baziRecordTrash.count({ where: { userId: user.id } });
  assertCount('BaziRecordTrash', trashCount);

  if (sessionStore.has(token)) {
    throw new Error('Session token still present after cleanup');
  }
  if (resetTokenByUser.has(user.id)) {
    throw new Error('Reset token still linked to user after cleanup');
  }
  if (deletedClientIndex.has(user.id)) {
    throw new Error('Deleted client index still present after cleanup');
  }
  if (clientRecordIndex.has(user.id)) {
    throw new Error('Client record index still present after cleanup');
  }

  logger.info('User deletion cascade verified.');
} finally {
  await prisma.$disconnect();
}
