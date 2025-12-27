import crypto from 'crypto';

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

const oauthStateStore = new Map();

const pruneOauthStateStore = (now = Date.now()) => {
  for (const [key, entry] of oauthStateStore.entries()) {
    if (!entry?.createdAt || now - entry.createdAt > OAUTH_STATE_TTL_MS) {
      oauthStateStore.delete(key);
    }
  }
};

const buildOauthState = (nextPath) => {
  pruneOauthStateStore();
  const state = crypto.randomBytes(24).toString('hex');
  oauthStateStore.set(state, { createdAt: Date.now(), nextPath });
  return state;
};

const consumeOauthState = (state) => {
  const entry = oauthStateStore.get(state);
  if (!entry) return null;
  oauthStateStore.delete(state);
  if (Date.now() - entry.createdAt > OAUTH_STATE_TTL_MS) return null;
  return entry;
};

const buildOauthRedirectUrl = ({ token, user, nextPath, error, frontendUrl = DEFAULT_FRONTEND_URL }) => {
  const redirectUrl = new URL('/login', frontendUrl);
  const hashParams = new URLSearchParams();
  const isProduction = process.env.NODE_ENV === 'production';

  if (token) {
    hashParams.set('token', token);
    if (!isProduction) {
      redirectUrl.searchParams.set('token', token);
    }
  }
  if (user) {
    const encodedUser = Buffer.from(JSON.stringify(user)).toString('base64url');
    hashParams.set('user', encodedUser);
    if (!isProduction) {
      redirectUrl.searchParams.set('user', encodedUser);
    }
  }
  if (nextPath) redirectUrl.searchParams.set('next', nextPath);
  if (error) redirectUrl.searchParams.set('error', error);
  if (hashParams.size) {
    redirectUrl.hash = hashParams.toString();
  }
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
  const email = rawEmail && rawEmail.includes('@')
    ? rawEmail
    : `dev-${safeProvider}-${timestamp}@example.com`;
  const name = rawName || `Dev ${safeProvider.charAt(0).toUpperCase()}${safeProvider.slice(1)} User`;
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
  isAdminUser,
  frontendUrl,
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

  const redirectUrl = buildOauthRedirectUrl({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      isAdmin: isAdminUser(user),
    },
    nextPath,
    frontendUrl,
  });
  return res.redirect(redirectUrl);
};

export {
  buildOauthState,
  consumeOauthState,
  buildOauthRedirectUrl,
  oauthStateStore,
  handleDevOauthLogin,
};
