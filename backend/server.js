import express from 'express';
import http from 'http';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import { pathToFileURL, fileURLToPath } from 'url';
import swaggerUi from 'swagger-ui-express';
import { PrismaClient, Prisma } from '@prisma/client';
import { Solar } from 'lunar-javascript';
import { drawTarot, getTarotSpreadConfig } from './tarot.js';
import tarotDeck from './data/tarotData.js';
import { hexagrams } from './data/ichingHexagrams.js';
import {
  pickTrigram,
  buildHexagram,
  applyChangingLines,
  deriveChangingLinesFromNumbers,
  deriveChangingLinesFromTimeContext,
} from './iching.js';
import { calculateRisingSign } from './zodiac.js';
import { resolveLocationCoordinates, computeTrueSolarTime, listKnownLocations } from './solarTime.js';
import { validateBaziInput } from './validation.js';
import { buildSearchOr, parseSearchTerms, recordMatchesQuery } from './search.js';
import { createAiGuard, createInFlightDeduper } from './lib/concurrency.js';
import {
  buildBaziCacheKey,
  buildFiveElementsPercent,
  getCachedBaziCalculation,
  getCachedBaziCalculationAsync,
  invalidateBaziCalculationCache,
  normalizeBaziResult,
  primeBaziCalculationCache,
  setBaziCacheEntry,
  setBaziCacheMirror,
} from './baziCache.js';
import { normalizePageNumber, normalizePageSize } from './pagination.js';
import { createAuthorizeToken, createRequireAuth, requireAdmin } from './auth.js';
import {
  formatTimezoneOffset,
  parseTimezoneOffsetMinutes,
  buildBirthTimeMeta,
} from './timezone.js';
import { getServerConfig, getSessionConfig } from './env.js';
import { initRedis, createRedisMirror } from './redis.js';
import { createSessionStore } from './sessionStore.js';
import { cleanupUserInMemory, deleteUserCascade } from './userCleanup.js';
import { deleteBaziRecordHard } from './recordCleanup.js';
import { hashPassword, isHashedPassword, verifyPassword } from './passwords.js';

const readPrismaDatasourceInfo = () => {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const schemaPath = path.resolve(here, '..', 'prisma', 'schema.prisma');
    const raw = fs.readFileSync(schemaPath, 'utf8');
    const datasourceMatch = raw.match(/datasource\s+db\s*{([\s\S]*?)\n}\s*/m);
    const block = datasourceMatch?.[1] ?? '';
    const provider = (block.match(/\bprovider\s*=\s*"([^"]+)"/)?.[1] ?? '')
      .trim()
      .toLowerCase();
    const urlExpr = (block.match(/\burl\s*=\s*([^\n\r]+)/)?.[1] ?? '').trim();
    const urlUsesDatabaseUrlEnv = /env\(\s*"DATABASE_URL"\s*\)/.test(urlExpr);
    return { provider, urlUsesDatabaseUrlEnv };
  } catch {
    return { provider: '', urlUsesDatabaseUrlEnv: false };
  }
};

const PRISMA_DATASOURCE = readPrismaDatasourceInfo();
const PRISMA_PROVIDER = PRISMA_DATASOURCE.provider;
const PRISMA_URL_USES_DATABASE_URL_ENV = PRISMA_DATASOURCE.urlUsesDatabaseUrlEnv;

const ensureDatabaseUrl = () => {
  if (process.env.DATABASE_URL) return;
  const nodeEnv = process.env.NODE_ENV || '';
  if (nodeEnv === 'production') return;

  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const sqlitePath = path.resolve(here, '..', 'prisma', 'dev.db');
    process.env.DATABASE_URL = `file:${sqlitePath}`;
  } catch {
    process.env.DATABASE_URL = 'file:./dev.db';
  }
};

ensureDatabaseUrl();

const prisma = new PrismaClient();
const app = express();
app.disable('x-powered-by');
const { sessionIdleMs: SESSION_IDLE_MS } = getSessionConfig();
const {
  port: PORT,
  jsonBodyLimit: JSON_BODY_LIMIT,
  maxUrlLength: MAX_URL_LENGTH,
  rateLimitWindowMs: RATE_LIMIT_WINDOW_MS,
  rateLimitMax: RATE_LIMIT_MAX,
  aiProvider: AI_PROVIDER,
  openaiApiKey: OPENAI_API_KEY,
  anthropicApiKey: ANTHROPIC_API_KEY,
  openaiModel: OPENAI_MODEL,
  anthropicModel: ANTHROPIC_MODEL,
  aiMaxTokens: AI_MAX_TOKENS,
  aiTimeoutMs: AI_TIMEOUT_MS,
  availableProviders: AVAILABLE_PROVIDERS,
  resetTokenTtlMs: RESET_TOKEN_TTL_MS,
  resetRequestMinDurationMs: RESET_REQUEST_MIN_DURATION_MS,
  googleClientId: GOOGLE_CLIENT_ID,
  googleClientSecret: GOOGLE_CLIENT_SECRET,
  googleRedirectUri: GOOGLE_REDIRECT_URI,
  frontendUrl: FRONTEND_URL,
  adminEmails: ADMIN_EMAILS,
  wechatAppId: WECHAT_APP_ID,
  wechatAppSecret: WECHAT_APP_SECRET,
  wechatScope: WECHAT_SCOPE,
  wechatFrontendUrl: WECHAT_FRONTEND_URL,
  wechatRedirectUri: WECHAT_REDIRECT_URI,
  openApiBaseUrl: OPENAPI_BASE_URL,
  importBatchSize: IMPORT_BATCH_SIZE,
  shutdownTimeoutMs: SHUTDOWN_TIMEOUT_MS,
  corsAllowedOrigins: CORS_ALLOWED_ORIGINS,
  nodeEnv: NODE_ENV,
} = getServerConfig();

const IS_PRODUCTION = NODE_ENV === 'production';
const DATABASE_URL = process.env.DATABASE_URL || '';
const IS_SQLITE = PRISMA_PROVIDER
  ? PRISMA_PROVIDER === 'sqlite'
  : (!DATABASE_URL || DATABASE_URL.startsWith('file:') || DATABASE_URL.includes('sqlite'));
const STRIP_SEARCH_MODE = IS_SQLITE;

const parseTrustProxy = (raw) => {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw === 'number') return raw;
  const value = String(raw).trim().toLowerCase();
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === '1') return 1;
  if (value === '0') return 0;
  const asNumber = Number(value);
  if (Number.isFinite(asNumber)) return asNumber;
  return null;
};

const trustProxy = parseTrustProxy(process.env.TRUST_PROXY);
if (trustProxy !== null) {
  app.set('trust proxy', trustProxy);
} else if (IS_PRODUCTION) {
  app.set('trust proxy', 1);
}

const applySqlitePragmas = async () => {
  if (!IS_SQLITE) return;
  try {
    await prisma.$queryRawUnsafe('PRAGMA journal_mode=WAL;');
    await prisma.$queryRawUnsafe('PRAGMA busy_timeout=5000;');
  } catch (error) {
    console.error('Failed to apply SQLite pragmas:', error);
  }
};

void applySqlitePragmas();
const RATE_LIMIT_ENABLED =
  IS_PRODUCTION || process.env.FORCE_RATE_LIMIT === 'true';
const AI_GUARD_ENABLED =
  IS_PRODUCTION || process.env.FORCE_AI_GUARD === 'true';

const registerProcessHandlers = () => {
  const triggerFatal = (label, payload) => {
    console.error(`[process] ${label}:`, payload);
    if (!IS_PRODUCTION) return;
    process.exitCode = 1;
    try {
      process.kill(process.pid, 'SIGTERM');
    } catch {
      process.exit(1);
    }
  };

  process.on('unhandledRejection', (reason) => {
    triggerFatal('unhandledRejection', reason);
  });
  process.on('uncaughtException', (error) => {
    triggerFatal('uncaughtException', error);
  });
};

registerProcessHandlers();

const stripInsensitiveMode = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => stripInsensitiveMode(item));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).reduce((acc, [key, val]) => {
      if (key === 'mode') return acc;
      acc[key] = stripInsensitiveMode(val);
      return acc;
    }, {});
  }
  return value;
};

const normalizePrismaWhere = (where) =>
  STRIP_SEARCH_MODE ? stripInsensitiveMode(where) : where;

const normalizeOrigin = (value) => {
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    if (url.hostname === '127.0.0.1' || url.hostname === '::1') {
      url.hostname = 'localhost';
    }
    return url.origin;
  } catch {
    return trimmed.replace(/\/+$/, '');
  }
};
const expandLoopbackOrigins = (origin) => {
  if (!origin) return [];
  try {
    const url = new URL(origin);
    const variants = new Set([normalizeOrigin(origin)]);
    const hostnames = new Set([url.hostname, 'localhost', '127.0.0.1', '::1']);
    hostnames.forEach((hostname) => {
      const variant = new URL(origin);
      variant.hostname = hostname;
      variants.add(normalizeOrigin(variant.origin));
    });
    return Array.from(variants).filter(Boolean);
  } catch {
    return [normalizeOrigin(origin)];
  }
};
const parseOriginList = (value) => {
  if (!value || typeof value !== 'string') return [];
  return value
    .split(',')
    .map((origin) => normalizeOrigin(origin))
    .filter(Boolean);
};
const baseFrontendOrigin = normalizeOrigin(FRONTEND_URL);
const wechatFrontendOrigin = normalizeOrigin(WECHAT_FRONTEND_URL);
const allowedOrigins = new Set([
  ...parseOriginList(CORS_ALLOWED_ORIGINS),
  ...expandLoopbackOrigins(baseFrontendOrigin),
  ...expandLoopbackOrigins(wechatFrontendOrigin),
].filter(Boolean));
const isLocalDevOrigin = (origin) => {
  const normalized = normalizeOrigin(origin);
  return (
    normalized.startsWith('http://localhost:')
    || normalized.startsWith('https://localhost:')
  );
};
const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (origin === 'null') return NODE_ENV !== 'production';
  const normalized = normalizeOrigin(origin);
  if (allowedOrigins.has(normalized)) return true;
  if (NODE_ENV !== 'production' && isLocalDevOrigin(origin)) return true;
  return false;
};

const isLocalUrl = (value) => {
  if (!value || typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return (
      url.hostname === 'localhost'
      || url.hostname === '127.0.0.1'
      || url.hostname === '::1'
    );
  } catch {
    return false;
  }
};

const validateProductionConfig = () => {
  if (!IS_PRODUCTION) return { errors: [], warnings: [] };
  const errors = [];
  const warnings = [];

  if (!PRISMA_PROVIDER) {
    warnings.push('Unable to detect Prisma datasource provider from prisma/schema.prisma; DB safety checks may be incomplete.');
  }
  if (!PRISMA_URL_USES_DATABASE_URL_ENV) {
    errors.push('Prisma schema must use url = env("DATABASE_URL") in production to avoid accidental hardcoded DB paths.');
  }
  if (!DATABASE_URL) {
    errors.push('DATABASE_URL is required in production.');
  }

  if (PRISMA_PROVIDER === 'sqlite') {
    if (process.env.ALLOW_SQLITE_PROD !== 'true') {
      errors.push('SQLite detected in production. Set ALLOW_SQLITE_PROD=true to override (single instance + strict backups), or switch Prisma schema to PostgreSQL before go-live.');
    }
    if (DATABASE_URL && !DATABASE_URL.startsWith('file:') && !DATABASE_URL.includes('sqlite')) {
      errors.push('DATABASE_URL must be a SQLite file URL (file:...) when Prisma provider is sqlite.');
    }
  }

  if (PRISMA_PROVIDER === 'postgresql') {
    if (process.env.ALLOW_SQLITE_PROD === 'true') {
      warnings.push('ALLOW_SQLITE_PROD=true is set but Prisma provider is postgresql; remove the override for production.');
    }
    if (DATABASE_URL && !/^postgres(ql)?:\/\//i.test(DATABASE_URL)) {
      errors.push('DATABASE_URL must be a PostgreSQL URL (postgres:// or postgresql://) when Prisma provider is postgresql.');
    }
  }
  if (!FRONTEND_URL || isLocalUrl(FRONTEND_URL)) {
    errors.push('FRONTEND_URL must be a non-localhost URL in production.');
  }
  if (!process.env.BACKEND_BASE_URL || isLocalUrl(process.env.BACKEND_BASE_URL)) {
    errors.push('BACKEND_BASE_URL must be a non-localhost URL in production.');
  }
  if (!process.env.REDIS_URL) {
    warnings.push('REDIS_URL is not set; sessions and caches will not be shared across instances.');
  }
  if (ADMIN_EMAILS.size === 0) {
    warnings.push('ADMIN_EMAILS is empty; admin-only endpoints will be inaccessible.');
  }
  if (ADMIN_EMAILS.has('admin@example.com')) {
    warnings.push('ADMIN_EMAILS contains admin@example.com; remove for production.');
  }
  if ((GOOGLE_CLIENT_ID && !GOOGLE_CLIENT_SECRET) || (!GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET)) {
    warnings.push('Google OAuth config is incomplete; enable both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
  }
  if ((WECHAT_APP_ID && !WECHAT_APP_SECRET) || (!WECHAT_APP_ID && WECHAT_APP_SECRET)) {
    warnings.push('WeChat OAuth config is incomplete; enable both WECHAT_APP_ID and WECHAT_APP_SECRET.');
  }

  return { errors, warnings };
};

const ensureSoftDeleteTables = async () => {
  if (IS_PRODUCTION || !IS_SQLITE || process.env.ALLOW_RUNTIME_SCHEMA_SYNC === 'false') return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS BaziRecordTrash (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      recordId INTEGER NOT NULL,
      deletedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(userId, recordId)
    );
  `);
};

const ensureSoftDeleteReady = (() => {
  let ready = null;
  return async () => {
    if (!ready) {
      ready = ensureSoftDeleteTables().catch((error) => {
        console.error('Failed to ensure soft delete tables:', error);
        throw error;
      });
    }
    return ready;
  };
})();

const fetchDeletedRecordIds = async (userId) => {
  await ensureSoftDeleteReady();
  const rows = await prisma.$queryRaw`SELECT recordId FROM BaziRecordTrash WHERE userId = ${userId}`;
  return rows.map((row) => row.recordId);
};

const isRecordSoftDeleted = async (userId, recordId) => {
  try {
    await ensureSoftDeleteReady();
    const rows = await prisma.$queryRaw`
      SELECT 1 as existsFlag FROM BaziRecordTrash WHERE userId = ${userId} AND recordId = ${recordId} LIMIT 1
    `;
    return rows.length > 0;
  } catch (error) {
    console.error('Soft delete check failed:', error);
    return false;
  }
};

app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      return callback(null, true);
    }
    const error = new Error('Not allowed by CORS');
    error.statusCode = 403;
    return callback(error);
    error.status = 403;
    return callback(error);
  },
  credentials: true,
}));
app.use(compression());
app.use(express.json({ limit: JSON_BODY_LIMIT }));

void ensureSoftDeleteReady().catch((error) => {
  console.error('Failed to initialize soft delete tables:', error);
});

const REQUEST_ID_HEADER = 'x-request-id';

const getRequestId = (req) => {
  const headerValue = req.headers[REQUEST_ID_HEADER];
  if (typeof headerValue === 'string' && headerValue.trim() !== '') {
    return headerValue.trim();
  }
  if (Array.isArray(headerValue) && headerValue.length > 0 && headerValue[0].trim() !== '') {
    return headerValue[0].trim();
  }
  return crypto.randomUUID();
};

app.use((req, res, next) => {
  const requestId = getRequestId(req);
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
});

const isUrlTooLong = (req) => {
  const url = req?.originalUrl || req?.url || '';
  return url.length > MAX_URL_LENGTH;
};

app.use((req, res, next) => {
  if (isUrlTooLong(req)) {
    return res.status(414).json({ error: 'Request-URI Too Long' });
  }
  return next();
});

const rateLimitStore = new Map();
const deletedClientIndex = new Map();
const clientRecordIndex = new Map();
let lastRateLimitCleanup = 0;
const maybeCleanupRateLimitStore = (now) => {
  if (!RATE_LIMIT_ENABLED) return;
  if (!Number.isFinite(RATE_LIMIT_WINDOW_MS) || RATE_LIMIT_WINDOW_MS <= 0) return;
  if (now - lastRateLimitCleanup < RATE_LIMIT_WINDOW_MS * 2) return;
  lastRateLimitCleanup = now;
  for (const [key, entry] of rateLimitStore.entries()) {
    if (!entry || now >= entry.resetAt) {
      rateLimitStore.delete(key);
    }
  }
};

const getRateLimitKey = (req) => {
  const trustProxyEnabled = Boolean(req.app?.get('trust proxy'));
  if (trustProxyEnabled && Array.isArray(req.ips) && req.ips.length > 0) {
    return req.ips[0];
  }
  return req.ip || req.connection?.remoteAddress || 'unknown';
};

const isLocalAddress = (value) => {
  if (!value || typeof value !== 'string') return false;
  if (value === '::1' || value === '127.0.0.1' || value === 'localhost') return true;
  if (value.startsWith('127.')) return true;
  if (value.startsWith('::ffff:127.')) return true;
  return false;
};

const normalizeClientId = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

const extractClientId = (req) => {
  if (!req) return '';
  const headerValue = req.headers?.['x-client-id'];
  if (typeof headerValue === 'string' && headerValue.trim()) {
    return normalizeClientId(headerValue);
  }
  const queryValue = req.query?.clientId;
  if (typeof queryValue === 'string' && queryValue.trim()) {
    return normalizeClientId(queryValue);
  }
  const bodyValue = req.body?.clientId;
  if (typeof bodyValue === 'string' && bodyValue.trim()) {
    return normalizeClientId(bodyValue);
  }
  return '';
};

const getClientDeletedSet = (userId, clientId) => {
  if (!userId || !clientId) return null;
  const userMap = deletedClientIndex.get(userId);
  if (!userMap) return null;
  return userMap.get(clientId) || null;
};

const getClientRecordSet = (userId, clientId) => {
  if (!userId || !clientId) return null;
  const userMap = clientRecordIndex.get(userId);
  if (!userMap) return null;
  return userMap.get(clientId) || null;
};

const trackClientDeletedRecords = (userId, clientId, recordIds) => {
  if (!userId || !clientId || !recordIds?.length) return;
  let userMap = deletedClientIndex.get(userId);
  if (!userMap) {
    userMap = new Map();
    deletedClientIndex.set(userId, userMap);
  }
  let recordSet = userMap.get(clientId);
  if (!recordSet) {
    recordSet = new Set();
    userMap.set(clientId, recordSet);
  }
  recordIds.forEach((id) => recordSet.add(id));
};

const trackClientRecords = (userId, clientId, recordIds) => {
  if (!userId || !clientId || !recordIds?.length) return;
  let userMap = clientRecordIndex.get(userId);
  if (!userMap) {
    userMap = new Map();
    clientRecordIndex.set(userId, userMap);
  }
  let recordSet = userMap.get(clientId);
  if (!recordSet) {
    recordSet = new Set();
    userMap.set(clientId, recordSet);
  }
  recordIds.forEach((id) => recordSet.add(id));
};

const removeClientDeletedRecord = (userId, clientId, recordId) => {
  if (!userId || !clientId || !recordId) return;
  const recordSet = getClientDeletedSet(userId, clientId);
  if (!recordSet) return;
  recordSet.delete(recordId);
  if (recordSet.size === 0) {
    const userMap = deletedClientIndex.get(userId);
    if (userMap) {
      userMap.delete(clientId);
      if (userMap.size === 0) {
        deletedClientIndex.delete(userId);
      }
    }
  }
};

const removeClientRecord = (userId, clientId, recordId) => {
  if (!userId || !clientId || !recordId) return;
  const recordSet = getClientRecordSet(userId, clientId);
  if (!recordSet) return;
  recordSet.delete(recordId);
  if (recordSet.size === 0) {
    const userMap = clientRecordIndex.get(userId);
    if (userMap) {
      userMap.delete(clientId);
      if (userMap.size === 0) {
        clientRecordIndex.delete(userId);
      }
    }
  }
};

const CLIENT_DELETE_SCOPE_ENABLED = NODE_ENV !== 'production';

app.use((req, res, next) => {
  if (!RATE_LIMIT_ENABLED) {
    return next();
  }
  if (!Number.isFinite(RATE_LIMIT_WINDOW_MS) || RATE_LIMIT_WINDOW_MS <= 0) {
    return next();
  }
  if (!Number.isFinite(RATE_LIMIT_MAX) || RATE_LIMIT_MAX <= 0) {
    return next();
  }

  const now = Date.now();
  maybeCleanupRateLimitStore(now);
  const key = getRateLimitKey(req);
  if (isLocalAddress(key)) {
    return next();
  }
  const entry = rateLimitStore.get(key);

  if (!entry || now >= entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return next();
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
    res.setHeader('Retry-After', String(retryAfterSeconds));
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  entry.count += 1;
  return next();
});

app.use((req, res, next) => {
  const startTime = process.hrtime.bigint();
  const timestamp = new Date().toISOString();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startTime) / 1e6;
    const url = req?.originalUrl || req?.url || '';
    console.log(
      `[${timestamp}] ${req.method} ${url} ${res.statusCode} ${durationMs.toFixed(1)}ms id=${req.requestId}`
    );
  });
  next();
});

// --- AI Provider Settings ---
const AI_CONCURRENCY_ERROR = 'AI request already in progress. Please wait.';
const aiGuard = createAiGuard();
const acquireAiGuard = AI_GUARD_ENABLED ? aiGuard.acquire : () => () => { };
const baziSubmitDeduper = createInFlightDeduper();
const baziCalculationDeduper = createInFlightDeduper();
const baziFullAnalysisDeduper = createInFlightDeduper();

const fetchWithTimeout = async (url, options, timeoutMs = AI_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeout);
  }
};

const ensureMinDuration = async (startedAtMs, minDurationMs) => {
  if (!Number.isFinite(minDurationMs) || minDurationMs <= 0) return;
  const elapsed = Date.now() - startedAtMs;
  if (elapsed >= minDurationMs) return;
  await new Promise((resolve) => setTimeout(resolve, minDurationMs - elapsed));
};

const WS_PATH = '/ws/ai';
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const WS_MAX_PAYLOAD = 1_000_000;

const buildWsAcceptKey = (key) => {
  return crypto.createHash('sha1').update(`${key}${WS_GUID}`).digest('base64');
};

const encodeWsFrame = (data, opcode = 0x1) => {
  const payload = Buffer.from(data);
  const payloadLength = payload.length;
  let header = null;

  if (payloadLength < 126) {
    header = Buffer.alloc(2);
    header[1] = payloadLength;
  } else if (payloadLength < 65536) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(payloadLength, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(payloadLength), 2);
  }

  header[0] = 0x80 | (opcode & 0x0f);
  return Buffer.concat([header, payload]);
};

const decodeWsFrames = (buffer) => {
  const frames = [];
  let offset = 0;

  while (buffer.length - offset >= 2) {
    const byte1 = buffer[offset];
    const byte2 = buffer[offset + 1];
    const fin = (byte1 & 0x80) !== 0;
    const opcode = byte1 & 0x0f;
    const masked = (byte2 & 0x80) !== 0;
    let payloadLength = byte2 & 0x7f;
    let headerLength = 2;

    if (payloadLength === 126) {
      if (buffer.length - offset < 4) break;
      payloadLength = buffer.readUInt16BE(offset + 2);
      headerLength = 4;
    } else if (payloadLength === 127) {
      if (buffer.length - offset < 10) break;
      const length64 = buffer.readBigUInt64BE(offset + 2);
      payloadLength = Number(length64);
      headerLength = 10;
    }

    const maskOffset = headerLength;
    const fullHeader = masked ? headerLength + 4 : headerLength;
    if (buffer.length - offset < fullHeader + payloadLength) break;

    const payloadStart = offset + fullHeader;
    const payload = buffer.slice(payloadStart, payloadStart + payloadLength);
    let unmaskedPayload = payload;

    if (masked) {
      const mask = buffer.slice(offset + maskOffset, offset + maskOffset + 4);
      unmaskedPayload = Buffer.alloc(payloadLength);
      for (let i = 0; i < payloadLength; i += 1) {
        unmaskedPayload[i] = payload[i] ^ mask[i % 4];
      }
    }

    frames.push({ fin, opcode, payload: unmaskedPayload });
    offset = payloadStart + payloadLength;
  }

  return { frames, remainder: buffer.slice(offset) };
};

const sendWsJson = (socket, data) => {
  if (!socket.writable) return;
  const payload = JSON.stringify(data);
  socket.write(encodeWsFrame(payload));
};

const callOpenAI = async ({ system, user }) => {
  if (!OPENAI_API_KEY) throw new Error('OpenAI API key not configured');
  const res = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.7,
      max_tokens: AI_MAX_TOKENS,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI error: ${res.status} ${errText}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content?.trim();
};

const callOpenAIStream = async ({ system, user, onChunk }) => {
  if (!OPENAI_API_KEY) throw new Error('OpenAI API key not configured');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.7,
      max_tokens: AI_MAX_TOKENS,
      stream: true,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI error: ${res.status} ${errText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let finished = false;

  while (!finished) {
    const { done, value } = await reader.read();
    if (done) {
      finished = true;
      break;
    }
    const chunk = decoder.decode(value);
    const lines = chunk.split('\n').filter(line => line.trim() !== '');
    for (const line of lines) {
      if (line === 'data: [DONE]') {
        finished = true;
        break;
      }
      if (line.startsWith('data: ')) {
        try {
          const json = JSON.parse(line.substring(6));
          const content = json.choices[0]?.delta?.content;
          if (content) {
            onChunk(content);
          }
        } catch (e) {
          // ignore parsing errors
        }
      }
    }
  }
};

const callAnthropic = async ({ system, user }) => {
  if (!ANTHROPIC_API_KEY) throw new Error('Anthropic API key not configured');
  const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: AI_MAX_TOKENS,
      temperature: 0.7,
      system,
      messages: [{ role: 'user', content: user }]
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic error: ${res.status} ${errText}`);
  }
  const data = await res.json();
  const contentBlock = Array.isArray(data?.content) ? data.content[0]?.text : null;
  return contentBlock?.trim();
};

