// The AI guard used to key on the authenticated user id. With no user system left, the
// caller's address is the only identity we have — good enough to stop one client from
// holding several expensive upstream calls open at once, which is all this guard is for.
// A caller behind a shared NAT can still starve its peers; the rate limiter, not this
// guard, is what bounds overall cost.
export const resolveClientKey = (req) =>
  req?.ip || req?.socket?.remoteAddress || req?.connection?.remoteAddress || null;

export const createAiGuard = (initial = new Set()) => {
  const inFlight = initial;
  return {
    acquire(clientKey) {
      if (!clientKey) return () => {};
      if (inFlight.has(clientKey)) return null;
      inFlight.add(clientKey);
      return () => {
        inFlight.delete(clientKey);
      };
    },
    has(clientKey) {
      return clientKey ? inFlight.has(clientKey) : false;
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
