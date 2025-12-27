import express from 'express';
import { prisma } from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import {
    getBaziCalculation,
    hasFullBaziResult
} from '../services/calculations.service.js';
import { buildBaziCacheKey, getCachedBaziCalculationAsync } from '../services/cache.service.js';
import { validateBaziInput, parseIdParam } from '../utils/validation.js';
import { parseRecordsQuery } from '../utils/query.js';
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
    const trueSolarCalc = location && Number.isFinite(meta?.timezoneOffsetMinutes)
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
                name: location?.name || (typeof payload?.birthLocation === 'string' ? payload.birthLocation.trim() : null),
                latitude: location.latitude,
                longitude: location.longitude,
            },
        }
        : null;

    return { ...meta, trueSolarTime };
};

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

router.post('/calculate', async (req, res) => {
    const validation = validateBaziInput(req.body);
    if (!validation.ok) {
        return res.status(400).json({ error: validation.reason === 'whitespace' ? 'Whitespace-only input' : 'Invalid input' });
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
        strength
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
        return res.status(400).json({ error: validation.reason === 'whitespace' ? 'Whitespace-only input' : 'Invalid input' });
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
        console.error('Full analysis failed:', error);
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
            select: { recordId: true }
        });
        const trashedIds = trashed.map(t => t.recordId);

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

        const records = await prisma.baziRecord.findMany({
            where,
            orderBy: resolveRecordsOrderBy(query.sortOption),
            skip: (query.safePage - 1) * query.safePageSize,
            take: query.safePageSize
        });

        const [totalCount, filteredCount] = await Promise.all([
            prisma.baziRecord.count({ where: statusWhere }),
            prisma.baziRecord.count({ where }),
        ]);

        res.json({
            records: records.map(serializeRecord),
            totalCount,
            filteredCount
        });
    } catch (error) {
        console.error(error);
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
            }
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
                    }
                });
                if (input?.softDeleted) {
                    await prisma.baziRecordTrash.upsert({
                        where: { userId_recordId: { userId: req.user.id, recordId: record.id } },
                        create: { userId: req.user.id, recordId: record.id },
                        update: {}
                    });
                }
                createdCount++;
            }
        }
        res.json({ created: createdCount });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Import failed' });
    }
});

router.get('/records/export', requireAuth, async (req, res) => {
    // Export logic: fetch all matching filters (ignoring page size usually, or large limit)
    const query = parseRecordsQuery(req.query);
    const userId = req.user.id;
    const includeDeletedStatus = req.query?.includeDeletedStatus === '1' || req.query?.includeDeletedStatus === 1;

    try {
        const trashed = await prisma.baziRecordTrash.findMany({ where: { userId }, select: { recordId: true } });
        const trashedIds = trashed.map(t => t.recordId);
        const trashedIdSet = new Set(trashedIds);

        const where = { userId };
        if (query.normalizedStatus === 'active') where.id = { notIn: trashedIds };
        else if (query.normalizedStatus === 'deleted') where.id = { in: trashedIds };

        if (query.validGender) {
            where.gender = query.validGender;
        }
        if (query.normalizedQuery) {
            where.OR = buildSearchOr(query.normalizedQuery);
        }

        const records = await prisma.baziRecord.findMany({
            where,
            orderBy: resolveRecordsOrderBy(query.sortOption),
            take: 2000 // reasonable limit for export
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

    // Soft delete multiple
    try {
        // Create trash entries. Ignore duplicates.
        // prisma.createMany is not supported nicely with "ignore" on sqlite sometimes?
        // But here we need to insert for each.
        // Use a transaction or loop.

        const operations = ids.map(id =>
            prisma.baziRecordTrash.upsert({
                where: { userId_recordId: { userId: req.user.id, recordId: Number(id) } },
                create: { userId: req.user.id, recordId: Number(id) },
                update: {}
            })
        );
        await prisma.$transaction(operations);
        res.json({ status: 'ok' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Bulk delete failed' });
    }
});


router.get('/records/:id', requireAuth, async (req, res) => {
    const id = parseIdParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid ID' });

    try {
        const record = await prisma.baziRecord.findUnique({
            where: { id, userId: req.user.id }
        });
        if (!record) return res.status(404).json({ error: 'Record not found' });
        res.json({ record: serializeRecord(record) });
    } catch (error) {
        res.status(500).json({ error: 'Internal error' });
    }
});

// Soft Delete
router.delete('/records/:id', requireAuth, async (req, res) => {
    const id = parseIdParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid ID' });

    try {
        // Verify ownership
        const record = await prisma.baziRecord.findUnique({ where: { id, userId: req.user.id } });
        if (!record) return res.status(404).json({ error: 'Record not found' });

        await prisma.baziRecordTrash.upsert({
            where: { userId_recordId: { userId: req.user.id, recordId: id } },
            create: { userId: req.user.id, recordId: id },
            update: {}
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
        await prisma.baziRecordTrash.deleteMany({
            where: { userId: req.user.id, recordId: id }
        });
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
        // Delete from trash first (cascade not working reverse?)
        await prisma.baziRecordTrash.deleteMany({ where: { userId: req.user.id, recordId: id } });
        // Delete from favorites
        await prisma.favorite.deleteMany({ where: { userId: req.user.id, recordId: id } });

        // Delete record
        await prisma.baziRecord.delete({
            where: { id, userId: req.user.id }
        });
        res.json({ status: 'ok' });
    } catch (err) {
        if (err.code === 'P2025') return res.status(404).json({ error: 'Not found' });
        res.status(500).json({ error: 'Hard delete failed' });
    }
});

export default router;
