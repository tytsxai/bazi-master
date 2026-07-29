import { logger } from '../config/logger.js';
import express from 'express';
import { getBaziCalculation, hasFullBaziResult } from '../services/calculations.service.js';
import { buildBaziCacheKey, getCachedBaziCalculationAsync } from '../services/cache.service.js';
import { validateBaziInput } from '../utils/validation.js';
import { generateAIContent, resolveAiProvider, buildBaziPrompt } from '../services/ai.service.js';
import { createAiGuard, resolveClientKey } from '../lib/concurrency.js';
import { buildBirthTimeMeta } from '../utils/timezone.js';
import { resolveLocationCoordinates, computeTrueSolarTime } from '../services/solarTime.service.js';

const router = express.Router();
const aiGuard = createAiGuard();
const AI_CONCURRENCY_ERROR = 'AI request already in progress. Please wait.';

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
    logger.error({ err: error, requestId: req.id }, 'Bazi calculation failed');
    res.status(500).json({ error: 'Calculation error' });
  }
});

router.post('/ai-interpret', async (req, res) => {
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

  const release = await aiGuard.acquire(resolveClientKey(req));
  if (!release) {
    return res.status(429).json({ error: AI_CONCURRENCY_ERROR });
  }
  try {
    const content = await generateAIContent({ system, user, fallback, provider });
    res.json({ content });
  } catch (error) {
    // An upstream provider being down is not our bug; report it as such rather than
    // letting it surface as a generic 500.
    logger.error({ err: error, requestId: req.id, provider }, 'Bazi AI interpretation failed');
    res.status(503).json({ error: 'AI interpretation is currently unavailable' });
  } finally {
    release();
  }
});

router.post('/full-analysis', async (req, res) => {
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

    const release = await aiGuard.acquire(resolveClientKey(req));
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
    logger.error({ err: error, requestId: req.id }, 'Full analysis failed');
    res.status(500).json({ error: 'Analysis error' });
  }
});

export default router;
