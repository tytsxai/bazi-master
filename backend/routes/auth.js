import { logger } from '../config/logger.js';
import express from 'express';
import { prisma } from '../config/prisma.js';
import { getServerConfig } from '../config/app.js';
import {
  requireAuth,
  revokeSessionAsync,
  createSessionToken,
  sessionStore,
  isAdminUser,
} from '../middleware/auth.js';
import { createRateLimitMiddleware } from '../middleware/rateLimit.middleware.js';
import { hashPassword } from '../utils/passwords.js';
import { deleteUserCascade } from '../userCleanup.js';
import { setSessionCookie } from '../utils/sessionCookie.js';
import {
  handleRegister,
  handleLogin,
  handleLogout,
  handlePasswordResetRequest,
  handlePasswordResetConfirm,
  handleGoogleCallback,
  handleWeChatCallback,
} from '../controllers/auth.controller.js';
import {
  buildOauthRedirectUrl,
  buildOauthStateAsync,
  handleDevOauthLogin,
} from '../services/oauth.service.js';

const router = express.Router();

// The global limiter (120/min) is far too loose for credential endpoints: it still
// allows ~170k password guesses per day from a single address. These add a second,
// much tighter budget on both the source address and the targeted account, so
// rotating IPs does not buy an attacker unlimited attempts against one email.
const AUTH_RATE_LIMIT_MAX = Number(process.env.AUTH_RATE_LIMIT_MAX) || 10;
const AUTH_RATE_LIMIT_WINDOW_MS = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;
const AUTH_RATE_LIMIT_ENABLED = process.env.NODE_ENV !== 'test';

const normalizeEmailKey = (req) => {
  const email = req.body?.email;
  if (typeof email !== 'string' || !email.trim()) return null;
  return email.trim().toLowerCase();
};

const authRateLimiters = AUTH_RATE_LIMIT_ENABLED
  ? [
      createRateLimitMiddleware({
        RATE_LIMIT_ENABLED: true,
        RATE_LIMIT_MAX: AUTH_RATE_LIMIT_MAX,
        RATE_LIMIT_WINDOW_MS: AUTH_RATE_LIMIT_WINDOW_MS,
        redisKeyPrefix: 'rate-limit:auth-ip:',
        setHeaders: false,
      }),
      createRateLimitMiddleware({
        RATE_LIMIT_ENABLED: true,
        RATE_LIMIT_MAX: AUTH_RATE_LIMIT_MAX,
        RATE_LIMIT_WINDOW_MS: AUTH_RATE_LIMIT_WINDOW_MS,
        redisKeyPrefix: 'rate-limit:auth-email:',
        resolveKey: normalizeEmailKey,
        setHeaders: false,
      }),
    ]
  : [];

const readBearerToken = (req) => {
  const auth = req.headers.authorization || '';
  if (typeof auth !== 'string') return null;
  return auth.startsWith('Bearer ') ? auth.slice(7) : null;
};

const sanitizeNextPath = (value) => {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null;
  return trimmed;
};

// Auth routes
router.post('/register', ...authRateLimiters, handleRegister);
router.post('/login', ...authRateLimiters, handleLogin);
router.post('/logout', requireAuth, handleLogout);

/**
 * Request Password Reset
 * POST /api/auth/password/request
 */
router.post('/password/request', ...authRateLimiters, handlePasswordResetRequest);

/**
 * Reset Password
 * POST /api/auth/password/reset
 */
router.post('/password/reset', ...authRateLimiters, handlePasswordResetConfirm);

// OAuth redirect entry points
router.get('/google', async (req, res, next) => {
  try {
    const { googleClientId, googleRedirectUri, frontendUrl, allowDevOauth } = getServerConfig();
    const nextPath = sanitizeNextPath(req.query?.next) || null;
    const state = await buildOauthStateAsync(nextPath);

    if (allowDevOauth && !googleClientId) {
      return await handleDevOauthLogin({
        provider: 'google',
        req,
        res,
        nextPath,
        prisma,
        hashPassword,
        createSessionToken,
        sessionStore,
        isAdminUser,
        frontendUrl,
        setSessionCookie,
      });
    }

    if (!googleClientId || !googleRedirectUri) {
      const redirectUrl = buildOauthRedirectUrl({ error: 'not_configured', nextPath, frontendUrl });
      return res.redirect(redirectUrl);
    }

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', googleClientId);
    authUrl.searchParams.set('redirect_uri', googleRedirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'email profile');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    return res.redirect(authUrl.toString());
  } catch (error) {
    return next(error);
  }
});

router.get('/wechat/redirect', async (req, res, next) => {
  try {
    const { wechatAppId, wechatRedirectUri, wechatScope, wechatFrontendUrl, allowDevOauth } =
      getServerConfig();
    const nextPath = sanitizeNextPath(req.query?.next) || null;
    const state = await buildOauthStateAsync(nextPath);

    if (allowDevOauth && !wechatAppId) {
      return await handleDevOauthLogin({
        provider: 'wechat',
        req,
        res,
        nextPath,
        prisma,
        hashPassword,
        createSessionToken,
        sessionStore,
        isAdminUser,
        frontendUrl: wechatFrontendUrl,
        setSessionCookie,
      });
    }

    if (!wechatAppId || !wechatRedirectUri) {
      const redirectUrl = buildOauthRedirectUrl({
        error: 'wechat_not_configured',
        nextPath,
        frontendUrl: wechatFrontendUrl,
      });
      return res.redirect(redirectUrl);
    }

    const authUrl = new URL('https://open.weixin.qq.com/connect/qrconnect');
    authUrl.searchParams.set('appid', wechatAppId);
    authUrl.searchParams.set('redirect_uri', wechatRedirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', wechatScope || 'snsapi_login');
    authUrl.searchParams.set('state', state);
    return res.redirect(`${authUrl.toString()}#wechat_redirect`);
  } catch (error) {
    return next(error);
  }
});

// OAuth Callbacks
router.get('/google/callback', handleGoogleCallback);
router.get('/wechat/callback', handleWeChatCallback);

router.get('/me', requireAuth, (req, res) => {
  const includeToken =
    req.headers['x-include-token'] === '1' && process.env.NODE_ENV !== 'production';
  const token = includeToken ? req.cookies?.bazi_session || readBearerToken(req) : null;
  res.json({
    user: req.user,
    ...(includeToken && token ? { token } : {}),
  });
});

router.delete('/me', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(400).json({ error: 'Invalid user' });
    const cookieToken = req.cookies?.bazi_session || null;
    const token = cookieToken || readBearerToken(req);
    await deleteUserCascade({
      prisma,
      userId,
      cleanupUserMemory: () => revokeSessionAsync(token),
    });
    res.json({ status: 'ok' });
  } catch (error) {
    logger.error('User self-delete failed:', error);
    res.status(500).json({ error: 'Unable to delete account' });
  }
});

export default router;
