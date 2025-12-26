import cors from 'cors';

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

export const isAllowedOrigin = (origin, allowedOrigins) => {
  if (!origin) return true;
  if (!allowedOrigins || typeof allowedOrigins.has !== 'function') return false;
  return allowedOrigins.has(origin);
};

export const createCorsConfig = (allowedOrigins) => {
  return {
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin, allowedOrigins)) {
        return callback(null, true);
      }
      const error = new Error('Not allowed by CORS');
      error.statusCode = 403;
      return callback(error);
    },
    credentials: true,
  };
};

export const createCorsMiddleware = (allowedOrigins) => {
  return cors(createCorsConfig(allowedOrigins));
};
