const readNumber = (value, fallback) => {
  if (value === undefined || value === null || value === '') {
    return Number(fallback);
  }
  return Number(value);
};

export const getBaziCacheConfig = () => ({
  ttlMs: readNumber(process.env.BAZI_CACHE_TTL_MS, 6 * 60 * 60 * 1000),
  maxEntries: readNumber(process.env.BAZI_CACHE_MAX_ENTRIES, 500),
});

export const getSessionConfig = () => ({
  sessionIdleMs: readNumber(process.env.SESSION_IDLE_MS, 30 * 60 * 1000),
});

const parseAdminEmails = (raw, nodeEnv = '') => {
  const fallback = nodeEnv === 'production' ? '' : 'admin@example.com';
  return new Set(
    (raw || fallback)
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
};

export const getServerConfig = () => {
  const port = process.env.PORT || 4000;
  const jsonBodyLimit = process.env.JSON_BODY_LIMIT || '50mb';
  const maxUrlLength = readNumber(process.env.MAX_URL_LENGTH, 16384);
  const nodeEnv = process.env.NODE_ENV || '';
  const isProduction = nodeEnv === 'production';
  const rateLimitWindowMs = readNumber(
    process.env.RATE_LIMIT_WINDOW_MS,
    isProduction ? 60_000 : 0
  );
  const rateLimitMax = readNumber(
    process.env.RATE_LIMIT_MAX,
    isProduction ? 120 : 0
  );

  const openaiApiKey = process.env.OPENAI_API_KEY || '';
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY || '';
  const aiProvider = (
    process.env.AI_PROVIDER
    || (openaiApiKey ? 'openai' : null)
    || (anthropicApiKey ? 'anthropic' : null)
    || 'mock'
  ).toLowerCase();

  const openaiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const anthropicModel = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20240620';
  const aiMaxTokens = readNumber(process.env.AI_MAX_TOKENS, 700);
  const aiTimeoutMs = readNumber(process.env.AI_TIMEOUT_MS, 15000);

  const resetTokenTtlMs = readNumber(process.env.RESET_TOKEN_TTL_MS, 30 * 60 * 1000);
  const resetRequestMinDurationMs = readNumber(
    process.env.RESET_REQUEST_MIN_DURATION_MS,
    350
  );
  const googleClientId = process.env.GOOGLE_CLIENT_ID || '';
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
  const googleRedirectUri =
    process.env.GOOGLE_REDIRECT_URI || `http://localhost:${port}/api/auth/google/callback`;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const adminEmails = parseAdminEmails(process.env.ADMIN_EMAILS, nodeEnv);

  const wechatAppId = process.env.WECHAT_APP_ID || '';
  const wechatAppSecret = process.env.WECHAT_APP_SECRET || '';
  const wechatScope = process.env.WECHAT_SCOPE || 'snsapi_login';
  const wechatFrontendUrl = process.env.WECHAT_FRONTEND_URL || frontendUrl || 'http://localhost:3000';
  const backendBaseUrl = process.env.BACKEND_BASE_URL || 'http://localhost:4000';
  const wechatRedirectUri = process.env.WECHAT_REDIRECT_URI
    || `${backendBaseUrl}/api/auth/wechat/callback`;
  const openApiBaseUrl = process.env.BACKEND_BASE_URL || `http://localhost:${port}`;

  const importBatchSize = readNumber(process.env.IMPORT_BATCH_SIZE, 500);
  const shutdownTimeoutMs = readNumber(process.env.SHUTDOWN_TIMEOUT_MS, 10000);
  const corsAllowedOrigins = process.env.CORS_ALLOWED_ORIGINS || '';
  const availableProviders = [
    { name: 'openai', enabled: Boolean(openaiApiKey) },
    { name: 'anthropic', enabled: Boolean(anthropicApiKey) },
    { name: 'mock', enabled: true }
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
