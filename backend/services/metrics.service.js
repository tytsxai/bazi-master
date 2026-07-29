import { createHash, timingSafeEqual } from 'crypto';
import { getHealthSnapshot } from './health.service.js';
import { isShuttingDown } from './lifecycle.service.js';
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
  shuttingDownFn = isShuttingDown,
  rateLimitDegradedFn = isRateLimitDegraded,
  processRef = process,
} = {}) => {
  // Uses the same cached snapshot as the health endpoints, so a scrape interval shorter
  // than the cache TTL costs nothing extra on the dependencies.
  const health = await healthSnapshotFn();
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
      name: 'bazi_rate_limit_degraded',
      help: '1 when the limiter fell back to its per-process in-memory store.',
      value: boolMetric(rateLimitDegradedFn()),
    }),
  ];

  // One series per dependency, driven by whatever getHealthSnapshot reports. Adding or
  // removing a dependency there needs no edit here. HELP/TYPE is emitted once for the
  // family — Prometheus rejects a duplicate declaration — so the header is written
  // separately from the series lines.
  const dependencies = Object.entries(health.checks ?? {});
  if (dependencies.length > 0) {
    blocks.push(
      [
        '# HELP bazi_dependency_up 1 when the dependency answered its health probe.',
        '# TYPE bazi_dependency_up gauge',
        ...dependencies.map(
          ([name, state]) =>
            `bazi_dependency_up{dependency="${name}"} ${boolMetric(
              state?.ok || state?.status === 'disabled'
            )}`
        ),
      ].join('\n')
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
