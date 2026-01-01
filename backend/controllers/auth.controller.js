import { logger } from '../config/logger.js';
import crypto from 'crypto';

import { prisma } from '../config/prisma.js';
import { getServerConfig } from '../config/app.js';
import {
  createSessionToken,
  touchSession,
  revokeSession,
  sessionStore,
  isAdminUser,
} from '../middleware/auth.js';
import { hashPassword, verifyPassword } from '../utils/passwords.js';
import {
  buildOauthRedirectUrl,
  consumeOauthStateAsync,
  handleDevOauthLogin,
} from '../services/oauth.service.js';
import { ensureDefaultUser } from '../services/schema.service.js';
import { setSessionCookie, clearSessionCookie } from '../utils/sessionCookie.js';
import {
  resetTokenStore,
  resetTokenByUser,
  pruneResetTokens,
  getResetTokenEntryAsync,
  setResetTokenForUser,
  deleteResetToken,
} from '../services/resetTokens.service.js';
import {
  ensurePasswordResetDeliveryReady,
  sendPasswordResetEmail,
} from '../services/email.service.js';

// SECURITY: Never log reset tokens, even in debug mode - removed PASSWORD_RESET_DEBUG_LOG support

const ensureDefaultUserReady = (() => {
  let promise = null;
  return async () => {
    if (!promise) {
      promise = ensureDefaultUser();
    }
    return promise;
  };
})();

const normalizeEmail = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');

const readBearerToken = (req) => {
  const auth = req.headers.authorization || '';
  if (typeof auth !== 'string') return null;
  return auth.startsWith('Bearer ') ? auth.slice(7) : null;
};

const ensureMinDuration = async (startedAtMs, minDurationMs) => {
  if (!Number.isFinite(minDurationMs) || minDurationMs <= 0) return;
  const elapsed = Date.now() - startedAtMs;
  const remaining = minDurationMs - elapsed;
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
};

export { resetTokenStore, resetTokenByUser };

const appendProviderParam = (url, provider) => {
  if (!provider) return url;
  const target = new URL(url);
  target.searchParams.set('provider', provider);
  return target.toString();
};

const redirectOauthError = (res, { provider, error, nextPath, frontendUrl }) => {
  const redirectUrl = buildOauthRedirectUrl({ error, nextPath, frontendUrl });
  return res.redirect(appendProviderParam(redirectUrl, provider));
};

const createOauthUser = async ({ email, name }) => {
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    const randomPassword = crypto.randomBytes(24).toString('hex');
    const hashed = await hashPassword(randomPassword);
    if (!hashed) return null;
    user = await prisma.user.create({
      data: {
        email,
        password: hashed,
        name: name || null,
      },
    });
  } else if (!user.name && name) {
    user = await prisma.user.update({ where: { id: user.id }, data: { name } });
  }
  return user;
};

export const handleRegister = async (req, res) => {
  await ensureDefaultUserReady();
  const email = normalizeEmail(req.body?.email);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Invalid email' });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Invalid password' });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: 'Email already registered' });
  }

  const hashed = await hashPassword(password);
  if (!hashed) {
    return res.status(500).json({ error: 'Unable to create user' });
  }

  const user = await prisma.user.create({
    data: {
      email,
      password: hashed,
      name: name || null,
    },
  });

  const token = createSessionToken(user.id);
  touchSession(token);
  setSessionCookie(res, token);

  return res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      isAdmin: isAdminUser(user),
    },
  });
};

export const handleLogin = async (req, res) => {
  await ensureDefaultUserReady();
  const email = normalizeEmail(req.body?.email);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Invalid email' });
  }
  if (!password) {
    return res.status(400).json({ error: 'Password required' });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const ok = await verifyPassword(password, user.password);
  if (!ok) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = createSessionToken(user.id);
  touchSession(token);
  setSessionCookie(res, token);

  return res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      isAdmin: isAdminUser(user),
    },
  });
};

export const handleLogout = async (req, res) => {
  const cookieToken = req.cookies?.bazi_session || null;
  const token =
    cookieToken ||
    readBearerToken(req) ||
    (typeof req.body?.token === 'string' ? req.body.token : null);
  revokeSession(token);
  clearSessionCookie(res);
  res.json({ status: 'ok' });
};

export const handlePasswordResetRequest = async (req, res) => {
  const { resetTokenTtlMs, resetRequestMinDurationMs } = getServerConfig();
  const startedAt = Date.now();
  const deliveryReady = ensurePasswordResetDeliveryReady();
  if (!deliveryReady.ok) {
    const message =
      deliveryReady.reason === 'disabled'
        ? 'Password reset is disabled'
        : 'Password reset email is not configured';
    return res.status(503).json({ error: message });
  }
  const email = normalizeEmail(req.body?.email);
  let user = null;

  if (email && email.includes('@')) {
    user = await prisma.user.findUnique({ where: { email } });
  }

  if (user) {
    pruneResetTokens();
    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt =
      Date.now() + (Number.isFinite(resetTokenTtlMs) ? resetTokenTtlMs : 30 * 60 * 1000);
    await setResetTokenForUser({
      userId: user.id,
      token,
      expiresAt,
      ttlMs: resetTokenTtlMs,
    });
    // SECURITY: Reset token is never logged - send via email in production
    try {
      await sendPasswordResetEmail({ to: user.email, token });
    } catch (error) {
      logger.error({ error }, 'Failed to send password reset email');
      return res.status(503).json({ error: 'Password reset email failed' });
    }
  }

  await ensureMinDuration(startedAt, resetRequestMinDurationMs);

  return res.json({
    message: 'If an account exists for that email, a reset code has been sent.',
  });
};

