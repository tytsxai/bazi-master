const AI_PROVIDER_STORAGE_KEY = 'bazi_ai_provider';

export const getPreferredAiProvider = () => {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(AI_PROVIDER_STORAGE_KEY);
  return raw ? raw : null;
};

export const setPreferredAiProvider = (provider) => {
  if (typeof window === 'undefined') return;
  if (!provider) {
    window.localStorage.removeItem(AI_PROVIDER_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(AI_PROVIDER_STORAGE_KEY, provider);
};

export const AI_PROVIDER_STORAGE_KEY_VALUE = AI_PROVIDER_STORAGE_KEY;
