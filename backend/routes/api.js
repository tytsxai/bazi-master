import express from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { generateAIContent } from '../services/ai.js';
import { getBaziCalculation } from '../services/bazi.js';
import { validateBaziInput } from '../validation.js';
import { sanitizeQueryParam, parseIdParam } from '../utils/validation.js';

const router = express.Router();

// Health check endpoints
router.get('/health', async (req, res) => {
  const [db, redis] = await Promise.all([checkDatabase(), checkRedis()]);
  const ok = db.ok && (redis.ok || redis.status === 'disabled');
  res.status(ok ? 200 : 503).json({
    status: ok ? 'ok' : 'degraded',
    checks: { db, redis },
  });
});

router.get('/ready', async (req, res) => {
  const [db, redis] = await Promise.all([checkDatabase(), checkRedis()]);
  const ok = db.ok && (redis.ok || redis.status === 'disabled');
  res.status(ok ? 200 : 503).json({
    status: ok ? 'ok' : 'degraded',
    checks: { db, redis },
    timestamp: new Date().toISOString(),
  });
});

// AI provider info
router.get('/ai/providers', (req, res) => {
  res.json({
    activeProvider: AI_PROVIDER,
    providers: AVAILABLE_PROVIDERS
  });
});

// System cache status
router.get('/system/cache-status', requireAuth, async (req, res) => {
  if (IS_PRODUCTION) {
    return res.status(404).json({ error: 'Not available' });
  }
  const redis = await checkRedis();
  res.json({
    redis,
    baziCache: { mirror: hasBaziCacheMirror() },
    timestamp: new Date().toISOString(),
  });
});

// Locations
router.get('/locations', (req, res) => {
  res.json({ locations: listKnownLocations() });
});

// AI interpretation
router.post('/ai/interpret', requireAuth, async (req, res) => {
  const { system, user, prompt, fallback: fallbackText } = req.body || {};
  const userPrompt = typeof user === 'string' ? user : typeof prompt === 'string' ? prompt : '';
  if (!userPrompt.trim()) {
    return res.status(400).json({ error: 'User prompt required' });
  }

  try {
    const result = await generateAIContent({
      system: system || 'You are a helpful assistant.',
      user: userPrompt,
      fallback: fallbackText
    });
    res.json({ result });
  } catch (error) {
    console.error('AI interpretation error:', error);
    res.status(500).json({ error: 'AI service unavailable' });
  }
});

// Bazi calculation
router.post('/bazi/calculate', async (req, res) => {
  const validation = validateBaziInput(req.body);
  if (!validation.ok) {
    const message = validation.reason === 'whitespace'
      ? 'Whitespace-only input is not allowed'
      : 'Missing required fields';
    return res.status(400).json({ error: message });
  }

  try {
    const result = await getBaziCalculation(req.body);
    res.json(result);
  } catch (error) {
    console.error('Bazi calculation error:', error);
    res.status(500).json({ error: 'Calculation error' });
  }
});

// Add more routes here...

export default router;