export const handlePasswordResetConfirm = async (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!token) {
    return res.status(400).json({ error: 'Reset token required' });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Invalid password' });
  }

  pruneResetTokens();
  const entry = await getResetTokenEntryAsync(token);
  if (!entry?.userId) {
    return res.status(400).json({ error: 'Invalid or expired token' });
  }

  const user = await prisma.user.findUnique({ where: { id: entry.userId } });
  if (!user) {
    deleteResetToken(token, entry.userId);
    return res.status(400).json({ error: 'Invalid or expired token' });
  }

  const hashed = await hashPassword(password);
  if (!hashed) {
    return res.status(500).json({ error: 'Unable to reset password' });
  }

  await prisma.user.update({ where: { id: user.id }, data: { password: hashed } });
  deleteResetToken(token, user.id);

  return res.json({ status: 'ok' });
};

export const handleGoogleCallback = async (req, res) => {
  const {
    googleClientId: GOOGLE_CLIENT_ID,
    googleClientSecret: GOOGLE_CLIENT_SECRET,
    googleRedirectUri: GOOGLE_REDIRECT_URI,
    frontendUrl: FRONTEND_URL,
    allowDevOauth: ALLOW_DEV_OAUTH,
    nodeEnv: NODE_ENV,
  } = getServerConfig();
  const IS_PRODUCTION = NODE_ENV === 'production';

  const queryError = typeof req.query?.error === 'string' ? req.query.error : '';
  const state = typeof req.query?.state === 'string' ? req.query.state : '';

  let nextPath = null;
  if (state) {
    const entry = await consumeOauthStateAsync(state);
    if (!entry && !queryError) {
      return redirectOauthError(res, {
        provider: 'google',
        error: 'invalid_state',
        nextPath: null,
        frontendUrl: FRONTEND_URL,
      });
    }
    nextPath = entry?.nextPath || null;
  } else if (!queryError) {
    return redirectOauthError(res, {
      provider: 'google',
      error: 'invalid_state',
      nextPath: null,
      frontendUrl: FRONTEND_URL,
    });
  }

  const hasDevParams = Boolean(req.query?.dev_email || req.query?.dev_name || req.query?.dev);
  if (!IS_PRODUCTION && ALLOW_DEV_OAUTH && hasDevParams) {
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
      frontendUrl: FRONTEND_URL,
      setSessionCookie,
    });
  }

  if (queryError) {
    return redirectOauthError(res, {
      provider: 'google',
      error: queryError,
      nextPath,
      frontendUrl: FRONTEND_URL,
    });
  }

  const code = typeof req.query?.code === 'string' ? req.query.code : '';
  if (!code) {
    return redirectOauthError(res, {
      provider: 'google',
      error: 'missing_code',
      nextPath,
      frontendUrl: FRONTEND_URL,
    });
  }

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    return redirectOauthError(res, {
      provider: 'google',
      error: 'not_configured',
      nextPath,
      frontendUrl: FRONTEND_URL,
    });
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      return redirectOauthError(res, {
        provider: 'google',
        error: 'server_error',
        nextPath,
        frontendUrl: FRONTEND_URL,
      });
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData?.access_token;
    if (!accessToken) {
      return redirectOauthError(res, {
        provider: 'google',
        error: 'server_error',
        nextPath,
        frontendUrl: FRONTEND_URL,
      });
    }

    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!profileRes.ok) {
      return redirectOauthError(res, {
        provider: 'google',
        error: 'server_error',
        nextPath,
        frontendUrl: FRONTEND_URL,
      });
    }

    const profile = await profileRes.json();
    const email = normalizeEmail(profile?.email);
    const name = typeof profile?.name === 'string' ? profile.name.trim() : '';

    if (!email || !email.includes('@')) {
      return redirectOauthError(res, {
        provider: 'google',
        error: 'missing_email',
        nextPath,
        frontendUrl: FRONTEND_URL,
      });
    }

    const user = await createOauthUser({ email, name });
    if (!user) {
      return redirectOauthError(res, {
        provider: 'google',
        error: 'server_error',
        nextPath,
        frontendUrl: FRONTEND_URL,
      });
    }

    const token = createSessionToken(user.id);
    touchSession(token);
    setSessionCookie(res, token);

    const redirectUrl = buildOauthRedirectUrl({
      nextPath,
      frontendUrl: FRONTEND_URL,
      success: true,
    });

    return res.redirect(redirectUrl);
  } catch (error) {
    logger.error('Google OAuth callback failed:', error);
    return redirectOauthError(res, {
      provider: 'google',
      error: 'server_error',
      nextPath,
      frontendUrl: FRONTEND_URL,
    });
  }
};

