const rateLimitStore = new Map();
const deletedClientIndex = new Map();
const clientRecordIndex = new Map();
let lastRateLimitCleanup = 0;

const maybeCleanupRateLimitStore = (now) => {
  const RATE_LIMIT_ENABLED = process.env.NODE_ENV === 'production' || process.env.RATE_LIMIT_MAX > 0;
  if (!RATE_LIMIT_ENABLED) return;
  const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000;
  if (!Number.isFinite(RATE_LIMIT_WINDOW_MS) || RATE_LIMIT_WINDOW_MS <= 0) return;
  if (now - lastRateLimitCleanup < RATE_LIMIT_WINDOW_MS * 2) return;
  lastRateLimitCleanup = now;
  for (const [key, entry] of rateLimitStore.entries()) {
    if (!entry || now >= entry.resetAt) {
      rateLimitStore.delete(key);
    }
  }
};

const getRateLimitKey = (req) => {
  const trustProxyEnabled = Boolean(req.app?.get('trust proxy'));
  if (trustProxyEnabled && Array.isArray(req.ips) && req.ips.length > 0) {
    return req.ips[0];
  }
  return req.ip || req.connection?.remoteAddress || 'unknown';
};

const isLocalAddress = (value) => {
  if (!value || typeof value !== 'string') return false;
  return value === '127.0.0.1' || value === '::1' || value.startsWith('127.0.0.') || value === 'localhost';
};

export const createRateLimitMiddleware = (config) => {
  const { RATE_LIMIT_ENABLED, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS } = config;

  return (req, res, next) => {
    if (!RATE_LIMIT_ENABLED) return next();

    const now = Date.now();
    maybeCleanupRateLimitStore(now);

    const key = getRateLimitKey(req);
    if (isLocalAddress(key)) return next();

    const entry = rateLimitStore.get(key) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    if (now >= entry.resetAt) {
      entry.count = 0;
      entry.resetAt = now + RATE_LIMIT_WINDOW_MS;
    }

    entry.count++;
    rateLimitStore.set(key, entry);

    res.setHeader('X-RateLimit-Limit', RATE_LIMIT_MAX);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, RATE_LIMIT_MAX - entry.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetAt / 1000));

    if (entry.count > RATE_LIMIT_MAX) {
      res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
      return res.status(429).json({
        error: 'Too many requests',
        retryAfter: Math.ceil((entry.resetAt - now) / 1000)
      });
    }

    next();
  };
};
