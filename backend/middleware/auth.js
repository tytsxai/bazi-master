import crypto from 'crypto';
import { prisma } from '../config/prisma.js';
import {
  buildAuthToken,
  createAuthorizeToken,
  createRequireAuth,
  requireAdmin,
} from '../services/auth.service.js';
import { createSessionStore } from '../services/session.service.js';
import { getServerConfig } from '../config/app.js';
import { REQUEST_ID_HEADER, getRequestId, requestIdMiddleware } from './requestId.middleware.js';

const { sessionTokenSecret: envSecret, adminEmails } = getServerConfig();
const isTest = process.env.NODE_ENV === 'test';
const sessionTokenSecret = isTest ? envSecret || 'test-session-secret-for-auth-me-test' : envSecret;
export const sessionStore = createSessionStore();
export const isAdminUser = (user) => adminEmails.has(user.email);

export const authorizeToken = createAuthorizeToken({
  prisma,
  sessionStore,
  isAdminUser,
  tokenSecret: sessionTokenSecret,
});

export { REQUEST_ID_HEADER, getRequestId, requestIdMiddleware };

export const requireAuth = createRequireAuth({ authorizeToken });
export const requireAuthStrict = createRequireAuth({
  authorizeToken,
  allowSessionExpiredSilent: false,
});
export { requireAdmin };

export const createSessionToken = (userId) =>
  buildAuthToken({ userId, secret: sessionTokenSecret });

export const touchSession = (token, now = Date.now()) => {
  if (!token) return;
  sessionStore.set(token, now);
};

export const revokeSession = (token) => {
  if (!token) return;
  sessionStore.delete(token);
};

const timingSafeEqualDigest = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = crypto.createHash('sha256').update(a, 'utf8').digest();
  const right = crypto.createHash('sha256').update(b, 'utf8').digest();
  return crypto.timingSafeEqual(left, right);
};

export const docsBasicAuth = (req, res, next) => {
  const validUser = process.env.DOCS_USER || 'admin';
  const validPassword = process.env.DOCS_PASSWORD;

  if (!validPassword) {
    // If not configured, deny access in production, or allow in dev
    if (process.env.NODE_ENV === 'production') {
      return res.status(500).send('Docs authentication not configured.');
    }
    return next();
  }

  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="API Docs"');
    return res.status(401).send('Authentication required.');
  }

  const credentials = Buffer.from(auth.split(' ')[1], 'base64').toString().split(':');
  const [user, password] = credentials;

  if (timingSafeEqualDigest(user, validUser) && timingSafeEqualDigest(password, validPassword)) {
    return next();
  }

  res.set('WWW-Authenticate', 'Basic realm="API Docs"');
  return res.status(401).send('Invalid credentials.');
};
