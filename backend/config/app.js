import { parseOriginList } from '../middleware/cors.middleware.js';

const readNumber = (value, fallback) => {
  if (value === undefined || value === null || value === '') {
    return Number(fallback);
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number(fallback);
};

// TRUST_PROXY=1 must mean "trust exactly one hop", not Express's boolean `true`
// ("trust every proxy"). With `true`, req.ip is taken from the leftmost X-Forwarded-For
// entry, which is fully attacker-controlled — rate limiting becomes bypassable by
// sending a forged header. Numeric values are therefore kept numeric.
const parseTrustProxy = (raw) => {
  if (raw === undefined || raw === null || raw === '') return false;
  const normalized = String(raw).trim();
  if (/^\d+$/.test(normalized)) return Number(normalized);
  if (normalized.toLowerCase() === 'true') return true;
  if (normalized.toLowerCase() === 'false') return false;
  return normalized;
};

export const getServerConfig = () => {
  const port = readNumber(process.env.PORT, 4000);
  // express.json() buffers and parses the whole body, so a handful of concurrent
  // max-size requests amplify into gigabytes of heap and OOM the container. No endpoint
  // here takes more than a few kilobytes of birth data.
  const jsonBodyLimit = process.env.JSON_BODY_LIMIT || '1mb';
  const maxUrlLength = readNumber(process.env.MAX_URL_LENGTH, 16384);
  const nodeEnv = process.env.NODE_ENV || '';
  const isProduction = nodeEnv === 'production';
  const rateLimitWindowMs = readNumber(process.env.RATE_LIMIT_WINDOW_MS, isProduction ? 60_000 : 0);
  const rateLimitMax = readNumber(process.env.RATE_LIMIT_MAX, isProduction ? 120 : 0);

  const openaiApiKey = process.env.OPENAI_API_KEY || '';
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY || '';
  const aiProvider = (
    process.env.AI_PROVIDER ||
    (openaiApiKey ? 'openai' : null) ||
    (anthropicApiKey ? 'anthropic' : null) ||
    'mock'
  ).toLowerCase();

  const openaiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const anthropicModel = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20240620';
  const aiMaxTokens = readNumber(process.env.AI_MAX_TOKENS, 700);
  const aiTimeoutMs = readNumber(process.env.AI_TIMEOUT_MS, 15000);

  const openApiBaseUrl = process.env.BACKEND_BASE_URL || `http://localhost:${port}`;
  const shutdownTimeoutMs = readNumber(process.env.SHUTDOWN_TIMEOUT_MS, 10000);
  const corsAllowedOrigins = process.env.CORS_ALLOWED_ORIGINS || '';
  const availableProviders = [
    { name: 'openai', enabled: Boolean(openaiApiKey) },
    { name: 'anthropic', enabled: Boolean(anthropicApiKey) },
    { name: 'mock', enabled: true },
  ];

  return {
    port,
    jsonBodyLimit,
    maxUrlLength,
    rateLimitWindowMs,
    rateLimitMax,
    aiProvider,
    openaiApiKey,
    anthropicApiKey,
    openaiModel,
    anthropicModel,
    aiMaxTokens,
    aiTimeoutMs,
    availableProviders,
    openApiBaseUrl,
    shutdownTimeoutMs,
    corsAllowedOrigins,
    nodeEnv,
  };
};

export const getBaziCacheConfig = () => ({
  ttlMs: readNumber(process.env.BAZI_CACHE_TTL_MS, 6 * 60 * 60 * 1000),
  maxEntries: readNumber(process.env.BAZI_CACHE_MAX_ENTRIES, 500),
});

export const initAppConfig = () => {
  const serverConfig = getServerConfig();

  const {
    port: PORT,
    jsonBodyLimit: JSON_BODY_LIMIT,
    maxUrlLength: MAX_URL_LENGTH,
    rateLimitWindowMs: RATE_LIMIT_WINDOW_MS,
    rateLimitMax: RATE_LIMIT_MAX,
    aiProvider: AI_PROVIDER,
    availableProviders: AVAILABLE_PROVIDERS,
    nodeEnv: NODE_ENV,
  } = serverConfig;

  const RATE_LIMIT_ENABLED = NODE_ENV === 'production' || RATE_LIMIT_MAX > 0;
  const IS_PRODUCTION = NODE_ENV === 'production';

  // CORS_ALLOWED_ORIGINS is the only origin source. There used to be a FRONTEND_URL too,
  // but its other jobs (OAuth redirects, password-reset email links) are gone, and two
  // variables that both had to be right was a standing source of "CORS blocked" reports.
  // The engine ships no UI of its own; whatever client calls it goes in this list.
  const allowedOrigins = new Set([
    ...parseOriginList(process.env.CORS_ALLOWED_ORIGINS),
    ...(IS_PRODUCTION ? [] : ['http://localhost:3000', 'http://127.0.0.1:3000']),
  ]);

  const trustProxy = parseTrustProxy(process.env.TRUST_PROXY);

  return {
    PORT,
    JSON_BODY_LIMIT,
    MAX_URL_LENGTH,
    RATE_LIMIT_WINDOW_MS,
    RATE_LIMIT_MAX,
    RATE_LIMIT_ENABLED,
    AI_PROVIDER,
    AVAILABLE_PROVIDERS,
    NODE_ENV,
    IS_PRODUCTION,
    allowedOrigins,
    trustProxy,
  };
};
