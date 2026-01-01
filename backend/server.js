import express from 'express';
import http from 'http';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { pathToFileURL } from 'url';
import swaggerUi from 'swagger-ui-express';
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

// Import configurations
// Health Check imports
import { checkDatabase, checkRedis } from './services/health.service.js';

// Import configurations
import { logger } from './config/logger.js';
import { ensureDatabaseUrl } from './config/database.js';
import { getBaziCacheConfig, getServerConfig, initAppConfig } from './config/app.js';
import { prisma } from './config/prisma.js';
import { createRedisMirror, initRedis } from './config/redis.js';

// Import middleware
import {
  createCorsMiddleware,
  createRateLimitMiddleware,
  helmetMiddleware,
  requestIdMiddleware,
  urlLengthMiddleware,
  validationMiddleware,
  globalErrorHandler,
  notFoundHandler,
} from './middleware/index.js';
import { sessionStore, docsBasicAuth } from './middleware/auth.js';

// Import utilities
import { patchExpressAsync } from './utils/express.js';
import { redactSensitive } from './utils/redact.js';
// Import services
import { buildOpenApiSpec } from './services/apiSchema.service.js';
import { setBaziCacheMirror } from './services/cache.service.js';
import { setResetTokenMirrors } from './services/resetTokens.service.js';
import { OAUTH_STATE_TTL_MS, setOauthStateMirror } from './services/oauth.service.js';

// Import routes
import apiRouter from './routes/api.js';

// Initialize configurations
ensureDatabaseUrl();
const appConfig = initAppConfig();
const { ttlMs: BAZI_CACHE_TTL_MS } = getBaziCacheConfig();
const SERVICE_NAME = 'bazi-master-backend';

// Extract commonly used config values
const {
  JSON_BODY_LIMIT,
  RATE_LIMIT_ENABLED,
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_MS,
  SESSION_IDLE_MS,
  allowedOrigins,
  trustProxy,
  IS_PRODUCTION,
  NODE_ENV,
} = appConfig;

// Initialize Express app
const app = express();
app.disable('x-powered-by');

