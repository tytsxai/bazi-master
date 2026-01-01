import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import zhCN from './locales/zh-CN.json';
import zhTW from './locales/zh-TW.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';

const resources = {
  'en-US': { translation: en },
  'zh-CN': { translation: zhCN },
  'zh-TW': { translation: zhTW },
  ja: { translation: ja },
  ko: { translation: ko },
};

const STORAGE_KEY = 'locale';
const SUPPORTED_LOCALES = new Set(['en-US', 'zh-CN', 'zh-TW', 'ja', 'ko']);

const normalizeLocale = (locale) => {
  if (!locale) return 'en-US';
  const lowered = locale.toLowerCase();
  if (lowered.startsWith('zh')) {
    if (lowered.includes('hant') || lowered.endsWith('-tw') || lowered.includes('-tw'))
      return 'zh-TW';
    return 'zh-CN';
  }
  if (lowered.startsWith('ja')) return 'ja';
  if (lowered.startsWith('ko')) return 'ko';
  if (SUPPORTED_LOCALES.has(locale)) return locale;
  return 'en-US';
};

const safeGetStoredLocale = () => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

const safeSetStoredLocale = (locale) => {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Ignore storage failures (e.g. private mode).
  }
};

const getInitialLocale = () => {
  const stored = safeGetStoredLocale();
  if (stored) return normalizeLocale(stored);
  return normalizeLocale(navigator.language);
};

void i18n.use(initReactI18next).init({
  resources,
  lng: getInitialLocale(),
  fallbackLng: {
    'zh-TW': ['zh-CN', 'en-US'],
    default: ['en-US'],
  },
  interpolation: { escapeValue: false },
});

i18n.on('languageChanged', (locale) => {
  const normalized = normalizeLocale(locale);
  if (normalized !== locale) {
    void i18n.changeLanguage(normalized);
    return;
  }
  safeSetStoredLocale(normalized);
});

export default i18n;
