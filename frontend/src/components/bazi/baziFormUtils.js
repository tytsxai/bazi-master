import { NUMERIC_FIELD_LIMITS, DEFAULT_FORM_KEYS } from './baziConstants';
import { getBrowserTimezoneLabel } from './baziTimezoneUtils';

// Form data utilities

export const buildDefaultFormData = () => {
  const now = new Date();
  return {
    birthYear: String(now.getFullYear()),
    birthMonth: String(now.getMonth() + 1),
    birthDay: String(now.getDate()),
    birthHour: '14',
    gender: '',
    birthLocation: '',
    timezone: getBrowserTimezoneLabel(),
  };
};

export const isWhitespaceOnly = (value) =>
  typeof value === 'string' && value.length > 0 && value.trim().length === 0;

export const normalizeOptionalText = (value) => (typeof value === 'string' ? value.trim() : value);

export const normalizeOverrideArg = (value) => {
  if (!value) return null;
  if (typeof value === 'object' && typeof value.preventDefault === 'function') return null;
  return value;
};

export const normalizeNumericInput = (value, limits) => {
  const cleaned = value.replace(/[^\d]/g, '');
  const parsed = cleaned === '' ? null : Number(cleaned);
  if (parsed === null) return '';
  if (limits) {
    const clamped = Math.max(limits.min, Math.min(limits.max, parsed));
    return String(clamped);
  }
  return String(parsed);
};

export const formatCoordinate = (value) =>
  Number.isFinite(value) ? Number(value).toFixed(4) : '—';

export const formatLocationLabel = (location) => {
  if (!location) return '—';
  if (typeof location === 'string') return location.trim() || '—';
  if (typeof location !== 'object') return '—';
  if (typeof location.label === 'string' && location.label.trim()) return location.label.trim();
  if (typeof location.name === 'string' && location.name.trim()) return location.name.trim();
  const parts = [];
  if (location.city) parts.push(location.city);
  if (location.region) parts.push(location.region);
  if (location.country) parts.push(location.country);
  return parts.length > 0 ? parts.join(', ') : '—';
};

export const coerceInt = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
};

export const safeJsonParse = (value) => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

export const isSameFormData = (left, right) =>
  DEFAULT_FORM_KEYS.every((key) => left?.[key] === right?.[key]);
