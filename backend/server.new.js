import express from 'express';
import http from 'http';
import compression from 'compression';
import { pathToFileURL } from 'url';
import swaggerUi from 'swagger-ui-express';

// Import configurations
import { ensureDatabaseUrl } from './config/database.js';
import { initAppConfig } from './config/app.js';
import { prisma, initPrismaConfig } from './config/prisma.js';

// Import middleware
import { helmetMiddleware, createCorsMiddleware } from './middleware/security.js';
import { requestIdMiddleware, requireAuth, requireAdmin } from './middleware/auth.js';
import { createRateLimitMiddleware } from './middleware/rateLimit.js';

// Import utilities
import { patchExpressAsync } from './utils/express.js';
import { isUrlTooLong } from './utils/validation.js';

// Import services
import { generateAIContent } from './services/ai.js';

// Import routes
import apiRouter from './routes/api.js';

// Initialize configurations
ensureDatabaseUrl();
const appConfig = initAppConfig();
const prismaConfig = initPrismaConfig();

// Extract commonly used config values
const {
  PORT,
  JSON_BODY_LIMIT,
  MAX_URL_LENGTH,
  RATE_LIMIT_ENABLED,
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_MS,
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

// Health Check Endpoint (Probes)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'bazi-master-backend',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Request ID middleware
app.use(requestIdMiddleware);

// URL length validation
app.use((req, res, next) => {
  if (isUrlTooLong(req)) {
    return res.status(414).json({ error: 'Request-URI Too Long' });
  }
  return next();
});

// Rate limiting
const rateLimitMiddleware = createRateLimitMiddleware({
  RATE_LIMIT_ENABLED,
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_MS,
});
app.use(rateLimitMiddleware);

// API routes
app.use('/api/v1', apiRouter);
app.use('/api', apiRouter);

// Swagger documentation (placeholder)
const openApiSpec = {}; // Will be populated later
const apiDocsGuards = IS_PRODUCTION ? [requireAuth, requireAdmin] : [];
app.get('/api-docs.json', ...apiDocsGuards, (req, res) => res.json(openApiSpec));

// Swagger UI
app.use('/api-docs', ...apiDocsGuards, swaggerUi.serve, swaggerUi.setup(openApiSpec));

// Create HTTP server
const server = http.createServer(app);

// Graceful shutdown handling
const setupGracefulShutdown = (server) => {
  const closeServer = (signal) => {
    console.log(`Received ${signal}, initiating graceful shutdown...`);

    const timeout = setTimeout(() => {
      console.error('Graceful shutdown timeout, forcing exit...');
      process.exit(1);
    }, 10000);

    timeout.unref();

    server.close(async () => {
      try {
        await prisma.$disconnect();
      } catch (error) {
        console.error('Error during Prisma disconnect:', error);
      } finally {
        clearTimeout(timeout);
        console.log('Graceful shutdown complete.');
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

    // Add config validation logic here...

    warnings.forEach((warning) => {
      console.warn(`[config] ${warning}`);
    });

    if (errors.length > 0) {
      errors.forEach((error) => {
        console.error(`[config] ${error}`);
      });
      process.exit(1);
      return;
    }

    try {
      // Initialize database tables
      // Add database initialization logic here...
    } catch (error) {
      console.error('Failed to initialize server prerequisites:', error);
    }

    const bindHost = process.env.BIND_HOST || (IS_PRODUCTION ? '0.0.0.0' : '127.0.0.1');
    server.listen(PORT, bindHost, () => {
      console.log(`BaZi Master API running on http://localhost:${PORT}`);
    });
  })();
}

// Exports for testing and external usage
export {
  app,
  server,
  prisma,
};
