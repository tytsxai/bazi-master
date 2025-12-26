export const createSessionStore = ({ ttlMs = null } = {}) => {
  const store = new Map();
  let mirror = null;
  let warnedOnFallback = false;

  const warnOnFallback = () => {
    if (mirror || warnedOnFallback) return;
    warnedOnFallback = true;
    console.warn('[session-store] Redis unavailable; using in-memory session store.');
  };

  const setMirror = (nextMirror) => {
    mirror = nextMirror;
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
      const local = store.get(key);
      if (local !== undefined) return local;
      if (!mirror?.get) return null;
      const remote = await mirror.get(key);
      const normalized = normalizeValue(remote);
      if (normalized === null) {
        if (remote !== null && remote !== undefined && mirror?.delete) {
          mirror.delete(key);
        }
        return null;
      }
      store.set(key, normalized);
      return normalized;
    },
    set(key, value) {
      warnOnFallback();
      const normalized = normalizeValue(value);
      if (normalized === null) return;
      store.set(key, normalized);
      if (mirror?.set) {
        mirror.set(key, normalized, ttlMs);
      }
    },
    delete(key) {
      warnOnFallback();
      store.delete(key);
      if (mirror?.delete) {
        mirror.delete(key);
      }
    },
    has(key) {
      warnOnFallback();
      return store.has(key);
    },
    async hasAsync(key) {
      warnOnFallback();
      const local = store.get(key);
      if (local !== undefined) return true;
      if (!mirror?.get) return false;
      const remote = await mirror.get(key);
      const normalized = normalizeValue(remote);
      if (normalized === null) {
        if (remote !== null && remote !== undefined && mirror?.delete) {
          mirror.delete(key);
        }
        return false;
      }
      store.set(key, normalized);
      return true;
    },
    clear() {
      warnOnFallback();
      store.clear();
      if (mirror?.clear) {
        mirror.clear();
      }
    },
    deleteByPrefix(prefix) {
      warnOnFallback();
      if (!prefix) return;
      for (const key of store.keys()) {
        if (typeof key === 'string' && key.startsWith(prefix)) {
          store.delete(key);
        }
      }
      if (mirror?.deleteByPrefix) {
        mirror.deleteByPrefix(prefix);
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
