export const createAiGuard = (initial = new Set()) => {
  const inFlight = initial;
  return {
    acquire(userId) {
      if (!userId) return () => {};
      if (inFlight.has(userId)) return null;
      inFlight.add(userId);
      return () => {
        inFlight.delete(userId);
      };
    },
    has(userId) {
      return userId ? inFlight.has(userId) : false;
    },
    size() {
      return inFlight.size;
    },
  };
};

export const createInFlightDeduper = (initial = new Map()) => {
  const inFlight = initial;
  let missingKeyQueue = Promise.resolve();
  return {
    getOrCreate(key, factory) {
      if (!key) {
        const promise = missingKeyQueue.then(factory);
        missingKeyQueue = promise.catch(() => {});
        return { promise, isNew: true };
      }
      const existing = inFlight.get(key);
      if (existing) {
        return { promise: existing, isNew: false };
      }
      const promise = factory();
      inFlight.set(key, promise);
      return { promise, isNew: true };
    },
    clear(key) {
      if (key) {
        inFlight.delete(key);
      }
    },
    has(key) {
      return key ? inFlight.has(key) : false;
    },
    size() {
      return inFlight.size;
    },
  };
};