export const handleWeChatCallback = async (req, res) => {
  const {
    allowDevOauth: ALLOW_DEV_OAUTH,
    wechatAppId: WECHAT_APP_ID,
    wechatAppSecret: WECHAT_APP_SECRET,
    wechatFrontendUrl: WECHAT_FRONTEND_URL,
    wechatRedirectUri: WECHAT_REDIRECT_URI,
    nodeEnv: NODE_ENV,
  } = getServerConfig();
  const IS_PRODUCTION = NODE_ENV === 'production';

  const code = typeof req.query?.code === 'string' ? req.query.code : '';
  const state = typeof req.query?.state === 'string' ? req.query.state : '';

  if (!code || !state) {
    return redirectOauthError(res, {
      provider: 'wechat',
      error: 'wechat_missing_params',
      nextPath: null,
      frontendUrl: WECHAT_FRONTEND_URL,
    });
  }

  const entry = await consumeOauthStateAsync(state);
  if (!entry) {
    return redirectOauthError(res, {
      provider: 'wechat',
      error: 'wechat_invalid_state',
      nextPath: null,
      frontendUrl: WECHAT_FRONTEND_URL,
    });
  }

  const nextPath = entry?.nextPath || null;

  const hasDevParams = Boolean(req.query?.dev_email || req.query?.dev_name || req.query?.dev);
  if (!IS_PRODUCTION && ALLOW_DEV_OAUTH && hasDevParams) {
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
      frontendUrl: WECHAT_FRONTEND_URL,
      setSessionCookie,
    });
  }

  if (!WECHAT_APP_ID || !WECHAT_APP_SECRET || !WECHAT_REDIRECT_URI) {
    return redirectOauthError(res, {
      provider: 'wechat',
      error: 'wechat_not_configured',
      nextPath,
      frontendUrl: WECHAT_FRONTEND_URL,
    });
  }

  try {
    const tokenUrl = new URL('https://api.weixin.qq.com/sns/oauth2/access_token');
    tokenUrl.searchParams.set('appid', WECHAT_APP_ID);
    tokenUrl.searchParams.set('secret', WECHAT_APP_SECRET);
    tokenUrl.searchParams.set('code', code);
    tokenUrl.searchParams.set('grant_type', 'authorization_code');

    const tokenRes = await fetch(tokenUrl.toString());

    if (!tokenRes.ok) {
      return redirectOauthError(res, {
        provider: 'wechat',
        error: 'wechat_token_failed',
        nextPath,
        frontendUrl: WECHAT_FRONTEND_URL,
      });
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData?.access_token;
    const openId = tokenData?.openid;

    if (!accessToken) {
      return redirectOauthError(res, {
        provider: 'wechat',
        error: 'wechat_token_failed',
        nextPath,
        frontendUrl: WECHAT_FRONTEND_URL,
      });
    }

    if (!openId) {
      return redirectOauthError(res, {
        provider: 'wechat',
        error: 'wechat_missing_openid',
        nextPath,
        frontendUrl: WECHAT_FRONTEND_URL,
      });
    }

    const userInfoUrl = new URL('https://api.weixin.qq.com/sns/userinfo');
    userInfoUrl.searchParams.set('access_token', accessToken || '');
    userInfoUrl.searchParams.set('openid', openId);
    userInfoUrl.searchParams.set('lang', 'en');

    const profileRes = await fetch(userInfoUrl.toString());
    if (!profileRes.ok) {
      return redirectOauthError(res, {
        provider: 'wechat',
        error: 'wechat_oauth_failed',
        nextPath,
        frontendUrl: WECHAT_FRONTEND_URL,
      });
    }

    const profile = await profileRes.json();
    const name = typeof profile?.nickname === 'string' ? profile.nickname.trim() : '';
    const email = `wechat_${openId}@wechat.local`;

    const user = await createOauthUser({ email, name });
    if (!user) {
      return redirectOauthError(res, {
        provider: 'wechat',
        error: 'server_error',
        nextPath,
        frontendUrl: WECHAT_FRONTEND_URL,
      });
    }

    const token = createSessionToken(user.id);
    touchSession(token);
    setSessionCookie(res, token);

    const redirectUrl = buildOauthRedirectUrl({
      nextPath,
      frontendUrl: WECHAT_FRONTEND_URL,
      success: true,
    });

    return res.redirect(redirectUrl);
  } catch (error) {
    logger.error('WeChat OAuth callback failed:', error);
    return redirectOauthError(res, {
      provider: 'wechat',
      error: 'wechat_oauth_failed',
      nextPath,
      frontendUrl: WECHAT_FRONTEND_URL,
    });
  }
};
