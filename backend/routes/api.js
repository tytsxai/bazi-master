import express from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { generateAIContent } from '../services/ai.js';
import { getBaziCalculation } from '../services/bazi.js';
import { validateBaziInput } from '../validation.js';
import { sanitizeQueryParam, parseIdParam } from '../utils/validation.js';
import { initRedis } from '../redis.js';
import { hasBaziCacheMirror } from '../baziCache.js';
import { listKnownLocations } from '../solarTime.js';
import { getServerConfig as getServerConfigFromEnv } from '../env.js';

const router = express.Router();
const prisma = new PrismaClient();

const {
  aiProvider: AI_PROVIDER,
  availableProviders: AVAILABLE_PROVIDERS,
  nodeEnv: NODE_ENV,
} = getServerConfigFromEnv();

const IS_PRODUCTION = NODE_ENV === 'production';

const withTimeout = (promise, timeoutMs) => {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      const timer = setTimeout(() => {
        clearTimeout(timer);
        reject(new Error('Timeout'));
      }, timeoutMs);
      timer.unref?.();
    }),
  ]);
};

const checkDatabase = async () => {
  try {
    await withTimeout(prisma.user.findFirst({ select: { id: true } }), 1500);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || 'db_check_failed' };
  }
};

const checkRedis = async () => {
  const configured = Boolean(process.env.REDIS_URL);
  const client = await initRedis();
  if (!client) {
    return configured ? { ok: false, status: 'unavailable' } : { ok: true, status: 'disabled' };
  }
  if (!client.isOpen) {
    return { ok: false, status: 'disconnected' };
  }
  try {
    await withTimeout(client.ping(), 1000);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || 'redis_check_failed' };
  }
};

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
