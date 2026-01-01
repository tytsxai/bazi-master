import { logger as appLogger } from './logger.js';
const getRedisUrl = (env = process.env) => env.REDIS_URL || '';
let redisClient = null;
let redisInitPromise = null;

export const resetRedisState = () => {
  redisClient = null;
  redisInitPromise = null;
};

export const initRedis = async ({
  require: requireRedis = false,
  env = process.env,
  url,
  importRedis = () => import('redis'),
  logger = appLogger,
} = {}) => {
  const redisUrl = typeof url === 'string' ? url : getRedisUrl(env);
  if (!redisUrl) {
    if (requireRedis || (env.NODE_ENV === 'production' && !env.CI)) {
      throw new Error('REDIS_URL is required for production sessions.');
    }
    return null;
  }
  if (redisClient) return redisClient;
  if (redisInitPromise) return redisInitPromise;
  redisInitPromise = (async () => {
    try {
      const redisModule = await importRedis();
      const { createClient } = redisModule;
      redisClient = createClient({ url: redisUrl });
      redisClient.on('error', (error) => {
        logger.error('[redis] client error:', error);
      });
      await redisClient.connect();
      if (typeof logger.info === 'function') {
        logger.info('[redis] connected');
      } else if (typeof logger.log === 'function') {
        logger.log('[redis] connected');
      }
      return redisClient;
    } catch (error) {
      redisInitPromise = null;
      if (requireRedis) {
        throw new Error(error?.message || 'redis_unavailable');
      }
      logger.warn('[redis] unavailable:', error?.message || error);
      redisClient = null;
      return null;
    }
  })();
  return redisInitPromise;
};

export const createRedisMirror = (
  client,
  { prefix = '', ttlMs = null, logger = appLogger } = {}
) => {
  const resolveKey = (key) => `${prefix}${key}`;
  const toJson = (value) => {
    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  };
  const fromJson = (value) => {
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  };

  return {
    async get(key) {
      if (!key) return null;
      try {
        const raw = await client.get(resolveKey(key));
        return fromJson(raw);
      } catch (error) {
        logger.warn('[redis] get failed:', error?.message || error);
        return null;
      }
    },
    async set(key, value, overrideTtlMs = null) {
      if (!key) return;
      const payload = toJson(value);
      if (!payload) return;
      const ttl =
        Number.isFinite(overrideTtlMs) && overrideTtlMs > 0
          ? overrideTtlMs
          : Number.isFinite(ttlMs) && ttlMs > 0
            ? ttlMs
            : null;
      try {
        if (ttl) {
          await client.set(resolveKey(key), payload, { PX: ttl });
        } else {
          await client.set(resolveKey(key), payload);
        }
      } catch (error) {
        logger.warn('[redis] set failed:', error?.message || error);
      }
    },
    async delete(key) {
      if (!key) return;
      try {
        await client.del(resolveKey(key));
      } catch (error) {
        logger.warn('[redis] delete failed:', error?.message || error);
      }
    },
    async clear() {
      if (!prefix) return;
      try {
        if (typeof client.scanIterator === 'function') {
          const keys = [];
          for await (const key of client.scanIterator({ MATCH: `${prefix}*`, COUNT: 100 })) {
            keys.push(key);
            if (keys.length >= 200) {
              await client.del(keys);
              keys.length = 0;
            }
          }
          if (keys.length) {
            await client.del(keys);
          }
        }
      } catch (error) {
        logger.warn('[redis] clear failed:', error?.message || error);
      }
    },
    async deleteByPrefix(rawPrefix) {
      if (!prefix || !rawPrefix) return;
      try {
        if (typeof client.scanIterator === 'function') {
          const keys = [];
          const match = `${prefix}${rawPrefix}*`;
          for await (const key of client.scanIterator({ MATCH: match, COUNT: 100 })) {
            keys.push(key);
            if (keys.length >= 200) {
              await client.del(keys);
              keys.length = 0;
            }
          }
          if (keys.length) {
            await client.del(keys);
          }
        }
      } catch (error) {
        logger.warn('[redis] deleteByPrefix failed:', error?.message || error);
      }
    },
  };
};
