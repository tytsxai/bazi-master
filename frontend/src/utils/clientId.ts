const CLIENT_ID_KEY = 'bazi_client_id_v1';

const generateClientId = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `client_${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

export const getClientId = (): string => {
  if (typeof window === 'undefined') return '';
  try {
    const storage = window.sessionStorage || window.localStorage;
    const existing = storage.getItem(CLIENT_ID_KEY);
    if (existing) return existing;
    const next = generateClientId();
    storage.setItem(CLIENT_ID_KEY, next);
    return next;
  } catch {
    return generateClientId();
  }
};
