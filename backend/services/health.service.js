import { prisma } from '../config/prisma.js';
import { initRedis } from '../config/redis.js';

export const withTimeout = (promise, timeoutMs) => {
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

export const checkDatabase = async ({ prismaClient = prisma, timeoutMs = 1500 } = {}) => {
  try {
    await withTimeout(prismaClient.user.findFirst({ select: { id: true } }), timeoutMs);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || 'db_check_failed' };
  }
};

export const checkRedis = async ({
  initRedisFn = initRedis,
  env = process.env,
  timeoutMs = 1000,
} = {}) => {
  const configured = Boolean(env.REDIS_URL);
  const client = await initRedisFn();
  if (!client) {
    return configured ? { ok: false, status: 'unavailable' } : { ok: true, status: 'disabled' };
  }
  try {
    await withTimeout(client.ping(), timeoutMs);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || 'redis_check_failed' };
  }
};

// The deep health endpoints each run a real database query and a Redis PING. `/health` is
// registered before the rate limiter (probes must never be throttled), so without a cache
// anyone can turn an unauthenticated GET loop into unbounded database load and exhaust the
// Prisma connection pool — the API goes slow while every health check still says "ok".
//
// A short TTL is enough: orchestrator and load-balancer probes fire every 5-10s, so they
// still get a fresh answer every time, while a flood collapses into one probe per window.
// The in-flight promise is shared as well, so a burst arriving on a cold cache produces a
// single check rather than one per request.
const DEFAULT_HEALTH_CACHE_TTL_MS = 1000;

let cachedSnapshot = null;
let cachedUntil = 0;
let inFlight = null;

export const resetHealthSnapshotCache = () => {
  cachedSnapshot = null;
  cachedUntil = 0;
  inFlight = null;
};

// Off outside production so tests (and local debugging) always observe the live state of
// the dependencies rather than a value cached by the previous assertion.
export const resolveHealthCacheTtlMs = (env = process.env) => {
  const raw = env.HEALTH_CACHE_TTL_MS;
  if (raw !== undefined && raw !== null && raw !== '') {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return env.NODE_ENV === 'production' ? DEFAULT_HEALTH_CACHE_TTL_MS : 0;
};

export const getHealthSnapshot = async ({
  env = process.env,
  checkDatabaseFn = checkDatabase,
  checkRedisFn = checkRedis,
  now = Date.now(),
} = {}) => {
  const probe = async () => {
    const [db, redis] = await Promise.all([checkDatabaseFn(), checkRedisFn()]);
    return { db, redis, ok: db.ok && (redis.ok || redis.status === 'disabled') };
  };

  const ttlMs = resolveHealthCacheTtlMs(env);
  if (ttlMs <= 0) return probe();

  if (cachedSnapshot && now < cachedUntil) return cachedSnapshot;
  if (inFlight) return inFlight;

  inFlight = probe()
    .then((snapshot) => {
      cachedSnapshot = snapshot;
      cachedUntil = Date.now() + ttlMs;
      return snapshot;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
};
