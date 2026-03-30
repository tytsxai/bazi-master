import { logger } from '../config/logger.js';
import express from 'express';
import { prisma } from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { getBaziCalculation, hasFullBaziResult } from '../services/calculations.service.js';
import { buildBaziCacheKey, getCachedBaziCalculationAsync } from '../services/cache.service.js';
import { validateBaziInput, parseIdParam } from '../utils/validation.js';
import { parseRecordsQuery, buildCreatedAtRange } from '../utils/query.js';
import { buildSearchOr } from '../utils/search.js';
import { generateAIContent, resolveAiProvider, buildBaziPrompt } from '../services/ai.service.js';
import { createAiGuard } from '../lib/concurrency.js';
import { buildBirthTimeMeta } from '../utils/timezone.js';
import { resolveLocationCoordinates, computeTrueSolarTime } from '../services/solarTime.service.js';

const router = express.Router();
const aiGuard = createAiGuard();
const AI_CONCURRENCY_ERROR = 'AI request already in progress. Please wait.';

const serializeRecord = (record) => ({
  ...record,
  pillars: JSON.parse(record.pillars),
  fiveElements: JSON.parse(record.fiveElements),
  tenGods: record.tenGods ? JSON.parse(record.tenGods) : null,
  luckCycles: record.luckCycles ? JSON.parse(record.luckCycles) : null,
});

const buildRecordData = (payload, userId) => ({
  userId,
  birthYear: payload.birthYear,
  birthMonth: payload.birthMonth,
  birthDay: payload.birthDay,
  birthHour: payload.birthHour,
  gender: payload.gender,
  birthLocation: payload.birthLocation ?? null,
  timezone: payload.timezone ?? null,
});

const buildTimeMetaForPayload = (payload) => {
  const meta = buildBirthTimeMeta({
    birthYear: payload?.birthYear,
    birthMonth: payload?.birthMonth,
    birthDay: payload?.birthDay,
    birthHour: payload?.birthHour,
    birthMinute: payload?.birthMinute,
    timezone: payload?.timezone,
    timezoneOffsetMinutes: payload?.timezoneOffsetMinutes,
  });

  const location = resolveLocationCoordinates(payload?.birthLocation);
  const trueSolarCalc =
    location && Number.isFinite(meta?.timezoneOffsetMinutes)
      ? computeTrueSolarTime({
          birthYear: payload?.birthYear,
          birthMonth: payload?.birthMonth,
          birthDay: payload?.birthDay,
          birthHour: payload?.birthHour,
          birthMinute: payload?.birthMinute,
          timezoneOffsetMinutes: meta.timezoneOffsetMinutes,
          longitude: location.longitude,
        })
      : null;

  const trueSolarTime = trueSolarCalc
    ? {
        applied: true,
        correctionMinutes: trueSolarCalc.correctionMinutes,
        correctedIso: trueSolarCalc.correctedDate?.toISOString?.() || null,
        location: {
          name:
            location?.name ||
            (typeof payload?.birthLocation === 'string' ? payload.birthLocation.trim() : null),
          latitude: location.latitude,
          longitude: location.longitude,
        },
      }
    : null;

  return { ...meta, trueSolarTime };
};

const findOwnedRecord = (id, userId, prismaClient = prisma) =>
  prismaClient.baziRecord.findFirst({
    where: { id, userId },
  });

const resolveRecordsOrderBy = (sortOption) => {
  switch (sortOption) {
    case 'created-asc':
      return { createdAt: 'asc' };
    case 'birth-asc':
      return [
        { birthYear: 'asc' },
        { birthMonth: 'asc' },
        { birthDay: 'asc' },
        { birthHour: 'asc' },
        { createdAt: 'asc' },
      ];
    case 'birth-desc':
      return [
        { birthYear: 'desc' },
        { birthMonth: 'desc' },
        { birthDay: 'desc' },
        { birthHour: 'desc' },
        { createdAt: 'desc' },
      ];
    case 'created-desc':
    default:
      return { createdAt: 'desc' };
  }
};

