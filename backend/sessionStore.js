export const createSessionStore = ({ ttlMs = null } = {}) => {
  const store = new Map();
  let mirror = null;

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
      return store.get(key);
    },
    async getAsync(key) {
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
      const normalized = normalizeValue(value);
      if (normalized === null) return;
      store.set(key, normalized);
      if (mirror?.set) {
        mirror.set(key, normalized, ttlMs);
      }
    },
    delete(key) {
      store.delete(key);
      if (mirror?.delete) {
        mirror.delete(key);
      }
    },
    has(key) {
      return store.has(key);
    },
    async hasAsync(key) {
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
      store.clear();
      if (mirror?.clear) {
        mirror.clear();
      }
    },
    deleteByPrefix(prefix) {
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
      return store.keys();
    },
    hasMirror() {
      return Boolean(mirror);
    },
    setMirror,
  };
};
