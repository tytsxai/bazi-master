const formatTimezoneOffset = (offsetMinutes) => {
  if (!Number.isFinite(offsetMinutes)) return 'UTC';
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  return `UTC${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const parseTimezoneOffsetMinutes = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^(utc|gmt|z)$/i.test(trimmed)) return 0;
  const match = trimmed.match(/^(?:utc|gmt)?\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?$/i);
  if (!match) return null;
  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] || 0);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours > 14 || minutes > 59)
    return null;
  return sign * (hours * 60 + minutes);
};

const getOffsetMinutesFromTimeZone = (timeZone, date) => {
  if (typeof timeZone !== 'string' || !timeZone.trim()) return null;
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const parts = dtf.formatToParts(date);
    const values = {};
    parts.forEach((part) => {
      if (part.type !== 'literal') values[part.type] = part.value;
    });
    const asUtc = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
      Number(values.second)
    );
    if (!Number.isFinite(asUtc)) return null;
    return Math.round((asUtc - date.getTime()) / 60000);
  } catch (error) {
    return null;
  }
};

const buildBirthTimeMeta = ({
  birthYear,
  birthMonth,
  birthDay,
  birthHour,
  birthMinute,
  timezone,
  timezoneOffsetMinutes,
}) => {
  const year = Number(birthYear);
  const month = Number(birthMonth);
  const day = Number(birthDay);
  const hour = Number.isFinite(Number(birthHour)) ? Number(birthHour) : 0;
  const minute = Number.isFinite(Number(birthMinute)) ? Number(birthMinute) : 0;
  if (![year, month, day].every(Number.isFinite)) {
    return { timezoneOffsetMinutes: null, birthTimestamp: null, birthIso: null };
  }

  const offsetFromPayload = parseTimezoneOffsetMinutes(timezoneOffsetMinutes);
  const offsetFromLabel = parseTimezoneOffsetMinutes(timezone);
  const baseUtcDate = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const offsetFromZone =
    offsetFromLabel === null ? getOffsetMinutesFromTimeZone(timezone, baseUtcDate) : null;
  const resolvedOffset = Number.isFinite(offsetFromPayload)
    ? offsetFromPayload
    : Number.isFinite(offsetFromLabel)
      ? offsetFromLabel
      : offsetFromZone;

  if (!Number.isFinite(resolvedOffset)) {
    return { timezoneOffsetMinutes: null, birthTimestamp: null, birthIso: null };
  }

  const birthTimestamp =
    Date.UTC(year, month - 1, day, hour, minute, 0) - resolvedOffset * 60 * 1000;
  return {
    timezoneOffsetMinutes: resolvedOffset,
    birthTimestamp,
    birthIso: new Date(birthTimestamp).toISOString(),
  };
};

export {
  formatTimezoneOffset,
  parseTimezoneOffsetMinutes,
  getOffsetMinutesFromTimeZone,
  buildBirthTimeMeta,
};
