import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext.jsx';

export default function Profile() {
  const { t, i18n } = useTranslation();
  const { user, token } = useAuth();
  const [locale, setLocale] = useState(i18n.resolvedLanguage || i18n.language || 'en-US');
  const [preferences, setPreferences] = useState({
    dailyGuidance: true,
    ritualReminders: false,
    researchUpdates: true,
  });
  const [status, setStatus] = useState({ type: 'idle', message: '' });

  useEffect(() => {
    let isMounted = true;
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
      } catch (error) {
        console.error('Failed to load settings', error);
      }
    };

    void loadSettings();
    return () => {
      isMounted = false;
    };
  }, [token, i18n]);

  const updatePreference = (key) => (event) => {
    const checked = event.target.checked;
    setPreferences((prev) => ({ ...prev, [key]: checked }));
  };

  const saveSettings = async (event) => {
    event.preventDefault();
    if (!token) return;
    setStatus({ type: 'saving', message: '' });
    try {
      const res = await fetch('/api/user/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ locale, preferences }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Failed to save settings');
      }
      await res.json();
      if (locale !== i18n.language) {
        void i18n.changeLanguage(locale);
      }
      setStatus({ type: 'success', message: 'Settings saved.' });
    } catch (error) {
      console.error('Failed to save settings', error);
      setStatus({ type: 'error', message: 'Unable to save settings. Please try again.' });
    }
  };

  return (
    <main id="main-content" tabIndex={-1} className="container mx-auto pb-16">
      <section className="glass-card rounded-3xl border border-white/10 p-8 shadow-glass">
        <h1 className="font-display text-3xl text-gold-400">{t('protected.title')}</h1>
        <p className="mt-3 text-white/70">{t('protected.subtitle')}</p>
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
          <p className="text-white/70">Name</p>
          <p className="text-white">{user?.name}</p>
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

          {status.type !== 'idle' && (
            <p
              className={`text-sm ${
                status.type === 'error' ? 'text-rose-200' : 'text-emerald-200'
              }`}
            >
              {status.message || (status.type === 'saving' ? 'Saving…' : '')}
            </p>
          )}

          <button
            type="submit"
            className="w-full rounded-full bg-gold-400 px-4 py-2 text-sm font-semibold text-mystic-900 shadow-lg shadow-gold-400/30"
            disabled={status.type === 'saving'}
          >
            {status.type === 'saving' ? 'Saving…' : 'Save settings'}
          </button>
        </form>
      </section>
    </main>
  );
}
