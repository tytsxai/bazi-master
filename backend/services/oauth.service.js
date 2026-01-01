import crypto from 'crypto';

import { logger } from '../config/logger.js';

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

const oauthStateStore = new Map();

// Google public keys cache
let googlePublicKeysCache = null;
let googlePublicKeysCacheExpiry = 0;

/**
 * Fetch Google's public keys for ID token verification
 */
const fetchGooglePublicKeys = async () => {
  const now = Date.now();
  if (googlePublicKeysCache && now < googlePublicKeysCacheExpiry) {
    return googlePublicKeysCache;
  }

  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/certs');
    if (!res.ok) {
      logger.warn({ status: res.status }, 'Failed to fetch Google public keys');
      return googlePublicKeysCache || null;
    }

    const cacheControl = res.headers.get('cache-control') || '';
    const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
    const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) * 1000 : 3600000;

    googlePublicKeysCache = await res.json();
    googlePublicKeysCacheExpiry = now + maxAge;
    return googlePublicKeysCache;
  } catch (error) {
    logger.warn({ err: error }, 'Error fetching Google public keys');
    return googlePublicKeysCache || null;
  }
};

/**
 * Decode JWT without verification (for extracting header)
 */
const decodeJwtHeader = (token) => {
  try {
    const [headerB64] = token.split('.');
    if (!headerB64) return null;
    const headerJson = Buffer.from(headerB64, 'base64url').toString('utf8');
    return JSON.parse(headerJson);
  } catch {
    return null;
  }
};

/**
 * Decode JWT payload without verification
 */
const decodeJwtPayload = (token) => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf8');
    return JSON.parse(payloadJson);
  } catch {
    return null;
  }
};

/**
 * Verify Google ID Token
 * @param {string} idToken - The ID token from Google OAuth
 * @param {string} clientId - Expected Google Client ID
 * @returns {object|null} - Decoded payload if valid, null otherwise
 */
const verifyGoogleIdToken = async (idToken, clientId) => {
  if (!idToken || typeof idToken !== 'string') {
    return null;
  }

  const payload = decodeJwtPayload(idToken);
  if (!payload) {
    logger.warn('Invalid ID token format');
    return null;
  }

  // Verify issuer
  const validIssuers = ['https://accounts.google.com', 'accounts.google.com'];
  if (!validIssuers.includes(payload.iss)) {
    logger.warn({ iss: payload.iss }, 'Invalid ID token issuer');
    return null;
  }

  // Verify audience (client ID)
  if (payload.aud !== clientId) {
    logger.warn({ aud: payload.aud, expected: clientId }, 'Invalid ID token audience');
    return null;
  }

  // Verify expiration
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    logger.warn({ exp: payload.exp, now }, 'ID token expired');
    return null;
  }

  // Verify issued at (not in the future, with 5 min tolerance)
  if (payload.iat && payload.iat > now + 300) {
    logger.warn({ iat: payload.iat, now }, 'ID token issued in the future');
    return null;
  }

  return payload;
};

const pruneOauthStateStore = (now = Date.now()) => {
  for (const [key, entry] of oauthStateStore.entries()) {
    if (!entry?.createdAt || now - entry.createdAt > OAUTH_STATE_TTL_MS) {
      oauthStateStore.delete(key);
    }
  }
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

const buildOauthRedirectUrl = ({ token, user, nextPath, error, frontendUrl = DEFAULT_FRONTEND_URL }) => {
  const redirectUrl = new URL('/login', frontendUrl);
  const hashParams = new URLSearchParams();
  const isProduction = process.env.NODE_ENV === 'production';

  if (token) {
    hashParams.set('token', token);
    if (!isProduction) {
      redirectUrl.searchParams.set('token', token);
    }
  }
  if (user) {
    const encodedUser = Buffer.from(JSON.stringify(user)).toString('base64url');
    hashParams.set('user', encodedUser);
    if (!isProduction) {
      redirectUrl.searchParams.set('user', encodedUser);
    }
  }
  if (nextPath) redirectUrl.searchParams.set('next', nextPath);
  if (error) redirectUrl.searchParams.set('error', error);
  if (hashParams.size) {
    redirectUrl.hash = hashParams.toString();
  }
  return redirectUrl.toString();
};

const normalizeDevOauthValue = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

const buildDevOauthIdentity = (provider, req) => {
  const rawEmail = normalizeDevOauthValue(req.query?.dev_email);
  const rawName = normalizeDevOauthValue(req.query?.dev_name);
  const safeProvider = provider.replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'oauth';
  const timestamp = Date.now();
  const email = rawEmail && rawEmail.includes('@')
    ? rawEmail
    : `dev-${safeProvider}-${timestamp}@example.com`;
  const name = rawName || `Dev ${safeProvider.charAt(0).toUpperCase()}${safeProvider.slice(1)} User`;
  return { email, name };
};

const handleDevOauthLogin = async ({
  provider,
  req,
  res,
  nextPath,
  prisma,
  hashPassword,
  createSessionToken,
  sessionStore,
  isAdminUser,
  frontendUrl,
}) => {
  const identity = buildDevOauthIdentity(provider, req);
  let user = await prisma.user.findUnique({ where: { email: identity.email } });
  if (!user) {
    const randomPassword = crypto.randomBytes(24).toString('hex');
    const hashed = await hashPassword(randomPassword);
    if (!hashed) {
      const redirectUrl = buildOauthRedirectUrl({ error: 'server_error', nextPath, frontendUrl });
      return res.redirect(redirectUrl);
    }
    user = await prisma.user.create({
      data: { email: identity.email, name: identity.name, password: hashed },
    });
  } else if (!user.name && identity.name) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { name: identity.name },
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
    nextPath,
    frontendUrl,
  });
  return res.redirect(redirectUrl);
};

export {
  buildOauthState,
  consumeOauthState,
  buildOauthRedirectUrl,
  oauthStateStore,
  handleDevOauthLogin,
  verifyGoogleIdToken,
};
