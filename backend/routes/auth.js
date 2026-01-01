import { logger } from '../config/logger.js';
import express from 'express';
import { prisma } from '../config/prisma.js';
import { getServerConfig } from '../config/app.js';
import {
  requireAuth,
  revokeSession,
  createSessionToken,
  sessionStore,
  isAdminUser,
} from '../middleware/auth.js';
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
  buildOauthState,
  handleDevOauthLogin,
} from '../services/oauth.service.js';

const router = express.Router();

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
router.post('/register', handleRegister);
router.post('/login', handleLogin);
router.post('/logout', requireAuth, handleLogout);

/**
 * Request Password Reset
 * POST /api/auth/password/request
 */
router.post('/password/request', handlePasswordResetRequest);

/**
 * Reset Password
 * POST /api/auth/password/reset
 */
router.post('/password/reset', handlePasswordResetConfirm);

// OAuth redirect entry points
router.get('/google', (req, res) => {
  const { googleClientId, googleRedirectUri, frontendUrl, allowDevOauth } = getServerConfig();
  const nextPath = sanitizeNextPath(req.query?.next) || null;
  const state = buildOauthState(nextPath);

  if (allowDevOauth && !googleClientId) {
    return handleDevOauthLogin({
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
});

router.get('/wechat/redirect', (req, res) => {
  const { wechatAppId, wechatRedirectUri, wechatScope, wechatFrontendUrl, allowDevOauth } =
    getServerConfig();
  const nextPath = sanitizeNextPath(req.query?.next) || null;
  const state = buildOauthState(nextPath);

  if (allowDevOauth && !wechatAppId) {
    return handleDevOauthLogin({
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
      cleanupUserMemory: () => revokeSession(token),
    });
    res.json({ status: 'ok' });
  } catch (error) {
    logger.error('User self-delete failed:', error);
    res.status(500).json({ error: 'Unable to delete account' });
  }
});

export default router;
