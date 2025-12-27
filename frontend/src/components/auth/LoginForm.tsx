import type { Dispatch, FormEvent, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';

interface LoginFormProps {
    email: string;
    setEmail: (val: string) => void;
    password: string;
    setPassword: (val: string) => void;
    errors: Record<string, string | undefined>;
    setErrors: Dispatch<SetStateAction<Record<string, string | undefined>>>;
    loginError: string;
    setLoginError: (val: string) => void;
    isSubmitting: boolean;
    oauthError: string;
    handleSubmit: (e: FormEvent) => void;
    handleGoogleLogin: () => void;
    handleWeChatLogin: () => void;
    onSwitchMode: (mode: string) => void;
    emailPattern: RegExp;
}

export default function LoginForm({
    email,
    setEmail,
    password,
    setPassword,
    errors,
    setErrors,
    loginError,
    setLoginError,
    isSubmitting,
    oauthError,
    handleSubmit,
    handleGoogleLogin,
    handleWeChatLogin,
    onSwitchMode,
    emailPattern,
}: LoginFormProps) {
    const { t } = useTranslation();

    return (
        <>
            <div className="mt-6">
                <label htmlFor="email" className="block text-sm text-white/80">
                    {t('login.email')}
                </label>
                <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(event) => {
                        const value = event.target.value;
                        setEmail(value);
                        if (loginError) setLoginError('');
                        if (errors.email && emailPattern.test(value)) {
                            setErrors((prev: any) => ({ ...prev, email: undefined }));
                        }
                    }}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-white outline-none focus:border-gold-400"
                    placeholder="seer@example.com"
                    required
                />
                {errors.email && (
                    <span className="mt-2 block text-xs text-rose-200">{errors.email}</span>
                )}
            </div>
            <div className="mt-4">
                <label htmlFor="password" className="block text-sm text-white/80">
                    {t('login.password')}
                </label>
                <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(event) => {
                        const value = event.target.value;
                        setPassword(value);
                        if (loginError) setLoginError('');
                        if (errors.password && value) {
                            setErrors((prev: any) => ({ ...prev, password: undefined }));
                        }
                    }}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-white outline-none focus:border-gold-400"
                    placeholder="••••••••"
                    required
                />
                {errors.password && (
                    <span className="mt-2 block text-xs text-rose-200">{errors.password}</span>
                )}
            </div>
            <button
                type="submit"
                className="mt-6 w-full rounded-full bg-gold-400 px-4 py-2 text-sm font-semibold text-mystic-900 shadow-lg shadow-gold-400/30 disabled:cursor-not-allowed disabled:opacity-70"
                disabled={isSubmitting}
            >
                {isSubmitting ? `${t('login.submit')}...` : t('login.submit')}
            </button>
            <button
                type="button"
                onClick={handleGoogleLogin}
                className="mt-3 w-full rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:border-gold-400 hover:text-gold-300"
            >
                {t('login.ui.continueWithGoogle')}
            </button>
            <button
                type="button"
                onClick={handleWeChatLogin}
                className="mt-3 w-full rounded-full border border-emerald-300/60 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-100 shadow-lg shadow-emerald-500/20 hover:border-emerald-300"
            >
                {t('login.ui.continueWithWeChat')}
            </button>
            {oauthError && <p className="mt-3 text-xs text-rose-200">{oauthError}</p>}
            {loginError && <p className="mt-3 text-xs text-rose-200">{loginError}</p>}

            <div className="mt-4 flex items-center justify-between text-xs text-white/70">
                <button
                    type="button"
                    className="underline decoration-white/40 underline-offset-4"
                    onClick={() => onSwitchMode('request')}
                >
                    {t('login.ui.forgotPassword')}
                </button>
                <button
                    type="button"
                    className="underline decoration-white/40 underline-offset-4"
                    onClick={() => onSwitchMode('reset')}
                >
                    {t('login.ui.haveCode')}
                </button>
            </div>
            <div className="mt-4 flex items-center justify-between text-xs text-white/70">
                <span>{t('login.ui.newHere')}</span>
                <button
                    type="button"
                    className="underline decoration-white/40 underline-offset-4"
                    onClick={() => onSwitchMode('register')}
                >
                    {t('login.registerTitle', { defaultValue: 'Create an account' })}
                </button>
            </div>
            <p className="mt-4 text-xs text-white/60">{t('login.ui.demoAccess')}</p>
        </>
    );
}