const callAnthropicStream = async ({ system, user, onChunk }) => {
  if (!ANTHROPIC_API_KEY) throw new Error('Anthropic API key not configured');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: AI_MAX_TOKENS,
      temperature: 0.7,
      system,
      stream: true,
      messages: [{ role: 'user', content: user }]
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic error: ${res.status} ${errText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let finished = false;

  while (!finished) {
    const { done, value } = await reader.read();
    if (done) {
      finished = true;
      break;
    }
    const chunk = decoder.decode(value);
    const lines = chunk.split('\n').filter(line => line.trim() !== '');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const json = JSON.parse(line.substring(6));
          if (json.type === 'content_block_delta' && json.delta?.text) {
            onChunk(json.delta.text);
          }
          if (json.type === 'message_stop') {
            finished = true;
            break;
          }
        } catch (e) {
          // ignore parsing errors
        }
      }
    }
  }
};

const normalizeProviderName = (value) =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

const resolveAiProvider = (requestedProvider) => {
  const normalized = normalizeProviderName(requestedProvider);
  const provider = normalized || AI_PROVIDER;
  const providerMeta = AVAILABLE_PROVIDERS.find((item) => item.name === provider);
  if (!providerMeta) {
    throw new Error('Unknown AI provider.');
  }
  if (!providerMeta.enabled) {
    throw new Error('Requested AI provider is not available.');
  }
  return provider;
};

const generateAIContent = async ({ system, user, fallback, provider, onChunk }) => {
  const resolvedProvider = resolveAiProvider(provider);
  if (resolvedProvider === 'mock') {
    const content = fallback();
    if (onChunk) {
      const words = content.split(' ');
      for (let i = 0; i < words.length; i++) {
        onChunk(words[i] + (i === words.length - 1 ? '' : ' '));
        await new Promise(r => setTimeout(r, 15));
      }
      return content;
    }
    return content;
  }
  try {
    if (resolvedProvider === 'openai') {
      if (onChunk) {
        let full = '';
        await callOpenAIStream({
          system, user, onChunk: (c) => {
            full += c;
            onChunk(c);
          }
        });
        return full;
      }
      return await callOpenAI({ system, user });
    }
    if (resolvedProvider === 'anthropic') {
      if (onChunk) {
        let full = '';
        await callAnthropicStream({
          system, user, onChunk: (c) => {
            full += c;
            onChunk(c);
          }
        });
        return full;
      }
      return await callAnthropic({ system, user });
    }
  } catch (error) {
    console.error('AI provider error:', error);
  }
  const fb = fallback();
  if (onChunk) onChunk(fb);
  return fb;
};

const buildBaziPrompt = ({ pillars, fiveElements, tenGods, luckCycles, strength }) => {
  const elementLines = fiveElements
    ? Object.entries(fiveElements).map(([key, value]) => `- ${key}: ${value}`).join('\n')
    : '- Not provided';
  const tenGodLines = Array.isArray(tenGods)
    ? tenGods
      .filter((tg) => tg?.strength > 0)
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 5)
      .map((tg) => `- ${tg.name}: ${tg.strength}`)
      .join('\n')
    : '- Not provided';
  const luckLines = Array.isArray(luckCycles)
    ? luckCycles.map((cycle) => `- ${cycle.range}: ${cycle.stem}${cycle.branch}`).join('\n')
    : '- Not provided';

  const system = 'You are a seasoned BaZi practitioner. Provide a concise, grounded interpretation in Markdown with sections: Summary, Key Patterns, Advice. Keep under 220 words.';
  const user = `
Day Master: ${pillars?.day?.stem || 'Unknown'} (${pillars?.day?.elementStem || 'Unknown'})
Month Pillar: ${pillars?.month?.stem || 'Unknown'} ${pillars?.month?.branch || 'Unknown'} (${pillars?.month?.elementBranch || 'Unknown'})
Five Elements:
${elementLines}
Ten Gods (top):
${tenGodLines}
Luck Cycles:
${luckLines}
Strength Notes: ${strength || 'Not provided'}
  `.trim();

  const fallback = () => {
    const summary = `A ${pillars?.day?.elementStem || 'balanced'} Day Master chart with notable elemental distribution.`;
    const patterns = tenGodLines;
    const advice = 'Focus on balancing elements that are lower in count and lean into favorable cycles.';
    return `
## 🔮 BaZi Insight
**Summary:** ${summary}

**Key Patterns:**
${patterns}

**Advice:**
${advice}
    `.trim();
  };

  return { system, user, fallback };
};

const buildZiweiPrompt = ({ chart, birth }) => {
  const lunar = chart?.lunar || {};
  const mingPalace = chart?.mingPalace || {};
  const shenPalace = chart?.shenPalace || {};
  const transformations = Array.isArray(chart?.fourTransformations)
    ? chart.fourTransformations
      .map((item) => `${item.type?.toUpperCase?.() || item.type} ${item.starCn || item.starName || item.starKey}`)
      .filter(Boolean)
      .slice(0, 6)
      .join(', ')
    : 'None';
  const mingStars = Array.isArray(mingPalace?.stars?.major)
    ? mingPalace.stars.major.map((star) => star.cn || star.name || star.key).filter(Boolean).join(', ')
    : '';
  const shenStars = Array.isArray(shenPalace?.stars?.major)
    ? shenPalace.stars.major.map((star) => star.cn || star.name || star.key).filter(Boolean).join(', ')
    : '';

  const system = 'You are a Zi Wei Dou Shu interpreter. Provide a concise interpretation in Markdown with sections: Overview, Key Palaces, Transformations, Guidance. Keep under 220 words.';
  const user = `
Birth: ${birth?.birthYear || '?'}-${birth?.birthMonth || '?'}-${birth?.birthDay || '?'} ${birth?.birthHour ?? '?'}h
Gender: ${birth?.gender || 'Unknown'}
Lunar: ${lunar.year || '?'}年 ${lunar.month || '?'}月 ${lunar.day || '?'}日 ${lunar.isLeap ? '(Leap)' : ''}
Ming Palace: ${mingPalace?.palace?.cn || mingPalace?.palace?.name || 'Unknown'} · ${mingPalace?.branch?.name || 'Unknown'}
Ming Major Stars: ${mingStars || 'None'}
Shen Palace: ${shenPalace?.palace?.cn || shenPalace?.palace?.name || 'Unknown'} · ${shenPalace?.branch?.name || 'Unknown'}
Shen Major Stars: ${shenStars || 'None'}
Four Transformations: ${transformations}
  `.trim();
  const fallback = () => {
    const overview = 'Your chart highlights distinct strengths rooted in the Ming and Shen palaces, with transformations signaling key growth themes.';
    const keyPalaces = 'Focus on the Ming palace qualities and how the Shen palace supports your life direction.';
    const transformationsText = 'Notice where your chart emphasizes momentum or restraint.';
    const guidance = 'Align daily decisions with the strongest palace energies and lean into balanced actions.';
    return `
## 🌌 Zi Wei Interpretation
**Overview:** ${overview}

**Key Palaces:** ${keyPalaces}

**Transformations:** ${transformationsText}

**Guidance:** ${guidance}
    `.trim();
  };

  return { system, user, fallback };
};

const ensureUserSettingsTable = async () => {
  if (!ALLOW_RUNTIME_SCHEMA_SYNC) return;
  try {
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS UserSettings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL UNIQUE,
        locale TEXT,
        preferences TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
  } catch (error) {
    console.error('Failed to ensure UserSettings table:', error);
  }
};

const ensureZiweiHistoryTable = async () => {
  if (!ALLOW_RUNTIME_SCHEMA_SYNC) return;
  try {
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS ZiweiRecord (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        birthYear INTEGER NOT NULL,
        birthMonth INTEGER NOT NULL,
        birthDay INTEGER NOT NULL,
        birthHour INTEGER NOT NULL,
        gender TEXT NOT NULL,
        chart TEXT NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
  } catch (error) {
    console.error('Failed to ensure ZiweiRecord table:', error);
  }
};

const ensureBaziRecordUpdatedAt = async () => {
  if (!ALLOW_RUNTIME_SCHEMA_SYNC) return;
  try {
    const columns = await prisma.$queryRawUnsafe('PRAGMA table_info(BaziRecord);');
    const hasUpdatedAt = Array.isArray(columns)
      && columns.some((column) => column?.name === 'updatedAt');
    if (hasUpdatedAt) return;

    await prisma.$executeRawUnsafe(
      'ALTER TABLE BaziRecord ADD COLUMN updatedAt DATETIME'
    );
    await prisma.$executeRawUnsafe(
      'UPDATE BaziRecord SET updatedAt = createdAt WHERE updatedAt IS NULL'
    );
  } catch (error) {
    console.error('Failed to ensure BaziRecord updatedAt column:', error);
  }
};

const ensureDefaultUser = async () => {
  const email = 'test@example.com';
  const password = 'password123';
  const name = 'Test User';
  if (!SHOULD_SEED_DEFAULT_USER) return;
  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (!existing) {
      const hashed = await hashPassword(password);
      if (!hashed) return;
      await prisma.user.create({ data: { email, password: hashed, name } });
      return;
    }
    const passwordMatches = await verifyPassword(password, existing.password);
    if (!passwordMatches || existing.name !== name || !isHashedPassword(existing.password)) {
      const hashed = await hashPassword(password);
      if (!hashed) return;
      await prisma.user.update({ where: { email }, data: { password: hashed, name } });
    }
  } catch (error) {
    console.error('Failed to ensure default user:', error);
  }
};

const parsePreferences = (raw) => {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const buildSettingsEtag = (row) => {
  if (!row?.updatedAt) return null;
  return `W/"${row.updatedAt}"`;
};

const parseIfMatchHeader = (headerValue) => {
  if (!headerValue || typeof headerValue !== 'string') return null;
  const token = headerValue.split(',')[0].trim();
  if (!token) return null;
  if (token === '*') return '*';
  if (token.startsWith('W/"') && token.endsWith('"')) {
    return token.slice(3, -1);
  }
  if (token.startsWith('"') && token.endsWith('"')) {
    return token.slice(1, -1);
  }
  return token;
};

const buildTrueSolarMeta = (payload, timeMeta) => {
  if (!payload) return null;
  const location = resolveLocationCoordinates(payload.birthLocation);
  if (!location) {
    return {
      applied: false,
      location: null,
      correctionMinutes: null,
      corrected: null,
      correctedIso: null,
    };
  }
  const resolvedOffset = Number.isFinite(timeMeta?.timezoneOffsetMinutes)
    ? timeMeta.timezoneOffsetMinutes
    : parseTimezoneOffsetMinutes(payload.timezoneOffsetMinutes ?? payload.timezone);
  const trueSolar = computeTrueSolarTime({
    birthYear: payload.birthYear,
    birthMonth: payload.birthMonth,
    birthDay: payload.birthDay,
    birthHour: payload.birthHour,
    birthMinute: payload.birthMinute,
    timezoneOffsetMinutes: resolvedOffset,
    longitude: location.longitude,
  });
  if (!trueSolar) {
    return {
      applied: false,
      location,
      correctionMinutes: null,
      corrected: null,
      correctedIso: null,
    };
  }
  return {
    applied: true,
    location,
    correctionMinutes: trueSolar.correctionMinutes,
    corrected: trueSolar.corrected,
    correctedIso: trueSolar.correctedDate.toISOString(),
  };
};

const resolveBaziCalculationInput = (payload) => {
  const timeMeta = buildBirthTimeMeta(payload);
  const trueSolarMeta = buildTrueSolarMeta(payload, timeMeta);
  if (trueSolarMeta?.applied && trueSolarMeta?.corrected) {
    const { year, month, day, hour } = trueSolarMeta.corrected;
    return {
      calculationPayload: {
        ...payload,
        birthYear: year,
        birthMonth: month,
        birthDay: day,
        birthHour: hour,
      },
      timeMeta,
      trueSolarMeta,
    };
  }
  return { calculationPayload: payload, timeMeta, trueSolarMeta };
};

const buildBaziCalculationKey = (payload, userId = null) => {
  if (!payload) return null;
  const birthLocation =
    typeof payload.birthLocation === 'string' ? payload.birthLocation.trim() : '';
  const timezone = typeof payload.timezone === 'string' ? payload.timezone.trim() : '';
  const gender =
    typeof payload.gender === 'string' ? payload.gender.trim().toLowerCase() : '';
  const timezoneOffsetMinutes = Number.isFinite(payload.timezoneOffsetMinutes)
    ? payload.timezoneOffsetMinutes
    : null;
  const keyPayload = {
    userId: userId ?? null,
    birthYear: payload.birthYear,
    birthMonth: payload.birthMonth,
    birthDay: payload.birthDay,
    birthHour: payload.birthHour,
    gender,
    birthLocation,
    timezone,
    timezoneOffsetMinutes,
  };
  const hash = crypto.createHash('sha256').update(JSON.stringify(keyPayload)).digest('hex');
  return userId ? `${userId}:${hash}` : `calc:${hash}`;
};

const buildBaziSubmitKey = (userId, payload) => {
  if (!userId || !payload) return null;
  return buildBaziCalculationKey(payload, userId);
};

// --- Mappings & Constants ---
const ALLOW_RUNTIME_SCHEMA_SYNC =
  !IS_PRODUCTION && IS_SQLITE && process.env.ALLOW_RUNTIME_SCHEMA_SYNC !== 'false';
const SHOULD_SEED_DEFAULT_USER =
  !IS_PRODUCTION && process.env.SEED_DEFAULT_USER !== 'false';
const PASSWORD_RESET_DEBUG_LOG =
  !IS_PRODUCTION && process.env.PASSWORD_RESET_DEBUG_LOG !== 'false';
const sessionStore = createSessionStore({ ttlMs: SESSION_IDLE_MS });
const createSessionToken = (userId) => {
  const issuedAt = Date.now();
  const nonce = crypto.randomBytes(16).toString('hex');
  return `token_${userId}_${issuedAt}_${nonce}`;
};
const resetTokenStore = new Map();
const resetTokenByUser = new Map();
const cleanupUserMemory = (userId) => {
  cleanupUserInMemory(userId, {
    sessionStore,
    resetTokenStore,
    resetTokenByUser,
    deletedClientIndex,
    clientRecordIndex,
  });
};
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const oauthStateStore = new Map();
const WECHAT_STATE_TTL_MS = 10 * 60 * 1000;
const wechatStateStore = new Map();
const pruneOauthStateStore = (now = Date.now()) => {
  for (const [key, entry] of oauthStateStore.entries()) {
    if (!entry?.createdAt || now - entry.createdAt > OAUTH_STATE_TTL_MS) {
      oauthStateStore.delete(key);
    }
  }
};
const pruneResetTokenStore = (now = Date.now()) => {
  for (const [token, entry] of resetTokenStore.entries()) {
    if (!entry?.expiresAt || now > entry.expiresAt) {
      resetTokenStore.delete(token);
      if (resetTokenByUser.get(entry?.userId) === token) {
        resetTokenByUser.delete(entry.userId);
      }
    }
  }
};

const initializeRedisMirrors = async () => {
  const client = await initRedis();
  if (!client) return;
  const sessionMirror = createRedisMirror(client, { prefix: 'session:' });
  sessionStore.setMirror(sessionMirror);
  const baziMirror = createRedisMirror(client, { prefix: 'bazi:calc:' });
  setBaziCacheMirror(baziMirror);
};
void initializeRedisMirrors();

const sanitizeNextPath = (raw) => {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith('/')) return null;
  if (trimmed.startsWith('//') || trimmed.startsWith('/\\')) return null;
  return trimmed;
};

const buildOauthState = (nextPath) => {
  pruneOauthStateStore();
  const state = crypto.randomBytes(24).toString('hex');
  oauthStateStore.set(state, { createdAt: Date.now(), nextPath });
  return state;
};

const consumeOauthState = (state) => {
  const entry = oauthStateStore.get(state);
  if (!entry) return null;
  oauthStateStore.delete(state);
  if (Date.now() - entry.createdAt > OAUTH_STATE_TTL_MS) return null;
  return entry;
};

const buildOauthRedirectUrl = ({ token, user, nextPath, error }) => {
  const redirectUrl = new URL('/login', FRONTEND_URL);
  const hashParams = new URLSearchParams();

  if (token) {
    hashParams.set('token', token);
  }
  if (user) {
    const encodedUser = Buffer.from(JSON.stringify(user)).toString('base64url');
    hashParams.set('user', encodedUser);
  }
  if (nextPath) redirectUrl.searchParams.set('next', nextPath);
  if (error) redirectUrl.searchParams.set('error', error);
  if (hashParams.size) {
    redirectUrl.hash = hashParams.toString();
  }
  return redirectUrl.toString();
};

const isAdminUser = (user) => {
  if (!user?.email) return false;
  return ADMIN_EMAILS.has(String(user.email).toLowerCase());
};

const authorizeToken = createAuthorizeToken({ prisma, sessionStore, isAdminUser });
const requireAuth = createRequireAuth({ authorizeToken });
const requireAuthStrict = createRequireAuth({ authorizeToken, allowSessionExpiredSilent: false });
const getBearerToken = (req) => {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return null;
  return auth.slice(7);
};
const resolveOptionalUser = async (req, res) => {
  const token = getBearerToken(req);
  if (!token) return null;
  try {
    return await authorizeToken(token);
  } catch (error) {
    res.status(401).json({ error: error.message || 'Unauthorized' });
    return null;
  }
};

