const SESSION_COOKIE_NAME = 'bazi_session';
const SESSION_COOKIE_MAX_AGE_MS = 30 * 60 * 1000;

const parseBoolean = (value) => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  return null;
};

const normalizeSameSite = (value, fallback) => {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'lax' || normalized === 'strict' || normalized === 'none') {
    return normalized;
  }
  return fallback;
};

const buildSessionCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === 'production';
  const sameSite = normalizeSameSite(
    process.env.SESSION_COOKIE_SAMESITE,
    isProduction ? 'strict' : 'lax'
  );
  const secureOverride = parseBoolean(process.env.SESSION_COOKIE_SECURE);
  let secure = secureOverride === null ? isProduction : secureOverride;
  if (sameSite === 'none') {
    secure = true;
  }

  const domain =
    typeof process.env.SESSION_COOKIE_DOMAIN === 'string' && process.env.SESSION_COOKIE_DOMAIN
      ? process.env.SESSION_COOKIE_DOMAIN.trim()
      : undefined;

  return {
    httpOnly: true,
    secure,
    sameSite,
    maxAge: SESSION_COOKIE_MAX_AGE_MS,
    path: '/',
    ...(domain ? { domain } : {}),
  };
};

export const setSessionCookie = (res, token) => {
  res.cookie(SESSION_COOKIE_NAME, token, buildSessionCookieOptions());
};

export const clearSessionCookie = (res) => {
  const domain =
    typeof process.env.SESSION_COOKIE_DOMAIN === 'string' && process.env.SESSION_COOKIE_DOMAIN
      ? process.env.SESSION_COOKIE_DOMAIN.trim()
      : undefined;
  res.clearCookie(SESSION_COOKIE_NAME, {
    path: '/',
    ...(domain ? { domain } : {}),
  });
};

export { SESSION_COOKIE_NAME };
