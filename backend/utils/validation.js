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
export const isWhitespaceOnly = (value) =>
  typeof value === 'string' && value.length > 0 && value.trim().length === 0;

export const isValidCalendarDate = (year, month, day) => {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
  );
};

export const validateBaziInput = (raw) => {
  const birthYear = Number(raw?.birthYear);
  const birthMonth = Number(raw?.birthMonth);
  const birthDay = Number(raw?.birthDay);
  const birthHour = Number(raw?.birthHour);
  const genderRaw = raw?.gender;
  const gender = typeof genderRaw === 'string' ? genderRaw.trim() : '';
  if (isWhitespaceOnly(genderRaw) || isWhitespaceOnly(raw?.birthLocation) || isWhitespaceOnly(raw?.timezone)) {
    return { ok: false, payload: null, reason: 'whitespace' };
  }
  const birthLocation = typeof raw?.birthLocation === 'string' ? raw.birthLocation.trim() : raw?.birthLocation;
  const timezone = typeof raw?.timezone === 'string' ? raw.timezone.trim() : raw?.timezone;

  if (
    !Number.isInteger(birthYear)
    || birthYear < 1
    || birthYear > 9999
    || !Number.isInteger(birthMonth)
    || birthMonth < 1
    || birthMonth > 12
    || !Number.isInteger(birthDay)
    || birthDay < 1
    || birthDay > 31
    || !Number.isInteger(birthHour)
    || birthHour < 0
    || birthHour > 23
    || !gender
    || !isValidCalendarDate(birthYear, birthMonth, birthDay)
  ) {
    return { ok: false, payload: null, reason: 'invalid' };
  }

  return {
    ok: true,
    payload: {
      ...raw,
      birthYear,
      birthMonth,
      birthDay,
      birthHour,
      gender,
      birthLocation,
      timezone,
    },
  };
};

