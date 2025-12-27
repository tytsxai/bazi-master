import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { validatePasswordStrength } from '../../utils/validation';
import type { AuthMode } from '../../auth/authTypes';

interface RegisterFormProps {
    name: string;
    setName: (val: string) => void;
    email: string;
    setEmail: (val: string) => void;
    password: string;
    setPassword: (val: string) => void;
    confirm: string;
    setConfirm: (val: string) => void;
    errors: Record<string, string | undefined>;
    setErrors: Dispatch<SetStateAction<Record<string, string | undefined>>>;
    status: string;
    isSubmitting: boolean;
    onSwitchMode: (mode: AuthMode) => void;
    emailPattern: RegExp;
}

export default function RegisterForm({
    name,
    setName,
    email,
    setEmail,
    password,
    setPassword,
    confirm,
    setConfirm,
    errors,
    setErrors,
    status,
    isSubmitting,
    onSwitchMode,
    emailPattern,
}: RegisterFormProps) {
    const { t } = useTranslation();

    return (
        <>
            <div className="mt-6">
                <label htmlFor="register-name" className="block text-sm text-white/80">
                    {t('login.ui.displayName')}
                </label>
                <input
                    id="register-name"
                    type="text"
                    value={name}
                    onChange={(event) => {
                        const value = event.target.value;
                        setName(value);
                        if (errors.name && value.trim().length >= 2) {
                            setErrors((prev: any) => ({ ...prev, name: undefined }));
                        }
                    }}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-white outline-none focus:border-gold-400"
                    placeholder="Star Seeker"
                />
                {errors.name && <span className="mt-2 block text-xs text-rose-200">{errors.name}</span>}
            </div>
            <div className="mt-4">
                <label htmlFor="register-email" className="block text-sm text-white/80">
                    {t('login.email')}
                </label>
                <input
                    id="register-email"
                    type="email"
                    value={email}
                    onChange={(event) => {
                        const value = event.target.value;
                        setEmail(value);
                        if (errors.email && emailPattern.test(value)) {
                            setErrors((prev: any) => ({ ...prev, email: undefined }));
                        }
                    }}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-white outline-none focus:border-gold-400"
                    placeholder="seer@example.com"
                    required
                />
                {errors.email && <span className="mt-2 block text-xs text-rose-200">{errors.email}</span>}
            </div>
            <div className="mt-4">
                <label htmlFor="register-password" className="block text-sm text-white/80">
                    {t('login.password')}
                </label>
                <input
                    id="register-password"
                    type="password"
                    value={password}
                    onChange={(event) => {
                        const value = event.target.value;
                        setPassword(value);
                        if (errors.password && !validatePasswordStrength(value, t)) {
                            setErrors((prev: any) => ({ ...prev, password: undefined }));
                        }
                    }}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-white outline-none focus:border-gold-400"
                    placeholder="••••••••"
                    required
                />
                {errors.password && <span className="mt-2 block text-xs text-rose-200">{errors.password}</span>}
            </div>
            <div className="mt-4">
                <label htmlFor="register-confirm" className="block text-sm text-white/80">
                    {t('login.ui.confirmPassword')}
                </label>
                <input
                    id="register-confirm"
                    type="password"
                    value={confirm}
                    onChange={(event) => {
                        const value = event.target.value;
                        setConfirm(value);
                        if (errors.confirm && value === password) {
                            setErrors((prev: any) => ({ ...prev, confirm: undefined }));
                        }
                    }}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-white outline-none focus:border-gold-400"
                    placeholder="••••••••"
                />
                {errors.confirm && <span className="mt-2 block text-xs text-rose-200">{errors.confirm}</span>}
            </div>
            <p className="mt-3 text-xs text-white/60">{t('login.errors.passwordStrength')}</p>
            {status && <p className="mt-3 text-xs text-rose-200">{status}</p>}
            <button
                type="submit"
                className="mt-6 w-full rounded-full bg-gold-400 px-4 py-2 text-sm font-semibold text-mystic-900 shadow-lg shadow-gold-400/30 disabled:cursor-not-allowed disabled:opacity-70"
                disabled={isSubmitting}
            >
                {isSubmitting ? `${t('login.registerSubmit')}...` : t('login.registerSubmit')}
            </button>
            <div className="mt-4 text-center">
                <button
                    type="button"
                    className="text-xs text-white/70 underline decoration-white/40 underline-offset-4"
                    onClick={() => onSwitchMode('login')}
                >
                    {t('login.ui.backToLogin')}
                </button>
            </div>
        </>
    );
}
