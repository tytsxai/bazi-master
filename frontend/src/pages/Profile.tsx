import type { ChangeEvent, FormEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useAuthFetch } from '../auth/useAuthFetch';
import { getPreferredAiProvider, setPreferredAiProvider } from '../utils/aiProvider';
import Breadcrumbs from '../components/Breadcrumbs';
import { readApiErrorMessage } from '../utils/apiError';
import logger from '../utils/logger';
import { sanitizeRedirectPath } from '../utils/redirect';

// Subcomponents
import ProfileHeader from '../components/profile/ProfileHeader';
import SettingsForm from '../components/profile/SettingsForm';
import HistorySnapshot from '../components/profile/HistorySnapshot';
import ZiweiQuickChart from '../components/profile/ZiweiQuickChart';
import DangerZone from '../components/profile/DangerZone';

const UNSAVED_WARNING_MESSAGE = '';
const PROFILE_NAME_MIN_LENGTH = 2;
const PROFILE_NAME_MAX_LENGTH = 40;

const useUnsavedChangesWarning = (shouldBlock: boolean, message = UNSAVED_WARNING_MESSAGE) => {
  useEffect(() => {
    if (!shouldBlock) return undefined;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
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
  const { user, isAuthenticated, isAuthResolved, refreshUser, setProfileName, logout } = useAuth();
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
  const [aiProviders, setAiProviders] = useState<{ name: string; enabled: boolean }[]>([]);
  const [activeProvider, setActiveProvider] = useState('');
  const [aiProviderError, setAiProviderError] = useState('');

  const [latestBaziRecord, setLatestBaziRecord] = useState<{
    id: string | number;
    birthYear: number;
    birthMonth: number;
    birthDay: number;
    birthHour: number;
    gender: string;
    birthLocation?: string;
    timezone?: string;
    createdAt: string;
  } | null>(null);
  const [latestBaziStatus, setLatestBaziStatus] = useState({ type: 'idle', message: '' });

  const [ziweiStatus, setZiweiStatus] = useState({ type: 'idle', message: '' });
  const [ziweiResult, setZiweiResult] = useState<{
    lunar: {
      year: number;
      month: number;
      day: number;
      isLeap: boolean;
      yearStem: string;
      yearBranch: string;
      monthStem: string;
      monthBranch: string;
    };
    mingPalace: { palace: { cn: string }; branch: { name: string } };
    shenPalace: { palace: { cn: string }; branch: { name: string } };
    birthIso: string;
    timezoneOffsetMinutes: number;
  } | null>(null);
  const [ziweiLoading, setZiweiLoading] = useState(false);

  const [recentHistory, setRecentHistory] = useState<
    {
      id: string | number;
      birthYear: number;
      birthMonth: number;
      birthDay: number;
      birthHour: number;
      gender: string;
      birthLocation?: string;
      timezone?: string;
      createdAt: string;
    }[]
  >([]);
  const [historyMeta, setHistoryMeta] = useState({
    totalCount: 0,
    filteredCount: 0,
    hasMore: false,
  });
  const [historyStatus, setHistoryStatus] = useState({ type: 'idle', message: '' });
  const [historyLoading, setHistoryLoading] = useState(false);

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const savedSettingsRef = useRef({ locale, preferences });
  const confirmDeleteCancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isAuthResolved || isAuthenticated) return;
    const redirectPath = `${location.pathname}${location.search || ''}${location.hash || ''}`;
    const params = new URLSearchParams();
    const safeNext = sanitizeRedirectPath(redirectPath, null);
    if (safeNext) params.set('next', safeNext);
    const target = params.size ? `/login?${params.toString()}` : '/login';
    navigate(target, { replace: true, state: { from: redirectPath } });
  }, [isAuthResolved, isAuthenticated, location, navigate]);

  useEffect(() => {
    let isMounted = true;
    const loadProviders = async () => {
      try {
        const res = await fetch('/api/ai/providers', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (!isMounted) return;
        setAiProviders(Array.isArray(data?.providers) ? data.providers : []);
        setActiveProvider(data?.activeProvider || '');
      } catch (error) {
        logger.warn({ error }, 'Failed to load AI providers');
      }
    };
    const loadSettings = async () => {
      if (!isAuthenticated) return;
      try {
        const res = await fetch('/api/user/settings', {
          cache: 'no-store',
          credentials: 'include',
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!isMounted) return;

        const nextLocaleRaw = data?.settings?.locale;
        const nextPreferences = data?.settings?.preferences;

        const fallbackLocale = savedSettingsRef.current.locale;
        const normalizedLocale = (() => {
          if (!nextLocaleRaw) return fallbackLocale;
          const lowered = String(nextLocaleRaw).toLowerCase();
          if (lowered.startsWith('zh')) {
            return lowered.includes('hant') || lowered.includes('-tw') ? 'zh-TW' : 'zh-CN';
          }
          return String(nextLocaleRaw);
        })();

        if (normalizedLocale && normalizedLocale !== fallbackLocale) {
          setLocale(normalizedLocale);
        }

        if (nextPreferences) {
          setPreferences((prev) => {
            const merged = { ...prev, ...nextPreferences };
            savedSettingsRef.current = { locale: normalizedLocale, preferences: merged };
            return merged;
          });
          if (typeof nextPreferences.profileName === 'string') {
            setProfileName(nextPreferences.profileName);
          }
        } else {
          savedSettingsRef.current = {
            locale: normalizedLocale,
            preferences: savedSettingsRef.current.preferences,
          };
        }
      } catch (error) {
        logger.warn({ error }, 'Failed to load settings');
      }
    };

    void loadProviders();
    void loadSettings();
    void refreshUser();
    return () => {
      isMounted = false;
    };
  }, [isAuthenticated, i18n, refreshUser, setProfileName]);

  useEffect(() => {
    let isMounted = true;
    const loadLatestBazi = async () => {
      if (!isAuthenticated) return;
      setLatestBaziStatus({ type: 'loading', message: '' });
      try {
        const res = await authFetch('/api/bazi/records?sort=created-desc&page=1&pageSize=1', {
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(await readApiErrorMessage(res, t('profile.recordsLoadError')));
        const data = await res.json();
        const record = Array.isArray(data?.records) ? data.records[0] : null;
        if (!isMounted) return;
        setLatestBaziRecord(record || null);
        setLatestBaziStatus({
          type: 'success',
          message: record ? '' : t('profile.noRecordAvailable'),
        });
      } catch (error: unknown) {
        if (!isMounted) return;
        const message = error instanceof Error ? error.message : t('profile.recordsLoadError');
        setLatestBaziStatus({ type: 'error', message });
      }
    };
    void loadLatestBazi();
    return () => {
      isMounted = false;
    };
  }, [authFetch, isAuthenticated, t]);

  useEffect(() => {
    let isMounted = true;
    const loadRecentHistory = async () => {
      if (!isAuthenticated) return;
      setHistoryLoading(true);
      setHistoryStatus({ type: 'loading', message: '' });
      try {
        const res = await authFetch('/api/bazi/records?sort=created-desc&page=1&pageSize=3', {
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(await readApiErrorMessage(res, t('profile.recordsLoadError')));
        const data = await res.json();
        if (!isMounted) return;
        setRecentHistory(Array.isArray(data?.records) ? data.records : []);
        setHistoryMeta({
          totalCount: Number.isFinite(data?.totalCount) ? data.totalCount : 0,
          filteredCount: Number.isFinite(data?.filteredCount) ? data.filteredCount : 0,
          hasMore: Boolean(data?.hasMore),
        });
        setHistoryStatus({ type: 'success', message: '' });
      } catch (error: unknown) {
        if (!isMounted) return;
        setRecentHistory([]);
        const message = error instanceof Error ? error.message : t('profile.recordsLoadError');
        setHistoryStatus({ type: 'error', message });
      } finally {
        if (isMounted) setHistoryLoading(false);
      }
    };
    void loadRecentHistory();
    return () => {
      isMounted = false;
    };
  }, [authFetch, isAuthenticated, t]);

  const updatePreference =
    (key: keyof typeof preferences) => (event: ChangeEvent<HTMLInputElement>) => {
      const checked = event.target.checked;
      setPreferences((prev) => ({ ...prev, [key]: checked }));
    };

  const handleProfileNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setPreferences((prev) => ({ ...prev, profileName: value }));
    if (profileNameError) {
      const trimmedLength = value.trim().length;
      if (
        trimmedLength === 0 ||
        (trimmedLength >= PROFILE_NAME_MIN_LENGTH && trimmedLength <= PROFILE_NAME_MAX_LENGTH)
      ) {
        setProfileNameError('');
      }
    }
  };

  const saveSettings = async (event: FormEvent) => {
    event.preventDefault();
    if (!isAuthenticated) return;
    setAiProviderError('');
    const trimmedProfileName = (preferences.profileName || '').trim();
    const len = trimmedProfileName.length;
    if (len !== 0 && (len < PROFILE_NAME_MIN_LENGTH || len > PROFILE_NAME_MAX_LENGTH)) {
      setProfileNameError(t('login.errors.nameTooShort'));
      return;
    }

    setStatus({ type: 'saving', message: '' });
    const nextPrefs = { ...preferences, profileName: trimmedProfileName };
    try {
      const res = await fetch('/api/user/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ locale, preferences: nextPrefs }),
      });
      if (!res.ok) throw new Error(await readApiErrorMessage(res, t('profile.loadError')));
      await res.json();
      setStatus({ type: 'success', message: t('profile.settingsSaved') });
      setPreferences(nextPrefs);
      setPreferredAiProvider(nextPrefs.aiProvider);
      setProfileName(nextPrefs.profileName);
      savedSettingsRef.current = { locale, preferences: nextPrefs };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('profile.loadError');
      setStatus({ type: 'error', message });
    }
  };

  const handleCancel = () => navigate(-1);

  const handleDeleteAccount = async () => {
    if (!isAuthenticated) return;
    setStatus({ type: 'saving', message: t('profile.removing') });
    try {
      const res = await fetch('/api/auth/me', {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(await readApiErrorMessage(res, t('profile.removeError')));
      logout();
      setConfirmDeleteOpen(false);
      navigate('/login?reason=deleted');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('profile.removeError');
      setStatus({ type: 'error', message });
      setConfirmDeleteOpen(false);
    }
  };

  const handleZiweiGenerate = async () => {
    if (ziweiLoading || !latestBaziRecord) return;
    setZiweiLoading(true);
    setZiweiStatus({ type: 'loading', message: '' });
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
      if (!res.ok)
        throw new Error(await readApiErrorMessage(res, t('ziwei.errors.calculateFailed')));
      setZiweiResult(await res.json());
      setZiweiStatus({ type: 'success', message: t('profile.ziweiReady') });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('ziwei.errors.calculateFailed');
      setZiweiStatus({ type: 'error', message });
    } finally {
      setZiweiLoading(false);
    }
  };

  const hasUnsavedChanges = useMemo(() => {
    const saved = savedSettingsRef.current;
    if (saved.locale !== locale) return true;
    return (Object.keys(preferences) as Array<keyof typeof preferences>).some(
      (k) => preferences[k] !== saved.preferences[k]
    );
  }, [locale, preferences]);

  useUnsavedChangesWarning(hasUnsavedChanges, t('errors.unsavedChanges'));

  const latestBirthSummary = latestBaziRecord
    ? `${latestBaziRecord.birthYear}-${String(latestBaziRecord.birthMonth).padStart(2, '0')}-${String(latestBaziRecord.birthDay).padStart(2, '0')} · ${String(latestBaziRecord.birthHour).padStart(2, '0')}:00`
    : '';

  return (
    <main id="main-content" tabIndex={-1} className="responsive-container pb-16">
      <Breadcrumbs />

      <ProfileHeader user={user} profileNameValue={preferences.profileName} />

      <SettingsForm
        locale={locale}
        setLocale={setLocale}
        preferences={preferences}
        handleProfileNameChange={handleProfileNameChange}
        updatePreference={updatePreference}
        aiProviders={aiProviders}
        activeProvider={activeProvider}
        status={status}
        profileNameError={profileNameError}
        aiProviderError={aiProviderError}
        saveSettings={saveSettings}
        handleCancel={handleCancel}
        onAiProviderSelect={(val) => setPreferences((p) => ({ ...p, aiProvider: val }))}
      />

      <HistorySnapshot
        recentHistory={recentHistory}
        historyMeta={historyMeta}
        historyLoading={historyLoading}
        historyStatus={historyStatus}
      />

      <ZiweiQuickChart
        latestBaziRecord={latestBaziRecord}
        latestBirthSummary={latestBirthSummary}
        ziweiLoading={ziweiLoading}
        latestBaziStatus={latestBaziStatus}
        handleZiweiGenerate={handleZiweiGenerate}
        ziweiStatus={ziweiStatus}
        ziweiResult={ziweiResult}
      />

      <DangerZone onOpenConfirm={() => setConfirmDeleteOpen(true)} />

      {confirmDeleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('profile.deleteAccountTitle', { defaultValue: 'Delete your account?' })}
            className="glass-card w-full max-w-md rounded-3xl border border-white/10 p-8 shadow-2xl"
          >
            <h2 className="font-display text-2xl text-white">{t('profile.deleteAccountTitle')}</h2>
            <p className="mt-4 text-sm text-white/70">{t('profile.deleteAccountDesc')}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={handleDeleteAccount}
                aria-label="Confirm Delete"
                className="w-full rounded-full bg-rose-500 px-6 py-2 text-sm font-semibold text-white shadow-lg shadow-rose-500/30"
              >
                {t('profile.confirmDelete')}
              </button>
              <button
                ref={confirmDeleteCancelRef}
                onClick={() => setConfirmDeleteOpen(false)}
                aria-label="Cancel"
                className="w-full rounded-full border border-white/20 bg-white/5 px-6 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10"
              >
                {t('profile.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
