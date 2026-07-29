// Must come first: installs the async-handler patch on express.Router before the route
// modules below construct their routers.
import './bootstrap/asyncRoutes.js';
import express from 'express';
import http from 'http';
import compression from 'compression';
import { pathToFileURL } from 'url';
import swaggerUi from 'swagger-ui-express';
import * as Sentry from '@sentry/node';

// Import configurations
// Health Check imports
import { getHealthSnapshot } from './services/health.service.js';
import { createMetricsHandler } from './services/metrics.service.js';
import { beginShutdown, isShuttingDown, resolveDrainMs } from './services/lifecycle.service.js';

// Import configurations
import { logger } from './config/logger.js';
import { getBaziCacheConfig, initAppConfig } from './config/app.js';
import { createRedisMirror, initRedis } from './config/redis.js';

// Import middleware
import {
  createCorsMiddleware,
  createRateLimitMiddleware,
  docsBasicAuth,
  helmetMiddleware,
  requestIdMiddleware,
  urlLengthMiddleware,
  validationMiddleware,
  globalErrorHandler,
  notFoundHandler,
} from './middleware/index.js';

// Import utilities
import { patchExpressAsync } from './utils/express.js';
import { redactSensitive } from './utils/redact.js';
// Import services
import { buildOpenApiSpec } from './services/apiSchema.service.js';
import { setBaziCacheMirror } from './services/cache.service.js';

// Import routes
import apiRouter from './routes/api.js';

// Initialize configurations
const appConfig = initAppConfig();
const { ttlMs: BAZI_CACHE_TTL_MS } = getBaziCacheConfig();
const SERVICE_NAME = 'bazi-master-backend';

// Extract commonly used config values
const {
  JSON_BODY_LIMIT,
  RATE_LIMIT_ENABLED,
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_MS,
  allowedOrigins,
  trustProxy,
  IS_PRODUCTION,
  NODE_ENV,
} = appConfig;

// Initialize Express app
const app = express();
app.disable('x-powered-by');

if (process.env.SENTRY_DSN && NODE_ENV === 'production') {
  const integrations = [];
  try {
    const { nodeProfilingIntegration } = await import('@sentry/profiling-node');
    integrations.push(nodeProfilingIntegration());
  } catch (error) {
    logger.warn({ err: error }, '[sentry] Profiling integration unavailable');
  }

  const readSampleRate = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback;
  };

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    integrations,
    // Environment and release are what let you tell staging from production and tie an
    // error to the deployment that introduced it — i.e. decide whether to roll back.
    environment: process.env.SENTRY_ENVIRONMENT || NODE_ENV,
    release: process.env.SENTRY_RELEASE || undefined,
    // These were both pinned at 1.0. Tracing every request (and profiling it) burns
    // through a small team's quota within days, after which Sentry drops events —
    // monitoring goes dark exactly when something is going wrong. Profiling also costs
    // measurable CPU, so it is off unless asked for.
    tracesSampleRate: readSampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE, 0.1),
    profilesSampleRate: readSampleRate(process.env.SENTRY_PROFILES_SAMPLE_RATE, 0),
  });
}

patchExpressAsync(app);

// Trust proxy if configured
if (trustProxy) {
  app.set('trust proxy', trustProxy);
}

// Apply middleware
app.use(helmetMiddleware);
app.use(createCorsMiddleware(allowedOrigins));
app.use(compression());
// Request ID middleware (ensure every response has a request id)
app.use(requestIdMiddleware);
app.use(express.json({ limit: JSON_BODY_LIMIT }));
app.use(validationMiddleware);

// HTTP Request Logger
import pinoHttp from 'pino-http';
// Orchestrator and load-balancer probes hit these every few seconds. Logging them
// produces thousands of lines a day that say nothing, and drowns real traffic.
// /metrics belongs here too: a scraper polls it as often as the probes, and its lines say
// nothing that the metrics themselves do not already report.
const HEALTH_PROBE_PATHS = new Set(['/live', '/health', '/metrics', '/api/health', '/api/ready']);

