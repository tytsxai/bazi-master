import crypto from 'crypto';
import { logger } from '../config/logger.js';

export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const isTest = process.env.NODE_ENV === 'test';

const oauthStateStore = new Map();
let oauthStateMirror = null;
let warnedOnFallback = false;

export const setOauthStateMirror = (mirror) => {
  oauthStateMirror = mirror;
};

const warnOnFallback = () => {
  if (isTest || oauthStateMirror || warnedOnFallback) return;
  warnedOnFallback = true;
  logger.warn('[oauth-state] Redis unavailable; using in-memory OAuth state store.');
};

const pruneOauthStateStore = (now = Date.now()) => {
  warnOnFallback();
  for (const [key, entry] of oauthStateStore.entries()) {
    if (!entry?.createdAt || now - entry.createdAt > OAUTH_STATE_TTL_MS) {
      oauthStateStore.delete(key);
    }
  }
};

const buildOauthState = (nextPath) => {
  pruneOauthStateStore();
  const state = crypto.randomBytes(24).toString('hex');
  const entry = { createdAt: Date.now(), nextPath };
  oauthStateStore.set(state, entry);
  if (oauthStateMirror?.set) {
    oauthStateMirror.set(state, entry, OAUTH_STATE_TTL_MS);
  }
  return state;
};

const getLocalOauthState = (state) => {
  warnOnFallback();
  const entry = oauthStateStore.get(state);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > OAUTH_STATE_TTL_MS) {
    oauthStateStore.delete(state);
    return null;
  }
  return entry;
};

const consumeOauthState = (state) => {
  warnOnFallback();
  const entry = oauthStateStore.get(state);
  if (!entry) return null;
  oauthStateStore.delete(state);
  if (Date.now() - entry.createdAt > OAUTH_STATE_TTL_MS) return null;
  if (oauthStateMirror?.delete) {
    oauthStateMirror.delete(state);
  }
  return entry;
};

const consumeOauthStateAsync = async (state) => {
  const local = getLocalOauthState(state);
  if (local) {
    oauthStateStore.delete(state);
    if (oauthStateMirror?.delete) {
      oauthStateMirror.delete(state);
    }
    return local;
  }

  if (!oauthStateMirror?.get) return null;
  const remote = await oauthStateMirror.get(state);
  if (!remote || typeof remote !== 'object') return null;
  const createdAt = Number(remote.createdAt);
  if (!Number.isFinite(createdAt)) {
    if (oauthStateMirror?.delete) {
      oauthStateMirror.delete(state);
    }
    return null;
  }
  if (Date.now() - createdAt > OAUTH_STATE_TTL_MS) {
    if (oauthStateMirror?.delete) {
      oauthStateMirror.delete(state);
    }
    return null;
  }
  if (oauthStateMirror?.delete) {
    oauthStateMirror.delete(state);
  }
  return {
    createdAt,
    nextPath: typeof remote.nextPath === 'string' ? remote.nextPath : remote.nextPath || null,
  };
};

const buildOauthRedirectUrl = ({
  nextPath,
  error,
  success = false,
  frontendUrl = DEFAULT_FRONTEND_URL,
}) => {
  const redirectUrl = new URL('/login', frontendUrl);
  if (nextPath) redirectUrl.searchParams.set('next', nextPath);
  if (error) redirectUrl.searchParams.set('error', error);
  if (!error && success) redirectUrl.searchParams.set('oauth', 'success');
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
  const email =
    rawEmail && rawEmail.includes('@') ? rawEmail : `dev-${safeProvider}-${timestamp}@example.com`;
  const name =
    rawName || `Dev ${safeProvider.charAt(0).toUpperCase()}${safeProvider.slice(1)} User`;
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
  frontendUrl,
  setSessionCookie,
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
  if (typeof setSessionCookie === 'function') {
    setSessionCookie(res, token);
  }

  const redirectUrl = buildOauthRedirectUrl({
    nextPath,
    frontendUrl,
    success: true,
  });
  return res.redirect(redirectUrl);
};

export {
  buildOauthState,
  consumeOauthState,
  consumeOauthStateAsync,
  buildOauthRedirectUrl,
  oauthStateStore,
  handleDevOauthLogin,
};
