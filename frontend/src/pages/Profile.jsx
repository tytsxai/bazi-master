import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { getPreferredAiProvider, setPreferredAiProvider } from '../utils/aiProvider.js';

const UNSAVED_WARNING_MESSAGE = 'You have unsaved changes. Are you sure you want to leave this page?';
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
  const { user, token } = useAuth();
  const navigate = useNavigate();
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
  const savedSettingsRef = useRef({ locale, preferences });

  useEffect(() => {
    let isMounted = true;
    const loadProviders = async () => {
      try {
        const res = await fetch('/api/ai/providers');
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
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!isMounted) return;
        const nextLocale = data?.settings?.locale;
        const nextPreferences = data?.settings?.preferences;
        if (nextLocale) {
          setLocale(nextLocale);
          if (nextLocale !== i18n.language) {
            void i18n.changeLanguage(nextLocale);
          }
        }
        if (nextPreferences) {
          setPreferences((prev) => ({ ...prev, ...nextPreferences }));
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
    return () => {
      isMounted = false;
    };
  }, [token, i18n]);

  useEffect(() => {
    if (!aiProviders.length) return;
    const currentProvider = preferences.aiProvider;
    const providerMeta = aiProviders.find((provider) => provider.name === currentProvider);
    if (currentProvider && providerMeta && !providerMeta.enabled) {
      const nextProvider = activeProvider || '';
      setPreferences((prev) => ({ ...prev, aiProvider: nextProvider }));
    }
  }, [aiProviders, activeProvider, preferences.aiProvider]);

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
        `Display name must be between ${PROFILE_NAME_MIN_LENGTH} and ${PROFILE_NAME_MAX_LENGTH} characters.`
      );
      setStatus({ type: 'error', message: 'Please fix the highlighted field.' });
      return;
    }
    if (preferences.aiProvider) {
      const providerMeta = aiProviders.find((provider) => provider.name === preferences.aiProvider);
      if (providerMeta && !providerMeta.enabled) {
        setAiProviderError('Selected AI provider is not available in this environment.');
        setStatus({ type: 'error', message: 'Please choose an available AI provider.' });
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
        const text = await res.text();
        throw new Error(text || 'Failed to save settings');
      }
      await res.json();
      if (locale !== i18n.language) {
        void i18n.changeLanguage(locale);
      }
      setPreferredAiProvider(nextPreferences.aiProvider || '');
      savedSettingsRef.current = { locale, preferences: nextPreferences };
      setStatus({ type: 'success', message: 'Settings saved.' });
    } catch (error) {
      console.error('Failed to save settings', error);
      setStatus({ type: 'error', message: 'Unable to save settings. Please try again.' });
    }
  };

  const hasUnsavedChanges = useMemo(() => {
    const saved = savedSettingsRef.current;
    if (!saved) return false;
    if (saved.locale !== locale) return true;
    return Object.keys(preferences).some((key) => preferences[key] !== saved.preferences?.[key]);
  }, [locale, preferences]);

  useUnsavedChangesWarning(hasUnsavedChanges);

  const handleCancel = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  const profileNameValue = typeof preferences.profileName === 'string' ? preferences.profileName : '';
  const aiProviderValue = typeof preferences.aiProvider === 'string' ? preferences.aiProvider : '';
  const enabledProviders = aiProviders.filter((provider) => provider.enabled);
  const hasAiProviders = aiProviders.length > 0;

  return (
    <main id="main-content" tabIndex={-1} className="responsive-container pb-16">
      <section className="glass-card rounded-3xl border border-white/10 p-8 shadow-glass">
        <h1 className="font-display text-3xl text-gold-400">{t('protected.title')}</h1>
        <p className="mt-3 text-white/70">{t('protected.subtitle')}</p>
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
          <p className="text-white/70">Name</p>
          <p className="text-white">{profileNameValue || user?.name}</p>
          <p className="mt-4 text-white/70">Email</p>
          <p className="text-white">{user?.email}</p>
        </div>
      </section>
      <section className="mt-8 glass-card rounded-3xl border border-white/10 p-8 shadow-glass">
        <h2 className="font-display text-2xl text-white">Profile settings</h2>
        <p className="mt-2 text-sm text-white/70">
          Keep your locale and ritual preferences synced across devices.
        </p>
        <form onSubmit={saveSettings} className="mt-6 space-y-6">
          <label className="block text-sm text-white/70">
            Locale
            <select
              className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-white outline-none focus:border-gold-400"
              value={locale}
              onChange={(event) => setLocale(event.target.value)}
            >
              <option value="en-US" className="bg-slate-900 text-white">English (US)</option>
              <option value="zh-CN" className="bg-slate-900 text-white">中文（简体）</option>
            </select>
          </label>

          <div>
            <label htmlFor="profile-name" className="block text-sm text-white/70">
              Display name (optional)
            </label>
            <input
              id="profile-name"
              type="text"
              value={profileNameValue}
              onChange={handleProfileNameChange}
              minLength={PROFILE_NAME_MIN_LENGTH}
              maxLength={PROFILE_NAME_MAX_LENGTH}
              className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-white outline-none focus:border-gold-400"
              placeholder="Add a short name for your profile"
              aria-invalid={Boolean(profileNameError)}
              aria-describedby={profileNameError ? 'profile-name-error' : 'profile-name-help'}
            />
            <div className="mt-2 flex items-center justify-between text-xs text-white/50">
              <span id="profile-name-help">
                {PROFILE_NAME_MIN_LENGTH}-{PROFILE_NAME_MAX_LENGTH} characters.
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
            <p className="text-sm text-white/70">Preferences</p>
            <div className="mt-3 space-y-3 text-sm text-white">
              <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-white/30 bg-white/10 text-gold-400 focus:ring-gold-400"
                  checked={preferences.dailyGuidance}
                  onChange={updatePreference('dailyGuidance')}
                />
                <span>
                  <span className="block font-medium">Daily guidance</span>
                  <span className="block text-xs text-white/60">Get a short daily prompt based on your charts.</span>
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
                  <span className="block font-medium">Ritual reminders</span>
                  <span className="block text-xs text-white/60">Receive reminders for your chosen timing rituals.</span>
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
                  <span className="block font-medium">Research updates</span>
                  <span className="block text-xs text-white/60">Stay informed on new analyses and insights.</span>
                </span>
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-sm text-white/70">AI provider</p>
            <p className="mt-2 text-xs text-white/60">
              {hasAiProviders
                ? 'Select the AI model host for interpretations. Only enabled providers can be saved.'
                : 'AI providers are not available right now.'}
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="block text-sm text-white/70">
                Preferred provider
                <select
                  className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-white outline-none focus:border-gold-400"
                  value={aiProviderValue}
                  onChange={(event) =>
                    setPreferences((prev) => ({ ...prev, aiProvider: event.target.value }))
                  }
                  disabled={!hasAiProviders}
                >
                  <option value="" className="bg-slate-900 text-white">Use default</option>
                  {aiProviders.map((provider) => (
                    <option
                      key={provider.name}
                      value={provider.name}
                      className="bg-slate-900 text-white"
                      disabled={!provider.enabled}
                    >
                      {provider.name.toUpperCase()} {provider.enabled ? '' : '(Unavailable)'}
                    </option>
                  ))}
                </select>
              </label>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-white/60">
                <p className="text-white/70">Active server provider</p>
                <p className="mt-2 text-sm text-white">{activeProvider ? activeProvider.toUpperCase() : 'Unknown'}</p>
                <p className="mt-2">
                  {enabledProviders.length
                    ? `${enabledProviders.length} provider(s) enabled.`
                    : 'No providers enabled. Using fallback summaries.'}
                </p>
              </div>
            </div>
            {aiProviderError && (
              <p className="mt-2 text-xs text-rose-200">{aiProviderError}</p>
            )}
          </div>

          {status.type !== 'idle' && (
            <p
              className={`text-sm ${
                status.type === 'error' ? 'text-rose-200' : 'text-emerald-200'
              }`}
            >
              {status.message || (status.type === 'saving' ? 'Saving…' : '')}
            </p>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="submit"
              className="w-full rounded-full bg-gold-400 px-4 py-2 text-sm font-semibold text-mystic-900 shadow-lg shadow-gold-400/30"
              disabled={status.type === 'saving'}
            >
              {status.type === 'saving' ? 'Saving…' : 'Save settings'}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="w-full rounded-full border border-white/30 px-4 py-2 text-sm font-semibold text-white/80 transition hover:border-gold-400/60 hover:text-white"
            >
              Cancel
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