const createWeChatState = (redirectPath) => {
  const state = crypto.randomBytes(16).toString('hex');
  const now = Date.now();
  wechatStateStore.set(state, { createdAt: now, redirectPath });
  for (const [key, entry] of wechatStateStore.entries()) {
    if (now - entry.createdAt > WECHAT_STATE_TTL_MS) {
      wechatStateStore.delete(key);
    }
  }
  return state;
};

const consumeWeChatState = (state) => {
  const entry = wechatStateStore.get(state);
  if (!entry) return null;
  wechatStateStore.delete(state);
  if (Date.now() - entry.createdAt > WECHAT_STATE_TTL_MS) return null;
  return entry.redirectPath;
};

const createResetToken = (userId) => {
  pruneResetTokenStore();
  const existingToken = resetTokenByUser.get(userId);
  if (existingToken) {
    resetTokenStore.delete(existingToken);
  }
  const token = crypto.randomBytes(24).toString('hex');
  resetTokenStore.set(token, { userId, expiresAt: Date.now() + RESET_TOKEN_TTL_MS });
  resetTokenByUser.set(userId, token);
  return token;
};

const consumeResetToken = (token) => {
  if (!token) return null;
  const entry = resetTokenStore.get(token);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    resetTokenStore.delete(token);
    if (resetTokenByUser.get(entry.userId) === token) {
      resetTokenByUser.delete(entry.userId);
    }
    return null;
  }
  resetTokenStore.delete(token);
  if (resetTokenByUser.get(entry.userId) === token) {
    resetTokenByUser.delete(entry.userId);
  }
  return entry.userId;
};

const PASSWORD_MIN_LENGTH = 8;
const isPasswordComplex = (password) => {
  if (typeof password !== 'string') return false;
  const trimmed = password.trim();
  if (trimmed.length < PASSWORD_MIN_LENGTH) return false;
  if (!/[A-Za-z]/.test(trimmed)) return false;
  if (!/\d/.test(trimmed)) return false;
  return true;
};

// Pinyin and Element mappings for Stems (TianGan)
const STEMS_MAP = {
  '甲': { name: 'Jia', element: 'Wood', polarity: '+' },
  '乙': { name: 'Yi', element: 'Wood', polarity: '-' },
  '丙': { name: 'Bing', element: 'Fire', polarity: '+' },
  '丁': { name: 'Ding', element: 'Fire', polarity: '-' },
  '戊': { name: 'Wu', element: 'Earth', polarity: '+' },
  '己': { name: 'Ji', element: 'Earth', polarity: '-' },
  '庚': { name: 'Geng', element: 'Metal', polarity: '+' },
  '辛': { name: 'Xin', element: 'Metal', polarity: '-' },
  '壬': { name: 'Ren', element: 'Water', polarity: '+' },
  '癸': { name: 'Gui', element: 'Water', polarity: '-' },
};

// Pinyin and Element mappings for Branches (DiZhi)
const BRANCHES_MAP = {
  '子': { name: 'Zi', element: 'Water', polarity: '+' }, // Standard Polarity for rendering/basic logic
  '丑': { name: 'Chou', element: 'Earth', polarity: '-' },
  '寅': { name: 'Yin', element: 'Wood', polarity: '+' },
  '卯': { name: 'Mao', element: 'Wood', polarity: '-' },
  '辰': { name: 'Chen', element: 'Earth', polarity: '+' },
  '巳': { name: 'Si', element: 'Fire', polarity: '-' },
  '午': { name: 'Wu', element: 'Fire', polarity: '+' },
  '未': { name: 'Wei', element: 'Earth', polarity: '-' },
  '申': { name: 'Shen', element: 'Metal', polarity: '+' },
  '酉': { name: 'You', element: 'Metal', polarity: '-' },
  '戌': { name: 'Xu', element: 'Earth', polarity: '+' },
  '亥': { name: 'Hai', element: 'Water', polarity: '-' },
};

// Five Elements Generating/Controlling relationships
// Generated order: Wood -> Fire -> Earth -> Metal -> Water -> Wood
// Controlled order: Wood -> Earth -> Water -> Fire -> Metal -> Wood
const ELEMENTS = ['Wood', 'Fire', 'Earth', 'Metal', 'Water'];

const ZODIAC_SIGNS = {
  aries: {
    name: 'Aries',
    dateRange: 'Mar 21 - Apr 19',
    element: 'Fire',
    modality: 'Cardinal',
    rulingPlanet: 'Mars',
    symbol: 'The Ram',
    keywords: ['bold', 'pioneering', 'direct'],
    strengths: ['courageous', 'decisive', 'energetic'],
    challenges: ['impatient', 'impulsive', 'restless'],
    luckyColors: ['Crimson', 'Gold'],
    luckyNumbers: [1, 9, 18],
    compatibility: ['Leo', 'Sagittarius', 'Gemini', 'Aquarius']
  },
  taurus: {
    name: 'Taurus',
    dateRange: 'Apr 20 - May 20',
    element: 'Earth',
    modality: 'Fixed',
    rulingPlanet: 'Venus',
    symbol: 'The Bull',
    keywords: ['steady', 'sensual', 'grounded'],
    strengths: ['patient', 'loyal', 'practical'],
    challenges: ['stubborn', 'possessive', 'slow to change'],
    luckyColors: ['Emerald', 'Forest Green'],
    luckyNumbers: [2, 6, 24],
    compatibility: ['Virgo', 'Capricorn', 'Cancer', 'Pisces']
  },
  gemini: {
    name: 'Gemini',
    dateRange: 'May 21 - Jun 20',
    element: 'Air',
    modality: 'Mutable',
    rulingPlanet: 'Mercury',
    symbol: 'The Twins',
    keywords: ['curious', 'social', 'quick-witted'],
    strengths: ['adaptable', 'expressive', 'versatile'],
    challenges: ['restless', 'inconsistent', 'scattered'],
    luckyColors: ['Yellow', 'Sky Blue'],
    luckyNumbers: [3, 5, 12],
    compatibility: ['Libra', 'Aquarius', 'Aries', 'Leo']
  },
  cancer: {
    name: 'Cancer',
    dateRange: 'Jun 21 - Jul 22',
    element: 'Water',
    modality: 'Cardinal',
    rulingPlanet: 'Moon',
    symbol: 'The Crab',
    keywords: ['intuitive', 'protective', 'nurturing'],
    strengths: ['empathetic', 'loyal', 'caring'],
    challenges: ['moody', 'guarded', 'overly cautious'],
    luckyColors: ['Silver', 'Sea Green'],
    luckyNumbers: [4, 7, 16],
    compatibility: ['Scorpio', 'Pisces', 'Taurus', 'Virgo']
  },
  leo: {
    name: 'Leo',
    dateRange: 'Jul 23 - Aug 22',
    element: 'Fire',
    modality: 'Fixed',
    rulingPlanet: 'Sun',
    symbol: 'The Lion',
    keywords: ['radiant', 'confident', 'generous'],
    strengths: ['charismatic', 'creative', 'warm'],
    challenges: ['proud', 'dramatic', 'stubborn'],
    luckyColors: ['Gold', 'Amber'],
    luckyNumbers: [1, 10, 19],
    compatibility: ['Aries', 'Sagittarius', 'Gemini', 'Libra']
  },
  virgo: {
    name: 'Virgo',
    dateRange: 'Aug 23 - Sep 22',
    element: 'Earth',
    modality: 'Mutable',
    rulingPlanet: 'Mercury',
    symbol: 'The Maiden',
    keywords: ['precise', 'service-oriented', 'observant'],
    strengths: ['organized', 'thoughtful', 'reliable'],
    challenges: ['overcritical', 'anxious', 'perfectionist'],
    luckyColors: ['Olive', 'Ivory'],
    luckyNumbers: [5, 14, 23],
    compatibility: ['Taurus', 'Capricorn', 'Cancer', 'Scorpio']
  },
  libra: {
    name: 'Libra',
    dateRange: 'Sep 23 - Oct 22',
    element: 'Air',
    modality: 'Cardinal',
    rulingPlanet: 'Venus',
    symbol: 'The Scales',
    keywords: ['harmonious', 'diplomatic', 'aesthetic'],
    strengths: ['fair-minded', 'charming', 'balanced'],
    challenges: ['indecisive', 'avoidant', 'people-pleasing'],
    luckyColors: ['Rose', 'Sapphire'],
    luckyNumbers: [6, 15, 24],
    compatibility: ['Gemini', 'Aquarius', 'Leo', 'Sagittarius']
  },
  scorpio: {
    name: 'Scorpio',
    dateRange: 'Oct 23 - Nov 21',
    element: 'Water',
    modality: 'Fixed',
    rulingPlanet: 'Pluto',
    symbol: 'The Scorpion',
    keywords: ['intense', 'magnetic', 'private'],
    strengths: ['resourceful', 'loyal', 'focused'],
    challenges: ['secretive', 'jealous', 'all-or-nothing'],
    luckyColors: ['Burgundy', 'Black'],
    luckyNumbers: [8, 11, 22],
    compatibility: ['Cancer', 'Pisces', 'Virgo', 'Capricorn']
  },
  sagittarius: {
    name: 'Sagittarius',
    dateRange: 'Nov 22 - Dec 21',
    element: 'Fire',
    modality: 'Mutable',
    rulingPlanet: 'Jupiter',
    symbol: 'The Archer',
    keywords: ['adventurous', 'optimistic', 'free-spirited'],
    strengths: ['honest', 'visionary', 'enthusiastic'],
    challenges: ['impatient', 'tactless', 'overextended'],
    luckyColors: ['Violet', 'Indigo'],
    luckyNumbers: [3, 12, 21],
    compatibility: ['Aries', 'Leo', 'Libra', 'Aquarius']
  },
  capricorn: {
    name: 'Capricorn',
    dateRange: 'Dec 22 - Jan 19',
    element: 'Earth',
    modality: 'Cardinal',
    rulingPlanet: 'Saturn',
    symbol: 'The Mountain Goat',
    keywords: ['ambitious', 'disciplined', 'strategic'],
    strengths: ['responsible', 'persistent', 'practical'],
    challenges: ['rigid', 'pessimistic', 'workaholic'],
    luckyColors: ['Charcoal', 'Brown'],
    luckyNumbers: [4, 13, 22],
    compatibility: ['Taurus', 'Virgo', 'Scorpio', 'Pisces']
  },
  aquarius: {
    name: 'Aquarius',
    dateRange: 'Jan 20 - Feb 18',
    element: 'Air',
    modality: 'Fixed',
    rulingPlanet: 'Uranus',
    symbol: 'The Water Bearer',
    keywords: ['innovative', 'independent', 'visionary'],
    strengths: ['original', 'humanitarian', 'inventive'],
    challenges: ['detached', 'unpredictable', 'stubborn'],
    luckyColors: ['Electric Blue', 'Silver'],
    luckyNumbers: [7, 11, 20],
    compatibility: ['Gemini', 'Libra', 'Aries', 'Sagittarius']
  },
  pisces: {
    name: 'Pisces',
    dateRange: 'Feb 19 - Mar 20',
    element: 'Water',
    modality: 'Mutable',
    rulingPlanet: 'Neptune',
    symbol: 'The Fish',
    keywords: ['dreamy', 'compassionate', 'artistic'],
    strengths: ['intuitive', 'empathetic', 'imaginative'],
    challenges: ['escapist', 'overly sensitive', 'indecisive'],
    luckyColors: ['Seafoam', 'Lavender'],
    luckyNumbers: [2, 9, 18],
    compatibility: ['Cancer', 'Scorpio', 'Taurus', 'Capricorn']
  }
};

const ZODIAC_PERIODS = new Set(['daily', 'weekly', 'monthly']);

const formatDateLabel = (date, options) =>
  date.toLocaleDateString('en-US', options);

const getWeekRange = (date) => {
  const day = date.getDay();
  const diffToMonday = (day + 6) % 7;
  const start = new Date(date);
  start.setDate(date.getDate() - diffToMonday);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return `${formatDateLabel(start, { month: 'short', day: 'numeric' })} - ${formatDateLabel(end, { month: 'short', day: 'numeric' })}`;
};

const normalizeSign = (raw) => raw?.toString().trim().toLowerCase();
const sanitizeQueryParam = (raw) => {
  const normalized = normalizeSign(raw);
  if (!normalized) return null;
  if (!/^[a-z]+$/.test(normalized)) return null;
  return normalized;
};

const buildHoroscope = (sign, period) => {
  const now = new Date();
  const range =
    period === 'daily'
      ? formatDateLabel(now, { month: 'short', day: 'numeric', year: 'numeric' })
      : period === 'weekly'
        ? getWeekRange(now)
        : formatDateLabel(now, { month: 'long', year: 'numeric' });

  const focusMap = {
    daily: 'short, intentional steps',
    weekly: 'strategic momentum',
    monthly: 'long-term alignment'
  };

  const energyMap = {
    Fire: 'spark and momentum',
    Earth: 'steadiness and structure',
    Air: 'clarity and connection',
    Water: 'intuition and depth'
  };

  return {
    overview: `Your ${sign.element.toLowerCase()} energy brings ${energyMap[sign.element]} today. Lead with ${sign.keywords[0]} choices and let ${focusMap[period]} guide your pace.`,
    love: `In relationships, lean into ${sign.keywords[1]} expression. A clear invitation or gentle check-in strengthens bonds.`,
    career: `Work flows when you apply your ${sign.strengths[1]} instincts. Prioritize the task that unlocks the rest.`,
    wellness: `Balance your drive with grounding rituals. Stretch, hydrate, and carve out a quiet reset.`,
    lucky: {
      colors: sign.luckyColors,
      numbers: sign.luckyNumbers
    },
    mantra: `I honor my ${sign.element.toLowerCase()} nature and move with ${sign.keywords[2]} confidence.`
  };
};

const ELEMENT_COMPATIBILITY = {
  Fire: {
    Fire: { score: 12, note: 'Shared fire energy creates bold momentum.' },
    Air: { score: 15, note: 'Air feeds Fire, sparking inspiration and action.' },
    Earth: { score: -3, note: 'Fire can feel contained by Earth’s steady pace.' },
    Water: { score: -6, note: 'Fire and Water can steam up communication.' }
  },
  Air: {
    Fire: { score: 15, note: 'Air fuels Fire, keeping ideas lively.' },
    Air: { score: 12, note: 'Shared air energy keeps things curious and social.' },
    Earth: { score: -4, note: 'Air may find Earth too fixed while Earth craves certainty.' },
    Water: { score: -2, note: 'Air can feel abstract to Water’s emotional depth.' }
  },
  Earth: {
    Fire: { score: -3, note: 'Earth prefers patience while Fire wants fast movement.' },
    Air: { score: -4, note: 'Earth seeks stability while Air seeks change.' },
    Earth: { score: 12, note: 'Shared earth energy builds reliability and trust.' },
    Water: { score: 15, note: 'Water nourishes Earth, creating a supportive bond.' }
  },
  Water: {
    Fire: { score: -6, note: 'Water can cool Fire, creating emotional distance.' },
    Air: { score: -2, note: 'Water looks for depth while Air wants space.' },
    Earth: { score: 15, note: 'Earth holds Water, creating steadiness and care.' },
    Water: { score: 12, note: 'Shared water energy heightens empathy and intuition.' }
  }
};

const MODALITY_COMPATIBILITY = {
  Cardinal: {
    Cardinal: { score: 4, note: 'Both initiate quickly, so pace-setting matters.' },
    Fixed: { score: 2, note: 'Cardinal sparks action while Fixed sustains it.' },
    Mutable: { score: 3, note: 'Cardinal leads while Mutable adapts and refines.' }
  },
  Fixed: {
    Cardinal: { score: 2, note: 'Fixed steadies Cardinal’s drive.' },
    Fixed: { score: 4, note: 'Shared fixed energy creates loyalty and endurance.' },
    Mutable: { score: 1, note: 'Fixed wants consistency while Mutable seeks variety.' }
  },
  Mutable: {
    Cardinal: { score: 3, note: 'Mutable flexes to Cardinal’s vision.' },
    Fixed: { score: 1, note: 'Mutable wants change while Fixed holds a line.' },
    Mutable: { score: 4, note: 'Shared mutable energy keeps things adaptable.' }
  }
};

const clampScore = (value, min = 0, max = 100) =>
  Math.min(max, Math.max(min, value));

const compatibilityLevel = (score) => {
  if (score >= 80) return 'Cosmic Spark';
  if (score >= 65) return 'Harmonious Flow';
  if (score >= 50) return 'Balanced Orbit';
  if (score >= 35) return 'Learning Curve';
  return 'High Contrast';
};

const buildCompatibilitySummary = (primary, secondary, level) =>
  `${level} between ${primary.name} and ${secondary.name}. ${primary.element} energy meets ${secondary.element} energy with ${primary.modality.toLowerCase()} and ${secondary.modality.toLowerCase()} rhythms.`;

const buildZodiacCompatibility = (primary, secondary) => {
  let score = 50;
  const highlights = [];
  const breakdown = {};

  if (primary.name === secondary.name) {
    score += 6;
    highlights.push('Same-sign pairing amplifies shared traits.');
  }

  const elementInsight = ELEMENT_COMPATIBILITY?.[primary.element]?.[secondary.element];
  if (elementInsight) {
    score += elementInsight.score;
    breakdown.element = {
      score: elementInsight.score,
      note: elementInsight.note
    };
    highlights.push(elementInsight.note);
  }

  const modalityInsight = MODALITY_COMPATIBILITY?.[primary.modality]?.[secondary.modality];
  if (modalityInsight) {
    score += modalityInsight.score;
    breakdown.modality = {
      score: modalityInsight.score,
      note: modalityInsight.note
    };
    highlights.push(modalityInsight.note);
  }

  const mutualMatch =
    primary.compatibility.includes(secondary.name) && secondary.compatibility.includes(primary.name);
  const oneWayMatch =
    !mutualMatch &&
    (primary.compatibility.includes(secondary.name) || secondary.compatibility.includes(primary.name));
  if (mutualMatch) {
    score += 12;
    breakdown.affinity = {
      score: 12,
      note: 'Mutual favorite pairing boosts natural chemistry.'
    };
    highlights.push('Mutual favorite pairing boosts natural chemistry.');
  } else if (oneWayMatch) {
    score += 6;
    breakdown.affinity = {
      score: 6,
      note: 'One sign naturally gravitates toward the other.'
    };
    highlights.push('One sign naturally gravitates toward the other.');
  }

  if (primary.rulingPlanet === secondary.rulingPlanet) {
    score += 4;
    breakdown.rulingPlanet = {
      score: 4,
      note: `Shared ruling planet (${primary.rulingPlanet}) aligns motivations.`
    };
    highlights.push(`Shared ruling planet (${primary.rulingPlanet}) aligns motivations.`);
  }

  score = clampScore(score);
  const level = compatibilityLevel(score);

  return {
    score,
    level,
    summary: buildCompatibilitySummary(primary, secondary, level),
    highlights,
    breakdown
  };
};

function getElementRelation(me, other) {
  if (me === other) return 'Same';

  const meIdx = ELEMENTS.indexOf(me);
  const otherIdx = ELEMENTS.indexOf(other);

  // Generating: me generates other?
  if ((meIdx + 1) % 5 === otherIdx) return 'Generates';
  // Generated by: other generates me?
  if ((otherIdx + 1) % 5 === meIdx) return 'GeneratedBy';
  // Controlling: me controls other?
  if ((meIdx + 2) % 5 === otherIdx) return 'Controls';
  // Controlled by: other controls me?
  if ((otherIdx + 2) % 5 === meIdx) return 'ControlledBy';

  return 'Unknown';
}

function calculateTenGod(dayMasterStemVal, targetStemVal) {
  const dm = STEMS_MAP[dayMasterStemVal];
  const target = STEMS_MAP[targetStemVal];

  if (!dm || !target) return 'Unknown';

  const relation = getElementRelation(dm.element, target.element);
  const samePolarity = dm.polarity === target.polarity;

  switch (relation) {
    case 'Same':
      return samePolarity ? 'Friend (Bi Jian)' : 'Rob Wealth (Jie Cai)';
    case 'Generates':
      return samePolarity ? 'Eating God (Shi Shen)' : 'Hurting Officer (Shang Guan)';
    case 'GeneratedBy':
      return samePolarity ? 'Indirect Resource (Pian Yin)' : 'Direct Resource (Zheng Yin)';
    case 'Controls':
      return samePolarity ? 'Indirect Wealth (Pian Cai)' : 'Direct Wealth (Zheng Cai)';
    case 'ControlledBy':
      return samePolarity ? 'Seven Killings (Qi Sha)' : 'Direct Officer (Zheng Guan)';
    default:
      return 'Unknown';
  }
}

// Helper to map a single pillar (Gan + Zhi)
function buildPillar(ganChar, zhiChar) {
  const ganInfo = STEMS_MAP[ganChar] || { name: ganChar, element: 'Unknown' };
  const zhiInfo = BRANCHES_MAP[zhiChar] || { name: zhiChar, element: 'Unknown' };

  return {
    stem: ganInfo.name,
    branch: zhiInfo.name,
    elementStem: ganInfo.element,
    elementBranch: zhiInfo.element,
    charStem: ganChar, // Internal use
    charBranch: zhiChar // Internal use
  };
}

const serializeRecord = (record) => ({
  ...record,
  pillars: JSON.parse(record.pillars),
  fiveElements: JSON.parse(record.fiveElements),
  tenGods: record.tenGods ? JSON.parse(record.tenGods) : null,
  luckCycles: record.luckCycles ? JSON.parse(record.luckCycles) : null,
});

