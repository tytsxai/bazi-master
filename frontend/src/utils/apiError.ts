import i18next from 'i18next';

interface ApiErrorPayload {
  error?: string;
  message?: string;
  errors?: (string | number)[];
}

export const getApiErrorMessage = (payload: unknown, fallback: string): string => {
  if (!payload) return fallback;
  if (typeof payload === 'string' && payload.trim()) return payload;

  const data = payload as ApiErrorPayload;
  if (typeof data.error === 'string' && data.error.trim()) return data.error;
  if (typeof data.message === 'string' && data.message.trim()) return data.message;

  if (Array.isArray(data.errors)) {
    const stringErrors = data.errors.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '');
    if (stringErrors.length) return stringErrors.join(', ');

    const numericErrors = data.errors.filter((entry): entry is number => typeof entry === 'number' && Number.isFinite(entry));
    if (numericErrors.length) {
      const detail = i18next.t('errors.itemsFailed', { count: numericErrors.length });
      return `${fallback} (${detail})`;
    }
  }
  return fallback;
};

const STACK_LINE_PATTERN = /^\s*at\s+\S+/i;
const HTML_HINT_PATTERN = /<!doctype html|<html|<body/i;

const sanitizeServerMessage = (message: string | null | undefined, fallback: string, status?: number): string => {
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

export const readApiErrorMessage = async (response: Response | null | undefined, fallback: string): Promise<string> => {
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
