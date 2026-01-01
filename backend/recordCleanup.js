import { logger } from './config/logger.js';

export const deleteBaziRecordHard = async ({ prisma, userId, recordId } = {}) => {
  if (!prisma || !userId || !recordId) {
    throw new Error('Missing prisma, userId, or recordId for deleteBaziRecordHard');
  }

  const [favoriteResult, recordResult] = await prisma.$transaction([
    prisma.favorite.deleteMany({ where: { userId, recordId } }),
    prisma.baziRecord.deleteMany({ where: { id: recordId, userId } }),
  ]);

  try {
    await prisma.$executeRaw`
      DELETE FROM BaziRecordTrash WHERE userId = ${userId} AND recordId = ${recordId}
    `;
  } catch (error) {
    logger.warn({ err: error }, 'Failed to clear BaziRecordTrash for hard delete');
  }

  return {
    deletedCount: recordResult?.count ?? 0,
    favoriteCount: favoriteResult?.count ?? 0,
  };
};
