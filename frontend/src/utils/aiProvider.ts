const AI_PROVIDER_STORAGE_KEY = 'bazi_ai_provider';

export const getPreferredAiProvider = (): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(AI_PROVIDER_STORAGE_KEY);
    return raw ? raw : null;
  } catch {
    return null;
  }
};

export const setPreferredAiProvider = (provider: string | null): void => {
  if (typeof window === 'undefined') return;
  try {
    if (!provider) {
      window.localStorage.removeItem(AI_PROVIDER_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(AI_PROVIDER_STORAGE_KEY, provider);
  } catch {
    // Ignore storage failures (e.g. private mode).
  }
};

export const AI_PROVIDER_STORAGE_KEY_VALUE = AI_PROVIDER_STORAGE_KEY;
