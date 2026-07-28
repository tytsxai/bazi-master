const SESSION_COOKIE_NAME = 'bazi_session';
const SESSION_COOKIE_DEFAULT_MAX_AGE_MS = 30 * 60 * 1000;

// The server expires idle sessions after SESSION_IDLE_MS; the cookie has to agree.
// Pinned at 30 minutes, raising SESSION_IDLE_MS had no effect — the browser dropped the
// cookie on the old schedule and users were logged out early with a still-valid session
// on the server. Read at call time so tests and reloads see the current value.
const resolveSessionMaxAgeMs = () => {
  const parsed = Number.parseInt(process.env.SESSION_IDLE_MS, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : SESSION_COOKIE_DEFAULT_MAX_AGE_MS;
};

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
    maxAge: resolveSessionMaxAgeMs(),
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
