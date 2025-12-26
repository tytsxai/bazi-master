import express from 'express';
import { prisma } from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import {
    getBaziCalculation,
    buildImportRecord
} from '../services/calculations.service.js';
import { validateBaziInput, parseIdParam } from '../utils/validation.js';
import { parseRecordsQuery } from '../utils/query.js';
import { generateAIContent, resolveAiProvider, buildBaziPrompt } from '../services/ai.service.js';
import { createAiGuard } from '../lib/concurrency.js';

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

router.post('/calculate', async (req, res) => {
    const validation = validateBaziInput(req.body);
    if (!validation.ok) {
        return res.status(400).json({ error: validation.reason === 'whitespace' ? 'Whitespace-only input' : 'Invalid input' });
    }

    try {
        const result = await getBaziCalculation(validation.payload);
        res.json(result);
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

    try {
        const calculation = await getBaziCalculation(validation.payload);

        let provider = null;
        try {
            provider = resolveAiProvider(req.body?.provider);
        } catch (error) {
            // fallback silently
        }

        const { system, user, fallback } = buildBaziPrompt({
            ...calculation,
            strength: req.body.strength
        });

        const release = await aiGuard.acquire(req.user.id);
        if (!release) {
            return res.status(429).json({ error: AI_CONCURRENCY_ERROR });
        }

        try {
            const content = await generateAIContent({ system, user, fallback, provider });
            res.json({ calculation, interpretation: content });
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
    try {
        const records = await prisma.baziRecord.findMany({
            where: { userId: req.user.id },
            orderBy: { createdAt: 'desc' },
            skip: (query.safePage - 1) * query.safePageSize,
            take: query.safePageSize
        });
        res.json({ records: records.map(serializeRecord) });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch records' });
    }
});

router.post('/records', requireAuth, async (req, res) => {
    const validation = validateBaziInput(req.body);
    if (!validation.ok) return res.status(400).json({ error: 'Invalid input' });

    try {
        const calculation = await getBaziCalculation(validation.payload);
        const record = await prisma.baziRecord.create({
            data: {
                userId: req.user.id,
                ...validation.payload,
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

router.delete('/records/:id', requireAuth, async (req, res) => {
    const id = parseIdParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid ID' });

    try {
        await prisma.baziRecord.delete({
            where: { id, userId: req.user.id }
        });
        res.json({ status: 'ok' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete record' });
    }
});

export default router;
