import { getSessionConfig } from './env.js';

const DEFAULT_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const { sessionIdleMs: DEFAULT_SESSION_IDLE_MS } = getSessionConfig();

export const parseAuthToken = (token) => {
  if (typeof token !== 'string') return null;
  const match = token.match(/^token_(\d+)_(\d+)(?:_[A-Za-z0-9]+)?$/);
  if (!match) return null;
  const userId = Number(match[1]);
  const issuedAt = Number(match[2]);
  if (!Number.isFinite(userId) || !Number.isFinite(issuedAt)) return null;
  return { userId, issuedAt };
};

export const createAuthorizeToken = ({
  prisma,
  sessionStore,
  isAdminUser,
  tokenTtlMs = DEFAULT_TOKEN_TTL_MS,
  sessionIdleMs = DEFAULT_SESSION_IDLE_MS,
  now = () => Date.now()
}) => {
  return async (token) => {
    if (!token) throw new Error('Unauthorized');
    const parsed = parseAuthToken(token);
    if (!parsed) throw new Error('Invalid token');
    if (now() - parsed.issuedAt > tokenTtlMs) {
      throw new Error('Token expired');
    }

    const current = now();
    const storedLastSeen = sessionStore.getAsync
      ? await sessionStore.getAsync(token)
      : sessionStore.get(token);
    const lastSeen = Number.isFinite(storedLastSeen) ? storedLastSeen : null;
    if (lastSeen === null) {
      throw new Error('Session expired');
    }
    if (current - lastSeen > sessionIdleMs) {
      sessionStore.delete(token);
      throw new Error('Session expired');
    }
    sessionStore.set(token, current);

    const userId = parsed.userId;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      isAdmin: isAdminUser(user)
    };
  };
};

export const createRequireAuth = ({ authorizeToken, allowSessionExpiredSilent = true }) => {
  return async (req, res, next) => {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    const silentExpired =
      allowSessionExpiredSilent && req.headers['x-session-expired-silent'] === '1';
    try {
      const user = await authorizeToken(token);
      req.user = user;
      next();
    } catch (error) {
      const message = typeof error?.message === 'string' ? error.message : '';
      const isExpired = message.toLowerCase().includes('expired');
      if (silentExpired && isExpired) {
        res.set('x-session-expired', '1');
        return res.status(200).json({ error: message || 'Unauthorized', sessionExpired: true });
      }
      res.status(401).json({ error: message || 'Unauthorized' });
    }
  };
};

export const requireAdmin = (req, res, next) => {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  return next();
};