const parseJsonValue = (raw) => {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const serializeRecordForList = (record) => ({
  id: record.id,
  birthYear: record.birthYear,
  birthMonth: record.birthMonth,
  birthDay: record.birthDay,
  birthHour: record.birthHour,
  gender: record.gender,
  birthLocation: record.birthLocation,
  timezone: record.timezone,
  pillars: JSON.parse(record.pillars),
  createdAt: record.createdAt,
});

const BAZI_LIST_SELECT = {
  id: true,
  birthYear: true,
  birthMonth: true,
  birthDay: true,
  birthHour: true,
  gender: true,
  birthLocation: true,
  timezone: true,
  pillars: true,
  createdAt: true,
};

const serializeIchingRecord = (record) => ({
  ...record,
  numbers: parseJsonValue(record.numbers),
  hexagram: parseJsonValue(record.hexagram),
  resultingHexagram: parseJsonValue(record.resultingHexagram),
  changingLines: parseJsonValue(record.changingLines),
  timeContext: parseJsonValue(record.timeContext),
});

const serializeZiweiRecord = (record) => ({
  id: record.id,
  userId: record.userId,
  birthYear: record.birthYear,
  birthMonth: record.birthMonth,
  birthDay: record.birthDay,
  birthHour: record.birthHour,
  gender: record.gender,
  chart: parseJsonValue(record.chart),
  createdAt: record.createdAt,
});

const serializeRecordWithTimezone = (record) => {
  const base = serializeRecord(record);
  const meta = buildBirthTimeMeta({
    birthYear: record.birthYear,
    birthMonth: record.birthMonth,
    birthDay: record.birthDay,
    birthHour: record.birthHour,
    timezone: record.timezone,
  });
  return { ...base, ...meta };
};

const getBirthSortTimestamp = (record) => {
  if (!record) return null;
  const meta = buildBirthTimeMeta({
    birthYear: record.birthYear,
    birthMonth: record.birthMonth,
    birthDay: record.birthDay,
    birthHour: record.birthHour,
    timezone: record.timezone,
  });
  if (Number.isFinite(meta?.birthTimestamp)) return meta.birthTimestamp;
  const year = Number(record.birthYear);
  const month = Number(record.birthMonth);
  const day = Number(record.birthDay);
  const hour = Number.isFinite(Number(record.birthHour)) ? Number(record.birthHour) : 0;
  if (![year, month, day].every(Number.isFinite)) return null;
  return Date.UTC(year, month - 1, day, hour, 0, 0);
};

const sortRecordsByBirth = (records, direction) => {
  if (!Array.isArray(records)) return records;
  const dir = direction === 'asc' ? 1 : -1;
  const keyed = records.map((record) => ({
    record,
    key: getBirthSortTimestamp(record),
    createdAt: record?.createdAt instanceof Date
      ? record.createdAt.getTime()
      : new Date(record?.createdAt ?? 0).getTime(),
    id: record?.id ?? 0,
  }));

  keyed.sort((a, b) => {
    const aFinite = Number.isFinite(a.key);
    const bFinite = Number.isFinite(b.key);
    if (aFinite && bFinite && a.key !== b.key) return (a.key - b.key) * dir;
    if (aFinite && !bFinite) return -1;
    if (!aFinite && bFinite) return 1;
    if (a.createdAt !== b.createdAt) return b.createdAt - a.createdAt;
    return b.id - a.id;
  });

  return keyed.map((entry) => entry.record);
};

const parseJsonField = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (typeof value === 'object') return value;
  return null;
};

const coerceInt = (value) => {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return null;
  return Math.trunc(numberValue);
};



const buildImportRecord = async (raw, userId) => {
  if (!raw || typeof raw !== 'object') return null;
  const birthYear = coerceInt(raw.birthYear);
  const birthMonth = coerceInt(raw.birthMonth);
  const birthDay = coerceInt(raw.birthDay);
  const birthHour = coerceInt(raw.birthHour);
  const gender = typeof raw.gender === 'string' ? raw.gender.trim() : '';
  if (!birthYear || !birthMonth || !birthDay || birthHour === null || !gender) return null;

  let pillars = parseJsonField(raw.pillars);
  let fiveElements = parseJsonField(raw.fiveElements);
  let tenGods = parseJsonField(raw.tenGods);
  let luckCycles = parseJsonField(raw.luckCycles);

  if (!pillars || !fiveElements) {
    const computed = await getBaziCalculation({
      birthYear,
      birthMonth,
      birthDay,
      birthHour,
      gender
    });
    if (!pillars) pillars = computed.pillars;
    if (!fiveElements) fiveElements = computed.fiveElements;
    if (!tenGods) tenGods = computed.tenGods;
    if (!luckCycles) luckCycles = computed.luckCycles;
  }
  primeBaziCalculationCache(
    { birthYear, birthMonth, birthDay, birthHour, gender },
    { pillars, fiveElements, tenGods, luckCycles }
  );

  const createdAtRaw = raw.createdAt ? new Date(raw.createdAt) : null;
  const createdAt = createdAtRaw && !Number.isNaN(createdAtRaw.getTime()) ? createdAtRaw : null;
  const updatedAtRaw = raw.updatedAt ? new Date(raw.updatedAt) : null;
  const updatedAt = updatedAtRaw && !Number.isNaN(updatedAtRaw.getTime()) ? updatedAtRaw : null;

  const timezoneOffset = parseTimezoneOffsetMinutes(raw.timezoneOffsetMinutes);
  const timezoneFallback = Number.isFinite(timezoneOffset)
    ? formatTimezoneOffset(timezoneOffset)
    : null;

  const record = {
    userId,
    birthYear,
    birthMonth,
    birthDay,
    birthHour,
    gender,
    birthLocation: typeof raw.birthLocation === 'string' ? raw.birthLocation : null,
    timezone: typeof raw.timezone === 'string' ? raw.timezone : timezoneFallback,
    pillars: JSON.stringify(pillars),
    fiveElements: JSON.stringify(fiveElements),
    tenGods: tenGods ? JSON.stringify(tenGods) : null,
    luckCycles: luckCycles ? JSON.stringify(luckCycles) : null,
  };

  if (createdAt) record.createdAt = createdAt;
  if (updatedAt || createdAt) record.updatedAt = updatedAt ?? createdAt;
  return record;
};

const parseIdParam = (value) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
};

// --- I Ching Helpers ---

// --- Core Calculation ---

const performCalculation = (data) => {
  const { birthYear, birthMonth, birthDay, birthHour, gender } = data;

  // Create Solar date. Lunar-javascript expects month 1-12.
  const solar = Solar.fromYmdHms(birthYear, birthMonth, birthDay, birthHour, 0, 0);
  const lunar = solar.getLunar();
  const eightChar = lunar.getEightChar();

  // 1. Pillars
  const yearPillar = buildPillar(eightChar.getYearGan(), eightChar.getYearZhi());
  const monthPillar = buildPillar(eightChar.getMonthGan(), eightChar.getMonthZhi());
  const dayPillar = buildPillar(eightChar.getDayGan(), eightChar.getDayZhi());
  const hourPillar = buildPillar(eightChar.getTimeGan(), eightChar.getTimeZhi());

  const pillars = {
    year: yearPillar,
    month: monthPillar,
    day: dayPillar,
    hour: hourPillar,
  };

  // 2. Five Elements Count
  // Count elements from Stems and Branches
  const counts = { Wood: 0, Fire: 0, Earth: 0, Metal: 0, Water: 0 };
  const addCount = (el) => { if (counts[el] !== undefined) counts[el]++; };

  [yearPillar, monthPillar, dayPillar, hourPillar].forEach(p => {
    addCount(p.elementStem);
    addCount(p.elementBranch);
  });
  const totalElements = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const fiveElementsPercent = ELEMENTS.reduce((acc, element) => {
    acc[element] = totalElements ? Math.round((counts[element] / totalElements) * 100) : 0;
    return acc;
  }, {});

  // 3. Ten Gods (Stems relative to Day Master)
  // We calculate Ten Gods for the generated Stems (Year, Month, Hour) relative to Day Stem.
  // We can also calculate for Branch Main Qi if we want, but for now stick to simple structure.
  // The frontend expects a list of { name, strength }.
  // Current logic in frontend is displaying them as a list.
  // We will provide a list of Ten Gods present in the Stems? Or all 10 types?
  // The previous mock returned all 10 types with strengths.
  // To be helpful, we can calculate the strength based on how many times that Ten God appears (simplified).

  const dayMasterChar = eightChar.getDayGan();
  const tenGodsCounts = {};

  // Initialize counts
  const allTenGodsTypes = [
    'Friend (Bi Jian)', 'Rob Wealth (Jie Cai)',
    'Eating God (Shi Shen)', 'Hurting Officer (Shang Guan)',
    'Indirect Wealth (Pian Cai)', 'Direct Wealth (Zheng Cai)',
    'Seven Killings (Qi Sha)', 'Direct Officer (Zheng Guan)',
    'Indirect Resource (Pian Yin)', 'Direct Resource (Zheng Yin)'
  ];
  allTenGodsTypes.forEach(t => tenGodsCounts[t] = 0);

  // Scan all stems and branches to count Ten Gods
  // For stems: direct relationship
  // For branches: use the main element/hidden stem? Simplified: use branch element.

  const scanParts = [
    yearPillar.charStem, yearPillar.charBranch,
    monthPillar.charStem, monthPillar.charBranch,
    // dayPillar.charStem is Self (Day Master), usually not counted as Ten God or counted as Friend?
    // Usually Day Master is not its own Ten God.
    dayPillar.charBranch,
    hourPillar.charStem, hourPillar.charBranch
  ];

  // Helper to get element of char to find pseudo-TenGod for Branch
  const getCharStemEquivalent = (char) => {
    // If it is a Stem, return it.
    if (STEMS_MAP[char]) return char;
    // If Branch, convert to Main Qi Stem (Simplified)
    // This is a rough approximation for the strength chart.
    const branchToMainQi = {
      '子': '癸', '丑': '己', '寅': '甲', '卯': '乙', '辰': '戊', '巳': '丙',
      '午': '丁', '未': '己', '申': '庚', '酉': '辛', '戌': '戊', '亥': '壬'
    };
    return branchToMainQi[char];
  };

  scanParts.forEach(char => {
    const stemVal = getCharStemEquivalent(char);
    if (stemVal) {
      const tg = calculateTenGod(dayMasterChar, stemVal);
      if (tenGodsCounts[tg] !== undefined) {
        tenGodsCounts[tg] += 10; // Add score
      } else if (tg.includes('Friend')) {
        // Self
        tenGodsCounts['Friend (Bi Jian)'] += 10;
      }
    }
  });

  // Map to array
  const tenGods = Object.entries(tenGodsCounts).map(([name, val]) => ({
    name, strength: val
  }));

  // 4. Luck Cycles (Da Yun)
  // lunar-javascript: gender 1=man, 0=woman
  const genderInt = gender === 'male' ? 1 : 0;
  const yun = eightChar.getYun(genderInt);
  const daYunArr = yun.getDaYun();

  // We usually take first 8-10 cycles
  // DaYun object has: getStartYear(), getStartAge(), getGanZhi()
  const luckCycles = daYunArr.slice(1, 9).map((dy) => { // Start from index 1 usually as index 0 is 0-agg
    const startAge = dy.getStartAge();
    const endAge = dy.getEndAge();
    const startYear = typeof dy.getStartYear === 'function' ? dy.getStartYear() : null;
    const endYear = typeof dy.getEndYear === 'function' ? dy.getEndYear() : null;
    const ganZhi = dy.getGanZhi();
    // Split GanZhi (e.g. "甲子")
    const gan = ganZhi.substring(0, 1);
    const zhi = ganZhi.substring(1, 2);
    const stemInfo = STEMS_MAP[gan] || { name: gan };
    const zhiInfo = BRANCHES_MAP[zhi] || { name: zhi };

    return {
      range: `${startAge}-${endAge}`,
      stem: stemInfo.name,
      branch: zhiInfo.name,
      startYear,
      endYear
    };
  });

  return { pillars, fiveElements: counts, fiveElementsPercent, tenGods, luckCycles };
};

const hasFullBaziResult = (result) => {
  if (!result || typeof result !== 'object') return false;
  if (!result.pillars || !result.fiveElements) return false;
  if (!result.tenGods || !result.luckCycles) return false;
  return true;
};

const getBaziCalculation = async (data, { bypassCache = false } = {}) => {
  const cacheKey = buildBaziCacheKey(data);
  if (!bypassCache && cacheKey) {
    const cached = await getCachedBaziCalculationAsync(cacheKey);
    if (cached && hasFullBaziResult(cached)) return cached;
  }
  const result = performCalculation(data);
  if (cacheKey) setBaziCacheEntry(cacheKey, result);
  return result;
};

// --- Ziwei (V2) Calculation ---
const ZIWEI_BRANCH_ORDER = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const ZIWEI_MONTH_BRANCH_ORDER = ['寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥', '子', '丑'];
const ZIWEI_PALACES = [
  { key: 'ming', name: 'Ming', cn: '命宫' },
  { key: 'brothers', name: 'Brothers', cn: '兄弟' },
  { key: 'spouse', name: 'Spouse', cn: '夫妻' },
  { key: 'children', name: 'Children', cn: '子女' },
  { key: 'wealth', name: 'Wealth', cn: '财帛' },
  { key: 'health', name: 'Health', cn: '疾厄' },
  { key: 'travel', name: 'Travel', cn: '迁移' },
  { key: 'friends', name: 'Friends', cn: '仆役' },
  { key: 'career', name: 'Career', cn: '官禄' },
  { key: 'property', name: 'Property', cn: '田宅' },
  { key: 'mental', name: 'Mental', cn: '福德' },
  { key: 'parents', name: 'Parents', cn: '父母' },
];

const ZIWEI_MAJOR_STARS = {
  ziwei: { key: 'ziwei', name: 'Zi Wei', cn: '紫微' },
  tianji: { key: 'tianji', name: 'Tian Ji', cn: '天机' },
  taiyang: { key: 'taiyang', name: 'Tai Yang', cn: '太阳' },
  wuqu: { key: 'wuqu', name: 'Wu Qu', cn: '武曲' },
  tiantong: { key: 'tiantong', name: 'Tian Tong', cn: '天同' },
  lianzhen: { key: 'lianzhen', name: 'Lian Zhen', cn: '廉贞' },
  tianfu: { key: 'tianfu', name: 'Tian Fu', cn: '天府' },
  taiyin: { key: 'taiyin', name: 'Tai Yin', cn: '太阴' },
  tanlang: { key: 'tanlang', name: 'Tan Lang', cn: '贪狼' },
  jumen: { key: 'jumen', name: 'Ju Men', cn: '巨门' },
  tianxiang: { key: 'tianxiang', name: 'Tian Xiang', cn: '天相' },
  tianliang: { key: 'tianliang', name: 'Tian Liang', cn: '天梁' },
  qisha: { key: 'qisha', name: 'Qi Sha', cn: '七杀' },
  pojun: { key: 'pojun', name: 'Po Jun', cn: '破军' },
};

const ZIWEI_MINOR_STARS = {
  wenchang: { key: 'wenchang', name: 'Wen Chang', cn: '文昌' },
  wenqu: { key: 'wenqu', name: 'Wen Qu', cn: '文曲' },
  zuofu: { key: 'zuofu', name: 'Zuo Fu', cn: '左辅' },
  youbi: { key: 'youbi', name: 'You Bi', cn: '右弼' },
  huoxing: { key: 'huoxing', name: 'Huo Xing', cn: '火星' },
  lingxing: { key: 'lingxing', name: 'Ling Xing', cn: '铃星' },
  tiankui: { key: 'tiankui', name: 'Tian Kui', cn: '天魁' },
  tianyue: { key: 'tianyue', name: 'Tian Yue', cn: '天钺' },
};

const ZIWEI_SIHUA_BY_STEM = {
  '甲': { lu: 'lianzhen', quan: 'pojun', ke: 'wuqu', ji: 'taiyang' },
  '乙': { lu: 'tianji', quan: 'tianliang', ke: 'ziwei', ji: 'taiyin' },
  '丙': { lu: 'tiantong', quan: 'tianji', ke: 'wenchang', ji: 'lianzhen' },
  '丁': { lu: 'taiyin', quan: 'tiantong', ke: 'tianji', ji: 'jumen' },
  '戊': { lu: 'tanlang', quan: 'taiyin', ke: 'youbi', ji: 'tianji' },
  '己': { lu: 'wuqu', quan: 'tanlang', ke: 'tianliang', ji: 'wenqu' },
  '庚': { lu: 'taiyang', quan: 'wuqu', ke: 'taiyin', ji: 'tiantong' },
  '辛': { lu: 'jumen', quan: 'taiyang', ke: 'wenqu', ji: 'wenchang' },
  '壬': { lu: 'tianliang', quan: 'ziwei', ke: 'tianji', ji: 'pojun' },
  '癸': { lu: 'pojun', quan: 'jumen', ke: 'taiyin', ji: 'tanlang' },
};

const normalizeIndex = (value, modulo = 12) => ((value % modulo) + modulo) % modulo;

const getTimeBranchIndex = (birthHour) => {
  const hour = Number(birthHour);
  if (!Number.isFinite(hour)) return 0;
  return Math.floor((hour + 1) / 2) % 12;
};

const buildZiweiPalaces = (mingIndex) => {
  const palaces = ZIWEI_BRANCH_ORDER.map((branch, index) => ({
    index,
    branch: {
      key: branch,
      name: BRANCHES_MAP[branch]?.name || branch,
      element: BRANCHES_MAP[branch]?.element || 'Unknown',
      polarity: BRANCHES_MAP[branch]?.polarity || null,
    },
    palace: null,
    stars: { major: [], minor: [] },
    transformations: [],
  }));

  ZIWEI_PALACES.forEach((palace, offset) => {
    const index = normalizeIndex(mingIndex + offset);
    palaces[index].palace = palace;
  });

  return palaces;
};

const calculateZiweiChart = (data) => {
  const { birthYear, birthMonth, birthDay, birthHour } = data;
  const solar = Solar.fromYmdHms(birthYear, birthMonth, birthDay, birthHour || 0, 0, 0);
  const lunar = solar.getLunar();
  const eightChar = lunar.getEightChar();

  const lunarMonth = lunar.getMonth();
  const lunarDay = lunar.getDay();
  const lunarYear = lunar.getYear();
  const isLeapMonth = typeof lunar.isLeap === 'function' ? lunar.isLeap() : Boolean(lunar.isLeap);

  const monthBranch = ZIWEI_MONTH_BRANCH_ORDER[normalizeIndex(lunarMonth - 1)];
  const monthBranchIndex = ZIWEI_BRANCH_ORDER.indexOf(monthBranch);
  const timeBranchIndex = getTimeBranchIndex(birthHour);

  const mingIndex = normalizeIndex(monthBranchIndex - timeBranchIndex);
  const shenIndex = normalizeIndex(monthBranchIndex + timeBranchIndex);

  const ziweiIndex = normalizeIndex(monthBranchIndex + (lunarDay - 1));
  const tianfuIndex = normalizeIndex(ziweiIndex + 6);

  const palaces = buildZiweiPalaces(mingIndex);

  const transformMap = ZIWEI_SIHUA_BY_STEM[eightChar.getYearGan()] || {};
  const transformByStarKey = Object.values(transformMap).reduce((acc, key) => {
    if (key) acc[key] = acc[key] || [];
    return acc;
  }, {});
  Object.entries(transformMap).forEach(([type, key]) => {
    if (!key) return;
    if (!transformByStarKey[key]) transformByStarKey[key] = [];
    transformByStarKey[key].push(type);
  });

  const addStar = (index, star, group) => {
    if (!star) return;
    const target = palaces[index];
    if (!target) return;
    const transforms = transformByStarKey[star.key] || [];
    const entry = transforms.length
      ? { ...star, transforms }
      : { ...star };
    target.stars[group].push(entry);
    if (transforms.length) {
      transforms.forEach((type) => {
        target.transformations.push({ type, starKey: star.key, starName: star.name, starCn: star.cn });
      });
    }
  };

  const ziweiGroup = [
    { star: ZIWEI_MAJOR_STARS.ziwei, offset: 0 },
    { star: ZIWEI_MAJOR_STARS.tianji, offset: 1 },
    { star: ZIWEI_MAJOR_STARS.taiyang, offset: 3 },
    { star: ZIWEI_MAJOR_STARS.wuqu, offset: 4 },
    { star: ZIWEI_MAJOR_STARS.tiantong, offset: 5 },
    { star: ZIWEI_MAJOR_STARS.lianzhen, offset: 6 },
  ];

  const tianfuGroup = [
    { star: ZIWEI_MAJOR_STARS.tianfu, offset: 0 },
    { star: ZIWEI_MAJOR_STARS.taiyin, offset: 1 },
    { star: ZIWEI_MAJOR_STARS.tanlang, offset: 2 },
    { star: ZIWEI_MAJOR_STARS.jumen, offset: 3 },
    { star: ZIWEI_MAJOR_STARS.tianxiang, offset: 4 },
    { star: ZIWEI_MAJOR_STARS.tianliang, offset: 5 },
    { star: ZIWEI_MAJOR_STARS.qisha, offset: 6 },
    { star: ZIWEI_MAJOR_STARS.pojun, offset: 7 },
  ];

  ziweiGroup.forEach(({ star, offset }) => addStar(normalizeIndex(ziweiIndex + offset), star, 'major'));
  tianfuGroup.forEach(({ star, offset }) => addStar(normalizeIndex(tianfuIndex + offset), star, 'major'));

  const minorBase = normalizeIndex(lunarDay + timeBranchIndex);
  const minorGroup = [
    { star: ZIWEI_MINOR_STARS.wenchang, offset: 0 },
    { star: ZIWEI_MINOR_STARS.wenqu, offset: 4 },
    { star: ZIWEI_MINOR_STARS.zuofu, offset: 6 },
    { star: ZIWEI_MINOR_STARS.youbi, offset: 10 },
    { star: ZIWEI_MINOR_STARS.huoxing, offset: 2 },
    { star: ZIWEI_MINOR_STARS.lingxing, offset: 8 },
    { star: ZIWEI_MINOR_STARS.tiankui, offset: 1 },
    { star: ZIWEI_MINOR_STARS.tianyue, offset: 7 },
  ];
  minorGroup.forEach(({ star, offset }) => addStar(normalizeIndex(minorBase + offset), star, 'minor'));

  const transformations = Object.entries(transformMap).map(([type, starKey]) => {
    const starDef = ZIWEI_MAJOR_STARS[starKey] || ZIWEI_MINOR_STARS[starKey] || { key: starKey };
    return {
      type,
      starKey,
      starName: starDef.name || starKey,
      starCn: starDef.cn || null,
    };
  });

  return {
    lunar: {
      year: lunarYear,
      month: lunarMonth,
      day: lunarDay,
      isLeap: isLeapMonth,
      yearStem: eightChar.getYearGan(),
      yearBranch: eightChar.getYearZhi(),
      monthStem: eightChar.getMonthGan(),
      monthBranch: eightChar.getMonthZhi(),
      dayStem: eightChar.getDayGan(),
      dayBranch: eightChar.getDayZhi(),
      timeStem: eightChar.getTimeGan(),
      timeBranch: eightChar.getTimeZhi(),
    },
    mingPalace: {
      index: mingIndex,
      branch: palaces[mingIndex]?.branch,
      palace: palaces[mingIndex]?.palace,
    },
    shenPalace: {
      index: shenIndex,
      branch: palaces[shenIndex]?.branch,
      palace: palaces[shenIndex]?.palace,
    },
    fourTransformations: transformations,
    palaces,
  };
};

