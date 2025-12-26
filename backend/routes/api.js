import express from 'express';
import { prisma } from '../config/prisma.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { getServerConfig as getServerConfigFromEnv } from '../env.js';
import { initRedis } from '../redis.js';

// Sub-routers
import baziRouter from './bazi.js';
import tarotRouter from './tarot.js';
import ichingRouter from './iching.js';

const router = express.Router();

const {
  aiProvider: AI_PROVIDER,
  availableProviders: AVAILABLE_PROVIDERS,
} = getServerConfigFromEnv();

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
  try {
    await withTimeout(client.ping(), 1000);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || 'redis_check_failed' };
  }
};

// Health Check
router.get('/health', async (req, res) => {
  const [db, redis] = await Promise.all([checkDatabase(), checkRedis()]);
  const ok = db.ok && (redis.ok || redis.status === 'disabled');
  res.status(ok ? 200 : 503).json({
    status: ok ? 'ok' : 'degraded',
    checks: { db, redis },
    timestamp: new Date().toISOString()
  });
});

// AI Info
router.get('/ai/providers', (req, res) => {
  res.json({
    activeProvider: AI_PROVIDER,
    providers: AVAILABLE_PROVIDERS
  });
});

// Auth routes
router.get('/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

router.delete('/auth/me', requireAuth, async (req, res) => {
  try {
    // For now, just return success - full implementation needs user cleanup
    res.json({ message: 'User account would be deleted' });
  } catch (error) {
    console.error('User self-delete failed:', error);
    res.status(500).json({ error: 'Unable to delete account' });
  }
});

// Mount sub-routers
router.use('/bazi', baziRouter);
router.use('/tarot', tarotRouter);
router.use('/iching', ichingRouter);

export default router;