if (process.env.SENTRY_DSN && NODE_ENV === 'production') {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    integrations: [nodeProfilingIntegration()],
    // Performance Monitoring
    tracesSampleRate: 1.0, //  Capture 100% of the transactions
    // Set sampling rate for profiling - this is relative to tracesSampleRate
    profilesSampleRate: 1.0,
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
app.use(cookieParser());
// Request ID middleware (ensure every response has a request id)
app.use(requestIdMiddleware);
app.use(express.json({ limit: JSON_BODY_LIMIT }));
app.use(validationMiddleware);

// HTTP Request Logger
import pinoHttp from 'pino-http';
app.use(
  pinoHttp({
    logger,
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
  const [db, redis] = await Promise.all([checkDatabase(), checkRedis()]);
  const ok = db.ok && (redis.ok || redis.status === 'disabled');

  if (!ok) {
    logger.warn({ checks: { db, redis } }, 'Health check failed');
  }

  res.status(ok ? 200 : 503).json({
    service: SERVICE_NAME,
    status: ok ? 'ok' : 'degraded',
    checks: { db, redis },
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

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

const applyServerTimeouts = (serverInstance, { env = process.env, loggerInstance = logger } = {}) => {
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

// Initialize WebSocket Server
import { initWebsocketServer, closeWebsocketServer } from './services/websocket.service.js';
if (NODE_ENV !== 'test') {
  initWebsocketServer(server);
}

const initRedisMirrors = async ({
  require = IS_PRODUCTION,
  initRedisFn = initRedis,
  createRedisMirrorFn = createRedisMirror,
  sessionStoreRef = sessionStore,
  setBaziCacheMirrorFn = setBaziCacheMirror,
  setResetTokenMirrorsFn = setResetTokenMirrors,
  setOauthStateMirrorFn = setOauthStateMirror,
  loggerInstance = logger,
  sessionIdleMs = SESSION_IDLE_MS,
  baziCacheTtlMs = BAZI_CACHE_TTL_MS,
  resetTokenTtlMs = getServerConfig().resetTokenTtlMs,
  oauthStateTtlMs = OAUTH_STATE_TTL_MS,
} = {}) => {
  const client = await initRedisFn({ require });
  if (!client) return;
  sessionStoreRef.setMirror(
    createRedisMirrorFn(client, {
      prefix: 'session:',
      ttlMs: sessionIdleMs,
    })
  );
  setBaziCacheMirrorFn(
    createRedisMirrorFn(client, {
      prefix: 'bazi-cache:',
      ttlMs: baziCacheTtlMs,
    })
  );
  setResetTokenMirrorsFn({
    tokenMirror: createRedisMirrorFn(client, {
      prefix: 'reset-token:',
      ttlMs: resetTokenTtlMs,
    }),
    userMirror: createRedisMirrorFn(client, {
      prefix: 'reset-token-user:',
      ttlMs: resetTokenTtlMs,
    }),
  });
  setOauthStateMirrorFn(
    createRedisMirrorFn(client, {
      prefix: 'oauth-state:',
      ttlMs: oauthStateTtlMs,
    })
  );
  loggerInstance.info('[redis] session, bazi cache, oauth state, reset tokens mirrors enabled');
};

// Graceful shutdown handling
const setupGracefulShutdown = (
  server,
  {
    loggerInstance = logger,
    prismaClient = prisma,
    processRef = process,
    closeWebsocketServerFn = closeWebsocketServer,
  } = {}
) => {
  let isShuttingDown = false;

  const resolveShutdownTimeout = () => {
    const raw =
      processRef.env.GRACEFUL_SHUTDOWN_TIMEOUT_MS ?? processRef.env.SHUTDOWN_TIMEOUT_MS ?? '';
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 10000;
  };

  const closeServer = (signal, err) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    if (err) {
      loggerInstance.error({ err, signal }, 'Unhandled error, initiating graceful shutdown...');
      if (!processRef.exitCode) {
        processRef.exitCode = 1;
      }
    } else {
      loggerInstance.info({ signal }, 'Received signal, initiating graceful shutdown...');
    }

    const timeoutMs = resolveShutdownTimeout();
    const timeout = setTimeout(() => {
      loggerInstance.error('Graceful shutdown timeout, forcing exit...');
      processRef.exit(1);
    }, timeoutMs);

    timeout.unref();

    const finalize = async () => {
      try {
        await prismaClient.$disconnect();
        loggerInstance.info('Prisma disconnected.');
      } catch (error) {
        loggerInstance.error({ err: error }, 'Error during Prisma disconnect');
      } finally {
        clearTimeout(timeout);
        loggerInstance.info('Graceful shutdown complete.');
        processRef.exit(processRef.exitCode || 0);
      }
    };

    try {
      if (typeof closeWebsocketServerFn === 'function') {
        closeWebsocketServerFn({ loggerInstance });
      }
    } catch (error) {
      loggerInstance.error({ err: error }, '[ws] Failed to shutdown WebSocket server');
    }

    try {
      if (typeof server?.close === 'function') {
        server.close(() => {
          void finalize();
        });
      } else {
        void finalize();
      }
    } catch (error) {
      loggerInstance.error({ err: error }, 'Error during server close');
      void finalize();
    }
  };

  processRef.once('SIGTERM', () => void closeServer('SIGTERM'));
  processRef.once('SIGINT', () => void closeServer('SIGINT'));
  processRef.once('uncaughtException', (error) => void closeServer('uncaughtException', error));
  processRef.once('unhandledRejection', (reason) => void closeServer('unhandledRejection', reason));
};

const validateProductionConfig = ({ env = process.env } = {}) => {
  const errors = [];
  const warnings = [];
  const allowDevOauthRaw = typeof env.ALLOW_DEV_OAUTH === 'string' ? env.ALLOW_DEV_OAUTH : '';
  const allowDevOauthEnabled =
    allowDevOauthRaw.trim().toLowerCase() === '1' ||
    allowDevOauthRaw.trim().toLowerCase() === 'true';
  const allowLocalhostRaw =
    typeof env.ALLOW_LOCALHOST_PROD === 'string' ? env.ALLOW_LOCALHOST_PROD : '';
  const allowLocalhostEnabled =
    allowLocalhostRaw.trim().toLowerCase() === '1' ||
    allowLocalhostRaw.trim().toLowerCase() === 'true';
  const passwordResetEnabledRaw =
    typeof env.PASSWORD_RESET_ENABLED === 'string' ? env.PASSWORD_RESET_ENABLED : '';
  const passwordResetEnabled =
    passwordResetEnabledRaw === '' ? true : passwordResetEnabledRaw.trim().toLowerCase() !== 'false';

  if (!env.SESSION_TOKEN_SECRET || env.SESSION_TOKEN_SECRET.length < 32) {
    errors.push('SESSION_TOKEN_SECRET must be at least 32 characters in production');
  }
  if (
    !env.DATABASE_URL ||
    (!env.DATABASE_URL.startsWith('postgresql://') && !env.DATABASE_URL.startsWith('postgres://'))
  ) {
    errors.push('DATABASE_URL must be PostgreSQL in production');
  }
  if (!env.REDIS_URL) {
    errors.push(
      'REDIS_URL must be configured in production to ensure consistent sessions/caching across instances.'
    );
  }
  if (!env.FRONTEND_URL || (!allowLocalhostEnabled && env.FRONTEND_URL.includes('localhost'))) {
    warnings.push('FRONTEND_URL should not be localhost in production');
  }
  if (!env.BACKEND_BASE_URL || (!allowLocalhostEnabled && env.BACKEND_BASE_URL.includes('localhost'))) {
    warnings.push('BACKEND_BASE_URL should not be localhost in production');
  }
  if (!env.ADMIN_EMAILS) {
    warnings.push('ADMIN_EMAILS is empty. Admin endpoints will be inaccessible.');
  }
  if (!env.DOCS_PASSWORD) {
    warnings.push('DOCS_PASSWORD is not configured. /api-docs will return 500 in production.');
  }
  if (!env.SENTRY_DSN) {
    warnings.push('SENTRY_DSN is not configured. Monitoring and error tracking will be disabled.');
  }
  if (allowDevOauthEnabled) {
    errors.push('ALLOW_DEV_OAUTH must be false in production');
  }
  if (passwordResetEnabled && (!env.SMTP_HOST || !env.SMTP_FROM)) {
    errors.push('SMTP_HOST and SMTP_FROM must be configured when password reset is enabled');
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
  prismaClient = prisma,
  initRedisMirrorsFn = initRedisMirrors,
  loggerInstance = logger,
  appConfigValue = appConfig,
  processRef = process,
} = {}) => {
  setupGracefulShutdown(serverInstance, { loggerInstance, prismaClient, processRef });

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

  try {
    await prismaClient.$connect();
    loggerInstance.info('[db] Database connection established');
  } catch (error) {
    loggerInstance.fatal({ err: error }, '[db] Failed to connect to database');
    processRef.exit(1);
    return;
  }

  try {
    await initRedisMirrorsFn({ require: appConfigValue.IS_PRODUCTION });
  } catch (error) {
    loggerInstance.fatal({ err: error }, '[redis] Failed to connect to Redis');
    processRef.exit(1);
    return;
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
  prisma,
  startServer,
  setupGracefulShutdown,
  initRedisMirrors,
  validateProductionConfig,
};
