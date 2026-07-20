import { logger } from '../config/logger.js';

const isTest = process.env.NODE_ENV === 'test';

const createMirroredStore = ({ name } = {}) => {
  const store = new Map();
  let mirror = null;
  let warnedOnFallback = false;

  const warnOnFallback = () => {
    if (isTest || mirror || warnedOnFallback) return;
    warnedOnFallback = true;
    logger.warn(`[${name}] Redis unavailable; using in-memory store.`);
  };

  const setMirror = (nextMirror) => {
    mirror = nextMirror;
  };

  return {
    get(key) {
      warnOnFallback();
      return store.get(key);
    },
    async getAsync(key) {
      warnOnFallback();
      if (store.has(key)) return store.get(key);
      if (!mirror?.get) return null;
      const remote = await mirror.get(key);
      if (remote === null || remote === undefined) return null;
      store.set(key, remote);
      return remote;
    },
    setLocal(key, value) {
      warnOnFallback();
      store.set(key, value);
    },
    set(key, value, ttlMs = null) {
      warnOnFallback();
      store.set(key, value);
      if (mirror?.set) {
        mirror.set(key, value, ttlMs);
      }
    },
    async setAsync(key, value, ttlMs = null) {
      warnOnFallback();
      store.set(key, value);
      if (mirror?.set) {
        await mirror.set(key, value, ttlMs);
      }
    },
    delete(key) {
      warnOnFallback();
      store.delete(key);
      if (mirror?.delete) {
        mirror.delete(key);
      }
    },
    async deleteAsync(key) {
      warnOnFallback();
      store.delete(key);
      if (mirror?.delete) {
        await mirror.delete(key);
      }
    },
    clear() {
      warnOnFallback();
      store.clear();
      if (mirror?.clear) {
        mirror.clear();
      }
    },
    async clearAsync() {
      warnOnFallback();
      store.clear();
      if (mirror?.clear) {
        await mirror.clear();
      }
    },
    has(key) {
      warnOnFallback();
      return store.has(key);
    },
    entries() {
      warnOnFallback();
      return store.entries();
    },
    keys() {
      warnOnFallback();
      return store.keys();
    },
    setMirror,
    getMirror() {
      return mirror;
    },
  };
};

export const resetTokenStore = createMirroredStore({ name: 'reset-token-store' });
export const resetTokenByUser = createMirroredStore({ name: 'reset-token-by-user' });

export const setResetTokenMirrors = ({ tokenMirror = null, userMirror = null } = {}) => {
  resetTokenStore.setMirror(tokenMirror);
  resetTokenByUser.setMirror(userMirror);
};

const normalizeUserId = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const normalizeExpiresAt = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const normalizeTokenEntry = (entry) => {
  if (!entry || typeof entry !== 'object') return null;
  const userId = normalizeUserId(entry.userId);
  if (!userId) return null;
  const expiresAt = normalizeExpiresAt(entry.expiresAt);
  return { userId, expiresAt };
};

const isExpiredEntry = (entry, now = Date.now()) =>
  Number.isFinite(entry?.expiresAt) && entry.expiresAt <= now;

export const pruneResetTokens = (now = Date.now()) => {
  for (const [token, entry] of resetTokenStore.entries()) {
    if (!entry?.expiresAt || now > entry.expiresAt) {
      resetTokenStore.delete(token);
      if (entry?.userId && resetTokenByUser.get(entry.userId) === token) {
        resetTokenByUser.delete(entry.userId);
      }
    }
  }
};

export const getResetTokenEntry = (token, now = Date.now()) => {
  if (!token) return null;
  const entry = resetTokenStore.get(token);
  if (!entry) return null;
  if (isExpiredEntry(entry, now)) {
    resetTokenStore.delete(token);
    if (entry?.userId && resetTokenByUser.get(entry.userId) === token) {
      resetTokenByUser.delete(entry.userId);
    }
    return null;
  }
  return entry;
};

