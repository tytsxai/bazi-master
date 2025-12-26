import crypto from 'crypto';
import { getSessionConfig } from '../config/app.js';

const DEFAULT_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const { sessionIdleMs: DEFAULT_SESSION_IDLE_MS } = getSessionConfig();
const TOKEN_PREFIX = 'token';
const TOKEN_NONCE_BYTES = 16;
const TOKEN_SIGNATURE_BYTES = 32;
const TOKEN_NONCE_HEX_LENGTH = TOKEN_NONCE_BYTES * 2;
const TOKEN_SIGNATURE_HEX_LENGTH = TOKEN_SIGNATURE_BYTES * 2;
const TOKEN_KEY_BYTES = 32;
const TOKEN_IV_BYTES = 12;
const TOKEN_TAG_BYTES = 16;
const TOKEN_ENCRYPTION_SALT = 'auth-token-v1';
const TOKEN_MIN_PAYLOAD_BYTES = TOKEN_IV_BYTES + TOKEN_TAG_BYTES + 1;

const normalizeSecret = (secret) => (typeof secret === 'string' ? secret.trim() : '');
const FALLBACK_TOKEN_SECRET = crypto.randomBytes(32).toString('hex');
const resolveTokenSecret = (secret) => normalizeSecret(secret) || FALLBACK_TOKEN_SECRET;

const buildSignatureBase = ({ issuedAt, payload }) =>
  `${issuedAt}.${payload}`;

const buildLegacySignatureBase = ({ userId, issuedAt, nonce }) =>
  `${userId}.${issuedAt}.${nonce}`;

const buildTokenSignature = (secret, payload) => {
  if (!secret) return null;
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(buildSignatureBase(payload));
  return hmac.digest('hex');
};

const buildLegacyTokenSignature = (secret, payload) => {
  if (!secret) return null;
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(buildLegacySignatureBase(payload));
  return hmac.digest('hex');
};
const deriveTokenKey = (secret) =>
  crypto.scryptSync(secret, TOKEN_ENCRYPTION_SALT, TOKEN_KEY_BYTES);

const encodePayload = (value) => Buffer.from(value).toString('base64url');

const decodePayload = (value) => Buffer.from(value, 'base64url');

const encryptTokenPayload = (secret, payload) => {
  if (!secret) return null;
  const key = deriveTokenKey(secret);
  const iv = crypto.randomBytes(TOKEN_IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();
  return encodePayload(Buffer.concat([iv, tag, ciphertext]));
};

const decryptTokenPayload = (secret, payload) => {
  if (!secret || typeof payload !== 'string') return null;
  let raw;
  try {
    raw = decodePayload(payload);
  } catch (error) {
    return null;
  }
  if (raw.length < TOKEN_MIN_PAYLOAD_BYTES) return null;
  const iv = raw.subarray(0, TOKEN_IV_BYTES);
  const tag = raw.subarray(TOKEN_IV_BYTES, TOKEN_IV_BYTES + TOKEN_TAG_BYTES);
  const ciphertext = raw.subarray(TOKEN_IV_BYTES + TOKEN_TAG_BYTES);
  try {
    const key = deriveTokenKey(secret);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  } catch (error) {
    return null;
  }
};

const safeEqual = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
};

export const buildAuthToken = ({
  userId,
  issuedAt = Date.now(),
  nonce = crypto.randomBytes(TOKEN_NONCE_BYTES).toString('hex'),
  secret = ''
}) => {
  if (!Number.isFinite(userId)) return null;
  const resolvedSecret = resolveTokenSecret(secret);
  const payload = encryptTokenPayload(resolvedSecret, { userId, nonce });
  if (!payload) return null;
  const signature = buildTokenSignature(resolvedSecret, { issuedAt, payload });
  const suffix = signature ? `${payload}.${signature}` : payload;
  return `${TOKEN_PREFIX}_${issuedAt}_${suffix}`;
};

const parseLegacyAuthToken = (token) => {
  if (typeof token !== 'string') return null;
  const match = token.match(/^token_(\d+)_(\d+)(?:_([A-Za-z0-9]+))?$/);
  if (!match) return null;
  const userId = Number(match[1]);
  const issuedAt = Number(match[2]);
  if (!Number.isFinite(userId) || !Number.isFinite(issuedAt)) return null;
  const suffix = match[3] || '';
  let nonce = null;
  let signature = null;
  if (suffix) {
    if (suffix.length >= TOKEN_NONCE_HEX_LENGTH + TOKEN_SIGNATURE_HEX_LENGTH) {
      signature = suffix.slice(-TOKEN_SIGNATURE_HEX_LENGTH);
      nonce = suffix.slice(0, -TOKEN_SIGNATURE_HEX_LENGTH);
    } else {
      nonce = suffix;
    }
  }
  return { userId, issuedAt, nonce, signature };
};

export const parseAuthToken = (token, { secret = '' } = {}) => {
  if (typeof token !== 'string') return null;
  const legacy = parseLegacyAuthToken(token);
  if (legacy) return legacy;
  const match = token.match(/^token_(\d+)_([A-Za-z0-9_-]+)\.([a-f0-9]+)$/i);
  if (match) {
    const issuedAt = Number(match[1]);
    if (!Number.isFinite(issuedAt)) return null;
    const payload = match[2];
    const signature = match[3] || null;
    const resolvedSecret = resolveTokenSecret(secret);
    const decrypted = decryptTokenPayload(resolvedSecret, payload);
    if (!decrypted || !Number.isFinite(decrypted.userId)) return null;
    return {
      userId: Number(decrypted.userId),
      issuedAt,
      nonce: decrypted.nonce ?? null,
      signature,
      payload
    };
  }
  return null;
};

export const createAuthorizeToken = ({
  prisma,
  sessionStore,
  isAdminUser,
  tokenTtlMs = DEFAULT_TOKEN_TTL_MS,
  sessionIdleMs = DEFAULT_SESSION_IDLE_MS,
  now = () => Date.now(),
  tokenSecret = ''
}) => {
  const resolvedSecret = resolveTokenSecret(tokenSecret);
  return async (token) => {
    if (!token) throw new Error('Unauthorized');
    const parsed = parseAuthToken(token, { secret: resolvedSecret });
    if (!parsed) throw new Error('Invalid token');
    if (!parsed.signature) {
      throw new Error('Invalid token');
    }
    const expected = parsed.payload
      ? buildTokenSignature(resolvedSecret, {
        issuedAt: parsed.issuedAt,
        payload: parsed.payload,
      })
      : buildLegacyTokenSignature(resolvedSecret, {
        userId: parsed.userId,
        issuedAt: parsed.issuedAt,
        nonce: parsed.nonce,
      });
    if (!expected || !safeEqual(expected, parsed.signature)) {
      throw new Error('Invalid token');
    }
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