const buildRecordsWhere = ({ query, userId, trashedIds }) => {
  const statusWhere = { userId };
  if (query.normalizedStatus === 'active') {
    statusWhere.id = { notIn: trashedIds };
  } else if (query.normalizedStatus === 'deleted') {
    statusWhere.id = { in: trashedIds };
  }

  const where = { ...statusWhere };

  if (query.validGender) {
    where.gender = query.validGender;
  }

  if (query.normalizedQuery) {
    where.OR = buildSearchOr(query.normalizedQuery);
  }

  const createdAtRange = buildCreatedAtRange({
    rangeType: query.rangeType,
    validRangeDays: query.validRangeDays,
    timezoneOffsetMinutes: query.timezoneOffsetMinutes,
  });
  if (createdAtRange) {
    where.createdAt = createdAtRange;
  }

  return { statusWhere, where };
};

router.post('/calculate', async (req, res) => {
  const validation = validateBaziInput(req.body);
  if (!validation.ok) {
    return res.status(400).json({
      error: validation.reason === 'whitespace' ? 'Whitespace-only input' : 'Invalid input',
    });
  }

  const timeMeta = buildTimeMetaForPayload(validation.payload);

  try {
    const cacheKey = buildBaziCacheKey(validation.payload);
    if (cacheKey) {
      const cached = await getCachedBaziCalculationAsync(cacheKey);
      if (cached && hasFullBaziResult(cached)) {
        res.set('x-bazi-cache', 'hit');
        return res.json({ ...cached, ...timeMeta });
      }
    }
    const result = await getBaziCalculation(validation.payload, { bypassCache: true });
    if (cacheKey) {
      res.set('x-bazi-cache', 'miss');
    }
    res.json({ ...result, ...timeMeta });
  } catch (error) {
    res.status(500).json({ error: 'Calculation error' });
  }
});

router.post('/ai-interpret', requireAuth, async (req, res) => {
  const { pillars, fiveElements, tenGods, strength } = req.body;
  if (!pillars) return res.status(400).json({ error: 'Bazi data required' });

  let provider = null;
  try {
    provider = resolveAiProvider(req.body?.provider);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Invalid AI provider.' });
  }

  const { system, user, fallback } = buildBaziPrompt({
    pillars,
    fiveElements,
    tenGods,
    luckCycles: req.body.luckCycles,
    strength,
  });

  const release = await aiGuard.acquire(req.user.id);
  if (!release) {
    return res.status(429).json({ error: AI_CONCURRENCY_ERROR });
  }
  try {
    const content = await generateAIContent({ system, user, fallback, provider });
    res.json({ content });
  } finally {
    release();
  }
});

router.post('/full-analysis', requireAuth, async (req, res) => {
  const validation = validateBaziInput(req.body);
  if (!validation.ok) {
    return res.status(400).json({
      error: validation.reason === 'whitespace' ? 'Whitespace-only input' : 'Invalid input',
    });
  }

  const timeMeta = buildTimeMetaForPayload(validation.payload);

  let provider = null;
  try {
    provider = resolveAiProvider(req.body?.provider);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Invalid AI provider.' });
  }

  try {
    const calculation = await getBaziCalculation(validation.payload);
    const enrichedCalculation = { ...calculation, ...timeMeta };
    const { system, user, fallback } = buildBaziPrompt({
      pillars: enrichedCalculation.pillars,
      fiveElements: enrichedCalculation.fiveElements,
      tenGods: enrichedCalculation.tenGods,
      luckCycles: enrichedCalculation.luckCycles,
    });

    const release = await aiGuard.acquire(req.user.id);
    if (!release) {
      return res.status(429).json({ error: AI_CONCURRENCY_ERROR });
    }

    try {
      const interpretation = await generateAIContent({ system, user, fallback, provider });
      res.json({
        ...enrichedCalculation,
        calculation: enrichedCalculation,
        interpretation,
      });
    } finally {
      release();
    }
  } catch (error) {
    logger.error('Full analysis failed:', error);
    res.status(500).json({ error: 'Analysis error' });
  }
});

// Records routes
router.get('/records', requireAuth, async (req, res) => {
  const query = parseRecordsQuery(req.query);
  const userId = req.user.id;

  try {
    // Determine trashed IDs to filter
    const trashed = await prisma.baziRecordTrash.findMany({
      where: { userId },
      select: { recordId: true },
    });
    const trashedIds = trashed.map((t) => t.recordId);

    const { statusWhere, where } = buildRecordsWhere({ query, userId, trashedIds });

    const records = await prisma.baziRecord.findMany({
      where,
      orderBy: resolveRecordsOrderBy(query.sortOption),
      skip: (query.safePage - 1) * query.safePageSize,
      take: query.safePageSize,
    });

    const [totalCount, filteredCount] = await Promise.all([
      prisma.baziRecord.count({ where: statusWhere }),
      prisma.baziRecord.count({ where }),
    ]);

    res.json({
      records: records.map(serializeRecord),
      totalCount,
      filteredCount,
      hasMore: query.safePage * query.safePageSize < filteredCount,
    });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ error: 'Failed to fetch records' });
  }
});

