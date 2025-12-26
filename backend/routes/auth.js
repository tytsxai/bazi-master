import express from 'express';
import { prisma } from '../config/prisma.js';
import {
  requireAuth,
  createSessionToken,
  touchSession,
  revokeSession,
  isAdminUser,
} from '../middleware/auth.js';
import { hashPassword, verifyPassword } from '../utils/passwords.js';
import { deleteUserCascade } from '../userCleanup.js';

const router = express.Router();

const normalizeEmail = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');

const readBearerToken = (req) => {
  const auth = req.headers.authorization || '';
  if (typeof auth !== 'string') return null;
  return auth.startsWith('Bearer ') ? auth.slice(7) : null;
};

// Auth routes
router.post('/register', async (req, res) => {
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

  return res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      isAdmin: isAdminUser(user),
    },
  });
});

router.post('/login', async (req, res) => {
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

  return res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      isAdmin: isAdminUser(user),
    },
  });
});

router.post('/logout', requireAuth, async (req, res) => {
  const token =
    readBearerToken(req) || (typeof req.body?.token === 'string' ? req.body.token : null);
  revokeSession(token);
  res.json({ status: 'ok' });
});

/**
 * Request Password Reset (Stub)
 * POST /api/auth/password/request
 */
router.post('/password/request', (req, res) => {
  // In a real app, this would generate a token and send an email
  // For now, we simulate success
  const email = normalizeEmail(req.body?.email);
  if (!email) return res.status(400).json({ error: 'Email required' });

  console.log(`[Stub] Password reset requested for: ${email}`);
  res.json({ status: 'ok', message: 'If account exists, email sent.' });
});

/**
 * Reset Password (Stub)
 * POST /api/auth/password/reset
 */
router.post('/password/reset', async (req, res) => {
  // In a real app, verify token and update password
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token and password required' });

  console.log(`[Stub] Password reset with token: ${token}`);
  // Simulate success
  res.json({ status: 'ok' });
});

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
