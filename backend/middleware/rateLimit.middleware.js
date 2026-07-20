import { logger } from '../config/logger.js';
import { initRedis } from '../config/redis.js';

const rateLimitStore = new Map();
const DEFAULT_REDIS_PREFIX = 'rate-limit:';
let lastRateLimitCleanup = 0;
let redisClient = null;
let redisInitPromise = null;
let warnedOnFallback = false;

const logWarn = (...args) => {
  logger.warn(...args);
  if (process.env.NODE_ENV !== 'production') {
    console.warn(...args);
  }
};

const resetRateLimitState = () => {
  lastRateLimitCleanup = 0;
  redisClient = null;
  redisInitPromise = null;
  warnedOnFallback = false;
};

const warnOnFallback = () => {
  if (warnedOnFallback) return;
  if (process.env.NODE_ENV === 'production') return;
  warnedOnFallback = true;
  logWarn('[rate-limit] Redis unavailable; using in-memory rate limit store.');
};

const ensureRedisClient = async (initRedisClient) => {
  if (redisClient) return redisClient;
  if (redisInitPromise) return redisInitPromise;
  redisInitPromise = (async () => {
    try {
      const client = await initRedisClient();
      if (!client) return null;
      redisClient = client;
      return client;
    } catch (error) {
      logWarn('[rate-limit] Redis init failed:', error?.message || error);
      return null;
    }
  })();
  return redisInitPromise;
};

const REDIS_OP_TIMEOUT_MS = 1000;

// Rate limiting sits in front of every request, so a slow Redis must never become a
// slow API. Anything past the deadline falls through to the in-memory limiter.
const withTimeout = (promise, timeoutMs = REDIS_OP_TIMEOUT_MS) => {
  let timer = null;
  return Promise.race([
    promise,
    new Promise((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('redis_timeout')), timeoutMs);
      timer.unref?.();
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
};

const getRedisRateLimitEntry = async (client, { key, windowMs, now, prefix }) => {
  const redisKey = `${prefix}${key}`;
  let count = 0;
  let ttlMs = null;
  try {
    const results = await withTimeout(client.multi().incr(redisKey).pttl(redisKey).exec());
    if (Array.isArray(results)) {
      count = Number(results[0]);
      ttlMs = Number(results[1]);
    }
  } catch (error) {
    logWarn('[rate-limit] Redis error:', error?.message || error);
    return null;
  }

  if (!Number.isFinite(count)) count = 0;
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    try {
      await withTimeout(client.pexpire(redisKey, windowMs));
    } catch (error) {
      logWarn('[rate-limit] Redis expire failed:', error?.message || error);
    }
    ttlMs = windowMs;
  }

  return {
    count,
    resetAt: now + ttlMs,
  };
};

const maybeCleanupRateLimitStore = (now) => {
  const RATE_LIMIT_ENABLED =
    process.env.NODE_ENV === 'production' || process.env.RATE_LIMIT_MAX > 0;
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

// Deliberately uses req.ip rather than req.ips[0]. Express already walks
// X-Forwarded-For according to the configured `trust proxy` hop count and returns the
// left-most address it is willing to trust; req.ips[0] is whatever the client wrote.
const getRateLimitKey = (req) => req.ip || req.connection?.remoteAddress || 'unknown';

const isLocalAddress = (value) => {
  if (!value || typeof value !== 'string') return false;
  return (
    value === '127.0.0.1' ||
    value === '::1' ||
    value.startsWith('127.0.0.') ||
    value === 'localhost'
  );
};

const createRateLimitMiddleware = (config) => {
  const {
    RATE_LIMIT_ENABLED,
    RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW_MS,
    initRedisClient = initRedis,
    redisKeyPrefix = DEFAULT_REDIS_PREFIX,
    // Lets callers rate limit on something other than the client address (e.g. the
    // submitted email on login). Returning a falsy key skips this limiter.
    resolveKey = null,
    setHeaders = true,
  } = config;

  const IS_PRODUCTION = process.env.NODE_ENV === 'production';

  return async (req, res, next) => {
    if (!RATE_LIMIT_ENABLED) return next();

    const now = Date.now();

    const key = resolveKey ? resolveKey(req) : getRateLimitKey(req);
    if (!key) return next();
    // The loopback exemption is a developer convenience. In production the key can be
    // influenced by proxy headers, so an unconditional bypass here would be a hole.
    if (!IS_PRODUCTION && isLocalAddress(key)) return next();

    let entry = null;
    const redis = await ensureRedisClient(initRedisClient);
    if (redis) {
      entry = await getRedisRateLimitEntry(redis, {
        key,
        windowMs: RATE_LIMIT_WINDOW_MS,
        now,
        prefix: redisKeyPrefix,
      });
    }

    if (!entry) {
      warnOnFallback();
      maybeCleanupRateLimitStore(now);
      entry = rateLimitStore.get(key) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
      if (now >= entry.resetAt) {
        entry.count = 0;
        entry.resetAt = now + RATE_LIMIT_WINDOW_MS;
      }

      entry.count++;
      rateLimitStore.set(key, entry);
    }

    if (entry.count === 0) {
      entry.count = 1;
    }

    if (setHeaders) {
      res.setHeader('X-RateLimit-Limit', RATE_LIMIT_MAX);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, RATE_LIMIT_MAX - entry.count));
      res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetAt / 1000));
    }

    if (entry.count > RATE_LIMIT_MAX) {
      res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
      return res.status(429).json({
        error: 'Too many requests',
        retryAfter: Math.ceil((entry.resetAt - now) / 1000),
      });
    }

    next();
  };
};

export {
  rateLimitStore,
  resetRateLimitState,
  maybeCleanupRateLimitStore,
  getRateLimitKey,
  isLocalAddress,
  createRateLimitMiddleware,
};
