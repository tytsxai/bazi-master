import express from 'express';
import { requireAdmin } from '../middleware/auth.js';
import { getWebsocketMetrics } from '../services/websocket.service.js';
import { checkDatabase, checkRedis } from '../services/health.service.js';

const router = express.Router();

// Admin Health Check with WS Metrics
router.get('/health', requireAdmin, async (req, res) => {
  const [db, redis] = await Promise.all([checkDatabase(), checkRedis()]);
  const ws = getWebsocketMetrics();

  const ok = db.ok && (redis.ok || redis.status === 'disabled') && ws.status === 'ok';

  res.status(ok ? 200 : 503).json({
    status: ok ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {
      db,
      redis,
      websocket: ws,
    },
    user: {
      id: req.user.id,
      email: req.user.email,
    },
  });
});

export default router;
