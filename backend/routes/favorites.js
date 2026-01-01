import express from 'express';
import { prisma } from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { parseIdParam } from '../utils/validation.js';

const router = express.Router();

const serializeRecord = (record) => {
  return {
    ...record,
    pillars: JSON.parse(record.pillars),
    fiveElements: JSON.parse(record.fiveElements),
    tenGods: record.tenGods ? JSON.parse(record.tenGods) : null,
    luckCycles: record.luckCycles ? JSON.parse(record.luckCycles) : null,
  };
};

router.post('/', requireAuth, async (req, res) => {
  const { recordId } = req.body;

  // Ensure recordId is an integer
  const rId = parseInt(recordId, 10);

  if (!rId || isNaN(rId)) return res.status(400).json({ error: 'Valid Record ID required' });

  try {
    // Verify the record exists and belongs to the current user
    const record = await prisma.baziRecord.findFirst({
      where: { id: rId, userId: req.user.id },
    });

    if (!record) {
      return res.status(404).json({ error: 'Record not found' });
    }

    const favorite = await prisma.favorite.create({
      data: { userId: req.user.id, recordId: rId },
      include: { record: true },
    });
    res.json({
      favorite: {
        ...favorite,
        record: serializeRecord(favorite.record),
      },
    });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Already favorited' });
    }
    res.status(500).json({ error: 'Failed to create favorite' });
  }
});

router.get('/', requireAuth, async (req, res) => {
  try {
    const favorites = await prisma.favorite.findMany({
      where: { userId: req.user.id },
      include: { record: true },
      orderBy: { createdAt: 'desc' },
    });

    const serializedFavorites = favorites.map((f) => ({
      ...f,
      record: serializeRecord(f.record),
    }));
    res.json({
      favorites: serializedFavorites,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch favorites' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  const id = parseIdParam(req.params.id);

  if (!id) return res.status(400).json({ error: 'Invalid ID' });

  try {
    await prisma.favorite.delete({
      where: { id, userId: req.user.id },
    });

    res.json({ status: 'ok' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete favorite' });
  }
});

export default router;