router.post('/records', requireAuth, async (req, res) => {
  const validation = validateBaziInput(req.body);
  if (!validation.ok) return res.status(400).json({ error: 'Invalid input' });

  try {
    const recentCutoff = new Date(Date.now() - 60 * 1000);
    const recentDuplicate = await prisma.baziRecord.findFirst({
      where: {
        ...buildRecordData(validation.payload, req.user.id),
        createdAt: { gte: recentCutoff },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (recentDuplicate) {
      const trashed = await prisma.baziRecordTrash.findUnique({
        where: {
          userId_recordId: {
            userId: req.user.id,
            recordId: recentDuplicate.id,
          },
        },
        select: { recordId: true },
      });
      if (!trashed) {
        res.json({ record: serializeRecord(recentDuplicate) });
        return;
      }
    }

    const calculation = await getBaziCalculation(validation.payload);
    const record = await prisma.baziRecord.create({
      data: {
        ...buildRecordData(validation.payload, req.user.id),
        pillars: JSON.stringify(calculation.pillars),
        fiveElements: JSON.stringify(calculation.fiveElements),
        tenGods: JSON.stringify(calculation.tenGods),
        luckCycles: JSON.stringify(calculation.luckCycles),
      },
    });
    res.json({ record: serializeRecord(record) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create record' });
  }
});

router.post('/records/import', requireAuth, async (req, res) => {
  const { records } = req.body;
  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ error: 'No records provided' });
  }

  let createdCount = 0;
  try {
    // Process in batch or transaction (serial for simplicity)
    // Note: Ideally use createMany but we need to calculate pillars for each if they are raw inputs.
    // Assuming import payload contains RAW inputs (birthYear etc).
    // If import contains FULL calculated data, we might trust it or recalc.
    // Safer to recalc.

    for (const input of records) {
      const validation = validateBaziInput(input);
      if (validation.ok) {
        const calculation = await getBaziCalculation(validation.payload);
        const record = await prisma.baziRecord.create({
          data: {
            ...buildRecordData(validation.payload, req.user.id),
            pillars: JSON.stringify(calculation.pillars),
            fiveElements: JSON.stringify(calculation.fiveElements),
            tenGods: JSON.stringify(calculation.tenGods),
            luckCycles: JSON.stringify(calculation.luckCycles),
          },
        });
        if (input?.softDeleted) {
          await prisma.baziRecordTrash.upsert({
            where: { userId_recordId: { userId: req.user.id, recordId: record.id } },
            create: { userId: req.user.id, recordId: record.id },
            update: {},
          });
        }
        createdCount++;
      }
    }
    res.json({ created: createdCount });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: 'Import failed' });
  }
});

router.get('/records/export', requireAuth, async (req, res) => {
  // Export logic: fetch all matching filters (ignoring page size usually, or large limit)
  const query = parseRecordsQuery(req.query);
  const userId = req.user.id;
  const includeDeletedStatus =
    req.query?.includeDeletedStatus === '1' || req.query?.includeDeletedStatus === 1;

  try {
    const trashed = await prisma.baziRecordTrash.findMany({
      where: { userId },
      select: { recordId: true },
    });
    const trashedIds = trashed.map((t) => t.recordId);
    const trashedIdSet = new Set(trashedIds);

    const { where } = buildRecordsWhere({ query, userId, trashedIds });

    const records = await prisma.baziRecord.findMany({
      where,
      orderBy: resolveRecordsOrderBy(query.sortOption),
    });

    const payload = records.map((record) => {
      const serialized = serializeRecord(record);
      if (!includeDeletedStatus) return serialized;
      return { ...serialized, softDeleted: trashedIdSet.has(record.id) };
    });

    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: 'Export failed' });
  }
});

