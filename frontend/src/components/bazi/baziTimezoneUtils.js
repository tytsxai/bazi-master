// Timezone utility functions for Bazi calculations

export const formatOffsetMinutes = (offsetMinutes) => {
  if (!Number.isFinite(offsetMinutes)) return 'UTC';
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  return `UTC${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

export const parseTimezoneOffsetMinutes = (raw) => {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.trunc(raw);
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^(utc|gmt|z)$/i.test(trimmed)) return 0;
  const match = trimmed.match(/^(?:utc|gmt)?\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?$/i);
  if (!match) return null;
  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] || 0);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours > 14 || minutes > 59) return null;
  return sign * (hours * 60 + minutes);
};

export const getBrowserTimezoneLabel = () => {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) return tz;
  } catch {
    // Ignore Intl issues and fall back to offset label.
  }
  const offsetMinutes = -new Date().getTimezoneOffset();
  return formatOffsetMinutes(offsetMinutes);
};



