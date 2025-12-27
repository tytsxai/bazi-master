import express from 'express';
import http from 'http';
import compression from 'compression';
import { pathToFileURL } from 'url';
import swaggerUi from 'swagger-ui-express';

// Import configurations
// Health Check imports
import { checkDatabase, checkRedis } from './services/health.service.js';

// Import configurations
import { logger } from './config/logger.js';
import { ensureDatabaseUrl } from './config/database.js';
import { getBaziCacheConfig, initAppConfig } from './config/app.js';
import { prisma, initPrismaConfig } from './config/prisma.js';
import { createRedisMirror, initRedis } from './config/redis.js';

// Import middleware
import {
  createCorsMiddleware,
  createRateLimitMiddleware,
  helmetMiddleware,
  requestIdMiddleware,
  requireAdmin,
  requireAuth,
  urlLengthMiddleware,
  globalErrorHandler,
  notFoundHandler,
} from './middleware/index.js';
import { sessionStore, docsBasicAuth } from './middleware/auth.js';

// Import utilities
import { patchExpressAsync } from './utils/express.js';
// Import services
import { buildOpenApiSpec } from './services/apiSchema.service.js';
import { setBaziCacheMirror } from './services/cache.service.js';

// Import routes
import apiRouter from './routes/api.js';

// Initialize configurations
ensureDatabaseUrl();
const appConfig = initAppConfig();
const prismaConfig = initPrismaConfig();
const { ttlMs: BAZI_CACHE_TTL_MS } = getBaziCacheConfig();
const SERVICE_NAME = 'bazi-master-backend';

// Extract commonly used config values
const {
  PORT,
  JSON_BODY_LIMIT,
  MAX_URL_LENGTH,
  RATE_LIMIT_ENABLED,
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_MS,
  SESSION_IDLE_MS,
  allowedOrigins,
  trustProxy,
  IS_PRODUCTION,
  NODE_ENV,
} = appConfig;

const { IS_SQLITE, IS_POSTGRES } = prismaConfig;

// Initialize Express app
const app = express();
patchExpressAsync(app);

// Trust proxy if configured
if (trustProxy) {
  app.set('trust proxy', trustProxy);
}

// Apply middleware
app.use(helmetMiddleware);
app.use(createCorsMiddleware(allowedOrigins));
app.use(compression());
app.use(express.json({ limit: JSON_BODY_LIMIT }));

// Request ID middleware
app.use(requestIdMiddleware);

// HTTP Request Logger
import pinoHttp from 'pino-http';
app.use(pinoHttp({
  logger,
  // Define a custom success message
  customSuccessMessage: function (req, res) {
    if (res.statusCode === 404) {
      return 'resource not found';
    }
    return `${req.method} completed`;
  },
  // Define a custom error message
  customErrorMessage: function (req, res, err) {
    return 'request errored with status code: ' + res.statusCode;
  },
  // Override attribute keys for the log object
  customAttributeKeys: {
    req: 'request',
    res: 'response',
    err: 'error',
    responseTime: 'timeTaken'
  },
  // Define which properties to include in the log
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      query: req.query,
      params: req.params,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
}));

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
app.use(['/api/bazi/calculate', '/api/bazi/ai-interpret', '/api/bazi/full-analysis', '/api/tarot/ai-interpret'], strictRateLimitMiddleware);

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
app.use(globalErrorHandler);

// Create HTTP server
const server = http.createServer(app);

// Initialize WebSocket Server
import { initWebsocketServer } from './services/websocket.service.js';
if (NODE_ENV !== 'test') {
  initWebsocketServer(server);
}

const initRedisMirrors = async ({
  require = IS_PRODUCTION,
  initRedisFn = initRedis,
  createRedisMirrorFn = createRedisMirror,
  sessionStoreRef = sessionStore,
  setBaziCacheMirrorFn = setBaziCacheMirror,
  loggerInstance = logger,
  sessionIdleMs = SESSION_IDLE_MS,
  baziCacheTtlMs = BAZI_CACHE_TTL_MS,
} = {}) => {
  const client = await initRedisFn({ require });
  if (!client) return;
  sessionStoreRef.setMirror(createRedisMirrorFn(client, {
    prefix: 'session:',
    ttlMs: sessionIdleMs,
  }));
  setBaziCacheMirrorFn(createRedisMirrorFn(client, {
    prefix: 'bazi-cache:',
    ttlMs: baziCacheTtlMs,
  }));
  loggerInstance.info('[redis] session and bazi cache mirrors enabled');
};

// Graceful shutdown handling
const setupGracefulShutdown = (server, {
  loggerInstance = logger,
  prismaClient = prisma,
  processRef = process,
} = {}) => {
  const closeServer = (signal) => {
    loggerInstance.info({ signal }, 'Received signal, initiating graceful shutdown...');

    const timeoutMs = parseInt(processRef.env.GRACEFUL_SHUTDOWN_TIMEOUT_MS, 10) || 10000;
    const timeout = setTimeout(() => {
      loggerInstance.error('Graceful shutdown timeout, forcing exit...');
      processRef.exit(1);
    }, timeoutMs);

    timeout.unref();

    server.close(async () => {
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
    });
  };

  processRef.once('SIGTERM', () => void closeServer('SIGTERM'));
  processRef.once('SIGINT', () => void closeServer('SIGINT'));
};

const validateProductionConfig = ({ env = process.env } = {}) => {
  const errors = [];
  const warnings = [];

  if (!env.SESSION_TOKEN_SECRET || env.SESSION_TOKEN_SECRET.length < 32) {
    errors.push('SESSION_TOKEN_SECRET must be at least 32 characters in production');
  }
  if (!env.DATABASE_URL?.includes('postgresql')) {
    errors.push('DATABASE_URL must be PostgreSQL in production');
  }
  if (!env.REDIS_URL) {
    errors.push('REDIS_URL must be configured in production to ensure consistent sessions/caching across instances.');
  }
  if (!env.FRONTEND_URL || env.FRONTEND_URL.includes('localhost')) {
    warnings.push('FRONTEND_URL should not be localhost in production');
  }
  if (!env.BACKEND_BASE_URL || env.BACKEND_BASE_URL.includes('localhost')) {
    warnings.push('BACKEND_BASE_URL should not be localhost in production');
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

  const bindHost = processRef.env.BIND_HOST || (appConfigValue.IS_PRODUCTION ? '0.0.0.0' : '127.0.0.1');
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