router.post('/records/bulk-delete', requireAuth, async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'IDs array required' });

  try {
    const normalizedIds = Array.from(
      new Set(ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))
    );
    if (!normalizedIds.length) {
      return res.status(400).json({ error: 'Valid record IDs required' });
    }

    const ownedRecords = await prisma.baziRecord.findMany({
      where: { userId: req.user.id, id: { in: normalizedIds } },
      select: { id: true },
    });
    if (!ownedRecords.length) {
      return res.status(404).json({ error: 'Record not found' });
    }

    const operations = ownedRecords.map((record) =>
      prisma.baziRecordTrash.upsert({
        where: { userId_recordId: { userId: req.user.id, recordId: record.id } },
        create: { userId: req.user.id, recordId: record.id },
        update: {},
      })
    );
    await prisma.$transaction(operations);
    res.json({ status: 'ok', updated: ownedRecords.length });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: 'Bulk delete failed' });
  }
});

router.get('/records/:id', requireAuth, async (req, res) => {
  const id = parseIdParam(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid ID' });

  try {
    const record = await findOwnedRecord(id, req.user.id);
    if (!record) return res.status(404).json({ error: 'Record not found' });
    res.json({ record: serializeRecord(record) });
  } catch (error) {
    res.status(500).json({ error: 'Internal error' });
  }
});

router.put('/records/:id', requireAuth, async (req, res) => {
  const id = parseIdParam(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid ID' });

  const validation = validateBaziInput(req.body);
  if (!validation.ok) {
    return res.status(400).json({
      error: validation.reason === 'whitespace' ? 'Whitespace-only input' : 'Invalid input',
    });
  }

  try {
    const existing = await findOwnedRecord(id, req.user.id);
    if (!existing) {
      return res.status(404).json({ error: 'Record not found' });
    }

    const calculation = await getBaziCalculation(validation.payload);
    const updated = await prisma.baziRecord.update({
      where: { id },
      data: {
        ...buildRecordData(validation.payload, req.user.id),
        pillars: JSON.stringify(calculation.pillars),
        fiveElements: JSON.stringify(calculation.fiveElements),
        tenGods: JSON.stringify(calculation.tenGods),
        luckCycles: JSON.stringify(calculation.luckCycles),
      },
    });

    res.json({ record: serializeRecord(updated) });
  } catch (error) {
    if (error?.code === 'P2025') {
      return res.status(404).json({ error: 'Record not found' });
    }
    logger.error(error);
    res.status(500).json({ error: 'Failed to update record' });
  }
});

// Soft Delete
router.delete('/records/:id', requireAuth, async (req, res) => {
  const id = parseIdParam(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid ID' });

  try {
    const record = await findOwnedRecord(id, req.user.id);
    if (!record) return res.status(404).json({ error: 'Record not found' });

    await prisma.baziRecordTrash.upsert({
      where: { userId_recordId: { userId: req.user.id, recordId: id } },
      create: { userId: req.user.id, recordId: id },
      update: {},
    });
    res.json({ status: 'ok' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete record' });
  }
});

// Restore
router.post('/records/:id/restore', requireAuth, async (req, res) => {
  const id = parseIdParam(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid ID' });

  try {
    const [record, deleted] = await prisma.$transaction([
      findOwnedRecord(id, req.user.id),
      prisma.baziRecordTrash.deleteMany({
        where: { userId: req.user.id, recordId: id },
      }),
    ]);

    if (!record || !deleted.count) {
      return res.status(404).json({ error: 'Record not found' });
    }

    res.json({ status: 'ok' });
  } catch (err) {
    res.status(500).json({ error: 'Restore failed' });
  }
});

// Hard Delete
router.delete('/records/:id/hard-delete', requireAuth, async (req, res) => {
  const id = parseIdParam(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid ID' });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const record = await findOwnedRecord(id, req.user.id, tx);
      if (!record) {
        const notFoundError = new Error('NOT_FOUND');
        notFoundError.code = 'NOT_FOUND';
        throw notFoundError;
      }

      await tx.baziRecordTrash.deleteMany({ where: { userId: req.user.id, recordId: id } });
      await tx.favorite.deleteMany({ where: { userId: req.user.id, recordId: id } });
      return tx.baziRecord.deleteMany({
        where: { id, userId: req.user.id },
      });
    });

    if (!result.count) {
      return res.status(404).json({ error: 'Not found' });
    }

    res.json({ status: 'ok' });
  } catch (err) {
    if (err?.code === 'NOT_FOUND' || err?.code === 'P2025') {
      return res.status(404).json({ error: 'Not found' });
    }
    res.status(500).json({ error: 'Hard delete failed' });
  }
});

export default router;
