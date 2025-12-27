import express from 'express';
import { checkDatabase, checkRedis } from '../services/health.service.js';
import { handleLogin, handleRegister } from '../controllers/auth.controller.js';
import { requireAuth, sessionStore } from '../middleware/auth.js';
import { hasBaziCacheMirror } from '../services/cache.service.js';

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
import mediaRouter from './media.js';
import synastryRouter from './synastry.js';
import calendarRouter from './calendar.js';
import adminRouter from './admin.js';

const router = express.Router();
const SERVICE_NAME = 'bazi-master-backend';

// Health Check Endpoint
router.get('/health', async (req, res) => {
  const [db, redis] = await Promise.all([checkDatabase(), checkRedis()]);
  const ok = db.ok && (redis.ok || redis.status === 'disabled');

  res.status(ok ? 200 : 503).json({
    service: SERVICE_NAME,
    status: ok ? 'ok' : 'degraded',
    checks: { db, redis },
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Readiness Check
router.get('/ready', async (req, res) => {
  const [db, redis] = await Promise.all([checkDatabase(), checkRedis()]);
  const ok = db.ok && (redis.ok || redis.status === 'disabled');

  res.status(ok ? 200 : 503).json({
    service: SERVICE_NAME,
    status: ok ? 'ready' : 'not_ready',
    checks: { db, redis },
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Compatibility auth endpoints (legacy clients/tests)
router.post('/register', handleRegister);
router.post('/login', handleLogin);

// System endpoints
router.get('/system/cache-status', requireAuth, async (req, res) => {
  const redis = await checkRedis();
  res.json({
    redis,
    sessionCache: { mirror: sessionStore.hasMirror() },
    baziCache: { mirror: hasBaziCacheMirror() },
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
router.use('/media', mediaRouter);
router.use('/synastry', synastryRouter);
router.use('/calendar', calendarRouter);
router.use('/admin', adminRouter);

export default router;
