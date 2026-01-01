const readNumber = (value, fallback) => {
  if (value === undefined || value === null || value === '') {
    return Number(fallback);
  }
  return Number(value);
};

const parseAdminEmails = (raw, nodeEnv = '') => {
  const fallback = nodeEnv === 'production' ? '' : 'admin@example.com';
  return new Set(
    (raw || fallback)
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
};

const normalizeOrigin = (value) => {
  if (!value || typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    return url.origin;
  } catch {
    return '';
  }
};

const expandLoopbackOrigins = (origin) => {
  if (!origin || typeof origin !== 'string') return [];
  const origins = new Set([origin]);

  try {
    const url = new URL(origin);
    if (url.hostname === 'localhost') {
      origins.add(origin.replace('localhost', '127.0.0.1'));
    } else if (url.hostname === '127.0.0.1') {
      origins.add(origin.replace('127.0.0.1', 'localhost'));
    }
  } catch {
    // Ignore invalid URLs
  }

  return Array.from(origins);
};

const parseOriginList = (value) => {
  if (!value || typeof value !== 'string') return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .flatMap(expandLoopbackOrigins);
};

const parseTrustProxy = (raw) => {
  if (raw === '1' || raw === 'true') return true;
  if (raw === '0' || raw === 'false') return false;
  return raw || false;
};

export const getServerConfig = () => {
  const port = process.env.PORT || 4000;
  const jsonBodyLimit = process.env.JSON_BODY_LIMIT || '50mb';
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

  const resetTokenTtlMs = readNumber(process.env.RESET_TOKEN_TTL_MS, 30 * 60 * 1000);
  const resetRequestMinDurationMs = readNumber(process.env.RESET_REQUEST_MIN_DURATION_MS, 350);
  const googleClientId = process.env.GOOGLE_CLIENT_ID || '';
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
  const googleRedirectUri =
    process.env.GOOGLE_REDIRECT_URI || `http://localhost:${port}/api/auth/google/callback`;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const adminEmails = parseAdminEmails(process.env.ADMIN_EMAILS, nodeEnv);
  const sessionTokenSecret =
    process.env.SESSION_TOKEN_SECRET ||
    (nodeEnv === 'test' ? 'test-session-secret-for-auth-me-test' : '');
  const allowDevOauthRaw = process.env.ALLOW_DEV_OAUTH;
  const allowDevOauth =
    allowDevOauthRaw === undefined || allowDevOauthRaw === ''
      ? !isProduction
      : allowDevOauthRaw === '1' || allowDevOauthRaw === 'true';

  const wechatAppId = process.env.WECHAT_APP_ID || '';
  const wechatAppSecret = process.env.WECHAT_APP_SECRET || '';
  const wechatScope = process.env.WECHAT_SCOPE || 'snsapi_login';
  const wechatFrontendUrl =
    process.env.WECHAT_FRONTEND_URL || frontendUrl || 'http://localhost:3000';
  const backendBaseUrl = process.env.BACKEND_BASE_URL || 'http://localhost:4000';
  const wechatRedirectUri =
    process.env.WECHAT_REDIRECT_URI || `${backendBaseUrl}/api/auth/wechat/callback`;
  const openApiBaseUrl = process.env.BACKEND_BASE_URL || `http://localhost:${port}`;

  const importBatchSize = readNumber(process.env.IMPORT_BATCH_SIZE, 500);
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
    resetTokenTtlMs,
    resetRequestMinDurationMs,
    googleClientId,
    googleClientSecret,
    googleRedirectUri,
    frontendUrl,
    adminEmails,
    sessionTokenSecret,
    allowDevOauth,
    wechatAppId,
    wechatAppSecret,
    wechatScope,
    wechatFrontendUrl,
    wechatRedirectUri,
    openApiBaseUrl,
    importBatchSize,
    shutdownTimeoutMs,
    corsAllowedOrigins,
    nodeEnv,
  };
};

export const getSessionConfig = () => ({
  sessionIdleMs: readNumber(process.env.SESSION_IDLE_MS, 30 * 60 * 1000),
});

export const getBaziCacheConfig = () => ({
  ttlMs: readNumber(process.env.BAZI_CACHE_TTL_MS, 6 * 60 * 60 * 1000),
  maxEntries: readNumber(process.env.BAZI_CACHE_MAX_ENTRIES, 500),
});

export const initAppConfig = () => {
  const sessionConfig = getSessionConfig();
  const serverConfig = getServerConfig();

  const {
    port: PORT,
    jsonBodyLimit: JSON_BODY_LIMIT,
    maxUrlLength: MAX_URL_LENGTH,
    rateLimitWindowMs: RATE_LIMIT_WINDOW_MS,
    rateLimitMax: RATE_LIMIT_MAX,
    aiProvider: AI_PROVIDER,
    availableProviders: AVAILABLE_PROVIDERS,
    googleClientId: GOOGLE_CLIENT_ID,
    googleClientSecret: GOOGLE_CLIENT_SECRET,
    googleRedirectUri: GOOGLE_REDIRECT_URI,
    frontendUrl: FRONTEND_URL,
    adminEmails: ADMIN_EMAILS,
    allowDevOauth: DEV_OAUTH_ENABLED,
    wechatAppId: WECHAT_APP_ID,
    wechatAppSecret: WECHAT_APP_SECRET,
    wechatScope: WECHAT_SCOPE,
    wechatFrontendUrl: WECHAT_FRONTEND_URL,
    wechatRedirectUri: WECHAT_REDIRECT_URI,
    nodeEnv: NODE_ENV,
  } = serverConfig;

  const RATE_LIMIT_ENABLED = NODE_ENV === 'production' || RATE_LIMIT_MAX > 0;
  const IS_PRODUCTION = NODE_ENV === 'production';
  const DATABASE_URL = process.env.DATABASE_URL || '';

  const baseFrontendOrigin = normalizeOrigin(FRONTEND_URL);
  const wechatFrontendOrigin = normalizeOrigin(WECHAT_FRONTEND_URL);
  const allowedOrigins = new Set([
    ...parseOriginList(process.env.CORS_ALLOWED_ORIGINS),
    baseFrontendOrigin,
    wechatFrontendOrigin,
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
    SESSION_IDLE_MS: sessionConfig.sessionIdleMs,
    AI_PROVIDER,
    AVAILABLE_PROVIDERS,
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI,
    FRONTEND_URL,
    ADMIN_EMAILS,
    DEV_OAUTH_ENABLED,
    WECHAT_APP_ID,
    WECHAT_APP_SECRET,
    WECHAT_SCOPE,
    WECHAT_FRONTEND_URL,
    WECHAT_REDIRECT_URI,
    NODE_ENV,
    IS_PRODUCTION,
    DATABASE_URL,
    allowedOrigins,
    trustProxy,
  };
};