const apiRouter = express.Router();
app.use('/api/v1', apiRouter);
app.use('/api', apiRouter);

// --- Routes ---

const withTimeout = (promise, timeoutMs) => {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      const timer = setTimeout(() => {
        clearTimeout(timer);
        reject(new Error('Timeout'));
      }, timeoutMs);
      timer.unref?.();
    }),
  ]);
};

const checkDatabase = async () => {
  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, 1500);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || 'db_check_failed' };
  }
};

const checkRedis = async () => {
  const configured = Boolean(process.env.REDIS_URL);
  const client = await initRedis();
  if (!client) {
    return configured ? { ok: false, status: 'unavailable' } : { ok: true, status: 'disabled' };
  }
  if (!client.isOpen) {
    return { ok: false, status: 'disconnected' };
  }
  try {
    await withTimeout(client.ping(), 1000);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || 'redis_check_failed' };
  }
};

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/ready', async (req, res) => {
  const [db, redis] = await Promise.all([checkDatabase(), checkRedis()]);
  const ok = db.ok && (redis.ok || redis.status === 'disabled');
  res.status(ok ? 200 : 503).json({
    status: ok ? 'ok' : 'degraded',
    checks: { db, redis },
    timestamp: new Date().toISOString(),
  });
});

apiRouter.get('/ai/providers', (req, res) => {
  res.json({
    activeProvider: AI_PROVIDER,
    providers: AVAILABLE_PROVIDERS
  });
});

apiRouter.get('/locations', (req, res) => {
  res.json({ locations: listKnownLocations() });
});

apiRouter.post('/ai/interpret', requireAuth, async (req, res) => {
  const { system, user, prompt, fallback: fallbackText } = req.body || {};
  const userPrompt = typeof user === 'string' ? user : typeof prompt === 'string' ? prompt : '';
  if (!userPrompt.trim()) {
    return res.status(400).json({ error: 'User prompt required' });
  }
  let provider = null;
  try {
    provider = resolveAiProvider(req.body?.provider);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Invalid AI provider.' });
  }

  const systemPrompt = typeof system === 'string' && system.trim()
    ? system.trim()
    : 'You are a helpful assistant. Provide a concise response in Markdown.';
  const fallback = () => (typeof fallbackText === 'string' && fallbackText.trim()
    ? fallbackText
    : 'Unable to reach the AI provider. Please try again shortly.');

  const release = acquireAiGuard(req.user.id);
  if (!release) {
    return res.status(429).json({ error: AI_CONCURRENCY_ERROR });
  }
  try {
    const content = await generateAIContent({ system: systemPrompt, user: userPrompt, fallback, provider });
    res.json({ content });
  } finally {
    release();
  }
});

apiRouter.get('/zodiac/compatibility', (req, res) => {
  const primaryKey = sanitizeQueryParam(req.query.primary);
  const secondaryKey = sanitizeQueryParam(req.query.secondary);

  if (!primaryKey || !secondaryKey) {
    return res.status(400).json({ error: 'Provide primary and secondary signs.' });
  }

  const primary = ZODIAC_SIGNS[primaryKey];
  const secondary = ZODIAC_SIGNS[secondaryKey];

  if (!primary || !secondary) {
    return res.status(404).json({ error: 'Unknown sign provided.' });
  }

  const compatibility = buildZodiacCompatibility(primary, secondary);

  res.json({
    primary: { key: primaryKey, ...primary },
    secondary: { key: secondaryKey, ...secondary },
    ...compatibility
  });
});

apiRouter.get('/zodiac/:sign', (req, res) => {
  const signKey = normalizeSign(req.params.sign);
  const sign = ZODIAC_SIGNS[signKey];
  if (!sign) return res.status(404).json({ error: 'Unknown sign' });

  res.json({ sign: { key: signKey, ...sign } });
});

apiRouter.post('/zodiac/rising', (req, res) => {
  const { birthDate, birthTime, latitude, longitude, timezoneOffsetMinutes } = req.body || {};

  if (!birthDate || !birthTime || latitude === undefined || longitude === undefined) {
    return res.status(400).json({ error: 'Birth date, time, latitude, and longitude are required.' });
  }

  const [birthYear, birthMonth, birthDay] = birthDate.split('-').map(Number);
  const [birthHour, birthMinute] = birthTime.split(':').map(Number);
  const lat = Number(latitude);
  const lon = Number(longitude);
  const tzOffset = Number(timezoneOffsetMinutes);

  if (![birthYear, birthMonth, birthDay, birthHour, birthMinute].every(Number.isFinite)) {
    return res.status(400).json({ error: 'Invalid birth date or time.' });
  }
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return res.status(400).json({ error: 'Latitude must be between -90 and 90.' });
  }
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    return res.status(400).json({ error: 'Longitude must be between -180 and 180.' });
  }
  if (!Number.isFinite(tzOffset) || tzOffset < -14 * 60 || tzOffset > 14 * 60) {
    return res.status(400).json({ error: 'Timezone offset must be between -14 and 14 hours.' });
  }

  try {
    const { signKey, ascendant } = calculateRisingSign({
      birthYear,
      birthMonth,
      birthDay,
      birthHour,
      birthMinute,
      latitude: lat,
      longitude: lon,
      timezoneOffsetMinutes: tzOffset
    });
    const sign = ZODIAC_SIGNS[signKey];
    res.json({
      rising: { key: signKey, ...sign },
      ascendant
    });
  } catch (error) {
    console.error('Rising sign error:', error);
    res.status(500).json({ error: 'Unable to calculate rising sign.' });
  }
});

apiRouter.get('/zodiac/:sign/horoscope', (req, res) => {
  const signKey = normalizeSign(req.params.sign);
  const sign = ZODIAC_SIGNS[signKey];
  if (!sign) return res.status(404).json({ error: 'Unknown sign' });

  const period = sanitizeQueryParam(req.query.period) || 'daily';
  if (!ZODIAC_PERIODS.has(period)) {
    return res.status(400).json({ error: 'Invalid period. Use daily, weekly, or monthly.' });
  }

  const horoscope = buildHoroscope(sign, period);
  res.json({
    sign: { key: signKey, ...sign },
    period,
    range:
      period === 'daily'
        ? formatDateLabel(new Date(), { month: 'short', day: 'numeric', year: 'numeric' })
        : period === 'weekly'
          ? getWeekRange(new Date())
          : formatDateLabel(new Date(), { month: 'long', year: 'numeric' }),
    generatedAt: new Date().toISOString(),
    horoscope
  });
});

apiRouter.get('/auth/google', (req, res) => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    const nextPath = sanitizeNextPath(req.query.next);
    const redirectUrl = buildOauthRedirectUrl({ error: 'not_configured', nextPath });
    return res.redirect(redirectUrl);
  }

  const nextPath = sanitizeNextPath(req.query.next);
  const state = buildOauthState(nextPath);
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
    include_granted_scopes: 'true',
  });

  return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

apiRouter.get('/auth/google/callback', async (req, res) => {
  const code = typeof req.query.code === 'string' ? req.query.code : null;
  const state = typeof req.query.state === 'string' ? req.query.state : null;
  const oauthError = typeof req.query.error === 'string' ? req.query.error : null;

  if (oauthError) {
    const redirectUrl = buildOauthRedirectUrl({ error: oauthError });
    return res.redirect(redirectUrl);
  }

  if (!code || !state) {
    const redirectUrl = buildOauthRedirectUrl({ error: 'missing_code' });
    return res.redirect(redirectUrl);
  }

  const stateEntry = consumeOauthState(state);
  if (!stateEntry) {
    const redirectUrl = buildOauthRedirectUrl({ error: 'invalid_state' });
    return res.redirect(redirectUrl);
  }

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    const redirectUrl = buildOauthRedirectUrl({ error: 'not_configured', nextPath: stateEntry.nextPath });
    return res.redirect(redirectUrl);
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      const detail = await tokenRes.text();
      console.error('Google token exchange failed:', tokenRes.status, detail);
      const redirectUrl = buildOauthRedirectUrl({
        error: 'token_exchange_failed',
        nextPath: stateEntry.nextPath,
      });
      return res.redirect(redirectUrl);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData?.access_token;
    if (!accessToken) {
      const redirectUrl = buildOauthRedirectUrl({
        error: 'missing_access_token',
        nextPath: stateEntry.nextPath,
      });
      return res.redirect(redirectUrl);
    }

    const profileRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!profileRes.ok) {
      const detail = await profileRes.text();
      console.error('Google profile fetch failed:', profileRes.status, detail);
      const redirectUrl = buildOauthRedirectUrl({
        error: 'profile_fetch_failed',
        nextPath: stateEntry.nextPath,
      });
      return res.redirect(redirectUrl);
    }

    const profile = await profileRes.json();
    const email = profile?.email;
    if (!email) {
      const redirectUrl = buildOauthRedirectUrl({ error: 'missing_email', nextPath: stateEntry.nextPath });
      return res.redirect(redirectUrl);
    }

    const displayName =
      profile?.name
      || profile?.given_name
      || profile?.family_name
      || email.split('@')[0];

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      const randomPassword = crypto.randomBytes(24).toString('hex');
      const hashed = await hashPassword(randomPassword);
      if (!hashed) {
        const redirectUrl = buildOauthRedirectUrl({ error: 'server_error', nextPath: stateEntry.nextPath });
        return res.redirect(redirectUrl);
      }
      user = await prisma.user.create({
        data: { email, name: displayName, password: hashed },
      });
    } else if (!user.name && displayName) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { name: displayName },
      });
    }

    const token = createSessionToken(user.id);
    sessionStore.set(token, Date.now());

    const redirectUrl = buildOauthRedirectUrl({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isAdmin: isAdminUser(user),
      },
      nextPath: stateEntry.nextPath,
    });
    return res.redirect(redirectUrl);
  } catch (error) {
    console.error('Google OAuth callback error:', error);
    const redirectUrl = buildOauthRedirectUrl({ error: 'server_error', nextPath: stateEntry.nextPath });
    return res.redirect(redirectUrl);
  }
});

const handleRegister = async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  if (!isPasswordComplex(password)) {
    return res.status(400).json({
      error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters and include letters and numbers.`,
    });
  }

  try {
    const hashed = await hashPassword(password);
    if (!hashed) {
      return res.status(500).json({ error: 'Unable to process password' });
    }
    const user = await prisma.user.create({
      data: { email: String(email).trim().toLowerCase(), password: hashed, name },
    });
    res.json({
      message: 'User created',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isAdmin: isAdminUser(user),
      },
    });
  } catch (error) {
    if (error.code === 'P2002') res.status(409).json({ error: 'Email already exists' });
    else { console.error(error); res.status(500).json({ error: 'Internal server error' }); }
  }
};

const handleLogin = async (req, res) => {
  const { email, password } = req.body;
  try {
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user || !(await verifyPassword(password, user.password))) {
      return res.status(401).json({ error: 'Login failed' });
    }
    if (!isHashedPassword(user.password)) {
      const hashed = await hashPassword(password);
      if (hashed) {
        await prisma.user.update({ where: { id: user.id }, data: { password: hashed } });
      }
    }
    const token = createSessionToken(user.id);
    sessionStore.set(token, Date.now());
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isAdmin: isAdminUser(user)
      }
    });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Internal server error' }); }
};

const handleLogout = async (req, res) => {
  const token = getBearerToken(req) || req.body?.token || null;
  if (token) {
    sessionStore.delete(token);
  }
  res.json({ message: 'Logged out' });
};

apiRouter.post('/register', handleRegister);
apiRouter.post('/auth/register', handleRegister);
apiRouter.post('/login', handleLogin);
apiRouter.post('/auth/login', handleLogin);
apiRouter.post('/auth/logout', handleLogout);

apiRouter.get('/auth/wechat/redirect', (req, res) => {
  const redirectPath = sanitizeNextPath(req.query?.next) || '/profile';
  if (!WECHAT_APP_ID) {
    const target = new URL('/login', WECHAT_FRONTEND_URL);
    target.searchParams.set('error', 'wechat_not_configured');
    target.searchParams.set('provider', 'wechat');
    target.searchParams.set('next', redirectPath);
    return res.redirect(target.toString());
  }
  const state = createWeChatState(redirectPath);
  const redirectUri = encodeURIComponent(WECHAT_REDIRECT_URI);
  const scope = encodeURIComponent(WECHAT_SCOPE);
  const wechatUrl = `https://open.weixin.qq.com/connect/qrconnect?appid=${WECHAT_APP_ID}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=${state}#wechat_redirect`;
  res.redirect(wechatUrl);
});

apiRouter.get('/auth/wechat/callback', async (req, res) => {
  const code = typeof req.query?.code === 'string' ? req.query.code : null;
  const state = typeof req.query?.state === 'string' ? req.query.state : null;

  const redirectToFrontend = (params) => {
    const target = new URL('/login', WECHAT_FRONTEND_URL);
    const hashParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        if (key === 'token' || key === 'user') {
          hashParams.set(key, String(value));
        } else {
          target.searchParams.set(key, String(value));
        }
      }
    });
    if (hashParams.size) {
      target.hash = hashParams.toString();
    }
    res.redirect(target.toString());
  };

  if (!code || !state) {
    return redirectToFrontend({ error: 'wechat_missing_params', provider: 'wechat' });
  }
  if (!WECHAT_APP_ID || !WECHAT_APP_SECRET) {
    return redirectToFrontend({ error: 'wechat_not_configured', provider: 'wechat' });
  }
  const redirectPath = consumeWeChatState(state);
  if (!redirectPath) {
    return redirectToFrontend({ error: 'wechat_invalid_state', provider: 'wechat' });
  }

  try {
    const tokenRes = await fetchWithTimeout(
      `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${WECHAT_APP_ID}&secret=${WECHAT_APP_SECRET}&code=${code}&grant_type=authorization_code`,
      { method: 'GET' },
      10000
    );
    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      console.error('WeChat token error:', text);
      return redirectToFrontend({ error: 'wechat_token_failed', provider: 'wechat' });
    }
    const tokenData = await tokenRes.json();
    if (tokenData?.errcode) {
      console.error('WeChat token response error:', tokenData);
      return redirectToFrontend({ error: 'wechat_token_failed', provider: 'wechat' });
    }

    let profile = null;
    if (tokenData?.access_token && tokenData?.openid) {
      const profileRes = await fetchWithTimeout(
        `https://api.weixin.qq.com/sns/userinfo?access_token=${tokenData.access_token}&openid=${tokenData.openid}&lang=zh_CN`,
        { method: 'GET' },
        10000
      );
      if (profileRes.ok) {
        const profileData = await profileRes.json();
        if (!profileData?.errcode) {
          profile = profileData;
        }
      }
    }

    const openId = tokenData?.openid;
    if (!openId) {
      return redirectToFrontend({ error: 'wechat_missing_openid', provider: 'wechat' });
    }
    const email = `wechat_${openId}@wechat.local`;
    const displayName = profile?.nickname || 'WeChat User';

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      const hashed = await hashPassword(crypto.randomBytes(16).toString('hex'));
      if (!hashed) {
        return redirectToFrontend({ error: 'server_error', provider: 'wechat' });
      }
      user = await prisma.user.create({
        data: {
          email,
          password: hashed,
          name: displayName,
        },
      });
    } else if (!user.name && displayName) {
      user = await prisma.user.update({
        where: { email },
        data: { name: displayName },
      });
    }

    const token = createSessionToken(user.id);
    sessionStore.set(token, Date.now());

    const userPayload = {
      id: user.id,
      email: user.email,
      name: user.name,
      isAdmin: isAdminUser(user),
    };
    const encodedUser = Buffer.from(JSON.stringify(userPayload)).toString('base64url');
    return redirectToFrontend({
      token,
      user: encodedUser,
      next: redirectPath,
      provider: 'wechat',
    });
  } catch (error) {
    console.error('WeChat OAuth error:', error);
    return redirectToFrontend({ error: 'wechat_oauth_failed', provider: 'wechat' });
  }
});

