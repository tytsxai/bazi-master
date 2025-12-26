import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { useAuthFetch } from '../auth/useAuthFetch.js';
import { getPreferredAiProvider, setPreferredAiProvider } from '../utils/aiProvider.js';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import { readApiErrorMessage } from '../utils/apiError.js';

const UNSAVED_WARNING_MESSAGE = '';
const PROFILE_NAME_MIN_LENGTH = 2;
const PROFILE_NAME_MAX_LENGTH = 40;

const useUnsavedChangesWarning = (shouldBlock, message = UNSAVED_WARNING_MESSAGE) => {
  useEffect(() => {
    if (!shouldBlock) return undefined;
    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = message;
      return message;
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [message, shouldBlock]);
};

export default function Profile() {
  const { t, i18n } = useTranslation();
  const { user, token, refreshUser, setProfileName, isAuthenticated, logout } = useAuth();
  const authFetch = useAuthFetch();
  const navigate = useNavigate();
  const location = useLocation();
  const [locale, setLocale] = useState(i18n.resolvedLanguage || i18n.language || 'en-US');
  const [preferences, setPreferences] = useState({
    dailyGuidance: true,
    ritualReminders: false,
    researchUpdates: true,
    profileName: '',
    aiProvider: getPreferredAiProvider() || '',
  });
  const [status, setStatus] = useState({ type: 'idle', message: '' });
  const [profileNameError, setProfileNameError] = useState('');
  const [aiProviders, setAiProviders] = useState([]);
  const [activeProvider, setActiveProvider] = useState('');
  const [aiProviderError, setAiProviderError] = useState('');
  const [latestBaziRecord, setLatestBaziRecord] = useState(null);
  const [latestBaziStatus, setLatestBaziStatus] = useState({ type: 'idle', message: '' });
  const [ziweiStatus, setZiweiStatus] = useState({ type: 'idle', message: '' });
  const [ziweiResult, setZiweiResult] = useState(null);
  const [ziweiLoading, setZiweiLoading] = useState(false);
  const [recentHistory, setRecentHistory] = useState([]);
  const [historyMeta, setHistoryMeta] = useState({ totalCount: 0, filteredCount: 0, hasMore: false });
  const [historyStatus, setHistoryStatus] = useState({ type: 'idle', message: '' });
  const [historyLoading, setHistoryLoading] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const savedSettingsRef = useRef({ locale, preferences });
  const confirmDeleteCancelRef = useRef(null);

  const getStoredLocale = () => {
    try {
      return localStorage.getItem('locale');
    } catch {
      return null;
    }
  };

  useEffect(() => {
    if (token) return;
    const redirectPath = `${location.pathname}${location.search || ''}${location.hash || ''}`;
    const params = new URLSearchParams();
    if (redirectPath) {
      params.set('next', redirectPath);
    }
    const target = params.size ? `/login?${params.toString()}` : '/login';
    navigate(target, { replace: true, state: { from: redirectPath } });
  }, [token, location, navigate]);

  useEffect(() => {
    let isMounted = true;
    const loadProviders = async () => {
      try {
        const res = await fetch('/api/ai/providers', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (!isMounted) return;
        const providerList = Array.isArray(data?.providers) ? data.providers : [];
        setAiProviders(providerList);
        setActiveProvider(data?.activeProvider || '');
      } catch (error) {
        console.error('Failed to load AI providers', error);
      }
    };
    const loadSettings = async () => {
      if (!token) return;
      try {
        const res = await fetch('/api/user/settings', {
          cache: 'no-store',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!isMounted) return;
        const nextLocale = data?.settings?.locale;
        const nextPreferences = data?.settings?.preferences;
        if (nextLocale) {
          const lowered = String(nextLocale).toLowerCase();
          const normalizedLocale = lowered.startsWith('zh')
            ? (lowered.includes('hant') || lowered.includes('-tw') ? 'zh-TW' : 'zh-CN')
            : nextLocale;
          setLocale(normalizedLocale);
          const storedLocale = getStoredLocale();
          const shouldSyncLanguage = !storedLocale || storedLocale === normalizedLocale;
          if (shouldSyncLanguage && normalizedLocale !== i18n.language) {
            void i18n.changeLanguage(normalizedLocale);
          }
        }
        if (nextPreferences) {
          setPreferences((prev) => ({ ...prev, ...nextPreferences }));
          if (typeof nextPreferences.profileName === 'string') {
            setProfileName(nextPreferences.profileName);
          }
        }
        const mergedPreferences = {
          ...preferences,
          ...(nextPreferences || {}),
        };
        savedSettingsRef.current = {
          locale: nextLocale || locale,
          preferences: mergedPreferences,
        };
      } catch (error) {
        console.error('Failed to load settings', error);
      }
    };

    void loadProviders();
    void loadSettings();
    void refreshUser();
    return () => {
      isMounted = false;
    };
  }, [token, i18n, refreshUser, setProfileName]);

  useEffect(() => {
    if (!aiProviders.length) return;
    const currentProvider = preferences.aiProvider;
    const providerMeta = aiProviders.find((provider) => provider.name === currentProvider);
    if (currentProvider && providerMeta && !providerMeta.enabled) {
      const nextProvider = activeProvider || '';
      setPreferences((prev) => ({ ...prev, aiProvider: nextProvider }));
    }
  }, [aiProviders, activeProvider, preferences.aiProvider]);

  useEffect(() => {
    let isMounted = true;
    const loadLatestBazi = async () => {
      if (!token) return;
      setLatestBaziStatus({ type: 'loading', message: '' });
      try {
        const res = await authFetch('/api/bazi/records?sort=created-desc&page=1&pageSize=1', {
          cache: 'no-store',
        });
        if (!res.ok) {
          const message = await readApiErrorMessage(res, t('profile.recordsLoadError'));
          throw new Error(message);
        }
        const data = await res.json();
        const record = Array.isArray(data?.records) ? data.records[0] : null;
        if (!isMounted) return;
        setLatestBaziRecord(record || null);
        setLatestBaziStatus({
          type: 'success',
          message: record ? '' : t('profile.noRecordAvailable'),
        });
      } catch (error) {
        if (!isMounted) return;
        setLatestBaziStatus({
          type: 'error',
          message: error.message || t('profile.recordsLoadError'),
        });
      }
    };
    void loadLatestBazi();
    return () => {
      isMounted = false;
    };
  }, [authFetch, token, t]);

  useEffect(() => {
    let isMounted = true;
    const loadRecentHistory = async () => {
      if (!token) return;
      setHistoryLoading(true);
      setHistoryStatus({ type: 'loading', message: '' });
      try {
        const params = new URLSearchParams({
          sort: 'created-desc',
          page: '1',
          pageSize: '3',
        });
        const res = await authFetch(`/api/bazi/records?${params.toString()}`, {
          cache: 'no-store',
        });
        if (!res.ok) {
          const message = await readApiErrorMessage(res, t('profile.recordsLoadError'));
          throw new Error(message);
        }
        const data = await res.json();
        if (!isMounted) return;
        setRecentHistory(Array.isArray(data?.records) ? data.records : []);
        setHistoryMeta({
          totalCount: Number.isFinite(data?.totalCount) ? data.totalCount : 0,
          filteredCount: Number.isFinite(data?.filteredCount) ? data.filteredCount : 0,
          hasMore: Boolean(data?.hasMore),
        });
        setHistoryStatus({ type: 'success', message: '' });
      } catch (error) {
        if (!isMounted) return;
        setRecentHistory([]);
        setHistoryMeta({ totalCount: 0, filteredCount: 0, hasMore: false });
        setHistoryStatus({
          type: 'error',
          message: error.message || t('profile.recordsLoadError'),
        });
      } finally {
        if (isMounted) setHistoryLoading(false);
      }
    };
    void loadRecentHistory();
    return () => {
      isMounted = false;
    };
  }, [authFetch, token, t]);

  useEffect(() => {
    if (!confirmDeleteOpen) return;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setConfirmDeleteOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    if (confirmDeleteOpen) {
      confirmDeleteCancelRef.current?.focus();
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmDeleteOpen]);

  const updatePreference = (key) => (event) => {
    const checked = event.target.checked;
    setPreferences((prev) => ({ ...prev, [key]: checked }));
  };

  const handleProfileNameChange = (event) => {
    const value = event.target.value;
    setPreferences((prev) => ({ ...prev, profileName: value }));
    if (profileNameError) {
      const trimmedLength = value.trim().length;
      const isValid =
        trimmedLength === 0 ||
        (trimmedLength >= PROFILE_NAME_MIN_LENGTH && trimmedLength <= PROFILE_NAME_MAX_LENGTH);
      if (isValid) {
        setProfileNameError('');
      }
    }
  };

  const saveSettings = async (event) => {
    event.preventDefault();
    if (!token) return;
    setAiProviderError('');
    const rawProfileName = typeof preferences.profileName === 'string' ? preferences.profileName : '';
    const trimmedProfileName = rawProfileName.trim();
    const profileNameLength = trimmedProfileName.length;
    const isProfileNameValid =
      profileNameLength === 0 ||
      (profileNameLength >= PROFILE_NAME_MIN_LENGTH &&
        profileNameLength <= PROFILE_NAME_MAX_LENGTH);
    if (!isProfileNameValid) {
      setProfileNameError(
        t('login.errors.nameTooShort')
      );
      setStatus({ type: 'error', message: t('iching.errors.correctFields') });
      return;
    }
    if (preferences.aiProvider) {
      const providerMeta = aiProviders.find((provider) => provider.name === preferences.aiProvider);
      if (providerMeta && !providerMeta.enabled) {
        setAiProviderError(t('profile.unavailable'));
        setStatus({ type: 'error', message: t('iching.errors.correctFields') });
        return;
      }
    }
    setStatus({ type: 'saving', message: '' });
    const nextPreferences = {
      ...preferences,
      profileName: trimmedProfileName,
    };
    if (nextPreferences.profileName !== preferences.profileName) {
      setPreferences(nextPreferences);
    }
    try {
      const res = await fetch('/api/user/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ locale, preferences: nextPreferences }),
      });
      if (!res.ok) {
        const message = await readApiErrorMessage(res, t('profile.loadError'));
        throw new Error(message);
      }
      await res.json();
      if (locale !== i18n.language) {
        void i18n.changeLanguage(locale);
      }
      setPreferredAiProvider(nextPreferences.aiProvider || '');
      setProfileName(nextPreferences.profileName);
      savedSettingsRef.current = { locale, preferences: nextPreferences };
      setStatus({ type: 'success', message: t('profile.settingsSaved') });
    } catch (error) {
      console.error('Failed to save settings', error);
      setStatus({ type: 'error', message: error.message || t('profile.loadError') });
    }
  };

  const hasUnsavedChanges = useMemo(() => {
    const saved = savedSettingsRef.current;
    if (!saved) return false;
    if (saved.locale !== locale) return true;
    return Object.keys(preferences).some((key) => preferences[key] !== saved.preferences?.[key]);
  }, [locale, preferences]);

  useUnsavedChangesWarning(hasUnsavedChanges, t('errors.unsavedChanges'));

  const handleCancel = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  const handleDeleteAccount = async () => {
    if (!token) return;
    setStatus({ type: 'saving', message: t('profile.removing') });
    try {
      const res = await fetch('/api/auth/me', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const message = await readApiErrorMessage(res, t('profile.removeError'));
        throw new Error(message);
      }
      logout();
      setConfirmDeleteOpen(false);
      navigate('/login?reason=deleted');
    } catch (error) {
      setStatus({ type: 'error', message: error.message || t('profile.removeError') });
      setConfirmDeleteOpen(false);
    }
  };

  const profileNameValue = typeof preferences.profileName === 'string' ? preferences.profileName : '';
  const aiProviderValue = typeof preferences.aiProvider === 'string' ? preferences.aiProvider : '';
  const enabledProviders = aiProviders.filter((provider) => provider.enabled);
  const hasAiProviders = aiProviders.length > 0;
  const latestBirthSummary = latestBaziRecord
    ? `${latestBaziRecord.birthYear}-${String(latestBaziRecord.birthMonth).padStart(2, '0')}-${String(latestBaziRecord.birthDay).padStart(2, '0')} · ${String(latestBaziRecord.birthHour).padStart(2, '0')}:00`
    : '';
  const formatBirthSummary = (record) => {
    if (!record) return '—';
    const year = String(record.birthYear ?? '').padStart(4, '0');
    const month = String(record.birthMonth ?? '').padStart(2, '0');
    const day = String(record.birthDay ?? '').padStart(2, '0');
    const hour = String(record.birthHour ?? '').padStart(2, '0');
    return `${year}-${month}-${day} · ${hour}:00`;
  };
  const formatCreatedAt = (value) => {
    if (!value) return '—';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleString();
  };

  const handleZiweiGenerate = async () => {
    if (ziweiLoading) return;
    if (!latestBaziRecord) {
      setZiweiStatus({ type: 'error', message: t('profile.saveBaziFirst') });
      return;
    }
    setZiweiLoading(true);
    setZiweiStatus({ type: 'loading', message: '' });
    setZiweiResult(null);
    try {
      const res = await authFetch('/api/ziwei/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          birthYear: latestBaziRecord.birthYear,
          birthMonth: latestBaziRecord.birthMonth,
          birthDay: latestBaziRecord.birthDay,
          birthHour: latestBaziRecord.birthHour,
          gender: latestBaziRecord.gender,
        }),
      });
      if (!res.ok) {
        const message = await readApiErrorMessage(res, t('ziwei.errors.calculateFailed'));
        throw new Error(message);
      }
      const data = await res.json();
      setZiweiResult(data);
      setZiweiStatus({ type: 'success', message: t('profile.ziweiReady') });
    } catch (error) {
      setZiweiStatus({ type: 'error', message: error.message || t('ziwei.errors.calculateFailed') });
    } finally {
      setZiweiLoading(false);
    }
  };

  return (
    <main id="main-content" tabIndex={-1} className="responsive-container pb-16">
      <Breadcrumbs />
      <section className="glass-card rounded-3xl border border-white/10 p-8 shadow-glass">
        <h1 className="font-display text-3xl text-gold-400">{t('profile.title')}</h1>
        <p className="mt-3 text-white/70">{t('profile.subtitle')}</p>
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
          <p className="text-white/70">{t('profile.name')}</p>
          <p className="text-white">{user?.name || '—'}</p>
          {profileNameValue ? (
            <>
              <p className="mt-4 text-white/70">{t('profile.displayName')}</p>
              <p className="text-white">{profileNameValue}</p>
            </>
          ) : null}
          <p className="mt-4 text-white/70">{t('profile.email')}</p>
          <p className="text-white">{user?.email || '—'}</p>
        </div>
      </section>
      <section className="mt-8 glass-card rounded-3xl border border-white/10 p-8 shadow-glass">
        <h2 className="font-display text-2xl text-white">{t('profile.settingsTitle')}</h2>
        <p className="mt-2 text-sm text-white/70">
          {t('profile.settingsSubtitle')}
        </p>
        <form onSubmit={saveSettings} className="mt-6 space-y-6">
          <label className="block text-sm text-white/70">
            {t('profile.locale')}
            <select
              className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-white outline-none focus:border-gold-400"
              value={locale}
              onChange={(event) => setLocale(event.target.value)}
            >
              <option value="en-US" className="bg-slate-900 text-white">English (US)</option>
              <option value="zh-CN" className="bg-slate-900 text-white">中文（简体）</option>
              <option value="zh-TW" className="bg-slate-900 text-white">中文（繁體）</option>
            </select>
          </label>

          <div>
            <label htmlFor="profile-name" className="block text-sm text-white/70">
              {t('profile.displayName')} ({t('profile.optional')})
            </label>
            <input
              id="profile-name"
              type="text"
              value={profileNameValue}
              onChange={handleProfileNameChange}
              minLength={PROFILE_NAME_MIN_LENGTH}
              maxLength={PROFILE_NAME_MAX_LENGTH}
              className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-white outline-none focus:border-gold-400"
              placeholder={t('profile.displayNamePlaceholder')}
              aria-invalid={Boolean(profileNameError)}
              aria-describedby={profileNameError ? 'profile-name-error' : 'profile-name-help'}
            />
            <div className="mt-2 flex items-center justify-between text-xs text-white/50">
              <span id="profile-name-help">
                {t('profile.displayNameHint')}
              </span>
              <span>
                {profileNameValue.length}/{PROFILE_NAME_MAX_LENGTH}
              </span>
            </div>
            {profileNameError && (
              <span id="profile-name-error" className="mt-2 block text-xs text-rose-200">
                {profileNameError}
              </span>
            )}
          </div>

          <div>
            <p className="text-sm text-white/70">{t('profile.preferences')}</p>
            <div className="mt-3 space-y-3 text-sm text-white">
              <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-white/30 bg-white/10 text-gold-400 focus:ring-gold-400"
                  checked={preferences.dailyGuidance}
                  onChange={updatePreference('dailyGuidance')}
                />
                <span>
                  <span className="block font-medium">{t('profile.dailyGuidance')}</span>
                  <span className="block text-xs text-white/60">{t('profile.dailyGuidanceDesc')}</span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-white/30 bg-white/10 text-gold-400 focus:ring-gold-400"
                  checked={preferences.ritualReminders}
                  onChange={updatePreference('ritualReminders')}
                />
                <span>
                  <span className="block font-medium">{t('profile.ritualReminders')}</span>
                  <span className="block text-xs text-white/60">{t('profile.ritualRemindersDesc')}</span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-white/30 bg-white/10 text-gold-400 focus:ring-gold-400"
                  checked={preferences.researchUpdates}
                  onChange={updatePreference('researchUpdates')}
                />
                <span>
                  <span className="block font-medium">{t('profile.researchUpdates')}</span>
                  <span className="block text-xs text-white/60">{t('profile.researchUpdatesDesc')}</span>
                </span>
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-sm text-white/70">{t('profile.aiProvider')}</p>
            <p className="mt-2 text-xs text-white/60">
              {hasAiProviders
                ? t('profile.aiProviderDesc')
                : t('profile.unavailable')}
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="block text-sm text-white/70">
                {t('profile.preferredProvider')}
                <select
                  className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-white outline-none focus:border-gold-400"
                  value={aiProviderValue}
                  onChange={(event) =>
                    setPreferences((prev) => ({ ...prev, aiProvider: event.target.value }))
                  }
                  disabled={!hasAiProviders}
                >
                  <option value="" className="bg-slate-900 text-white">{t('profile.useDefault')}</option>
                  {aiProviders.map((provider) => (
                    <option
                      key={provider.name}
                      value={provider.name}
                      className="bg-slate-900 text-white"
                      disabled={!provider.enabled}
                    >
                      {provider.name.toUpperCase()} {provider.enabled ? '' : `(${t('profile.unavailable')})`}
                    </option>
                  ))}
                </select>
              </label>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-white/60">
                <p className="text-white/70">{t('profile.activeServerProvider')}</p>
                <p className="mt-2 text-sm text-white">{activeProvider ? activeProvider.toUpperCase() : t('profile.unknown')}</p>
                <p className="mt-2">
                  {enabledProviders.length
                    ? t('profile.providersEnabled', { count: enabledProviders.length })
                    : t('profile.noProvidersEnabled')}
                </p>
              </div>
            </div>
            {aiProviderError && (
              <p className="mt-2 text-xs text-rose-200">{aiProviderError}</p>
            )}
          </div>

          {status.type !== 'idle' && (
            <p
              role={status.type === 'error' ? 'alert' : 'status'}
              aria-live={status.type === 'error' ? 'assertive' : 'polite'}
              className={`text-sm ${status.type === 'error' ? 'text-rose-200' : 'text-emerald-200'
                }`}
            >
              {status.message || (status.type === 'saving' ? t('profile.saving') : '')}
            </p>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="submit"
              className="w-full rounded-full bg-gold-400 px-4 py-2 text-sm font-semibold text-mystic-900 shadow-lg shadow-gold-400/30"
              disabled={status.type === 'saving'}
            >
              {status.type === 'saving' ? t('profile.saving') : t('profile.saveSettings')}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="w-full rounded-full border border-white/30 px-4 py-2 text-sm font-semibold text-white/80 transition hover:border-gold-400/60 hover:text-white"
            >
              {t('profile.cancel')}
            </button>
          </div>
        </form>
      </section>
      <section className="mt-8 glass-card rounded-3xl border border-white/10 p-8 shadow-glass">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl text-white">{t('profile.historySnapshot')}</h2>
            <p className="mt-2 text-sm text-white/70">
              {t('profile.historySnapshotDesc')}
            </p>
          </div>
          <Link
            to="/history"
            className="rounded-full border border-white/30 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white/80 transition hover:border-gold-400/60 hover:text-white"
          >
            {t('profile.openHistory')}
          </Link>
        </div>
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-white/80">
            <div>
              <p className="text-xs uppercase text-white/50">{t('profile.totalRecords')}</p>
              <p className="mt-1 text-white" data-testid="profile-history-total">
                {historyMeta.totalCount}
              </p>
            </div>
            {historyMeta.hasMore && (
              <p className="text-xs text-white/50">{t('profile.showingLatest')}</p>
            )}
          </div>
          {historyLoading ? (
            <p className="mt-4 text-sm text-white/60">{t('history.recordLoading')}</p>
          ) : recentHistory.length ? (
            <div className="mt-4 grid gap-3" data-testid="profile-history-list">
              {recentHistory.map((record) => (
                <div
                  key={record.id}
                  data-testid="profile-history-card"
                  data-record-id={record.id}
                  data-birth-year={record.birthYear}
                  data-birth-month={record.birthMonth}
                  data-birth-day={record.birthDay}
                  data-birth-hour={record.birthHour}
                  data-gender={record.gender || ''}
                  data-location={record.birthLocation || ''}
                  data-timezone={record.timezone || ''}
                  data-created-at={record.createdAt || ''}
                  className="rounded-2xl border border-white/10 bg-white/5 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-white" data-testid="profile-history-birth">
                      {formatBirthSummary(record)}
                    </p>
                    <p className="text-xs text-white/60" data-testid="profile-history-created">
                      {t('bazi.saved')} {formatCreatedAt(record.createdAt)}
                    </p>
                  </div>
                  <div className="mt-2 grid gap-2 text-xs text-white/70 sm:grid-cols-2">
                    <p>
                      <span className="text-white/50">{t('bazi.birthLocation')}:</span>{' '}
                      <span data-testid="profile-history-location">
                        {record.birthLocation || t('profile.unknown')}
                      </span>
                    </p>
                    <p>
                      <span className="text-white/50">{t('bazi.timezone')}:</span>{' '}
                      <span data-testid="profile-history-timezone">
                        {record.timezone || t('profile.unknown')}
                      </span>
                    </p>
                    <p>
                      <span className="text-white/50">{t('bazi.gender')}:</span>{' '}
                      <span data-testid="profile-history-gender">
                        {record.gender || t('profile.unknown')}
                      </span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-white/60">{t('profile.noHistory')}</p>
          )}
          {historyStatus.type === 'error' && (
            <p className="mt-3 text-xs text-rose-200">{historyStatus.message}</p>
          )}
        </div>
      </section>
      <section className="mt-8 glass-card rounded-3xl border border-white/10 p-8 shadow-glass">
        <h2 className="font-display text-2xl text-white">{t('profile.ziweiQuickChart')}</h2>
        <p className="mt-2 text-sm text-white/70">
          {t('profile.ziweiQuickChartDesc')}
        </p>
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-white/80">
            <div>
              <p className="text-xs uppercase text-white/50">{t('profile.latestBaziRecord')}</p>
              <p className="mt-1 text-white">
                {latestBaziRecord
                  ? `${latestBirthSummary} · ${latestBaziRecord.gender}`
                  : t('profile.noRecordAvailable')}
              </p>
            </div>
            <button
              type="button"
              onClick={handleZiweiGenerate}
              disabled={!latestBaziRecord || ziweiLoading || latestBaziStatus.type === 'loading'}
              className="rounded-full bg-gold-400 px-4 py-2 text-xs font-semibold text-mystic-900 shadow-lg shadow-gold-400/30 transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {ziweiLoading ? t('profile.calculating') : t('profile.generateZiwei')}
            </button>
          </div>
          {latestBaziStatus.type === 'error' && (
            <p className="mt-3 text-xs text-rose-200">{latestBaziStatus.message}</p>
          )}
          {latestBaziStatus.type === 'success' && !latestBaziRecord && (
            <p className="mt-3 text-xs text-white/60">
              {t('profile.createBaziFirst')}
            </p>
          )}
        </div>
        {ziweiStatus.type !== 'idle' && (
          <p
            data-testid="profile-ziwei-status"
            role={ziweiStatus.type === 'error' ? 'alert' : 'status'}
            aria-live={ziweiStatus.type === 'error' ? 'assertive' : 'polite'}
            className={`mt-4 text-sm ${ziweiStatus.type === 'error' ? 'text-rose-200' : 'text-emerald-200'
              }`}
          >
            {ziweiStatus.message || (ziweiStatus.type === 'loading' ? t('profile.calculating') : '')}
          </p>
        )}
        {ziweiResult && (
          <div className="mt-6 grid gap-4 md:grid-cols-3" data-testid="profile-ziwei-result">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <h3 className="text-xs uppercase text-gold-400/80">{t('bazi.year')}</h3>
              <p className="mt-2 text-white">
                {ziweiResult?.lunar
                  ? `${ziweiResult.lunar.year}年 ${ziweiResult.lunar.month}月 ${ziweiResult.lunar.day}日${ziweiResult.lunar.isLeap ? ' (Leap)' : ''}`
                  : '—'}
              </p>
              <p className="mt-1 text-xs text-white/60">
                {ziweiResult?.lunar
                  ? `${ziweiResult.lunar.yearStem}${ziweiResult.lunar.yearBranch}年 · ${ziweiResult.lunar.monthStem}${ziweiResult.lunar.monthBranch}月`
                  : '—'}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <h3 className="text-xs uppercase text-gold-400/80">{t('bazi.fourPillars')}</h3>
              <p className="mt-2 text-white">
                命宫: {ziweiResult?.mingPalace?.palace?.cn} · {ziweiResult?.mingPalace?.branch?.name}
              </p>
              <p className="mt-1 text-white">
                身宫: {ziweiResult?.shenPalace?.palace?.cn} · {ziweiResult?.shenPalace?.branch?.name}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <h3 className="text-xs uppercase text-gold-400/80">{t('bazi.birthUtc')}</h3>
              <p className="mt-2 text-white">{ziweiResult?.birthIso || '—'}</p>
              <p className="mt-1 text-xs text-white/60">
                UTC offset: {Number.isFinite(ziweiResult?.timezoneOffsetMinutes)
                  ? `${ziweiResult.timezoneOffsetMinutes} ${t('profile.mins')}`
                  : '—'}
              </p>
            </div>
          </div>
        )}
      </section>

      <section className="mt-8 glass-card rounded-3xl border border-rose-500/30 bg-rose-900/10 p-8 shadow-glass">
        <h2 className="font-display text-2xl text-rose-300">{t('profile.dangerZone')}</h2>
        <p className="mt-2 text-sm text-white/70">
          {t('profile.dangerZoneDesc')}
        </p>
        <div className="mt-6">
          <button
            type="button"
            onClick={() => setConfirmDeleteOpen(true)}
            className="rounded-full border border-rose-400/40 bg-rose-500/10 px-6 py-2 text-sm font-semibold text-rose-100 transition hover:border-rose-300 hover:text-rose-50"
          >
            {t('profile.deleteAccount')}
          </button>
        </div>
      </section>

      {
        confirmDeleteOpen && (
          <div
            role="presentation"
            onClick={() => setConfirmDeleteOpen(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6"
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-account-title"
              onClick={(event) => event.stopPropagation()}
              className="w-full max-w-md rounded-3xl border border-rose-500/20 bg-slate-950/95 p-6 text-white shadow-2xl backdrop-blur"
            >
              <h2 id="delete-account-title" className="text-lg font-semibold text-rose-300">
                {t('profile.deleteAccountTitle')}
              </h2>
              <p className="mt-2 text-sm text-white/70">
                {t('profile.deleteAccountDesc')}
              </p>
              <div className="mt-6 flex flex-wrap gap-3 sm:justify-end">
                <button
                  ref={confirmDeleteCancelRef}
                  type="button"
                  onClick={() => setConfirmDeleteOpen(false)}
                  className="rounded-full border border-white/20 px-4 py-2 text-xs uppercase tracking-[0.2em] text-white/70 transition hover:border-white/40 hover:text-white"
                >
                  {t('profile.cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  className="rounded-full bg-rose-600 px-4 py-2 text-xs uppercase tracking-[0.2em] text-white shadow-lg shadow-rose-900/40 transition hover:bg-rose-500"
                >
                  {t('profile.confirmDelete')}
                </button>
              </div>
            </div>
          </div>
        )
      }
    </main >
  );
}
