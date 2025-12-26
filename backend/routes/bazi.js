import express from 'express';
import { prisma } from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import {
    getBaziCalculation,
    buildImportRecord
} from '../services/bazi.js';
import { validateBaziInput } from '../validation.js';
import { parseIdParam } from '../utils/validation.js';
import { parseRecordsQuery } from '../utils/query.js';
import { generateAIContent } from '../services/ai.js';
import { resolveAiProvider } from '../services/ai.service.js';
import { createAiGuard } from '../lib/concurrency.js';
import { buildBaziPrompt } from '../services/prompts.service.js';

const router = express.Router();
const aiGuard = createAiGuard();
const AI_CONCURRENCY_ERROR = 'AI request already in progress. Please wait.';

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

router.post('/full-analysis', requireAuth, async (req, res) => {
    const validation = validateBaziInput(req.body);
    if (!validation.ok) {
        const message = validation.reason === 'whitespace'
            ? 'Whitespace-only input is not allowed'
            : 'Missing required fields';
        return res.status(400).json({ error: message });
    }

    try {
        const result = await getBaziCalculation(validation.payload);
        res.json(result);
    } catch (error) {
        console.error(error);
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

// Records routes
router.get('/records', requireAuth, async (req, res) => {
    const query = parseRecordsQuery(req.query);
    // Implementation for fetching records
    res.json({ records: [] }); // Placeholder
});

router.post('/records', requireAuth, async (req, res) => {
    const validation = validateBaziInput(req.body);
    if (!validation.ok) return res.status(400).json({ error: 'Invalid input' });

    try {
        const record = await prisma.baziRecord.create({
            data: {
                userId: req.user.id,
                ...validation.payload,
                pillars: JSON.stringify(validation.payload.pillars), // Should be pre-calculated
                fiveElements: JSON.stringify(validation.payload.fiveElements),
                tenGods: JSON.stringify(validation.payload.tenGods),
                luckCycles: JSON.stringify(validation.payload.luckCycles),
            }
        });
        res.json(record);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create record' });
    }
});

export default router;
