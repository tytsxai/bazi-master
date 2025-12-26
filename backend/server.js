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
import { sessionStore } from './middleware/auth.js';

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
});
app.use(rateLimitMiddleware);

// API routes
app.use('/api', apiRouter);

// OpenAPI/Swagger documentation
const openApiSpec = buildOpenApiSpec({
  baseUrl: process.env.BACKEND_BASE_URL || 'http://localhost:4000',
});
const apiDocsGuards = IS_PRODUCTION ? [requireAuth, requireAdmin] : [];
app.get('/api-docs.json', ...apiDocsGuards, (req, res) => res.json(openApiSpec));

// Swagger UI
app.use('/api-docs', ...apiDocsGuards, swaggerUi.serve, swaggerUi.setup(openApiSpec));

// 404 Handler
app.use(notFoundHandler);

// Global Error Handler
app.use(globalErrorHandler);

// Create HTTP server
const server = http.createServer(app);

const initRedisMirrors = async () => {
  const client = await initRedis({ require: IS_PRODUCTION });
  if (!client) return;
  sessionStore.setMirror(createRedisMirror(client, {
    prefix: 'session:',
    ttlMs: SESSION_IDLE_MS,
  }));
  setBaziCacheMirror(createRedisMirror(client, {
    prefix: 'bazi-cache:',
    ttlMs: BAZI_CACHE_TTL_MS,
  }));
  logger.info('[redis] session and bazi cache mirrors enabled');
};

// Graceful shutdown handling
const setupGracefulShutdown = (server) => {
  const closeServer = (signal) => {
    logger.info({ signal }, `Received signal, initiating graceful shutdown...`);

    const timeoutMs = parseInt(process.env.GRACEFUL_SHUTDOWN_TIMEOUT_MS, 10) || 10000;
    const timeout = setTimeout(() => {
      logger.error('Graceful shutdown timeout, forcing exit...');
      process.exit(1);
    }, timeoutMs);

    timeout.unref();

    server.close(async () => {
      try {
        await prisma.$disconnect();
        logger.info('Prisma disconnected.');
      } catch (error) {
        logger.error({ err: error }, 'Error during Prisma disconnect');
      } finally {
        clearTimeout(timeout);
        logger.info('Graceful shutdown complete.');
        process.exit(process.exitCode || 0);
      }
    });
  };

  process.once('SIGTERM', () => void closeServer('SIGTERM'));
  process.once('SIGINT', () => void closeServer('SIGINT'));
};

// Startup logic
const isMain = pathToFileURL(process.argv[1] || '').href === import.meta.url;

if (NODE_ENV !== 'test' && isMain) {
  void (async () => {
    setupGracefulShutdown(server);

    // Validate production config
    const errors = [];
    const warnings = [];

    if (IS_PRODUCTION) {
      if (!process.env.SESSION_TOKEN_SECRET || process.env.SESSION_TOKEN_SECRET.length < 32) {
        errors.push('SESSION_TOKEN_SECRET must be at least 32 characters in production');
      }
      if (!process.env.DATABASE_URL?.includes('postgresql')) {
        errors.push('DATABASE_URL must be PostgreSQL in production');
      }
      if (!process.env.REDIS_URL) {
        errors.push('REDIS_URL must be configured in production to ensure consistent sessions/caching across instances.');
      }
      if (!process.env.FRONTEND_URL || process.env.FRONTEND_URL.includes('localhost')) {
        warnings.push('FRONTEND_URL should not be localhost in production');
      }
      if (!process.env.BACKEND_BASE_URL || process.env.BACKEND_BASE_URL.includes('localhost')) {
        warnings.push('BACKEND_BASE_URL should not be localhost in production');
      }
    }

    warnings.forEach((warning) => {
      logger.warn({ warning }, `[config] ${warning}`);
    });

    if (errors.length > 0) {
      errors.forEach((error) => {
        logger.error({ error }, `[config] ${error}`);
      });
      process.exit(1);
      return;
    }

    try {
      // Test database connection
      await prisma.$connect();
      logger.info('[db] Database connection established');
    } catch (error) {
      logger.fatal({ err: error }, '[db] Failed to connect to database');
      process.exit(1);
    }

    try {
      await initRedisMirrors();
    } catch (error) {
      logger.fatal({ err: error }, '[redis] Failed to connect to Redis');
      process.exit(1);
    }

    const bindHost = process.env.BIND_HOST || (IS_PRODUCTION ? '0.0.0.0' : '127.0.0.1');
    server.listen(PORT, bindHost, () => {
      logger.info(`BaZi Master API running on http://${bindHost}:${PORT}`);
      if (IS_PRODUCTION && bindHost === '0.0.0.0') {
        logger.info(`[production] Accepting connections from all interfaces`);
      }
    });
  })();
}

// Exports for testing and external usage
export {
  app,
  server,
  prisma,
};