export const getResetTokenEntryAsync = async (token) => {
  if (!token) return null;
  const local = getResetTokenEntry(token);
  if (local) return local;
  if (!resetTokenStore.getMirror()?.get) return null;
  const remote = await resetTokenStore.getAsync(token);
  const normalized = normalizeTokenEntry(remote);
  if (!normalized) {
    await resetTokenStore.deleteAsync(token);
    return null;
  }
  if (isExpiredEntry(normalized)) {
    await resetTokenStore.deleteAsync(token);
    return null;
  }
  resetTokenStore.setLocal(token, normalized);
  if (!resetTokenByUser.get(normalized.userId)) {
    resetTokenByUser.setLocal(normalized.userId, token);
  }
  return normalized;
};

/**
 * Fetch a reset token entry and delete it in the same step.
 *
 * Reading and then deleting leaves a window where two concurrent confirm requests both
 * see a valid token. Redis GETDEL closes it; without a mirror the local Map is the only
 * store and a delete right after the read is equivalent, since Node is single-threaded
 * between awaits.
 */
export const consumeResetTokenEntryAsync = async (token) => {
  if (!token) return null;
  const mirror = resetTokenStore.getMirror();

  if (mirror?.getAndDelete) {
    const remote = await mirror.getAndDelete(token);
    const normalized = normalizeTokenEntry(remote);
    // The local copy is now stale either way.
    resetTokenStore.delete(token);
    if (!normalized || isExpiredEntry(normalized)) return null;
    if (resetTokenByUser.get(normalized.userId) === token) {
      await resetTokenByUser.deleteAsync(normalized.userId);
    }
    return normalized;
  }

  // No mirror: read and delete with no await in between, so two callers cannot both
  // observe the token. An await here would yield the loop and reopen the race.
  const local = getResetTokenEntry(token);
  if (local?.userId) {
    deleteResetToken(token, local.userId);
    return local;
  }

  // Not held locally but a mirror without getAndDelete may still have it.
  const entry = await getResetTokenEntryAsync(token);
  if (!entry?.userId) return null;
  const stillPresent = getResetTokenEntry(token);
  if (!stillPresent) return null;
  deleteResetToken(token, entry.userId);
  await deleteResetTokenAsync(token, entry.userId);
  return entry;
};

export const getResetTokenForUserAsync = async (userId) => {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return null;
  const local = resetTokenByUser.get(normalizedUserId);
  if (local) return local;
  if (!resetTokenByUser.getMirror()?.get) return null;
  const remote = await resetTokenByUser.getAsync(normalizedUserId);
  if (typeof remote !== 'string' || !remote) {
    await resetTokenByUser.deleteAsync(normalizedUserId);
    return null;
  }
  resetTokenByUser.setLocal(normalizedUserId, remote);
  return remote;
};

export const setResetTokenForUser = async ({ userId, token, expiresAt, ttlMs } = {}) => {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId || !token) return;

  const existingToken =
    resetTokenByUser.get(normalizedUserId) || (await getResetTokenForUserAsync(normalizedUserId));
  if (existingToken && existingToken !== token) {
    await resetTokenStore.deleteAsync(existingToken);
  }

  const entry = { userId: normalizedUserId, expiresAt: normalizeExpiresAt(expiresAt) };
  await resetTokenStore.setAsync(token, entry, ttlMs);
  await resetTokenByUser.setAsync(normalizedUserId, token, ttlMs);
};

export const deleteResetToken = (token, userId = null) => {
  if (!token) return;
  resetTokenStore.delete(token);
  if (userId) {
    const normalizedUserId = normalizeUserId(userId);
    if (normalizedUserId && resetTokenByUser.get(normalizedUserId) === token) {
      resetTokenByUser.delete(normalizedUserId);
    }
  }
};

export const deleteResetTokenAsync = async (token, userId = null) => {
  if (!token) return;
  await resetTokenStore.deleteAsync(token);
  if (userId) {
    const normalizedUserId = normalizeUserId(userId);
    const mappedToken =
      resetTokenByUser.get(normalizedUserId) || (await getResetTokenForUserAsync(normalizedUserId));
    if (mappedToken === token) {
      await resetTokenByUser.deleteAsync(normalizedUserId);
    }
  }
};

export const deleteResetTokensForUser = async (userId) => {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return;
  const token =
    resetTokenByUser.get(normalizedUserId) || (await getResetTokenForUserAsync(normalizedUserId));
  if (token) {
    await resetTokenStore.deleteAsync(token);
  }
  await resetTokenByUser.deleteAsync(normalizedUserId);
};
