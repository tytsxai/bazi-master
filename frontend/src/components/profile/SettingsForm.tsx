import type { ChangeEvent, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

interface AiProvider {
    name: string;
    enabled: boolean;
}

interface Preferences {
    dailyGuidance: boolean;
    ritualReminders: boolean;
    researchUpdates: boolean;
    profileName: string;
    aiProvider: string;
}

interface SettingsFormProps {
    locale: string;
    setLocale: (value: string) => void;
    preferences: Preferences;
    handleProfileNameChange: (event: ChangeEvent<HTMLInputElement>) => void;
    updatePreference: (key: keyof Preferences) => (event: ChangeEvent<HTMLInputElement>) => void;
    aiProviders: AiProvider[];
    activeProvider: string;
    status: { type: string; message: string };
    profileNameError: string;
    aiProviderError: string;
    saveSettings: (event: FormEvent) => void;
    handleCancel: () => void;
    onAiProviderSelect: (value: string) => void;
}

export default function SettingsForm({
    locale,
    setLocale,
    preferences,
    handleProfileNameChange,
    updatePreference,
    aiProviders,
    activeProvider,
    status,
    profileNameError,
    aiProviderError,
    saveSettings,
    handleCancel,
    onAiProviderSelect,
}: SettingsFormProps) {
    const { t } = useTranslation();

    const profileNameValue = preferences.profileName || '';
    const aiProviderValue = preferences.aiProvider || '';
    const enabledProviders = aiProviders.filter((p) => p.enabled);
    const hasAiProviders = aiProviders.length > 0;

    return (
        <section className="mt-8 glass-card rounded-3xl border border-white/10 p-8 shadow-glass">
            <h2 className="font-display text-2xl text-white">{t('profile.settingsTitle')}</h2>
            <p className="mt-2 text-sm text-white/70">{t('profile.settingsSubtitle')}</p>

            <form onSubmit={saveSettings} className="mt-6 space-y-6">
                <label className="block text-sm text-white/70">
                    {t('profile.locale')}
                    <select
                        className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-white outline-none focus:border-gold-400"
                        value={locale}
                        onChange={(e) => setLocale(e.target.value)}
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
                        className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-white outline-none focus:border-gold-400"
                        placeholder={t('profile.displayNamePlaceholder')}
                    />
                    <div className="mt-2 flex items-center justify-between text-xs text-white/50">
                        <span>{t('profile.displayNameHint')}</span>
                        <span>{profileNameValue.length}/40</span>
                    </div>
                    {profileNameError && (
                        <span className="mt-2 block text-xs text-rose-200">{profileNameError}</span>
                    )}
                </div>

                <div>
                    <p className="text-sm text-white/70">{t('profile.preferences')}</p>
                    <div className="mt-3 space-y-3 text-sm text-white">
                        {(['dailyGuidance', 'ritualReminders', 'researchUpdates'] as const).map((key) => (
                            <label key={key} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                                <input
                                    type="checkbox"
                                    className="mt-1 h-4 w-4 rounded border-white/30 bg-white/10 text-gold-400 focus:ring-gold-400"
                                    checked={preferences[key]}
                                    onChange={updatePreference(key)}
                                />
                                <span>
                                    <span className="block font-medium">{t(`profile.${key}`)}</span>
                                    <span className="block text-xs text-white/60">{t(`profile.${key}Desc`)}</span>
                                </span>
                            </label>
                        ))}
                    </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-sm text-white/70">{t('profile.aiProvider')}</p>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <label className="block text-sm text-white/70">
                            {t('profile.preferredProvider')}
                            <select
                                className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-white outline-none focus:border-gold-400"
                                value={aiProviderValue}
                                onChange={(e) => onAiProviderSelect(e.target.value)}
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
                    {aiProviderError && <p className="mt-2 text-xs text-rose-200">{aiProviderError}</p>}
                </div>

                {status.type !== 'idle' && (
                    <p className={`text-sm ${status.type === 'error' ? 'text-rose-200' : 'text-emerald-200'}`}>
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
    );
}
