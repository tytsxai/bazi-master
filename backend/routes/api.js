import express from 'express';
import { checkRedis, getHealthSnapshot } from '../services/health.service.js';
import { isShuttingDown } from '../services/lifecycle.service.js';
import { hasBaziCacheMirror } from '../services/cache.service.js';

// Sub-routers
import aiRouter from './ai.js';
import baziRouter from './bazi.js';
import ziweiRouter from './ziwei.js';
import tarotRouter from './tarot.js';
import ichingRouter from './iching.js';
import liuyaoRouter from './liuyao.js';
import zodiacRouter from './zodiac.js';
import locationsRouter from './locations.js';
import synastryRouter from './synastry.js';
import calendarRouter from './calendar.js';

const router = express.Router();
const SERVICE_NAME = 'bazi-master-backend';

// Health Check Endpoint
router.get('/health', async (req, res) => {
  if (isShuttingDown()) {
    return res.status(503).json({
      service: SERVICE_NAME,
      status: 'shutting_down',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  }

  const { checks, ok } = await getHealthSnapshot();

  res.status(ok ? 200 : 503).json({
    service: SERVICE_NAME,
    status: ok ? 'ok' : 'degraded',
    checks,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Liveness Check (process-only)
router.get('/live', (req, res) => {
  res.status(200).json({
    service: SERVICE_NAME,
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Readiness Check
router.get('/ready', async (req, res) => {
  // Reported before the deep checks so a draining instance is pulled out of the load
  // balancer's pool while it is still healthy enough to finish its in-flight requests.
  if (isShuttingDown()) {
    return res.status(503).json({
      service: SERVICE_NAME,
      status: 'shutting_down',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  }

  const { checks, ok } = await getHealthSnapshot();

  res.status(ok ? 200 : 503).json({
    service: SERVICE_NAME,
    status: ok ? 'ready' : 'not_ready',
    checks,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// System endpoints
router.get('/system/cache-status', async (req, res) => {
  const redis = await checkRedis();
  res.json({
    redis,
    baziCache: { mirror: hasBaziCacheMirror() },
  });
});

// Mount sub-routers
router.use('/ai', aiRouter);
router.use('/bazi', baziRouter);
router.use('/ziwei', ziweiRouter);
router.use('/tarot', tarotRouter);
router.use('/iching', ichingRouter);
router.use('/liuyao', liuyaoRouter);
router.use('/zodiac', zodiacRouter);
router.use('/locations', locationsRouter);
router.use('/synastry', synastryRouter);
router.use('/calendar', calendarRouter);

export default router;
