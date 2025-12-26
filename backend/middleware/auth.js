import { prisma } from '../config/prisma.js';
import { buildAuthToken, createAuthorizeToken, createRequireAuth, requireAdmin } from '../services/auth.service.js';
import { createSessionStore } from '../services/session.service.js';
import { getServerConfig } from '../config/app.js';
import {
  REQUEST_ID_HEADER,
  getRequestId,
  requestIdMiddleware,
} from './requestId.middleware.js';

const { sessionTokenSecret: envSecret, adminEmails } = getServerConfig();
const isTest = process.env.NODE_ENV === 'test';
const sessionTokenSecret = isTest ? (envSecret || 'test-session-secret-for-auth-me-test') : envSecret;
export const sessionStore = createSessionStore();
export const isAdminUser = (user) => adminEmails.has(user.email);

const authorizeToken = createAuthorizeToken({
  prisma,
  sessionStore,
  isAdminUser,
  tokenSecret: sessionTokenSecret
});

export { REQUEST_ID_HEADER, getRequestId, requestIdMiddleware };

export const requireAuth = createRequireAuth({ authorizeToken });
export const requireAuthStrict = createRequireAuth({ authorizeToken, allowSessionExpiredSilent: false });
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