app.use(
  pinoHttp({
    logger,
    autoLogging: {
      ignore: (req) => HEALTH_PROBE_PATHS.has((req.url || '').split('?')[0]),
    },
    // Define a custom success message
    customSuccessMessage: function (req, res) {
      if (res.statusCode === 404) {
        return 'resource not found';
      }
      return `${req.method} completed`;
    },
    // Define a custom error message
    customErrorMessage: function (req, res) {
      return 'request errored with status code: ' + res.statusCode;
    },
    // Override attribute keys for the log object
    customAttributeKeys: {
      req: 'request',
      res: 'response',
      err: 'error',
      responseTime: 'timeTaken',
    },
    // Define which properties to include in the log
    serializers: {
      req: (req) => ({
        id: req.id,
        method: req.method,
        url: req.url,
        query: redactSensitive(req.query),
        params: redactSensitive(req.params),
      }),
      res: (res) => ({
        statusCode: res.statusCode,
      }),
    },
  })
);

// Liveness Check Endpoint (process-only)
app.get('/live', (req, res) => {
  res.status(200).json({
    service: SERVICE_NAME,
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Deep Health Check Endpoint
app.get('/health', async (req, res) => {
  if (isShuttingDown()) {
    return res.status(503).json({
      service: SERVICE_NAME,
      status: 'shutting_down',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  }

  const { checks, ok } = await getHealthSnapshot();

  if (!ok) {
    logger.warn({ checks }, 'Health check failed');
  }

  res.status(ok ? 200 : 503).json({
    service: SERVICE_NAME,
    status: ok ? 'ok' : 'degraded',
    checks,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Prometheus scrape target. Registered alongside the probes and ahead of the rate limiter
// for the same reason they are: a scraper polling on a fixed interval must not be able to
// exhaust the quota (nor be throttled into gaps in the metrics). It reuses the cached
// health snapshot, so scraping is cheap regardless of interval.
app.get('/metrics', createMetricsHandler());

// URL length validation
app.use(urlLengthMiddleware);

// Rate limiting
const rateLimitMiddleware = createRateLimitMiddleware({
  RATE_LIMIT_ENABLED,
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_MS,
  redisKeyPrefix: 'rate-limit:global:',
});
app.use(rateLimitMiddleware);

// Stricter rate limiting for AI/Calculation endpoints
const strictRateLimitMiddleware = createRateLimitMiddleware({
  RATE_LIMIT_ENABLED,
  RATE_LIMIT_MAX: Math.max(5, Math.floor(RATE_LIMIT_MAX / 5)), // 20% of global, min 5
  RATE_LIMIT_WINDOW_MS, // Same window
  redisKeyPrefix: 'rate-limit:strict:',
});

// Apply strict limits to expensive routes
app.use(
  [
    '/api/bazi/calculate',
    '/api/bazi/ai-interpret',
    '/api/bazi/full-analysis',
    '/api/tarot/ai-interpret',
    '/api/iching/ai-interpret',
  ],
  strictRateLimitMiddleware
);

// API routes
app.use('/api', apiRouter);

// OpenAPI/Swagger documentation
const openApiSpec = buildOpenApiSpec({
  baseUrl: process.env.BACKEND_BASE_URL || 'http://localhost:4000',
});
const apiDocsGuards = IS_PRODUCTION ? [docsBasicAuth] : [];
app.get('/api-docs.json', ...apiDocsGuards, (req, res) => res.json(openApiSpec));

// Swagger UI
app.use('/api-docs', ...apiDocsGuards, swaggerUi.serve, swaggerUi.setup(openApiSpec));

// 404 Handler
app.use(notFoundHandler);

// Global Error Handler
if (process.env.SENTRY_DSN && NODE_ENV === 'production') {
  Sentry.setupExpressErrorHandler(app);
}
app.use(globalErrorHandler);

// Create HTTP server
const server = http.createServer(app);

const applyServerTimeouts = (
  serverInstance,
  { env = process.env, loggerInstance = logger } = {}
) => {
  if (!serverInstance) return;

  const parseMs = (value) => {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  };

  const keepAliveTimeoutMs = parseMs(env.SERVER_KEEP_ALIVE_TIMEOUT_MS);
  const headersTimeoutMs = parseMs(env.SERVER_HEADERS_TIMEOUT_MS);
  const requestTimeoutMs = parseMs(env.SERVER_REQUEST_TIMEOUT_MS);

  if (keepAliveTimeoutMs !== null) {
    serverInstance.keepAliveTimeout = keepAliveTimeoutMs;
  }
  if (headersTimeoutMs !== null) {
    serverInstance.headersTimeout = headersTimeoutMs;
  }
  if (requestTimeoutMs !== null) {
    serverInstance.requestTimeout = requestTimeoutMs;
  }

  if (
    Number.isFinite(serverInstance.keepAliveTimeout) &&
    Number.isFinite(serverInstance.headersTimeout) &&
    serverInstance.headersTimeout <= serverInstance.keepAliveTimeout
  ) {
    serverInstance.headersTimeout = serverInstance.keepAliveTimeout + 1000;
    loggerInstance.warn(
      {
        keepAliveTimeout: serverInstance.keepAliveTimeout,
        headersTimeout: serverInstance.headersTimeout,
      },
      '[server] headersTimeout adjusted to exceed keepAliveTimeout'
    );
  }
};

applyServerTimeouts(server);

// Redis holds exactly one thing now: the shared BaZi calculation cache. It used to also
// back sessions, OAuth state, reset tokens and credential revocation, all of which were
// correctness-critical across instances. A calculation cache is not — a miss just costs
// CPU — which is why Redis is optional even in production.
const initRedisMirrors = async ({
  require = false,
  initRedisFn = initRedis,
  createRedisMirrorFn = createRedisMirror,
  setBaziCacheMirrorFn = setBaziCacheMirror,
  loggerInstance = logger,
  baziCacheTtlMs = BAZI_CACHE_TTL_MS,
} = {}) => {
  const client = await initRedisFn({ require });
  if (!client) return;
  setBaziCacheMirrorFn(
    createRedisMirrorFn(client, {
      prefix: 'bazi-cache:',
      ttlMs: baziCacheTtlMs,
    })
  );
  loggerInstance.info('[redis] bazi calculation cache mirror enabled');
};

// Graceful shutdown handling
const setupGracefulShutdown = (server, { loggerInstance = logger, processRef = process } = {}) => {
  // Local re-entrancy guard. Distinct from the shared lifecycle flag, which is what the
  // readiness probes read and which stays set for the rest of the process's life.
  let shutdownStarted = false;

  const resolveShutdownTimeout = () => {
    const raw =
      processRef.env.GRACEFUL_SHUTDOWN_TIMEOUT_MS ?? processRef.env.SHUTDOWN_TIMEOUT_MS ?? '';
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 10000;
  };

  const closeServer = (signal, err) => {
    if (shutdownStarted) return;
    shutdownStarted = true;
    // Flip readiness to 503 before anything else, so the load balancer stops routing
    // here while the socket is still open and in-flight requests can still complete.
    beginShutdown();

    if (err) {
      loggerInstance.error({ err, signal }, 'Unhandled error, initiating graceful shutdown...');
      if (!processRef.exitCode) {
        processRef.exitCode = 1;
      }
    } else {
      loggerInstance.info({ signal }, 'Received signal, initiating graceful shutdown...');
    }

    const timeoutMs = resolveShutdownTimeout();
    const drainMs = resolveDrainMs(processRef.env);
    // The budget covers the drain too, so GRACEFUL_SHUTDOWN_TIMEOUT_MS keeps meaning
    // "time allowed to finish in-flight work" rather than silently shrinking by the
    // drain period.
    const timeout = setTimeout(() => {
      loggerInstance.error('Graceful shutdown timeout, forcing exit...');
      processRef.exit(1);
    }, timeoutMs + drainMs);

    timeout.unref();

    const finalize = () => {
      clearTimeout(timeout);
      loggerInstance.info('Graceful shutdown complete.');
      processRef.exit(processRef.exitCode || 0);
    };

    const stopAccepting = () => {
      try {
        if (typeof server?.close === 'function') {
          server.close(() => {
            finalize();
          });
        } else {
          finalize();
        }
      } catch (error) {
        loggerInstance.error({ err: error }, 'Error during server close');
        finalize();
      }
    };

    if (drainMs > 0) {
      loggerInstance.info({ drainMs }, 'Readiness now failing; draining before close...');
      setTimeout(stopAccepting, drainMs);
      return;
    }

    stopAccepting();
  };

  processRef.once('SIGTERM', () => void closeServer('SIGTERM'));
  processRef.once('SIGINT', () => void closeServer('SIGINT'));
  // An uncaught exception leaves the process in an undefined state, so shutting down is
  // the honest response.
  processRef.once('uncaughtException', (error) => void closeServer('uncaughtException', error));
  // A rejected promise does not carry the same guarantee, and tearing the whole service
  // down for one bad request is a much worse outcome than one failed request. Handlers
  // are wrapped (see utils/express.js) so these should be rare — log loudly instead.
  processRef.on('unhandledRejection', (reason) => {
    loggerInstance.error({ err: reason }, 'Unhandled promise rejection');
    if (process.env.SENTRY_DSN && NODE_ENV === 'production') {
      Sentry.captureException(reason);
    }
  });
};

const parseEnabledFlag = (value, fallback = true) => {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

// The engine stores nothing and authenticates nobody, so almost everything that used to
// be a hard error here is gone with the subsystem that needed it. What remains an error is
// only what makes the deployment unsafe or unusable; the rest is a warning, because a
// service that refuses to boot over a missing nice-to-have is its own outage.
const validateProductionConfig = ({ env = process.env } = {}) => {
  const errors = [];
  const warnings = [];
  const allowLocalhostEnabled = parseEnabledFlag(env.ALLOW_LOCALHOST_PROD, false);

  // No origins at all means every cross-origin browser call is rejected. A server-to-server
  // or agent caller sends no Origin header and is unaffected, so this is a warning rather
  // than a hard stop — a headless deployment legitimately needs no origin list.
  if (!env.CORS_ALLOWED_ORIGINS) {
    warnings.push(
      'CORS_ALLOWED_ORIGINS is empty. Browser clients will be blocked; server-side and agent callers are unaffected.'
    );
  }
  if (
    !env.BACKEND_BASE_URL ||
    (!allowLocalhostEnabled && env.BACKEND_BASE_URL.includes('localhost'))
  ) {
    warnings.push('BACKEND_BASE_URL should not be localhost in production');
  }
  // Hard error: without it /api-docs answers 500 in production anyway, and finding that out
  // from a user report is worse than finding it out at boot.
  if (!env.DOCS_PASSWORD) {
    errors.push('DOCS_PASSWORD must be configured in production; /api-docs is unusable without it');
  }
  if (!env.REDIS_URL) {
    warnings.push(
      'REDIS_URL is not configured. Each instance keeps its own in-memory calculation cache; results stay correct, hit rate drops.'
    );
  }
  if (!env.METRICS_TOKEN) {
    warnings.push('METRICS_TOKEN is not configured. /metrics returns 404 in production.');
  }
  if (!env.SENTRY_DSN) {
    warnings.push('SENTRY_DSN is not configured. Monitoring and error tracking will be disabled.');
  }
  if (!env.TRUST_PROXY) {
    warnings.push(
      'TRUST_PROXY is not configured. Client IP detection and rate limiting may be incorrect behind proxies.'
    );
  }

  return { errors, warnings };
};

const startServer = async ({
  serverInstance = server,
  initRedisMirrorsFn = initRedisMirrors,
  loggerInstance = logger,
  appConfigValue = appConfig,
  processRef = process,
} = {}) => {
  setupGracefulShutdown(serverInstance, { loggerInstance, processRef });

  const errors = [];
  const warnings = [];

  if (appConfigValue.IS_PRODUCTION) {
    const result = validateProductionConfig({ env: processRef.env });
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }

  warnings.forEach((warning) => {
    loggerInstance.warn({ warning }, `[config] ${warning}`);
  });

  if (errors.length > 0) {
    errors.forEach((error) => {
      loggerInstance.error({ error }, `[config] ${error}`);
    });
    processRef.exit(1);
    return;
  }

  // Redis is a cache, so a connection failure degrades the service rather than breaking
  // it — booting anyway is the right call. Logged at error so the degradation is visible.
  try {
    await initRedisMirrorsFn({ require: false });
  } catch (error) {
    loggerInstance.error(
      { err: error },
      '[redis] Cache mirror unavailable; continuing with the per-process cache'
    );
  }

  const bindHost =
    processRef.env.BIND_HOST || (appConfigValue.IS_PRODUCTION ? '0.0.0.0' : '127.0.0.1');
  serverInstance.listen(appConfigValue.PORT, bindHost, () => {
    loggerInstance.info(`BaZi Master API running on http://${bindHost}:${appConfigValue.PORT}`);
    if (appConfigValue.IS_PRODUCTION && bindHost === '0.0.0.0') {
      loggerInstance.info('[production] Accepting connections from all interfaces');
    }
  });
};

// Startup logic
const isMain = pathToFileURL(process.argv[1] || '').href === import.meta.url;

if (NODE_ENV !== 'test' && isMain) {
  void startServer();
}

// Exports for testing and external usage
export {
  app,
  server,
  startServer,
  setupGracefulShutdown,
  initRedisMirrors,
  validateProductionConfig,
};
