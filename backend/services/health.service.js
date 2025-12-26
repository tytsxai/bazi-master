import { prisma } from '../config/prisma.js';
import { initRedis } from '../redis.js';

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

export const checkDatabase = async () => {
  try {
    await withTimeout(prisma.user.findFirst({ select: { id: true } }), 1500);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || 'db_check_failed' };
  }
};

export const checkRedis = async () => {
  const configured = Boolean(process.env.REDIS_URL);
  const client = await initRedis();
  if (!client) {
    return configured ? { ok: false, status: 'unavailable' } : { ok: true, status: 'disabled' };
  }
  try {
    await withTimeout(client.ping(), 1000);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || 'redis_check_failed' };
  }
};
