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

export const checkRedis = async ({ initRedisFn = initRedis, env = process.env, timeoutMs = 1000 } = {}) => {
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
