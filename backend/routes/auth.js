import express from 'express';
import { prisma } from '../config/prisma.js';
import {
  requireAuth,
  revokeSession,
} from '../middleware/auth.js';
import { deleteUserCascade } from '../userCleanup.js';
import {
  handleRegister,
  handleLogin,
  handleLogout,
  handlePasswordResetRequest,
  handlePasswordResetConfirm,
  handleGoogleCallback,
  handleWeChatCallback
} from '../controllers/auth.controller.js';

const router = express.Router();

const readBearerToken = (req) => {
  const auth = req.headers.authorization || '';
  if (typeof auth !== 'string') return null;
  return auth.startsWith('Bearer ') ? auth.slice(7) : null;
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

// OAuth Callbacks
router.get('/google/callback', handleGoogleCallback);
router.get('/wechat/callback', handleWeChatCallback);

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

router.delete('/me', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(400).json({ error: 'Invalid user' });
    const token = readBearerToken(req);
    await deleteUserCascade({
      prisma,
      userId,
      cleanupUserMemory: () => revokeSession(token),
    });
    res.json({ status: 'ok' });
  } catch (error) {
    console.error('User self-delete failed:', error);
    res.status(500).json({ error: 'Unable to delete account' });
  }
});

export default router;
