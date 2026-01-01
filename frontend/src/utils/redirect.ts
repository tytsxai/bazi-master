const ALLOWED_PATHS = new Set([
  '/',
  '/login',
  '/register',
  '/profile',
  '/history',
  '/favorites',
  '/bazi',
  '/tarot',
  '/iching',
  '/zodiac',
  '/synastry',
  '/soul-portrait',
  '/ziwei',
  '/admin',
  '/404',
  '/403',
]);

const ALLOWED_PREFIXES = ['/history/'];

const hasAllowedPrefix = (path: string) =>
  ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix));

export const sanitizeRedirectPath = (
  value: unknown,
  fallback: string | null = '/profile'
): string | null => {
  if (!value || typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return fallback;
  if (trimmed.includes('://')) return fallback;

  const base = trimmed.split('?')[0].split('#')[0];
  if (ALLOWED_PATHS.has(base) || hasAllowedPrefix(base)) return trimmed;
  return fallback;
};

export const safeAssignLocation = (target: string | null | undefined) => {
  const safeTarget = sanitizeRedirectPath(target, null);
  if (!safeTarget) return;
  window.location.assign(safeTarget);
};
