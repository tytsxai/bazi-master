import crypto from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(crypto.scrypt);

const DEFAULT_SCRYPT = {
  N: 16384,
  r: 8,
  p: 1,
  keylen: 64,
};

const MAX_SCRYPT = {
  N: 1 << 20,
  r: 32,
  p: 32,
};

const safeEqual = (a, b) => {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

export const isHashedPassword = (value) => typeof value === 'string' && value.startsWith('scrypt$');

export const hashPassword = async (password) => {
  if (typeof password !== 'string') return null;
  const salt = crypto.randomBytes(16);
  const { N, r, p, keylen } = DEFAULT_SCRYPT;
  const derived = await scrypt(password, salt, keylen, { N, r, p });
  return [
    'scrypt',
    String(N),
    String(r),
    String(p),
    salt.toString('base64'),
    Buffer.from(derived).toString('base64'),
  ].join('$');
};

export const verifyPassword = async (password, stored) => {
  if (typeof stored !== 'string' || typeof password !== 'string') return false;
  if (!isHashedPassword(stored)) {
    return safeEqual(Buffer.from(password), Buffer.from(stored));
  }
  const parts = stored.split('$');
  if (parts.length !== 6) return false;
  const [, nStr, rStr, pStr, saltB64, hashB64] = parts;
  const N = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;
  if (N > MAX_SCRYPT.N || r > MAX_SCRYPT.r || p > MAX_SCRYPT.p) return false;
  const salt = Buffer.from(saltB64, 'base64');
  const hash = Buffer.from(hashB64, 'base64');
  if (!salt.length || !hash.length) return false;
  const derived = await scrypt(password, salt, hash.length, { N, r, p });
  return safeEqual(Buffer.from(derived), hash);
};