apiRouter.post('/password/request', async (req, res) => {
  const startedAt = Date.now();
  const { email } = req.body || {};
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

  const sendResponse = async (status, payload) => {
    await ensureMinDuration(startedAt, RESET_REQUEST_MIN_DURATION_MS);
    return res.status(status).json(payload);
  };

  if (!normalizedEmail) {
    return sendResponse(400, { error: 'Email is required' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (user) {
      const token = createResetToken(user.id);
      if (PASSWORD_RESET_DEBUG_LOG) {
        console.log(`[password-reset] Reset token for ${user.email}: ${token}`);
      }
    }
  } catch (error) {
    console.error('Password reset request error:', error);
  }

  return sendResponse(200, {
    message: 'If an account exists for that email, a reset link has been sent.'
  });
});

apiRouter.post('/password/reset', async (req, res) => {
  const { token, password } = req.body || {};
  if (!token || typeof token !== 'string' || !password || typeof password !== 'string') {
    return res.status(400).json({ error: 'Reset token and new password are required' });
  }
  if (!isPasswordComplex(password)) {
    return res.status(400).json({
      error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters and include letters and numbers.`,
    });
  }

  const userId = consumeResetToken(token);
  if (!userId) {
    return res.status(400).json({ error: 'Invalid or expired reset token' });
  }

  try {
    const hashed = await hashPassword(password);
    if (!hashed) {
      return res.status(500).json({ error: 'Unable to process password' });
    }
    await prisma.user.update({ where: { id: userId }, data: { password: hashed } });
    return res.json({ message: 'Password updated' });
  } catch (error) {
    console.error('Password reset error:', error);
    return res.status(500).json({ error: 'Unable to reset password' });
  }
});

apiRouter.get('/user/settings', requireAuth, async (req, res) => {
  try {
    const rows = await prisma.$queryRaw`
      SELECT locale, preferences, updatedAt FROM UserSettings WHERE userId = ${req.user.id} LIMIT 1
    `;
    const row = Array.isArray(rows) ? rows[0] : null;
    const etag = buildSettingsEtag(row);
    if (etag) {
      res.set('ETag', etag);
    }
    res.json({
      settings: {
        locale: row?.locale ?? null,
        preferences: parsePreferences(row?.preferences),
        updatedAt: row?.updatedAt ?? null,
      },
      etag,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

apiRouter.put('/user/settings', requireAuth, async (req, res) => {
  const { locale, preferences } = req.body || {};
  if (locale !== undefined && typeof locale !== 'string') {
    return res.status(400).json({ error: 'Invalid locale' });
  }
  if (preferences !== undefined && (typeof preferences !== 'object' || Array.isArray(preferences))) {
    return res.status(400).json({ error: 'Invalid preferences' });
  }

  try {
    const expectedUpdatedAt =
      typeof req.body?.expectedUpdatedAt === 'string' ? req.body.expectedUpdatedAt : null;
    const ifMatchValue = parseIfMatchHeader(req.headers['if-match']);
    const rows = await prisma.$queryRaw`
      SELECT locale, preferences, updatedAt FROM UserSettings WHERE userId = ${req.user.id} LIMIT 1
    `;
    const row = Array.isArray(rows) ? rows[0] : null;
    const currentEtag = buildSettingsEtag(row);
    const hasRow = Boolean(row);
    if (ifMatchValue === '*' && !hasRow) {
      return res.status(409).json({
        error: 'Settings have changed. Please refresh and try again.',
        settings: null,
        etag: null,
      });
    }
    if (ifMatchValue && ifMatchValue !== '*' && (!hasRow || ifMatchValue !== row.updatedAt)) {
      return res.status(409).json({
        error: 'Settings have changed. Please refresh and try again.',
        settings: {
          locale: row?.locale ?? null,
          preferences: parsePreferences(row?.preferences),
          updatedAt: row?.updatedAt ?? null,
        },
        etag: currentEtag,
      });
    }
    if (expectedUpdatedAt && (!hasRow || expectedUpdatedAt !== row.updatedAt)) {
      return res.status(409).json({
        error: 'Settings have changed. Please refresh and try again.',
        settings: {
          locale: row?.locale ?? null,
          preferences: parsePreferences(row?.preferences),
          updatedAt: row?.updatedAt ?? null,
        },
        etag: currentEtag,
      });
    }

    const existingPreferences = parsePreferences(row?.preferences);
    const nextLocale = typeof locale === 'string' ? locale : row?.locale ?? null;
    const nextPreferences = preferences ?? existingPreferences ?? null;
    const preferencesJson = nextPreferences ? JSON.stringify(nextPreferences) : null;
    const requiresExisting = ifMatchValue === '*' || Boolean(expectedUpdatedAt) || Boolean(ifMatchValue);

    if (requiresExisting && !hasRow) {
      return res.status(409).json({
        error: 'Settings have changed. Please refresh and try again.',
        settings: null,
        etag: null,
      });
    }

    const expectedMatch =
      expectedUpdatedAt || (ifMatchValue && ifMatchValue !== '*' ? ifMatchValue : null);

    const updateResult = expectedMatch
      ? await prisma.$executeRaw`
          INSERT INTO UserSettings (userId, locale, preferences, createdAt, updatedAt)
          VALUES (${req.user.id}, ${nextLocale}, ${preferencesJson}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT(userId)
          DO UPDATE SET locale = excluded.locale, preferences = excluded.preferences, updatedAt = CURRENT_TIMESTAMP
          WHERE UserSettings.updatedAt = ${expectedMatch}
        `
      : await prisma.$executeRaw`
          INSERT INTO UserSettings (userId, locale, preferences, createdAt, updatedAt)
          VALUES (${req.user.id}, ${nextLocale}, ${preferencesJson}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT(userId)
          DO UPDATE SET locale = excluded.locale, preferences = excluded.preferences, updatedAt = CURRENT_TIMESTAMP
        `;

    if (expectedMatch && updateResult === 0) {
      const refreshRows = await prisma.$queryRaw`
        SELECT locale, preferences, updatedAt FROM UserSettings WHERE userId = ${req.user.id} LIMIT 1
      `;
      const refreshRow = Array.isArray(refreshRows) ? refreshRows[0] : null;
      const refreshEtag = buildSettingsEtag(refreshRow);
      return res.status(409).json({
        error: 'Settings have changed. Please refresh and try again.',
        settings: {
          locale: refreshRow?.locale ?? null,
          preferences: parsePreferences(refreshRow?.preferences),
          updatedAt: refreshRow?.updatedAt ?? null,
        },
        etag: refreshEtag,
      });
    }

    const updatedRows = await prisma.$queryRaw`
      SELECT locale, preferences, updatedAt FROM UserSettings WHERE userId = ${req.user.id} LIMIT 1
    `;
    const updatedRow = Array.isArray(updatedRows) ? updatedRows[0] : null;
    const updatedEtag = buildSettingsEtag(updatedRow);
    if (updatedEtag) {
      res.set('ETag', updatedEtag);
    }
    res.json({
      status: 'ok',
      settings: {
        locale: updatedRow?.locale ?? nextLocale ?? null,
        preferences: parsePreferences(updatedRow?.preferences) ?? nextPreferences ?? null,
        updatedAt: updatedRow?.updatedAt ?? null,
      },
      etag: updatedEtag,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

apiRouter.get('/auth/me', requireAuthStrict, (req, res) => {
  res.json({ user: req.user });
});

apiRouter.delete('/auth/me', requireAuthStrict, async (req, res) => {
  try {
    await deleteUserCascade({ prisma, userId: req.user.id, cleanupUserMemory });
    res.json({ message: 'User deleted' });
  } catch (error) {
    console.error('User self-delete failed:', error);
    res.status(500).json({ error: 'Unable to delete account' });
  }
});

apiRouter.get('/admin/health', requireAuth, requireAdmin, (req, res) => {
  res.json({ status: 'ok' });
});

apiRouter.delete('/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
  const userId = parseIdParam(req.params.id);
  if (!userId) return res.status(400).json({ error: 'Invalid user id' });
  try {
    await deleteUserCascade({ prisma, userId, cleanupUserMemory });
    res.json({ success: true });
  } catch (error) {
    console.error('Admin user delete failed:', error);
    res.status(500).json({ error: 'Unable to delete user' });
  }
});

apiRouter.post('/bazi/calculate', async (req, res) => {
  const validation = validateBaziInput(req.body);
  if (!validation.ok) {
    const message = validation.reason === 'whitespace'
      ? 'Whitespace-only input is not allowed'
      : 'Missing required fields';
    return res.status(400).json({ error: message });
  }

  const submitKey = buildBaziCalculationKey(validation.payload);
  const buildResponse = async () => {
    const payload = validation.payload;
    const { calculationPayload, timeMeta, trueSolarMeta } = resolveBaziCalculationInput(payload);
    const result = await getBaziCalculation(calculationPayload);
    return {
      pillars: result.pillars,
      fiveElements: result.fiveElements,
      fiveElementsPercent: result.fiveElementsPercent,
      trueSolarTime: trueSolarMeta,
      ...timeMeta,
    };
  };

  const { promise: calculationPromise, isNew } = baziCalculationDeduper.getOrCreate(
    submitKey,
    buildResponse
  );

  const finalize = () => {
    if (isNew) {
      baziCalculationDeduper.clear(submitKey);
    }
  };

  calculationPromise
    .then((payload) => res.json(payload))
    .catch((error) => {
      console.error(error);
      res.status(500).json({ error: 'Calculation error' });
    })
    .finally(finalize);
});

apiRouter.post('/bazi/full-analysis', requireAuth, async (req, res) => {
  const validation = validateBaziInput(req.body);
  if (!validation.ok) {
    const message = validation.reason === 'whitespace'
      ? 'Whitespace-only input is not allowed'
      : 'Missing required fields';
    return res.status(400).json({ error: message });
  }

  const submitKey = buildBaziCalculationKey(validation.payload, req.user?.id);
  const buildResponse = async () => {
    const payload = validation.payload;
    const { calculationPayload, timeMeta, trueSolarMeta } = resolveBaziCalculationInput(payload);
    const result = await getBaziCalculation(calculationPayload);
    return { ...result, ...timeMeta, trueSolarTime: trueSolarMeta };
  };

  const { promise: analysisPromise, isNew } = baziFullAnalysisDeduper.getOrCreate(
    submitKey,
    buildResponse
  );

  const finalize = () => {
    if (isNew) {
      baziFullAnalysisDeduper.clear(submitKey);
    }
  };

  analysisPromise
    .then((payload) => res.json(payload))
    .catch((error) => {
      console.error(error);
      res.status(500).json({ error: 'Calculation error' });
    })
    .finally(finalize);
});

apiRouter.post('/ziwei/calculate', requireAuth, (req, res) => {
  const { birthYear, birthMonth, birthDay, birthHour, gender } = req.body || {};
  if (!birthYear || !birthMonth || !birthDay || birthHour === undefined || !gender) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const birthYearNumber = Number(birthYear);
  const birthMonthNumber = Number(birthMonth);
  const birthDayNumber = Number(birthDay);
  const birthHourNumber = Number(birthHour);

  if (
    !Number.isInteger(birthYearNumber)
    || birthYearNumber < 1
    || birthYearNumber > 9999
    || !Number.isInteger(birthMonthNumber)
    || birthMonthNumber < 1
    || birthMonthNumber > 12
    || !Number.isInteger(birthDayNumber)
    || birthDayNumber < 1
    || birthDayNumber > 31
    || !Number.isInteger(birthHourNumber)
    || birthHourNumber < 0
    || birthHourNumber > 23
  ) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const payload = {
      ...req.body,
      birthYear: birthYearNumber,
      birthMonth: birthMonthNumber,
      birthDay: birthDayNumber,
      birthHour: birthHourNumber,
    };
    const result = calculateZiweiChart(payload);
    const timeMeta = buildBirthTimeMeta(payload);
    res.json({ ...result, ...timeMeta });
  } catch (error) {
    console.error('Ziwei calculation error:', error);
    res.status(500).json({ error: 'Calculation error' });
  }
});

apiRouter.post('/ziwei/ai-interpret', requireAuth, async (req, res) => {
  const { birthYear, birthMonth, birthDay, birthHour, gender, chart: chartPayload } = req.body || {};
  let provider = null;
  try {
    provider = resolveAiProvider(req.body?.provider);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Invalid AI provider.' });
  }

  let chart = chartPayload;
  let birthMeta = {
    birthYear,
    birthMonth,
    birthDay,
    birthHour,
    gender,
  };

  const hasChart = chart && typeof chart === 'object';
  if (!hasChart) {
    const birthYearNumber = Number(birthYear);
    const birthMonthNumber = Number(birthMonth);
    const birthDayNumber = Number(birthDay);
    const birthHourNumber = Number(birthHour);
    if (
      !Number.isInteger(birthYearNumber)
      || birthYearNumber < 1
      || birthYearNumber > 9999
      || !Number.isInteger(birthMonthNumber)
      || birthMonthNumber < 1
      || birthMonthNumber > 12
      || !Number.isInteger(birthDayNumber)
      || birthDayNumber < 1
      || birthDayNumber > 31
      || !Number.isInteger(birthHourNumber)
      || birthHourNumber < 0
      || birthHourNumber > 23
      || !gender
    ) {
      return res.status(400).json({ error: 'Zi Wei chart data required' });
    }
    const payload = {
      birthYear: birthYearNumber,
      birthMonth: birthMonthNumber,
      birthDay: birthDayNumber,
      birthHour: birthHourNumber,
      gender,
    };
    const result = calculateZiweiChart(payload);
    const timeMeta = buildBirthTimeMeta(payload);
    chart = { ...result, ...timeMeta };
    birthMeta = payload;
  }

  const { system, user, fallback } = buildZiweiPrompt({
    chart,
    birth: birthMeta,
  });

  const release = acquireAiGuard(req.user.id);
  if (!release) {
    return res.status(429).json({ error: AI_CONCURRENCY_ERROR });
  }
  try {
    const content = await generateAIContent({ system, user, fallback, provider });
    res.json({ content });
  } finally {
    release();
  }
});

apiRouter.post('/ziwei/history', requireAuth, async (req, res) => {
  const { birthYear, birthMonth, birthDay, birthHour, gender } = req.body || {};
  if (!birthYear || !birthMonth || !birthDay || birthHour === undefined || !gender) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const birthYearNumber = Number(birthYear);
  const birthMonthNumber = Number(birthMonth);
  const birthDayNumber = Number(birthDay);
  const birthHourNumber = Number(birthHour);

  if (
    !Number.isInteger(birthYearNumber)
    || birthYearNumber < 1
    || birthYearNumber > 9999
    || !Number.isInteger(birthMonthNumber)
    || birthMonthNumber < 1
    || birthMonthNumber > 12
    || !Number.isInteger(birthDayNumber)
    || birthDayNumber < 1
    || birthDayNumber > 31
    || !Number.isInteger(birthHourNumber)
    || birthHourNumber < 0
    || birthHourNumber > 23
  ) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const payload = {
      birthYear: birthYearNumber,
      birthMonth: birthMonthNumber,
      birthDay: birthDayNumber,
      birthHour: birthHourNumber,
      gender,
    };
    const result = calculateZiweiChart(payload);
    const timeMeta = buildBirthTimeMeta(payload);
    const record = await prisma.ziweiRecord.create({
      data: {
        userId: req.user.id,
        birthYear: birthYearNumber,
        birthMonth: birthMonthNumber,
        birthDay: birthDayNumber,
        birthHour: birthHourNumber,
        gender: String(gender),
        chart: JSON.stringify({ ...result, ...timeMeta }),
      },
    });
    res.json({ record: serializeZiweiRecord(record) });
  } catch (error) {
    console.error('Failed to save Ziwei history:', error);
    res.status(500).json({ error: 'Unable to save history' });
  }
});

apiRouter.get('/ziwei/history', requireAuth, async (req, res) => {
  const rawLimit = Number(req.query.limit);
  const take = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 30;
  try {
    const records = await prisma.ziweiRecord.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take,
    });
    res.json({ records: records.map(serializeZiweiRecord) });
  } catch (error) {
    console.error('Failed to load Ziwei history:', error);
    res.status(500).json({ error: 'Unable to load history' });
  }
});

apiRouter.delete('/ziwei/history/:id', requireAuth, async (req, res) => {
  const recordId = Number(req.params.id);
  if (!Number.isInteger(recordId) || recordId <= 0) {
    return res.status(400).json({ error: 'Invalid record id' });
  }
  try {
    const record = await prisma.ziweiRecord.findUnique({ where: { id: recordId } });
    if (!record || record.userId !== req.user.id) {
      return res.status(404).json({ error: 'Record not found' });
    }
    await prisma.ziweiRecord.delete({ where: { id: recordId } });
    res.json({ status: 'ok' });
  } catch (error) {
    console.error('Failed to delete Ziwei history:', error);
    res.status(500).json({ error: 'Unable to delete history' });
  }
});

apiRouter.post('/bazi/records', requireAuth, async (req, res) => {
  const validation = validateBaziInput(req.body);
  if (!validation.ok) {
    const message = validation.reason === 'whitespace'
      ? 'Whitespace-only input is not allowed'
      : 'Missing required fields';
    return res.status(400).json({ error: message });
  }

  const clientId = extractClientId(req);
  const submitKey = buildBaziSubmitKey(req.user.id, validation.payload);

  const createRecord = async () => {
    const {
      birthYear,
      birthMonth,
      birthDay,
      birthHour,
      gender,
      birthLocation,
      timezone,
      result: providedResult,
    } = validation.payload;

    const { calculationPayload } = resolveBaziCalculationInput({
      ...validation.payload,
      birthYear,
      birthMonth,
      birthDay,
      birthHour,
      gender,
    });
    const normalizedProvidedResult =
      providedResult && typeof providedResult === 'object' ? providedResult : null;
    const needsCalculation =
      !normalizedProvidedResult?.pillars
      || !normalizedProvidedResult?.fiveElements
      || !normalizedProvidedResult?.tenGods
      || !normalizedProvidedResult?.luckCycles;
    const computedResult = needsCalculation ? await getBaziCalculation(calculationPayload) : null;
    const finalResult = {
      pillars: normalizedProvidedResult?.pillars ?? computedResult?.pillars,
      fiveElements: normalizedProvidedResult?.fiveElements ?? computedResult?.fiveElements,
      tenGods: normalizedProvidedResult?.tenGods ?? computedResult?.tenGods ?? null,
      luckCycles: normalizedProvidedResult?.luckCycles ?? computedResult?.luckCycles ?? null,
    };

    if (!finalResult.pillars || !finalResult.fiveElements) {
      return null;
    }

    primeBaziCalculationCache(calculationPayload, finalResult);

    return prisma.baziRecord.create({
      data: {
        userId: req.user.id,
        birthYear,
        birthMonth,
        birthDay,
        birthHour,
        gender,
        birthLocation: typeof birthLocation === 'string' && birthLocation.trim()
          ? birthLocation.trim()
          : null,
        timezone: typeof timezone === 'string' && timezone.trim() ? timezone.trim() : null,
        pillars: JSON.stringify(finalResult.pillars),
        fiveElements: JSON.stringify(finalResult.fiveElements),
        tenGods: finalResult.tenGods ? JSON.stringify(finalResult.tenGods) : null,
        luckCycles: finalResult.luckCycles ? JSON.stringify(finalResult.luckCycles) : null,
      },
    });
  };

  const { promise: createPromise, isNew } = baziSubmitDeduper.getOrCreate(
    submitKey,
    createRecord
  );

  if (!isNew) {
    try {
      const record = await createPromise;
      if (!record) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      trackClientRecords(req.user.id, clientId, [record.id]);
      return res.json({ record: serializeRecordWithTimezone(record) });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  try {
    const record = await createPromise;
    if (!record) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    trackClientRecords(req.user.id, clientId, [record.id]);
    return res.json({ record: serializeRecordWithTimezone(record) });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (isNew) {
      baziSubmitDeduper.clear(submitKey);
    }
  }
});

const normalizeRangeFilter = (rangeDays) => {
  if (typeof rangeDays === 'string') {
    const normalized = rangeDays.trim().toLowerCase();
    if (normalized === 'today') return { rangeType: 'today', rangeDays: null };
    if (normalized === 'week' || normalized === 'this-week' || normalized === 'thisweek') {
      return { rangeType: 'week', rangeDays: null };
    }
  }
  const parsedRange = Number(rangeDays);
  const validRangeDays = Number.isFinite(parsedRange) && parsedRange > 0 ? parsedRange : null;
  return { rangeType: null, rangeDays: validRangeDays };
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const getStartOfLocalDayUtc = (baseDate, offsetMinutes) => {
  const offsetMs = offsetMinutes * 60000;
  const localNow = new Date(baseDate.getTime() + offsetMs);
  const localStartUtcMs = Date.UTC(
    localNow.getUTCFullYear(),
    localNow.getUTCMonth(),
    localNow.getUTCDate()
  );
  return new Date(localStartUtcMs - offsetMs);
};

const getStartOfLocalWeekUtc = (baseDate, offsetMinutes) => {
  const offsetMs = offsetMinutes * 60000;
  const localNow = new Date(baseDate.getTime() + offsetMs);
  const localStartUtcMs = Date.UTC(
    localNow.getUTCFullYear(),
    localNow.getUTCMonth(),
    localNow.getUTCDate()
  );
  const day = localNow.getUTCDay();
  const diffToMonday = (day + 6) % 7;
  const weekStartLocalUtcMs = localStartUtcMs - diffToMonday * MS_PER_DAY;
  return new Date(weekStartLocalUtcMs - offsetMs);
};

const parseRecordsQuery = (source) => {
  const {
    page = '1',
    pageSize = '100',
    q,
    gender,
    rangeDays,
    sort,
    status,
    timezoneOffsetMinutes,
    clientId,
  } = source || {};

  const parsedPage = Number(page);
  const parsedPageSize = Number(pageSize);
  const safePage = Number.isFinite(parsedPage) && parsedPage > 0 ? Math.trunc(parsedPage) : 1;
  const safePageSize = Number.isFinite(parsedPageSize) && parsedPageSize > 0
    ? Math.min(Math.trunc(parsedPageSize), 500)
    : 100;

  const normalizedQuery = typeof q === 'string' ? q.trim() : '';
  const normalizedGender = typeof gender === 'string' ? gender.trim().toLowerCase() : '';
  const validGender = normalizedGender === 'male' || normalizedGender === 'female'
    ? normalizedGender
    : null;
  const { rangeType, rangeDays: validRangeDays } = normalizeRangeFilter(rangeDays);
  const resolvedTimezoneOffsetMinutes = parseTimezoneOffsetMinutes(timezoneOffsetMinutes);
  const sortOption = typeof sort === 'string' && sort.trim() ? sort.trim() : 'created-desc';
  const statusOption = typeof status === 'string' ? status.trim().toLowerCase() : 'active';
  const normalizedStatus = ['active', 'deleted', 'all'].includes(statusOption) ? statusOption : 'active';
  const normalizedClientId = normalizeClientId(clientId);

  return {
    safePage,
    safePageSize,
    normalizedQuery,
    validGender,
    validRangeDays,
    rangeType,
    timezoneOffsetMinutes: resolvedTimezoneOffsetMinutes,
    sortOption,
    normalizedStatus,
    clientId: normalizedClientId,
  };
};

const getBaziRecords = async (req, res, source) => {
  const sourceWithClient = {
    ...(source || {}),
    clientId: source?.clientId ?? extractClientId(req),
  };
  const {
    safePage,
    safePageSize,
    normalizedQuery,
    validGender,
    validRangeDays,
    rangeType,
    timezoneOffsetMinutes,
    sortOption,
    normalizedStatus,
    clientId,
  } = parseRecordsQuery(sourceWithClient);
  const hasQuotes = normalizedQuery.includes('"') || normalizedQuery.includes("'");
  const searchTerms = normalizedQuery
    ? (hasQuotes ? parseSearchTerms(normalizedQuery) : [normalizedQuery])
    : [];
  const normalizedTerms = searchTerms
    .map((term) => term.toLowerCase())
    .filter(Boolean);
  const shouldFilterInMemory = normalizedTerms.length > 0;
  const birthSortDirection = sortOption === 'birth-asc'
    ? 'asc'
    : sortOption === 'birth-desc'
      ? 'desc'
      : null;

  const baseWhere = { userId: req.user.id };
  const where = { userId: req.user.id };
  const clientRecordSet = null;
  const clientRecordIds =
    clientRecordSet && clientRecordSet.size ? Array.from(clientRecordSet) : null;
  const deletedIds = await fetchDeletedRecordIds(req.user.id);
  const deletedIdSet = new Set(deletedIds);
  const clientDeletedSet = null;
  const scopedDeletedIds = null;
  const clientRecordDeletedIds = null;

  if (normalizedStatus === 'active') {
    if (deletedIds.length) {
      baseWhere.id = { notIn: deletedIds };
      where.id = { notIn: deletedIds };
    }
  } else if (normalizedStatus === 'deleted') {
    let filteredIds = deletedIds;
    if (clientDeletedSet && scopedDeletedIds?.length) {
      filteredIds = scopedDeletedIds;
      if (clientRecordSet) {
        filteredIds = filteredIds.filter((id) => clientRecordSet.has(id));
      }
    } else if (clientRecordDeletedIds?.length) {
      filteredIds = clientRecordDeletedIds;
    }
    if (!filteredIds.length) {
      return res.json({
        records: [],
        hasMore: false,
        totalCount: 0,
        filteredCount: 0,
      });
    }
    baseWhere.id = { in: filteredIds };
    where.id = { in: filteredIds };
  }
  if (validGender) where.gender = validGender;
  if (rangeType === 'today') {
    const offsetMinutes = Number.isFinite(timezoneOffsetMinutes) ? timezoneOffsetMinutes : 0;
    const start = getStartOfLocalDayUtc(new Date(), offsetMinutes);
    where.createdAt = { gte: start };
  } else if (rangeType === 'week') {
    const offsetMinutes = Number.isFinite(timezoneOffsetMinutes) ? timezoneOffsetMinutes : 0;
    const start = getStartOfLocalWeekUtc(new Date(), offsetMinutes);
    where.createdAt = { gte: start };
  } else if (validRangeDays) {
    where.createdAt = { gte: new Date(Date.now() - validRangeDays * 24 * 60 * 60 * 1000) };
  }
  if (!shouldFilterInMemory && normalizedQuery) {
    if (searchTerms.length > 1) {
      where.AND = searchTerms.map((term) => ({ OR: buildSearchOr(term) }));
    } else if (searchTerms.length === 1) {
      where.OR = buildSearchOr(searchTerms[0]);
    }
  }

  let orderBy = [{ createdAt: 'desc' }, { id: 'desc' }];
  if (sortOption === 'created-asc') {
    orderBy = [{ createdAt: 'asc' }, { id: 'asc' }];
  } else if (sortOption === 'birth-desc') {
    orderBy = [
      { birthYear: 'desc' },
      { birthMonth: 'desc' },
      { birthDay: 'desc' },
      { birthHour: 'desc' },
      { createdAt: 'desc' },
      { id: 'desc' },
    ];
  } else if (sortOption === 'birth-asc') {
    orderBy = [
      { birthYear: 'asc' },
      { birthMonth: 'asc' },
      { birthDay: 'asc' },
      { birthHour: 'asc' },
      { createdAt: 'desc' },
      { id: 'desc' },
    ];
  }

  const prismaBaseWhere = normalizePrismaWhere(baseWhere);
  const prismaWhere = normalizePrismaWhere(where);

  const skip = (safePage - 1) * safePageSize;

  if (shouldFilterInMemory) {
    const [totalCount, records] = await Promise.all([
      prisma.baziRecord.count({ where: prismaBaseWhere }),
      prisma.baziRecord.findMany({ where: prismaWhere, orderBy, select: BAZI_LIST_SELECT }),
    ]);
    const filteredRecords = records.filter((record) =>
      normalizedTerms.every((term) => recordMatchesQuery(record, term))
    );
    const sortedRecords = birthSortDirection
      ? sortRecordsByBirth(filteredRecords, birthSortDirection)
      : filteredRecords;
    const filteredCount = sortedRecords.length;
    const pageSlice = sortedRecords.slice(skip, skip + safePageSize + 1);
    const hasMore = pageSlice.length > safePageSize;
    const pageRecords = hasMore ? pageSlice.slice(0, safePageSize) : pageSlice;

    return res.json({
      records: pageRecords.map(serializeRecordForList),
      hasMore,
      totalCount,
      filteredCount,
    });
  }

  if (birthSortDirection) {
    const [totalCount, records] = await Promise.all([
      prisma.baziRecord.count({ where: prismaBaseWhere }),
      prisma.baziRecord.findMany({ where: prismaWhere, select: BAZI_LIST_SELECT }),
    ]);
    const sortedRecords = sortRecordsByBirth(records, birthSortDirection);
    const filteredCount = sortedRecords.length;
    const pageSlice = sortedRecords.slice(skip, skip + safePageSize + 1);
    const hasMore = pageSlice.length > safePageSize;
    const pageRecords = hasMore ? pageSlice.slice(0, safePageSize) : pageSlice;

    return res.json({
      records: pageRecords.map(serializeRecordForList),
      hasMore,
      totalCount,
      filteredCount,
    });
  }

  const [totalCount, filteredCount, records] = await Promise.all([
    prisma.baziRecord.count({ where: prismaBaseWhere }),
    prisma.baziRecord.count({ where: prismaWhere }),
    prisma.baziRecord.findMany({
      where: prismaWhere,
      orderBy,
      skip,
      take: safePageSize + 1,
      select: BAZI_LIST_SELECT,
    }),
  ]);
  const hasMore = records.length > safePageSize;
  const pageRecords = hasMore ? records.slice(0, safePageSize) : records;

  return res.json({
    records: pageRecords.map(serializeRecordForList),
    hasMore,
    totalCount,
    filteredCount,
  });
};

apiRouter.get('/bazi/records', requireAuth, async (req, res) => {
  return getBaziRecords(req, res, req.query);
});

apiRouter.post('/bazi/records/search', requireAuth, async (req, res) => {
  return getBaziRecords(req, res, req.body);
});

apiRouter.get('/bazi/records/export', requireAuth, async (req, res) => {
  const {
    normalizedQuery,
    validGender,
    validRangeDays,
    sortOption,
    normalizedStatus,
  } = parseRecordsQuery(req.query);
  const includeDeletedStatus =
    normalizedStatus !== 'active'
    || req.query?.includeDeletedStatus === '1'
    || req.query?.includeDeletedStatus === 'true';
  const hasQuotes = normalizedQuery.includes('"') || normalizedQuery.includes("'");
  const searchTerms = normalizedQuery
    ? (hasQuotes ? parseSearchTerms(normalizedQuery) : [normalizedQuery])
    : [];
  const normalizedTerms = searchTerms
    .map((term) => term.toLowerCase())
    .filter(Boolean);
  const shouldFilterInMemory = normalizedTerms.length > 0;

  const where = { userId: req.user.id };
  const deletedIds = await fetchDeletedRecordIds(req.user.id);
  const deletedSet = new Set(deletedIds);

  if (normalizedStatus === 'active' && deletedIds.length) {
    where.id = { notIn: deletedIds };
  } else if (normalizedStatus === 'deleted') {
    if (!deletedIds.length) {
      return res.json({
        version: 1,
        exportedAt: new Date().toISOString(),
        records: [],
      });
    }
    where.id = { in: deletedIds };
  }
  if (validGender) where.gender = validGender;
  if (validRangeDays) {
    where.createdAt = { gte: new Date(Date.now() - validRangeDays * 24 * 60 * 60 * 1000) };
  }
  if (!shouldFilterInMemory && normalizedQuery) {
    if (searchTerms.length > 1) {
      where.AND = searchTerms.map((term) => ({ OR: buildSearchOr(term) }));
    } else if (searchTerms.length === 1) {
      where.OR = buildSearchOr(searchTerms[0]);
    }
  }

  let orderBy = [{ createdAt: 'desc' }, { id: 'desc' }];
  if (sortOption === 'created-asc') {
    orderBy = [{ createdAt: 'asc' }, { id: 'asc' }];
  } else if (sortOption === 'birth-desc') {
    orderBy = [
      { birthYear: 'desc' },
      { birthMonth: 'desc' },
      { birthDay: 'desc' },
      { birthHour: 'desc' },
      { createdAt: 'desc' },
      { id: 'desc' },
    ];
  } else if (sortOption === 'birth-asc') {
    orderBy = [
      { birthYear: 'asc' },
      { birthMonth: 'asc' },
      { birthDay: 'asc' },
      { birthHour: 'asc' },
      { createdAt: 'desc' },
      { id: 'desc' },
    ];
  }

  const prismaWhere = normalizePrismaWhere(where);
  let records = await prisma.baziRecord.findMany({
    where: prismaWhere,
    orderBy,
  });
  if (shouldFilterInMemory) {
    records = records.filter((record) =>
      normalizedTerms.every((term) => recordMatchesQuery(record, term))
    );
  }
  const deletedCount = normalizedStatus === 'all'
    ? deletedIds.length
    : normalizedStatus === 'deleted'
      ? records.length
      : 0;
  const activeCount = normalizedStatus === 'all'
    ? Math.max(0, records.length - deletedCount)
    : normalizedStatus === 'active'
      ? records.length
      : 0;
  const exportedRecords = records.map((record) => {
    const base = serializeRecordWithTimezone(record);
    if (!includeDeletedStatus) return base;
    return { ...base, softDeleted: deletedSet.has(record.id) };
  });
  res.json({
    version: 2,
    exportedAt: new Date().toISOString(),
    status: normalizedStatus,
    totalCount: exportedRecords.length,
    activeCount,
    deletedCount,
    records: exportedRecords,
  });
});

apiRouter.post('/bazi/records/import', requireAuth, async (req, res) => {
  let incoming = null;
  if (Array.isArray(req.body)) {
    incoming = req.body;
  } else if (req.body && typeof req.body === 'object') {
    if (!('records' in req.body)) {
      return res.status(400).json({ error: 'Invalid import file format' });
    }
    if (!Array.isArray(req.body.records)) {
      return res.status(400).json({ error: 'Invalid import file format' });
    }
    incoming = req.body.records;
  } else {
    return res.status(400).json({ error: 'Invalid import file format' });
  }

  if (!incoming.length) {
    return res.status(400).json({ error: 'No records provided' });
  }

  const errorIndices = [];
  const failedIndices = [];
  let created = 0;
  let validCount = 0;
  let batchEntries = [];
  const softDeletedEntries = [];

  const flushBatch = async () => {
    if (!batchEntries.length) return;
    const batchRecords = batchEntries.map((entry) => entry.record);
    try {
      const result = await prisma.baziRecord.createMany({ data: batchRecords });
      created += result.count;
    } catch (error) {
      console.error('Import error (bulk):', error);
      for (const entry of batchEntries) {
        try {
          await prisma.baziRecord.create({ data: entry.record });
          created += 1;
        } catch (entryError) {
          console.error('Import error (single):', entryError);
          failedIndices.push(entry.index);
        }
      }
    } finally {
      batchEntries = [];
    }
  };

  const importSoftDeletedEntries = async () => {
    if (!softDeletedEntries.length) return;
    await ensureSoftDeleteReady();
    for (const entry of softDeletedEntries) {
      try {
        const createdRecord = await prisma.baziRecord.create({ data: entry.record });
        created += 1;
        await prisma.$executeRaw`
          INSERT OR IGNORE INTO BaziRecordTrash (userId, recordId)
          VALUES (${req.user.id}, ${createdRecord.id})
        `;
      } catch (entryError) {
        console.error('Import error (soft delete):', entryError);
        failedIndices.push(entry.index);
      }
    }
  };

  const isSoftDeleted = (raw) => Boolean(raw?.softDeleted || raw?.isDeleted);

  for (let index = 0; index < incoming.length; index += 1) {
    const raw = incoming[index];
    const record = await buildImportRecord(raw, req.user.id);
    if (record) {
      validCount += 1;
      if (isSoftDeleted(raw)) {
        softDeletedEntries.push({ index, record });
      } else {
        batchEntries.push({ index, record });
        if (batchEntries.length >= IMPORT_BATCH_SIZE) {
          await flushBatch();
        }
      }
    } else {
      errorIndices.push(index);
    }
  }

  if (!validCount) {
    return res.status(400).json({ error: 'No valid records found' });
  }

  await flushBatch();
  await importSoftDeletedEntries();

  if (!created) {
    return res.status(500).json({
      error: 'Unable to import records',
      failed: failedIndices.slice(0, 5),
    });
  }

  res.json({
    created,
    skipped: incoming.length - validCount,
    failed: failedIndices.length ? failedIndices.slice(0, 5) : undefined,
    errors: errorIndices.length ? errorIndices.slice(0, 5) : undefined,
    softDeleted: softDeletedEntries.length || undefined,
  });
});

apiRouter.post('/bazi/records/bulk-delete', requireAuth, async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : null;
  if (!ids || !ids.length) {
    return res.status(400).json({ error: 'No record ids provided' });
  }
  const clientId = extractClientId(req);

  const normalizedIds = ids
    .map((id) => parseIdParam(id))
    .filter((id) => id !== null);

  if (!normalizedIds.length) {
    return res.status(400).json({ error: 'No valid record ids provided' });
  }

  const existing = await prisma.baziRecord.findMany({
    where: { userId: req.user.id, id: { in: normalizedIds } },
    select: { id: true },
  });
  const existingIds = existing.map((record) => record.id);

  if (!existingIds.length) {
    return res.status(404).json({ error: 'No matching records found' });
  }

  await ensureSoftDeleteReady();
  await prisma.$executeRaw(
    Prisma.sql`
      INSERT OR IGNORE INTO BaziRecordTrash (userId, recordId)
      VALUES ${Prisma.join(existingIds.map((id) => Prisma.sql`(${req.user.id}, ${id})`))}
    `
  );
  trackClientDeletedRecords(req.user.id, clientId, existingIds);

  res.json({
    deleted: existingIds.length,
    requested: normalizedIds.length,
    skipped: normalizedIds.length - existingIds.length,
  });
});

apiRouter.get('/bazi/records/:id', requireAuth, async (req, res) => {
  const recordId = parseIdParam(req.params.id);
  if (!recordId) return res.status(400).json({ error: 'Invalid record id' });
  const record = await prisma.baziRecord.findFirst({
    where: { id: recordId, userId: req.user.id },
  });
  if (!record) return res.status(404).json({ error: 'Record not found' });
  if (await isRecordSoftDeleted(req.user.id, recordId)) {
    return res.status(404).json({ error: 'Record not found' });
  }
  res.json({ record: serializeRecordWithTimezone(record) });
});

apiRouter.put('/bazi/records/:id', requireAuth, async (req, res) => {
  const recordId = parseIdParam(req.params.id);
  if (!recordId) return res.status(400).json({ error: 'Invalid record id' });

  const existing = await prisma.baziRecord.findFirst({
    where: { id: recordId, userId: req.user.id },
  });
  if (!existing) return res.status(404).json({ error: 'Record not found' });
  if (await isRecordSoftDeleted(req.user.id, recordId)) {
    return res.status(404).json({ error: 'Record not found' });
  }

  const mergedPayload = {
    ...req.body,
    birthYear: req.body?.birthYear ?? existing.birthYear,
    birthMonth: req.body?.birthMonth ?? existing.birthMonth,
    birthDay: req.body?.birthDay ?? existing.birthDay,
    birthHour: req.body?.birthHour ?? existing.birthHour,
    gender: req.body?.gender ?? existing.gender,
    birthLocation: req.body?.birthLocation ?? existing.birthLocation,
    timezone: req.body?.timezone ?? existing.timezone,
  };

  const validation = validateBaziInput(mergedPayload);
  if (!validation.ok) {
    const message = validation.reason === 'whitespace'
      ? 'Whitespace-only input is not allowed'
      : 'Missing required fields';
    return res.status(400).json({ error: message });
  }

  const {
    birthYear,
    birthMonth,
    birthDay,
    birthHour,
    gender,
    birthLocation,
    timezone,
    result: providedResult,
  } = validation.payload;

  const { calculationPayload } = resolveBaziCalculationInput({
    ...validation.payload,
    birthYear,
    birthMonth,
    birthDay,
    birthHour,
    gender,
  });
  const normalizedProvidedResult =
    providedResult && typeof providedResult === 'object' ? providedResult : null;
  const needsCalculation =
    !normalizedProvidedResult?.pillars
    || !normalizedProvidedResult?.fiveElements
    || !normalizedProvidedResult?.tenGods
    || !normalizedProvidedResult?.luckCycles;
  const computedResult = needsCalculation ? await getBaziCalculation(calculationPayload) : null;
  const finalResult = {
    pillars: normalizedProvidedResult?.pillars ?? computedResult?.pillars,
    fiveElements: normalizedProvidedResult?.fiveElements ?? computedResult?.fiveElements,
    tenGods: normalizedProvidedResult?.tenGods ?? computedResult?.tenGods ?? null,
    luckCycles: normalizedProvidedResult?.luckCycles ?? computedResult?.luckCycles ?? null,
  };

  if (!finalResult.pillars || !finalResult.fiveElements) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  invalidateBaziCalculationCache({
    birthYear: existing.birthYear,
    birthMonth: existing.birthMonth,
    birthDay: existing.birthDay,
    birthHour: existing.birthHour,
    gender: existing.gender,
  });
  invalidateBaziCalculationCache({
    birthYear,
    birthMonth,
    birthDay,
    birthHour,
    gender,
  });
  primeBaziCalculationCache(calculationPayload, finalResult);

  const updated = await prisma.baziRecord.update({
    where: { id: recordId },
    data: {
      birthYear,
      birthMonth,
      birthDay,
      birthHour,
      gender,
      birthLocation: typeof birthLocation === 'string' && birthLocation.trim()
        ? birthLocation.trim()
        : null,
      timezone: typeof timezone === 'string' && timezone.trim() ? timezone.trim() : null,
      pillars: JSON.stringify(finalResult.pillars),
      fiveElements: JSON.stringify(finalResult.fiveElements),
      tenGods: finalResult.tenGods ? JSON.stringify(finalResult.tenGods) : null,
      luckCycles: finalResult.luckCycles ? JSON.stringify(finalResult.luckCycles) : null,
    },
  });

  res.json({ record: serializeRecordWithTimezone(updated) });
});

apiRouter.delete('/bazi/records/:id', requireAuth, async (req, res) => {
  const recordId = parseIdParam(req.params.id);
  if (!recordId) return res.status(400).json({ error: 'Invalid record id' });
  const clientId = extractClientId(req);
  const record = await prisma.baziRecord.findFirst({
    where: { id: recordId, userId: req.user.id },
  });
  if (!record) return res.status(404).json({ error: 'Record not found' });

  invalidateBaziCalculationCache({
    birthYear: record.birthYear,
    birthMonth: record.birthMonth,
    birthDay: record.birthDay,
    birthHour: record.birthHour,
    gender: record.gender,
  });

  await ensureSoftDeleteReady();
  await prisma.$executeRaw`
    INSERT OR IGNORE INTO BaziRecordTrash (userId, recordId) VALUES (${req.user.id}, ${recordId})
  `;
  trackClientDeletedRecords(req.user.id, clientId, [recordId]);
  res.json({ status: 'ok', softDeleted: true });
});

apiRouter.post('/bazi/records/:id/restore', requireAuth, async (req, res) => {
  const recordId = parseIdParam(req.params.id);
  if (!recordId) return res.status(400).json({ error: 'Invalid record id' });
  const clientId = extractClientId(req);
  const record = await prisma.baziRecord.findFirst({
    where: { id: recordId, userId: req.user.id },
  });
  if (!record) return res.status(404).json({ error: 'Record not found' });

  await ensureSoftDeleteReady();
  const deletedRows = await prisma.$queryRaw`
    SELECT id FROM BaziRecordTrash WHERE userId = ${req.user.id} AND recordId = ${recordId} LIMIT 1
  `;
  if (!deletedRows.length) {
    return res.status(404).json({ error: 'Record not deleted' });
  }

  await prisma.$executeRaw`
    DELETE FROM BaziRecordTrash WHERE userId = ${req.user.id} AND recordId = ${recordId}
  `;
  removeClientDeletedRecord(req.user.id, clientId, recordId);

  res.json({ status: 'ok', record: serializeRecordWithTimezone(record) });
});

apiRouter.delete('/bazi/records/:id/hard-delete', requireAuth, async (req, res) => {
  const recordId = parseIdParam(req.params.id);
  if (!recordId) return res.status(400).json({ error: 'Invalid record id' });
  const clientId = extractClientId(req);
  const record = await prisma.baziRecord.findFirst({
    where: { id: recordId, userId: req.user.id },
  });
  if (!record) return res.status(404).json({ error: 'Record not found' });

  if (!(await isRecordSoftDeleted(req.user.id, recordId))) {
    return res.status(409).json({ error: 'Record must be deleted first' });
  }

  invalidateBaziCalculationCache({
    birthYear: record.birthYear,
    birthMonth: record.birthMonth,
    birthDay: record.birthDay,
    birthHour: record.birthHour,
    gender: record.gender,
  });

  try {
    const { deletedCount } = await deleteBaziRecordHard({
      prisma,
      userId: req.user.id,
      recordId,
    });
    removeClientDeletedRecord(req.user.id, clientId, recordId);
    removeClientRecord(req.user.id, clientId, recordId);
    if (!deletedCount) {
      return res.status(404).json({ error: 'Record not found' });
    }
    return res.json({ status: 'ok', hardDeleted: true });
  } catch (error) {
    console.error('Hard delete failed:', error);
    return res.status(500).json({ error: 'Unable to delete record' });
  }
});

apiRouter.post('/favorites', requireAuth, async (req, res) => {
  const { recordId } = req.body;
  if (!recordId) return res.status(400).json({ error: 'Record ID required' });

  const record = await prisma.baziRecord.findFirst({ where: { id: recordId, userId: req.user.id } });
  if (!record) return res.status(404).json({ error: 'Record not found' });
  if (await isRecordSoftDeleted(req.user.id, recordId)) {
    return res.status(404).json({ error: 'Record not found' });
  }

  const existingFavorite = await prisma.favorite.findUnique({
    where: { userId_recordId: { userId: req.user.id, recordId } },
  });
  if (existingFavorite) {
    return res.json({
      favorite: {
        ...existingFavorite,
        record: serializeRecordWithTimezone(record),
      },
    });
  }

  let favorite = null;
  try {
    favorite = await prisma.favorite.create({
      data: { userId: req.user.id, recordId },
      include: { record: true },
    });
  } catch (error) {
    if (error?.code === 'P2002') {
      const fallbackFavorite = await prisma.favorite.findUnique({
        where: { userId_recordId: { userId: req.user.id, recordId } },
      });
      if (fallbackFavorite) {
        return res.json({
          favorite: {
            ...fallbackFavorite,
            record: serializeRecordWithTimezone(record),
          },
        });
      }
      return res.status(409).json({ error: 'Favorite already exists' });
    }
    console.error('Failed to create favorite:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }

  res.json({
    favorite: {
      ...favorite,
      record: serializeRecordWithTimezone(favorite.record),
    },
  });
});

apiRouter.get('/favorites', requireAuth, async (req, res) => {
  const favorites = await prisma.favorite.findMany({
    where: { userId: req.user.id, record: { userId: req.user.id } },
    include: { record: true },
    orderBy: { createdAt: 'desc' },
  });
  const deletedIds = await fetchDeletedRecordIds(req.user.id);
  const deletedSet = new Set(deletedIds);
  res.json({
    favorites: favorites
      .filter((favorite) => !deletedSet.has(favorite.recordId))
      .map((favorite) => ({
        ...favorite,
        record: serializeRecordWithTimezone(favorite.record),
      })),
  });
});

apiRouter.delete('/favorites/:id', requireAuth, async (req, res) => {
  const favoriteId = parseIdParam(req.params.id);
  if (!favoriteId) return res.status(400).json({ error: 'Invalid favorite id' });
  const favorite = await prisma.favorite.findFirst({ where: { id: favoriteId, userId: req.user.id } });
  if (!favorite) return res.status(404).json({ error: 'Favorite not found' });

  await prisma.favorite.delete({ where: { id: favoriteId } });
  res.json({ status: 'ok' });
});


apiRouter.post('/bazi/ai-interpret', requireAuth, async (req, res) => {
  const { pillars, fiveElements, tenGods, strength } = req.body;
  if (!pillars) return res.status(400).json({ error: 'Bazi data required' });
  let provider = null;
  try {
    provider = resolveAiProvider(req.body?.provider);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Invalid AI provider.' });
  }

  const { system, user, fallback } = buildBaziPrompt({
    pillars,
    fiveElements,
    tenGods,
    luckCycles: req.body.luckCycles,
    strength
  });

  const release = acquireAiGuard(req.user.id);
  if (!release) {
    return res.status(429).json({ error: AI_CONCURRENCY_ERROR });
  }
  try {
    const content = await generateAIContent({ system, user, fallback, provider });
    res.json({ content });
  } finally {
    release();
  }
});


// --- Tarot Endpoints ---

apiRouter.get('/tarot/cards', (req, res) => {
  res.json({ cards: tarotDeck });
});

apiRouter.post('/tarot/draw', async (req, res) => {
  const { spreadType = 'SingleCard' } = req.body || {};
  const normalizedSpread = spreadType || 'SingleCard';
  const needsAuth = normalizedSpread !== 'SingleCard';
  const user = await resolveOptionalUser(req, res);
  if (res.headersSent) return;
  if (needsAuth && !user) {
    return res.status(401).json({ error: 'Login required for this spread.' });
  }
  res.json(drawTarot({ spreadType: normalizedSpread }));
});

apiRouter.post('/tarot/ai-interpret', requireAuthStrict, async (req, res) => {
  const { spreadType, cards, userQuestion } = req.body;
  if (!cards || cards.length === 0) return res.status(400).json({ error: 'No cards provided' });
  let provider = null;
  try {
    provider = resolveAiProvider(req.body?.provider);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Invalid AI provider.' });
  }

  const normalizedSpread = spreadType || 'SingleCard';
  const spreadConfig = getTarotSpreadConfig(normalizedSpread);
  const positions = spreadConfig.positions || [];
  const cardList = cards.map((card, index) => {
    const positionLabel = card.positionLabel || positions[index]?.label;
    const positionMeaning = card.positionMeaning || positions[index]?.meaning;
    const positionText = [
      positionLabel ? `${positionLabel}` : null,
      positionMeaning ? `${positionMeaning}` : null
    ].filter(Boolean).join(' — ');
    return `${card.position}. ${positionText ? `${positionText} - ` : ''}${card.name} (${card.isReversed ? 'Reversed' : 'Upright'}) - ${card.isReversed ? card.meaningRev : card.meaningUp}`;
  }).join('\n');

  const system = 'You are a tarot reader. Provide a concise reading in Markdown with sections: Interpretation and Advice. Use the position meanings for context. Keep under 220 words. Reference key cards by name.';
  const user = `
Spread: ${normalizedSpread || 'Unknown'}
Question: ${userQuestion || 'General Reading'}
Cards:
${cardList}
  `.trim();
  const fallback = () => {
    const interpretation = 'The spread points to momentum building around your question, with key lessons emerging from the central cards.';
    const advice = 'Reflect on the card themes and take one grounded action aligned with the most constructive card.';
    return `
## 🔮 Tarot Reading: ${normalizedSpread || 'Unknown'}
**Interpretation:** ${interpretation}

**Advice:** ${advice}
    `.trim();
  };

  const release = acquireAiGuard(req.user.id);
  if (!release) {
    return res.status(429).json({ error: AI_CONCURRENCY_ERROR });
  }
  let content = '';
  try {
    content = await generateAIContent({ system, user, fallback, provider });
  } finally {
    release();
  }

  // Persist the record
  try {
    await prisma.tarotRecord.create({
      data: {
        userId: req.user.id,
        spreadType: normalizedSpread,
        cards: JSON.stringify(cards),
        userQuestion,
        aiInterpretation: content
      }
    });
  } catch (e) {
    console.error('Failed to save tarot record:', e);
    // Don't block response on save failure, but good to know
  }

  res.json({ content });
});

apiRouter.get('/tarot/history', requireAuth, async (req, res) => {
  try {
    const records = await prisma.tarotRecord.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' }
    });
    const payload = records.map((record) => ({
      id: record.id,
      spreadType: record.spreadType,
      userQuestion: record.userQuestion,
      aiInterpretation: record.aiInterpretation,
      cards: JSON.parse(record.cards || '[]'),
      createdAt: record.createdAt
    }));
    res.json({ records: payload });
  } catch (error) {
    console.error('Failed to load tarot history:', error);
    res.status(500).json({ error: 'Unable to load history' });
  }
});

apiRouter.delete('/tarot/history/:id', requireAuth, async (req, res) => {
  const recordId = parseIdParam(req.params.id);
  if (!recordId) return res.status(400).json({ error: 'Invalid record id' });

  try {
    const record = await prisma.tarotRecord.findUnique({ where: { id: recordId } });
    if (!record || record.userId !== req.user.id) {
      return res.status(404).json({ error: 'Record not found' });
    }
    await prisma.tarotRecord.delete({ where: { id: recordId } });
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete tarot record:', error);
    res.status(500).json({ error: 'Unable to delete record' });
  }
});

// --- I Ching Endpoints ---

apiRouter.get('/iching/hexagrams', (req, res) => {
  res.json({ hexagrams });
});

apiRouter.post('/iching/divine', (req, res) => {
  const { method = 'number', numbers } = req.body || {};
  let inputNumbers = numbers;
  let timeContext = null;

  if (method === 'time') {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const hour = now.getHours();
    const minute = now.getMinutes();
    inputNumbers = [year + month + day, hour + minute, year + month + day + hour + minute];
    timeContext = { year, month, day, hour, minute, iso: now.toISOString() };
  } else if (!Array.isArray(numbers) || numbers.length !== 3) {
    return res.status(400).json({ error: 'Provide three numbers for number divination.' });
  }

  const parsedNumbers = inputNumbers.map((value) => Number(value));
  if (parsedNumbers.some((value) => !Number.isFinite(value))) {
    return res.status(400).json({ error: 'Numbers must be valid integers.' });
  }

  const upperTrigram = pickTrigram(parsedNumbers[0]);
  const lowerTrigram = pickTrigram(parsedNumbers[1]);
  let changingLines = [];
  if (method === 'time' && timeContext) {
    changingLines = deriveChangingLinesFromTimeContext(timeContext);
  } else {
    changingLines = deriveChangingLinesFromNumbers(parsedNumbers);
  }
  if (!upperTrigram || !lowerTrigram) {
    return res.status(400).json({ error: 'Unable to compute a hexagram from the provided numbers.' });
  }

  const hexagram = buildHexagram(upperTrigram, lowerTrigram);
  if (!hexagram) {
    return res.status(500).json({ error: 'Hexagram lookup failed.' });
  }

  const resultingHexagram = applyChangingLines(hexagram, changingLines);

  res.json({
    method,
    numbers: parsedNumbers,
    timeContext,
    hexagram,
    changingLines,
    resultingHexagram,
  });
});

apiRouter.post('/iching/ai-interpret', requireAuth, async (req, res) => {
  const { hexagram, resultingHexagram, changingLines, userQuestion, method, timeContext } = req.body;
  if (!hexagram) return res.status(400).json({ error: 'Hexagram data required' });
  let provider = null;
  try {
    provider = resolveAiProvider(req.body?.provider);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Invalid AI provider.' });
  }

  const lines = Array.isArray(changingLines) && changingLines.length > 0 ? changingLines.join(', ') : 'None';
  const hexagramName = typeof hexagram === 'string' ? hexagram : (hexagram?.name || 'Unknown');
  const resultName = resultingHexagram
    ? (typeof resultingHexagram === 'string' ? resultingHexagram : (resultingHexagram?.name || 'Unknown'))
    : 'None';
  const timeLine = timeContext
    ? `Time: ${timeContext.year}-${String(timeContext.month).padStart(2, '0')}-${String(timeContext.day).padStart(2, '0')} ${String(timeContext.hour).padStart(2, '0')}:${String(timeContext.minute).padStart(2, '0')}`
    : null;
  const methodLine = method ? `Method: ${method}` : null;

  const system = 'You are an I Ching interpreter. Provide a concise interpretation in Markdown with sections: Interpretation and Advice. Mention the primary and resulting hexagrams when available. Keep under 200 words.';
  const user = `
Question: ${userQuestion || 'General Guidance'}
${methodLine || ''}
${timeLine || ''}
Hexagram: ${hexagramName}
Resulting Hexagram: ${resultName}
Changing Lines: ${lines}
  `.trim();
  const fallback = () => {
    const interpretation = 'The primary hexagram points to steady progress through mindful adaptation, while the resulting hexagram signals how the situation may evolve.';
    const advice = 'Align with your core values while remaining flexible about timing and approach.';
    return `
## ☯️ I Ching Interpretation
**Interpretation:** ${interpretation}

**Advice:** ${advice}
    `.trim();
  };

  const release = acquireAiGuard(req.user.id);
  if (!release) {
    return res.status(429).json({ error: AI_CONCURRENCY_ERROR });
  }
  try {
    const content = await generateAIContent({ system, user, fallback, provider });
    res.json({ content });
  } finally {
    release();
  }
});

apiRouter.post('/iching/history', requireAuth, async (req, res) => {
  const {
    method,
    numbers,
    hexagram,
    resultingHexagram,
    changingLines,
    timeContext,
    userQuestion,
    aiInterpretation,
  } = req.body || {};

  if (!hexagram || typeof hexagram !== 'object') {
    return res.status(400).json({ error: 'Hexagram data required' });
  }

  try {
    const record = await prisma.ichingRecord.create({
      data: {
        userId: req.user.id,
        method: typeof method === 'string' && method.trim() ? method.trim() : 'number',
        numbers: Array.isArray(numbers) ? JSON.stringify(numbers) : null,
        hexagram: JSON.stringify(hexagram),
        resultingHexagram: resultingHexagram ? JSON.stringify(resultingHexagram) : null,
        changingLines: Array.isArray(changingLines) ? JSON.stringify(changingLines) : null,
        timeContext: timeContext ? JSON.stringify(timeContext) : null,
        userQuestion: typeof userQuestion === 'string' ? userQuestion.trim() : null,
        aiInterpretation: typeof aiInterpretation === 'string' ? aiInterpretation : null,
      },
    });
    res.json({ record: serializeIchingRecord(record) });
  } catch (error) {
    console.error('Failed to save I Ching record:', error);
    res.status(500).json({ error: 'Unable to save record' });
  }
});

apiRouter.get('/iching/history', requireAuth, async (req, res) => {
  try {
    const records = await prisma.ichingRecord.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ records: records.map(serializeIchingRecord) });
  } catch (error) {
    console.error('Failed to load I Ching history:', error);
    res.status(500).json({ error: 'Unable to load history' });
  }
});

apiRouter.delete('/iching/history/:id', requireAuth, async (req, res) => {
  const recordId = parseIdParam(req.params.id);
  if (!recordId) return res.status(400).json({ error: 'Invalid record id' });

  try {
    const record = await prisma.ichingRecord.findUnique({ where: { id: recordId } });
    if (!record || record.userId !== req.user.id) {
      return res.status(404).json({ error: 'Record not found' });
    }
    await prisma.ichingRecord.delete({ where: { id: recordId } });
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete I Ching record:', error);
    res.status(500).json({ error: 'Unable to delete record' });
  }
});

const normalizeOpenApiPath = (path) => {
  if (!path) return '/';
  const normalized = path.replace(/\/+/g, '/');
  return normalized === '' ? '/' : normalized;
};

const extractPathParams = (path) => {
  const params = [];
  const regex = /:([A-Za-z0-9_]+)/g;
  let match = regex.exec(path);
  while (match) {
    params.push(match[1]);
    match = regex.exec(path);
  }
  return params;
};

const toOpenApiPath = (path) => path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');

const collectRouterRoutes = (router, prefix = '') => {
  const routes = [];
  if (!router?.stack) return routes;

  router.stack.forEach((layer) => {
    if (layer?.route?.path) {
      const routePath = normalizeOpenApiPath(`${prefix}${layer.route.path}`);
      const methods = Object.keys(layer.route.methods || {}).filter((method) => layer.route.methods[method]);
      methods.forEach((method) => {
        routes.push({ method, path: routePath });
      });
      return;
    }

    if (layer?.name === 'router' && layer.handle?.stack) {
      routes.push(...collectRouterRoutes(layer.handle, prefix));
    }
  });

  return routes;
};

const buildOpenApiSpec = () => {
  const paths = {};
  const routes = [
    { method: 'get', path: '/health' },
    { method: 'get', path: '/ready' },
    ...collectRouterRoutes(apiRouter, '/api/v1'),
  ];

  routes.forEach(({ method, path }) => {
    const openApiPath = toOpenApiPath(path);
    const pathParams = extractPathParams(path);

    if (!paths[openApiPath]) {
      paths[openApiPath] = {};
    }

    const operation = {
      summary: `${method.toUpperCase()} ${openApiPath}`,
      responses: {
        200: { description: 'OK' },
        400: { description: 'Bad request' },
        401: { description: 'Unauthorized' },
        500: { description: 'Server error' },
      },
    };

    if (pathParams.length > 0) {
      operation.parameters = pathParams.map((name) => ({
        name,
        in: 'path',
        required: true,
        schema: { type: 'string' },
      }));
    }

    if (['post', 'put', 'patch'].includes(method)) {
      operation.requestBody = {
        required: false,
        content: {
          'application/json': {
            schema: { type: 'object', additionalProperties: true },
          },
        },
      };
    }

    paths[openApiPath][method] = operation;
  });

  const baseUrl = OPENAPI_BASE_URL;
  return {
    openapi: '3.0.0',
    info: {
      title: 'BaZi Master API',
      version: '1.0.0',
      description: 'Auto-generated Swagger documentation.',
    },
    servers: [{ url: baseUrl }],
    paths,
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
  };
};

const openApiSpec = buildOpenApiSpec();
const apiDocsGuards = IS_PRODUCTION ? [requireAuth, requireAdmin] : [];
app.get('/api-docs.json', ...apiDocsGuards, (req, res) => res.json(openApiSpec));
app.use(
  '/api-docs',
  ...apiDocsGuards,
  swaggerUi.serve,
  swaggerUi.setup(openApiSpec, { explorer: true })
);

const server = http.createServer(app);
const activeSockets = new Set();

server.on('connection', (socket) => {
  activeSockets.add(socket);
  socket.on('close', () => {
    activeSockets.delete(socket);
  });
});

server.on('upgrade', (req, socket, head) => {
  if ((req.url || '').length > MAX_URL_LENGTH) {
    socket.write('HTTP/1.1 414 Request-URI Too Long\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }

  if (req.url !== WS_PATH) {
    socket.destroy();
    return;
  }

  const origin = req.headers.origin;
  if (origin && !isAllowedOrigin(origin)) {
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }

  const upgradeHeader = req.headers.upgrade;
  if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
    socket.destroy();
    return;
  }

  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.destroy();
    return;
  }

  const acceptKey = buildWsAcceptKey(key);
  const responseHeaders = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${acceptKey}`,
  ];
  socket.write(`${responseHeaders.join('\r\n')}\r\n\r\n`);

  let buffer = head && head.length ? Buffer.from(head) : Buffer.alloc(0);
  let isBusy = false;
  let isClosed = false;

  const sendClose = (code = 1000) => {
    if (isClosed) return;
    isClosed = true;
    const payload = Buffer.alloc(2);
    payload.writeUInt16BE(code, 0);
    socket.write(encodeWsFrame(payload, 0x8));
    socket.end();
  };

  const sendPong = (payload) => {
    if (isClosed) return;
    socket.write(encodeWsFrame(payload, 0x0a));
  };

  const streamContent = async (content) => {
    const chunkSize = 120;
    for (let i = 0; i < content.length; i += chunkSize) {
      if (isClosed) return;
      const chunk = content.slice(i, i + chunkSize);
      sendWsJson(socket, { type: 'chunk', content: chunk });
    }
  };

  const handleTextMessage = async (text) => {
    if (isClosed) return;
    let message;
    try {
      message = JSON.parse(text);
    } catch {
      sendWsJson(socket, { type: 'error', message: 'Invalid JSON payload.' });
      sendClose(1002);
      return;
    }

    if (message?.type !== 'bazi_ai_request') {
      sendWsJson(socket, { type: 'error', message: 'Unsupported request type.' });
      return;
    }

    if (isBusy) {
      sendWsJson(socket, { type: 'error', message: 'Request already in progress.' });
      return;
    }
    isBusy = true;

    let release = null;
    try {
      const token = message?.token;
      const user = await authorizeToken(token);
      release = acquireAiGuard(user.id);
      if (!release) {
        sendWsJson(socket, { type: 'error', message: AI_CONCURRENCY_ERROR });
        return;
      }
      const payload = message?.payload;
      if (!payload?.pillars) {
        sendWsJson(socket, { type: 'error', message: 'Bazi data required.' });
        sendClose(1003);
        return;
      }
      let provider = null;
      try {
        provider = resolveAiProvider(message?.provider);
      } catch (error) {
        sendWsJson(socket, { type: 'error', message: error.message || 'Invalid AI provider.' });
        return;
      }

      sendWsJson(socket, { type: 'start' });
      const { system, user: userPrompt, fallback } = buildBaziPrompt(payload);

      await generateAIContent({
        system,
        user: userPrompt,
        fallback,
        provider,
        onChunk: (chunk) => {
          if (!isClosed) {
            sendWsJson(socket, { type: 'chunk', content: chunk });
          }
        }
      });

      if (!isClosed) {
        sendWsJson(socket, { type: 'done' });
        sendClose(1000);
      }
    } catch (error) {
      sendWsJson(socket, { type: 'error', message: error.message || 'AI request failed.' });
      sendClose(1011);
    } finally {
      if (release) {
        release();
      }
      isBusy = false;
    }
  };

  sendWsJson(socket, { type: 'connected' });

  const markClosed = () => {
    if (isClosed) return;
    isClosed = true;
  };

  socket.on('data', (data) => {
    buffer = Buffer.concat([buffer, data]);
    const result = decodeWsFrames(buffer);
    buffer = result.remainder;

    for (const frame of result.frames) {
      if (frame.payload.length > WS_MAX_PAYLOAD) {
        sendWsJson(socket, { type: 'error', message: 'Payload too large.' });
        sendClose(1009);
        return;
      }

      if (frame.opcode === 0x8) {
        sendClose(1000);
        return;
      }
      if (frame.opcode === 0x9) {
        sendPong(frame.payload);
        continue;
      }
      if (frame.opcode === 0x1) {
        const text = frame.payload.toString('utf8');
        void handleTextMessage(text);
      }
    }
  });

  socket.on('end', markClosed);
  socket.on('close', markClosed);
  socket.on('error', () => {
    sendClose(1011);
  });
});

app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  const isPayloadTooLarge = err?.type === 'entity.too.large';
  const status = isPayloadTooLarge
    ? 413
    : Number(err?.statusCode || err?.status || 500);
  const isClientError = status >= 400 && status < 500;
  const message = isPayloadTooLarge
    ? 'Request body too large'
    : (isClientError ? (err?.message || 'Bad request') : 'Internal server error');

  if (status >= 500) {
    console.error('Unhandled error:', err);
  }

  return res.status(status).json({ error: message });
});

const isMain = (() => {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
})();

const setupGracefulShutdown = (httpServer) => {
  let shuttingDown = false;

  const closeServer = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}. Starting graceful shutdown.`);

    const timeout = setTimeout(() => {
      console.warn('Graceful shutdown timed out. Forcing socket close.');
      for (const socket of activeSockets) {
        socket.destroy();
      }
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);

    timeout.unref();

    httpServer.close(async () => {
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

if (NODE_ENV !== 'test' && isMain) {
  void (async () => {
    setupGracefulShutdown(server);
    const { errors, warnings } = validateProductionConfig();
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
      await ensureUserSettingsTable();
      await ensureZiweiHistoryTable();
      await ensureBaziRecordUpdatedAt();
      await ensureDefaultUser();
    } catch (error) {
      console.error('Failed to initialize server prerequisites:', error);
    }

    server.listen(PORT, () => {
      console.log(`BaZi Master API running on http://localhost:${PORT}`);
    });
  })();
}

export {
  BRANCHES_MAP,
  ELEMENTS,
  STEMS_MAP,
  app,
  buildBaziCacheKey,
  buildFiveElementsPercent,
  buildImportRecord,
  buildSearchOr,
  buildPillar,
  calculateTenGod,
  getBaziCalculation,
  getCachedBaziCalculation,
  getCachedBaziCalculationAsync,
  getElementRelation,
  invalidateBaziCalculationCache,
  normalizeBaziResult,
  parseRecordsQuery,
  parseSearchTerms,
  performCalculation,
  prisma,
  recordMatchesQuery,
  primeBaziCalculationCache,
  server,
  serializeRecordWithTimezone,
  setBaziCacheEntry,
  buildBirthTimeMeta,
};
