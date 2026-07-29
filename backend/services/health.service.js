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

// The deep health endpoints run a Redis PING. `/health` is registered before the rate
// limiter (probes must never be throttled), so without a cache anyone can turn an
// unauthenticated GET loop into unbounded load on the dependency — the API goes slow while
// every health check still says "ok".
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

/**
 * 返回 `{ checks, ok }`。`checks` 是"依赖名 -> 状态"的字典。
 *
 * 用字典而不是把依赖拍平成顶层字段：调用方（`/health`、`/api/ready`、`/metrics`）
 * 一律原样透传 `checks`，所以增删一个依赖不需要再去改每一个调用点。
 *
 * 引擎是无状态的纯计算，唯一的外部依赖是 Redis，而 Redis 只是缓存镜像、还是可选的。
 * 所以没配 `REDIS_URL` 时 `/health` 和 `/live` 的结论一致——这是对的，不是漏了检查：
 * 没有任何依赖挂掉能让计算算错，进程活着就是可服务的。
 */
export const getHealthSnapshot = async ({
  env = process.env,
  checkRedisFn = checkRedis,
  now = Date.now(),
} = {}) => {
  const probe = async () => {
    const redis = await checkRedisFn();
    return {
      checks: { redis },
      // Redis 是可选依赖：没配 REDIS_URL 是 disabled（健康），配了却连不上才是不健康。
      ok: redis.ok || redis.status === 'disabled',
    };
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
