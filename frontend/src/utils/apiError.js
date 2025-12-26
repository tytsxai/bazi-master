import i18next from 'i18next';

export const getApiErrorMessage = (payload, fallback) => {
  if (!payload) return fallback;
  if (typeof payload === 'string' && payload.trim()) return payload;
  if (typeof payload.error === 'string' && payload.error.trim()) return payload.error;
  if (typeof payload.message === 'string' && payload.message.trim()) return payload.message;
  if (Array.isArray(payload.errors)) {
    const stringErrors = payload.errors.filter((entry) => typeof entry === 'string' && entry.trim());
    if (stringErrors.length) return stringErrors.join(', ');
    const numericErrors = payload.errors.filter((entry) => Number.isFinite(entry));
    if (numericErrors.length) {
      const detail = i18next.t('errors.itemsFailed', { count: numericErrors.length });
      return `${fallback} (${detail})`;
    }
  }
  return fallback;
};

const STACK_LINE_PATTERN = /^\s*at\s+\S+/i;
const HTML_HINT_PATTERN = /<!doctype html|<html|<body/i;

const sanitizeServerMessage = (message, fallback, status) => {
  if (!message) return fallback;
  const raw = String(message);
  if (!status || status < 500) return raw;
  if (HTML_HINT_PATTERN.test(raw)) return fallback;
  const lines = raw.split('\n');
  const filtered = lines.filter((line) => !STACK_LINE_PATTERN.test(line)).map((line) => line.trim());
  const cleaned = filtered.filter(Boolean).join('\n').trim();
  if (!cleaned) return fallback;
  if (cleaned !== raw) {
    return cleaned.split('\n')[0].trim() || fallback;
  }
  return cleaned;
};

export const readApiErrorMessage = async (response, fallback) => {
  if (!response) return fallback;
  const status = typeof response.status === 'number' ? response.status : 0;
  let text = '';
  try {
    text = await response.text();
  } catch {
    return fallback;
  }
  if (!text) return fallback;
  try {
    const parsed = JSON.parse(text);
    const message = getApiErrorMessage(parsed, fallback);
    return sanitizeServerMessage(message, fallback, status);
  } catch {
    return sanitizeServerMessage(text, fallback, status);
  }
};
