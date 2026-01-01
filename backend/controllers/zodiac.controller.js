import { ZODIAC_PERIODS, ZODIAC_SIGNS } from '../constants/zodiac.js';
import {
  buildHoroscope,
  buildZodiacCompatibility,
  calculateRisingSign,
  formatDateLabel,
  getWeekRange,
  sanitizeQueryParam,
} from '../services/zodiac.service.js';

const getSignPayload = (signKey) => {
  const sign = ZODIAC_SIGNS[signKey];
  if (!sign) return null;
  return { key: signKey, value: signKey, ...sign };
};

const resolveSignKey = (raw) => {
  const normalized = sanitizeQueryParam(raw);
  if (!normalized) return null;
  return ZODIAC_SIGNS[normalized] ? normalized : null;
};

const buildHoroscopeRange = (period) => {
  const now = new Date();
  if (period === 'daily') {
    return formatDateLabel(now, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  if (period === 'weekly') {
    return getWeekRange(now);
  }
  return formatDateLabel(now, { month: 'long', year: 'numeric' });
};

export const getZodiacCompatibility = (req, res) => {
  const primaryKey = resolveSignKey(req.query.primary);
  const secondaryKey = resolveSignKey(req.query.secondary);

  if (!primaryKey || !secondaryKey) {
    return res.status(400).json({ error: 'Invalid zodiac signs provided.' });
  }

  const primary = ZODIAC_SIGNS[primaryKey];
  const secondary = ZODIAC_SIGNS[secondaryKey];
  const compatibility = buildZodiacCompatibility(primary, secondary);

  return res.json({
    ...compatibility,
    primary: getSignPayload(primaryKey),
    secondary: getSignPayload(secondaryKey),
  });
};

export const postZodiacRising = (req, res) => {
  const { birthDate, birthTime, timezoneOffsetMinutes, latitude, longitude } = req.body || {};

  if (typeof birthDate !== 'string' || typeof birthTime !== 'string') {
    return res.status(400).json({ error: 'Birth date and time are required.' });
  }

  const [birthYear, birthMonth, birthDay] = birthDate.split('-').map(Number);
  const [birthHour, birthMinute] = birthTime.split(':').map(Number);

  const dateCandidate = new Date(Date.UTC(birthYear, birthMonth - 1, birthDay));
  const dateValid =
    Number.isFinite(birthYear) &&
    Number.isFinite(birthMonth) &&
    Number.isFinite(birthDay) &&
    dateCandidate.getUTCFullYear() === birthYear &&
    dateCandidate.getUTCMonth() === birthMonth - 1 &&
    dateCandidate.getUTCDate() === birthDay;

  const timeValid =
    Number.isFinite(birthHour) &&
    Number.isFinite(birthMinute) &&
    birthHour >= 0 &&
    birthHour <= 23 &&
    birthMinute >= 0 &&
    birthMinute <= 59;

  const offsetMinutes = Number(timezoneOffsetMinutes);
  const offsetValid =
    Number.isFinite(offsetMinutes) && offsetMinutes >= -840 && offsetMinutes <= 840;

  const lat = Number(latitude);
  const lon = Number(longitude);
  const locationValid =
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180;

  if (!dateValid || !timeValid || !offsetValid || !locationValid) {
    return res.status(400).json({ error: 'Invalid rising sign input.' });
  }

  const result = calculateRisingSign({
    birthYear,
    birthMonth,
    birthDay,
    birthHour,
    birthMinute,
    latitude: lat,
    longitude: lon,
    timezoneOffsetMinutes: offsetMinutes,
  });

  const risingPayload = getSignPayload(result.signKey);
  if (!risingPayload) {
    return res.status(500).json({ error: 'Unable to resolve rising sign.' });
  }

  return res.json({
    rising: {
      value: risingPayload.value,
      key: risingPayload.key,
      name: risingPayload.name,
      dateRange: risingPayload.dateRange,
    },
    ascendant: result.ascendant,
  });
};

export const getZodiacHoroscope = (req, res) => {
  const signKey = resolveSignKey(req.params.sign);
  if (!signKey) {
    return res.status(400).json({ error: 'Unknown zodiac sign.' });
  }

  const periodRaw = sanitizeQueryParam(req.query.period) || 'daily';
  if (!ZODIAC_PERIODS.has(periodRaw)) {
    return res.status(400).json({ error: 'Unknown horoscope period.' });
  }

  const sign = ZODIAC_SIGNS[signKey];
  const horoscope = buildHoroscope(sign, periodRaw);
  const range = buildHoroscopeRange(periodRaw);

  return res.json({
    sign: {
      key: signKey,
      value: signKey,
      name: sign.name,
      dateRange: sign.dateRange,
    },
    period: periodRaw,
    range,
    generatedAt: new Date().toISOString(),
    horoscope,
  });
};

export const getZodiacSign = (req, res) => {
  const signKey = resolveSignKey(req.params.sign);
  if (!signKey) {
    return res.status(400).json({ error: 'Unknown zodiac sign.' });
  }

  const sign = getSignPayload(signKey);
  return res.json({ sign });
};
