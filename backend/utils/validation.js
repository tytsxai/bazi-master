export const isUrlTooLong = (req) => {
  const url = req?.originalUrl || req?.url || '';
  const MAX_URL_LENGTH = parseInt(process.env.MAX_URL_LENGTH) || 16384;
  return url.length > MAX_URL_LENGTH;
};

export const parseIdParam = (value) => {
  if (typeof value !== 'string') return null;
  const num = parseInt(value, 10);
  return Number.isFinite(num) && num > 0 ? num : null;
};

export const sanitizeQueryParam = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

export const sanitizeNextPath = (value) => {
  if (typeof value !== 'string') return '/profile';
  const trimmed = value.trim();
  if (!trimmed || !trimmed.startsWith('/')) return '/profile';
  // Basic security check - prevent redirect to external domains
  if (trimmed.includes('://')) return '/profile';
  return trimmed;
};

export const isLocalUrl = (value) => {
  if (!value || typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname.startsWith('127.0.0.');
  } catch {
    return false;
  }
};
