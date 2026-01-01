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

const getRedisRateLimitEntry = async (client, { key, windowMs, now, prefix }) => {
  const redisKey = `${prefix}${key}`;
  let count = 0;
  let ttlMs = null;
  try {
    const results = await client.multi().incr(redisKey).pttl(redisKey).exec();
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
      await client.pexpire(redisKey, windowMs);
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

const getRateLimitKey = (req) => {
  const trustProxyEnabled = Boolean(req.app?.get('trust proxy'));
  if (trustProxyEnabled && Array.isArray(req.ips) && req.ips.length > 0) {
    return req.ips[0];
  }
  return req.ip || req.connection?.remoteAddress || 'unknown';
};

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
  } = config;

  return async (req, res, next) => {
    if (!RATE_LIMIT_ENABLED) return next();

    const now = Date.now();

    const key = getRateLimitKey(req);
    if (isLocalAddress(key)) return next();

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

    res.setHeader('X-RateLimit-Limit', RATE_LIMIT_MAX);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, RATE_LIMIT_MAX - entry.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetAt / 1000));

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
