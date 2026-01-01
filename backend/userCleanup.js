import { logger } from './config/logger.js';
import { parseAuthToken } from './services/auth.service.js';

const deleteUserResetTokens = (userId, resetTokenStore, resetTokenByUser) => {
  if (!resetTokenStore || !resetTokenByUser) return;
  const directToken = resetTokenByUser.get(userId);
  if (directToken) {
    resetTokenByUser.delete(userId);
    resetTokenStore.delete(directToken);
  }
  for (const [token, entry] of resetTokenStore.entries()) {
    if (entry?.userId === userId) {
      resetTokenStore.delete(token);
    }
  }
};

const deleteUserSessions = (userId, sessionStore, sessionTokenSecret) => {
  if (!sessionStore) return;
  if (sessionTokenSecret) {
    if (!sessionStore.keys) return;
    for (const token of sessionStore.keys()) {
      if (typeof token !== 'string') continue;
      const parsed = parseAuthToken(token, { secret: sessionTokenSecret });
      if (parsed?.userId === userId) {
        sessionStore.delete(token);
      }
    }
    return;
  }
  const prefix = `token_${userId}_`;
  if (typeof sessionStore.deleteByPrefix === 'function') {
    sessionStore.deleteByPrefix(prefix);
    return;
  }
  if (!sessionStore.keys) return;
  for (const token of sessionStore.keys()) {
    if (typeof token === 'string' && token.startsWith(prefix)) {
      sessionStore.delete(token);
    }
  }
};

export const cleanupUserInMemory = (
  userId,
  {
    sessionStore,
    resetTokenStore,
    resetTokenByUser,
    deletedClientIndex,
    clientRecordIndex,
    sessionTokenSecret,
  } = {}
) => {
  if (!userId) return;
  deleteUserResetTokens(userId, resetTokenStore, resetTokenByUser);
  deleteUserSessions(userId, sessionStore, sessionTokenSecret);
  deletedClientIndex?.delete?.(userId);
  clientRecordIndex?.delete?.(userId);
};

export const deleteUserCascade = async ({ prisma, userId, cleanupUserMemory = null } = {}) => {
  if (!prisma || !userId) {
    throw new Error('Missing prisma or userId for deleteUserCascade');
  }

  await prisma.$transaction([
    prisma.favorite.deleteMany({ where: { userId } }),
    prisma.tarotRecord.deleteMany({ where: { userId } }),
    prisma.ichingRecord.deleteMany({ where: { userId } }),
    prisma.ziweiRecord.deleteMany({ where: { userId } }),
    prisma.baziRecord.deleteMany({ where: { userId } }),
    prisma.userSettings.deleteMany({ where: { userId } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);

  try {
    // Attempt to delete from BaziRecordTrash using Prisma Client if available
    if (prisma.baziRecordTrash) {
      await prisma.baziRecordTrash.deleteMany({ where: { userId } });
    } else {
      // Fallback to raw SQL if the model is somehow missing from the client
      await prisma.$executeRaw`DELETE FROM BaziRecordTrash WHERE userId = ${userId}`;
    }
  } catch (error) {
    logger.warn('Failed to clear BaziRecordTrash for deleted user:', error?.message || error);
  }

  if (typeof cleanupUserMemory === 'function') {
    cleanupUserMemory(userId);
  }
};
