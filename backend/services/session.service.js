import { logger } from '../config/logger.js';

// How long a locally cached session lookup may be trusted before Redis is consulted
// again. Without this the local Map shadows Redis forever, so a logout on one instance
// never takes effect on the others and revocation is impossible in a multi-instance
// deployment. Short enough to bound that window, long enough to absorb request bursts.
const DEFAULT_LOCAL_CACHE_MS = 10_000;

export const createSessionStore = ({ ttlMs = null, localCacheMs = DEFAULT_LOCAL_CACHE_MS } = {}) => {
  const store = new Map();
  // key -> timestamp after which the local copy must be re-checked against the mirror.
  const localFresh = new Map();
  let mirror = null;
  let warnedOnFallback = false;

  const markFresh = (key) => {
    if (!mirror) return;
    localFresh.set(key, Date.now() + localCacheMs);
  };

  const isFresh = (key) => {
    if (!mirror) return true; // no mirror: the local Map is the only source of truth
    const until = localFresh.get(key);
    return typeof until === 'number' && until > Date.now();
  };

  const forgetLocal = (key) => {
    store.delete(key);
    localFresh.delete(key);
  };

  // The local Map has no TTL of its own, so abandoned sessions would accumulate for the
  // lifetime of the process. Sweep anything past the idle window on a fixed cadence.
  const pruneLocal = (now = Date.now()) => {
    for (const [key, value] of store.entries()) {
      if (Number.isFinite(ttlMs) && ttlMs > 0 && Number.isFinite(value) && now - value > ttlMs) {
        forgetLocal(key);
      }
    }
    for (const [key, until] of localFresh.entries()) {
      if (until <= now && !store.has(key)) {
        localFresh.delete(key);
      }
    }
  };

  let lastPrune = 0;
  const maybePrune = () => {
    const now = Date.now();
    const interval = Number.isFinite(ttlMs) && ttlMs > 0 ? Math.max(ttlMs, 60_000) : 300_000;
    if (now - lastPrune < interval) return;
    lastPrune = now;
    pruneLocal(now);
  };

  const warnOnFallback = () => {
    if (mirror || warnedOnFallback) return;
    warnedOnFallback = true;
    logger.warn('[session-store] Redis unavailable; using in-memory session store.');
  };

  const setMirror = (nextMirror) => {
    mirror = nextMirror;
  };

  const setValue = (key, value) => {
    const normalized = normalizeValue(value);
    if (normalized === null) return null;
    store.set(key, normalized);
    return normalized;
  };

  const normalizeValue = (value) => {
    if (Number.isFinite(value)) return value;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    return parsed;
  };

  return {
    get(key) {
      warnOnFallback();
      return store.get(key);
    },
    async getAsync(key) {
      warnOnFallback();
      maybePrune();
      const local = store.get(key);
      // Only short-circuit while the local copy is still inside its freshness window.
      // Past that, Redis decides — otherwise a revoked session lives on here.
      if (local !== undefined && isFresh(key)) return local;
      if (!mirror?.get) return local !== undefined ? local : null;
      const remote = await mirror.get(key);
      const normalized = normalizeValue(remote);
      if (normalized === null) {
        if (remote !== null && remote !== undefined && mirror?.delete) {
          mirror.delete(key);
        }
        forgetLocal(key);
        return null;
      }
      store.set(key, normalized);
      markFresh(key);
      return normalized;
    },
    set(key, value) {
      warnOnFallback();
      maybePrune();
      const normalized = setValue(key, value);
      if (normalized === null) return;
      markFresh(key);
      if (mirror?.set) {
        mirror.set(key, normalized, ttlMs);
      }
    },
    async setAsync(key, value) {
      warnOnFallback();
      maybePrune();
      const normalized = setValue(key, value);
      if (normalized === null) return;
      markFresh(key);
      if (mirror?.set) {
        await mirror.set(key, normalized, ttlMs);
      }
    },
    delete(key) {
      warnOnFallback();
      forgetLocal(key);
      if (mirror?.delete) {
        mirror.delete(key);
      }
    },
    async deleteAsync(key) {
      warnOnFallback();
      forgetLocal(key);
      if (mirror?.delete) {
        await mirror.delete(key);
      }
    },
    has(key) {
      warnOnFallback();
      return store.has(key);
    },
    async hasAsync(key) {
      warnOnFallback();
      maybePrune();
      const local = store.get(key);
      if (local !== undefined && isFresh(key)) return true;
      if (!mirror?.get) return local !== undefined;
      const remote = await mirror.get(key);
      const normalized = normalizeValue(remote);
      if (normalized === null) {
        if (remote !== null && remote !== undefined && mirror?.delete) {
          mirror.delete(key);
        }
        forgetLocal(key);
        return false;
      }
      store.set(key, normalized);
      markFresh(key);
      return true;
    },
    clear() {
      warnOnFallback();
      store.clear();
      localFresh.clear();
      if (mirror?.clear) {
        mirror.clear();
      }
    },
    async clearAsync() {
      warnOnFallback();
      store.clear();
      localFresh.clear();
      if (mirror?.clear) {
        await mirror.clear();
      }
    },
    deleteByPrefix(prefix) {
      warnOnFallback();
      if (!prefix) return;
      for (const key of store.keys()) {
        if (typeof key === 'string' && key.startsWith(prefix)) {
          forgetLocal(key);
        }
      }
      if (mirror?.deleteByPrefix) {
        mirror.deleteByPrefix(prefix);
      }
    },
    async deleteByPrefixAsync(prefix) {
      warnOnFallback();
      if (!prefix) return;
      for (const key of store.keys()) {
        if (typeof key === 'string' && key.startsWith(prefix)) {
          store.delete(key);
        }
      }
      if (mirror?.deleteByPrefix) {
        await mirror.deleteByPrefix(prefix);
      }
    },
    keys() {
      warnOnFallback();
      return store.keys();
    },
    hasMirror() {
      return Boolean(mirror);
    },
    setMirror,
  };
};
