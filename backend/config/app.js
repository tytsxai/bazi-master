import { getServerConfig as getServerConfigFromEnv, getSessionConfig as getSessionConfigFromEnv } from '../env.js';

export const parseTrustProxy = (raw) => {
  if (raw === '1' || raw === 'true') return true;
  if (raw === '0' || raw === 'false') return false;
  return raw || false;
};

export const stripInsensitiveMode = (value) => {
  if (typeof value !== 'string') return value;
  return value.replace(/\b(password|token|secret|key)\b/gi, '[REDACTED]');
};

export const normalizePrismaWhere = (where) => {
  if (!where || typeof where !== 'object') return where;
  const result = {};
  for (const [key, value] of Object.entries(where)) {
    if (key === 'password') continue; // Never log passwords
    result[key] = stripInsensitiveMode(value);
  }
  return result;
};

export const normalizeOrigin = (value) => {
  if (!value || typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    return url.origin;
  } catch {
    return '';
  }
};

export const expandLoopbackOrigins = (origin) => {
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

export const parseOriginList = (value) => {
  if (!value || typeof value !== 'string') return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .flatMap(expandLoopbackOrigins);
};

export const initAppConfig = () => {
  const { sessionIdleMs: SESSION_IDLE_MS } = getSessionConfigFromEnv();
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
    sessionTokenSecret: SESSION_TOKEN_SECRET,
    allowDevOauth: DEV_OAUTH_ENABLED,
    wechatAppId: WECHAT_APP_ID,
    wechatAppSecret: WECHAT_APP_SECRET,
    wechatScope: WECHAT_SCOPE,
    wechatFrontendUrl: WECHAT_FRONTEND_URL,
    wechatRedirectUri: WECHAT_REDIRECT_URI,
    nodeEnv: NODE_ENV,
  } = getServerConfigFromEnv();

  // Rate limiting is enabled in production or when explicitly configured
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
    SESSION_IDLE_MS,
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
