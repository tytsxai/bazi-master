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
    delete(key) {
      warnOnFallback();
      store.delete(key);
      if (mirror?.delete) {
        mirror.delete(key);
      }
    },
    clear() {
      warnOnFallback();
      store.clear();
      if (mirror?.clear) {
        mirror.clear();
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

export const setResetTokenMirrors = ({
  tokenMirror = null,
  userMirror = null,
} = {}) => {
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
    resetTokenStore.delete(token);
    return null;
  }
  if (isExpiredEntry(normalized)) {
    resetTokenStore.delete(token);
    return null;
  }
  resetTokenStore.setLocal(token, normalized);
  if (!resetTokenByUser.get(normalized.userId)) {
    resetTokenByUser.setLocal(normalized.userId, token);
  }
  return normalized;
};

export const getResetTokenForUserAsync = async (userId) => {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return null;
  const local = resetTokenByUser.get(normalizedUserId);
  if (local) return local;
  if (!resetTokenByUser.getMirror()?.get) return null;
  const remote = await resetTokenByUser.getAsync(String(normalizedUserId));
  if (typeof remote !== 'string' || !remote) {
    resetTokenByUser.delete(normalizedUserId);
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
    resetTokenStore.delete(existingToken);
  }

  const entry = { userId: normalizedUserId, expiresAt: normalizeExpiresAt(expiresAt) };
  resetTokenStore.set(token, entry, ttlMs);
  resetTokenByUser.set(normalizedUserId, token, ttlMs);
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

export const deleteResetTokensForUser = async (userId) => {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return;
  const token =
    resetTokenByUser.get(normalizedUserId) || (await getResetTokenForUserAsync(normalizedUserId));
  if (token) {
    resetTokenStore.delete(token);
  }
  resetTokenByUser.delete(normalizedUserId);
};
