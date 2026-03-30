import { parseTimezoneOffsetMinutes } from './timezone.js';

export const normalizeClientId = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

export const normalizeRangeFilter = (rangeDays) => {
  if (typeof rangeDays === 'string') {
    const normalized = rangeDays.trim().toLowerCase();
    if (normalized === 'today') return { rangeType: 'today', rangeDays: null };
    if (normalized === 'week' || normalized === 'this-week' || normalized === 'thisweek') {
      return { rangeType: 'week', rangeDays: null };
    }
  }
  const parsedRange = Number(rangeDays);
  const validRangeDays = Number.isFinite(parsedRange) && parsedRange > 0 ? parsedRange : null;
  return { rangeType: null, rangeDays: validRangeDays };
};

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

const resolveTimezoneOffsetMinutes = (timezoneOffsetMinutes) =>
  Number.isFinite(timezoneOffsetMinutes) ? timezoneOffsetMinutes : 0;

export const buildCreatedAtRange = ({
  rangeType = null,
  validRangeDays = null,
  timezoneOffsetMinutes = null,
  now = new Date(),
} = {}) => {
  const nowDate = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(nowDate.getTime())) return null;

  const offsetMinutes = resolveTimezoneOffsetMinutes(timezoneOffsetMinutes);
  const offsetMs = offsetMinutes * MINUTE_MS;
  const shiftedNow = new Date(nowDate.getTime() + offsetMs);

  if (rangeType === 'today') {
    const startLocalMs = Date.UTC(
      shiftedNow.getUTCFullYear(),
      shiftedNow.getUTCMonth(),
      shiftedNow.getUTCDate()
    );
    const endLocalMs = startLocalMs + DAY_MS;
    return {
      gte: new Date(startLocalMs - offsetMs),
      lt: new Date(endLocalMs - offsetMs),
    };
  }

  if (rangeType === 'week') {
    const localDay = shiftedNow.getUTCDay();
    const daysFromMonday = (localDay + 6) % 7;
    const startLocalMs =
      Date.UTC(
        shiftedNow.getUTCFullYear(),
        shiftedNow.getUTCMonth(),
        shiftedNow.getUTCDate()
      ) -
      daysFromMonday * DAY_MS;
    return {
      gte: new Date(startLocalMs - offsetMs),
      lte: nowDate,
    };
  }

  if (Number.isFinite(validRangeDays) && validRangeDays > 0) {
    return {
      gte: new Date(nowDate.getTime() - validRangeDays * DAY_MS),
      lte: nowDate,
    };
  }

  return null;
};

export const parseRecordsQuery = (source) => {
  const {
    page = '1',
    pageSize = '100',
    q,
    gender,
    rangeDays,
    sort,
    status,
    timezoneOffsetMinutes,
    clientId,
  } = source || {};

  const parsedPage = Number(page);
  const parsedPageSize = Number(pageSize);
  const safePage = Number.isFinite(parsedPage) && parsedPage > 0 ? Math.trunc(parsedPage) : 1;
  const safePageSize =
    Number.isFinite(parsedPageSize) && parsedPageSize > 0
      ? Math.min(Math.trunc(parsedPageSize), 500)
      : 100;

  const normalizedQuery = typeof q === 'string' ? q.trim() : '';
  const normalizedGender = typeof gender === 'string' ? gender.trim().toLowerCase() : '';
  const validGender =
    normalizedGender === 'male' || normalizedGender === 'female' ? normalizedGender : null;

  const { rangeType, rangeDays: validRangeDays } = normalizeRangeFilter(rangeDays);
  const resolvedTimezoneOffsetMinutes = parseTimezoneOffsetMinutes(timezoneOffsetMinutes);
  const sortOption = typeof sort === 'string' && sort.trim() ? sort.trim() : 'created-desc';
  const statusOption = typeof status === 'string' ? status.trim().toLowerCase() : 'active';
  const normalizedStatus = ['active', 'deleted', 'all'].includes(statusOption)
    ? statusOption
    : 'active';
  const normalizedClientId = normalizeClientId(clientId);

  return {
    safePage,
    safePageSize,
    normalizedQuery,
    validGender,
    validRangeDays,
    rangeType,
    timezoneOffsetMinutes: resolvedTimezoneOffsetMinutes,
    sortOption,
    normalizedStatus,
    clientId: normalizedClientId,
  };
};
