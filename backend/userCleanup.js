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

  // BaziRecordTrash has no foreign key to User, so nothing cleans it up implicitly.
  // It used to be deleted after the transaction committed, with failures swallowed by a
  // warning — meaning a deleted user could leave rows behind permanently. It belongs in
  // the same transaction: either the account and all its traces go, or nothing does.
  const operations = [
    prisma.favorite.deleteMany({ where: { userId } }),
    prisma.tarotRecord.deleteMany({ where: { userId } }),
    prisma.ichingRecord.deleteMany({ where: { userId } }),
    prisma.ziweiRecord.deleteMany({ where: { userId } }),
    prisma.baziRecord.deleteMany({ where: { userId } }),
    prisma.userSettings.deleteMany({ where: { userId } }),
  ];

  if (prisma.baziRecordTrash) {
    operations.push(prisma.baziRecordTrash.deleteMany({ where: { userId } }));
  } else {
    // Fallback for a client generated without the model. Identifiers must be quoted or
    // PostgreSQL folds them to lower case and the statement fails.
    operations.push(prisma.$executeRaw`DELETE FROM "BaziRecordTrash" WHERE "userId" = ${userId}`);
  }

  operations.push(prisma.user.delete({ where: { id: userId } }));

  await prisma.$transaction(operations);

  if (typeof cleanupUserMemory === 'function') {
    await cleanupUserMemory(userId);
  }
};
