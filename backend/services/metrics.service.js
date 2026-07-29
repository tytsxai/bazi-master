import { createHash, timingSafeEqual } from 'crypto';
import { getHealthSnapshot } from './health.service.js';
import { isShuttingDown } from './lifecycle.service.js';
import { getWebsocketMetrics } from './websocket.service.js';
import { isRateLimitDegraded } from '../middleware/rateLimit.middleware.js';

// Prometheus text exposition format, hand-rolled. A client library would add a dependency
// and a registry to keep in sync for the handful of gauges that actually drive alerts here.
const formatMetric = ({ name, help, type = 'gauge', value, labels = null }) => {
  const lines = [`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`];
  const suffix = labels
    ? `{${Object.entries(labels)
        .map(([key, val]) => `${key}="${String(val).replace(/(["\\])/g, '\\$1')}"`)
        .join(',')}}`
    : '';
  lines.push(`${name}${suffix} ${value}`);
  return lines.join('\n');
};

const boolMetric = (value) => (value ? 1 : 0);

export const collectMetrics = async ({
  healthSnapshotFn = getHealthSnapshot,
  websocketMetricsFn = getWebsocketMetrics,
  shuttingDownFn = isShuttingDown,
  rateLimitDegradedFn = isRateLimitDegraded,
  processRef = process,
} = {}) => {
  // Uses the same cached snapshot as the health endpoints, so a scrape interval shorter
  // than the cache TTL costs nothing extra on the database.
  const health = await healthSnapshotFn();
  const ws = websocketMetricsFn();
  const memory = processRef.memoryUsage();

  const blocks = [
    formatMetric({
      name: 'bazi_up',
      help: 'Always 1 for a process that answered the scrape.',
      value: 1,
    }),
    formatMetric({
      name: 'bazi_uptime_seconds',
      help: 'Process uptime in seconds.',
      value: processRef.uptime(),
    }),
    formatMetric({
      name: 'bazi_shutting_down',
      help: '1 while the process is draining after SIGTERM.',
      value: boolMetric(shuttingDownFn()),
    }),
    formatMetric({
      name: 'bazi_process_resident_memory_bytes',
      help: 'Resident set size of the backend process.',
      value: memory.rss,
    }),
    formatMetric({
      name: 'bazi_process_heap_used_bytes',
      help: 'V8 heap currently in use.',
      value: memory.heapUsed,
    }),
    formatMetric({
      name: 'bazi_dependency_up',
      help: '1 when the dependency answered its health probe.',
      value: boolMetric(health.db?.ok),
      labels: { dependency: 'database' },
    }),
    // Second series of the same metric family, so it deliberately carries no HELP/TYPE of
    // its own — Prometheus rejects a duplicate declaration. It must stay adjacent to the
    // block above.
    `bazi_dependency_up{dependency="redis"} ${boolMetric(
      health.redis?.ok || health.redis?.status === 'disabled'
    )}`,
    formatMetric({
      name: 'bazi_rate_limit_degraded',
      help: '1 when the limiter fell back to its per-process in-memory store.',
      value: boolMetric(rateLimitDegradedFn()),
    }),
  ];

  // Absent until the WebSocket server is initialised (it is skipped under NODE_ENV=test).
  // Emitting zeros there would look like "no connections" rather than "not measured".
  if (ws.status === 'ok') {
    blocks.push(
      formatMetric({
        name: 'bazi_websocket_connections',
        help: 'Currently open WebSocket connections.',
        value: ws.totalConnections,
      }),
      formatMetric({
        name: 'bazi_websocket_connections_max',
        help: 'Connection ceiling; new connections are refused at this value.',
        value: ws.maxConnections,
      }),
      formatMetric({
        name: 'bazi_websocket_ai_requests_active',
        help: 'AI generations currently streaming over WebSocket.',
        value: ws.activeAiRequests,
      })
    );
  }

  return `${blocks.join('\n')}\n`;
};

const timingSafeCompare = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  // Hashing first keeps both inputs the same length, which is what timingSafeEqual
  // requires — comparing the raw strings throws whenever the lengths differ.
  return timingSafeEqual(
    createHash('sha256').update(a, 'utf8').digest(),
    createHash('sha256').update(b, 'utf8').digest()
  );
};

// Bearer token rather than the admin session used by /api/admin/health: a scraper is not a
// logged-in user, and requiring a session cookie is exactly why that endpoint could never
// actually be monitored.
export const createMetricsHandler = ({ env = process.env, collect = collectMetrics } = {}) => {
  return async (req, res) => {
    const token = env.METRICS_TOKEN || '';

    if (!token) {
      // Unconfigured in production means "not exposed" — 404 rather than an open endpoint
      // that leaks connection counts and memory usage to anyone who guesses the path.
      if (env.NODE_ENV === 'production') {
        return res.status(404).json({ error: 'Not found' });
      }
    } else {
      const header = req.headers.authorization || '';
      const presented = header.startsWith('Bearer ') ? header.slice(7) : '';
      if (!presented || !timingSafeCompare(presented, token)) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

    const body = await collect();
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.set('Cache-Control', 'no-store');
    return res.status(200).send(body);
  };
};
