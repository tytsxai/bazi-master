/**
 * Process lifecycle state, shared between the shutdown handler and the readiness probes.
 *
 * Closing the listening socket the instant SIGTERM arrives is the default behaviour and
 * it is wrong behind a load balancer: the balancer only learns the instance is gone when
 * a health probe fails or a connection is refused, and every request it routes in the
 * meantime becomes a 502. The fix is to fail readiness *first*, give the balancer a
 * moment to notice, and only then stop accepting connections.
 *
 * Kept in its own module so `routes/api.js` can read the flag without importing
 * `server.js` (which would start the server as a side effect).
 */

let shuttingDown = false;

export const isShuttingDown = () => shuttingDown;

export const beginShutdown = () => {
  shuttingDown = true;
};

/** Test-only: restore the initial state between cases. */
export const resetLifecycle = () => {
  shuttingDown = false;
};

/**
 * How long to keep serving traffic after readiness starts failing.
 *
 * Must be longer than the load balancer's probe interval times its failure threshold,
 * and shorter than the orchestrator's stop grace period (30s in docker-compose.prod.yml)
 * or the process gets SIGKILLed mid-drain. Off outside production, where the delay is
 * just a slow Ctrl-C.
 */
export const resolveDrainMs = (env = process.env) => {
  const raw = env.SHUTDOWN_DRAIN_MS;
  if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return env.NODE_ENV === 'production' ? 5000 : 0;
};
