import crypto from 'crypto';
import { prisma } from '../config/prisma.js';
import { createAuthorizeToken, createRequireAuth, requireAdmin } from '../auth.js';
import { createSessionStore } from '../sessionStore.js';
import { getServerConfig } from '../env.js';

const { sessionTokenSecret: envSecret, adminEmails } = getServerConfig();
const isTest = process.env.NODE_ENV === 'test';
const sessionTokenSecret = isTest ? (envSecret || 'test-session-secret-for-auth-me-test') : envSecret;
const sessionStore = createSessionStore();
const isAdminUser = (user) => adminEmails.has(user.email);

const authorizeToken = createAuthorizeToken({
  prisma,
  sessionStore,
  isAdminUser,
  tokenSecret: sessionTokenSecret
});

export const REQUEST_ID_HEADER = 'x-request-id';

export const getRequestId = (req) => {
  const headerValue = req.headers[REQUEST_ID_HEADER];
  if (typeof headerValue === 'string' && headerValue.trim() !== '') {
    return headerValue.trim();
  }
  if (Array.isArray(headerValue) && headerValue.length > 0 && headerValue[0].trim() !== '') {
    return headerValue[0].trim();
  }
  return crypto.randomUUID();
};

export const requestIdMiddleware = (req, res, next) => {
  const requestId = getRequestId(req);
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
};

export const requireAuth = createRequireAuth({ authorizeToken });
export const requireAuthStrict = createRequireAuth({ authorizeToken, allowSessionExpiredSilent: false });
export { requireAdmin };
