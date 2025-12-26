import express from 'express';
import { checkDatabase, checkRedis } from '../services/health.service.js';

// Sub-routers
import authRouter from './auth.js';
import aiRouter from './ai.js';
import baziRouter from './bazi.js';
import ziweiRouter from './ziwei.js';
import tarotRouter from './tarot.js';
import ichingRouter from './iching.js';
import favoritesRouter from './favorites.js';
import zodiacRouter from './zodiac.js';
import userRouter from './user.js';
import locationsRouter from './locations.js';

const router = express.Router();
const SERVICE_NAME = 'bazi-master-backend';

// API health check (used by Playwright/dev-server)
router.get('/health', async (req, res) => {
  const [db, redis] = await Promise.all([checkDatabase(), checkRedis()]);
  const ok = db.ok && (redis.ok || redis.status === 'disabled');
  res.status(ok ? 200 : 503).json({
    service: SERVICE_NAME,
    status: ok ? 'ok' : 'degraded',
    checks: { db, redis },
    timestamp: new Date().toISOString(),
  });
});

// Readiness Check (for load balancer health checks)
router.get('/ready', async (req, res) => {
  const [db, redis] = await Promise.all([checkDatabase(), checkRedis()]);
  const ok = db.ok && (redis.ok || redis.status === 'disabled');
  res.status(ok ? 200 : 503).json({
    service: SERVICE_NAME,
    status: ok ? 'ready' : 'not_ready',
    checks: { db, redis },
    timestamp: new Date().toISOString()
  });
});

// Mount sub-routers
router.use('/auth', authRouter);
router.use('/ai', aiRouter);
router.use('/bazi', baziRouter);
router.use('/ziwei', ziweiRouter);
router.use('/tarot', tarotRouter);
router.use('/iching', ichingRouter);
router.use('/favorites', favoritesRouter);
router.use('/zodiac', zodiacRouter);
router.use('/user', userRouter);
router.use('/locations', locationsRouter);

export default router;
