import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { validatePasswordStrength } from '../../utils/validation';
import type { AuthMode } from '../../auth/authTypes';

interface ResetConfirmFormProps {
    token: string;
    setToken: (val: string) => void;
    password: string;
    setPassword: (val: string) => void;
    errors: Record<string, string | undefined>;
    setErrors: Dispatch<SetStateAction<Record<string, string | undefined>>>;
    status: { type: string; message: string } | null;
    isSubmitting: boolean;
    onSwitchMode: (mode: AuthMode) => void;
}

export default function ResetConfirmForm({
    token,
    setToken,
    password,
    setPassword,
    errors,
    setErrors,
    status,
    isSubmitting,
    onSwitchMode,
}: ResetConfirmFormProps) {
    const { t } = useTranslation();

    return (
        <>
            <div className="mt-6">
                <label htmlFor="reset-token" className="block text-sm text-white/80">
                    {t('login.ui.resetCode')}
                </label>
                <input
                    id="reset-token"
                    type="text"
                    value={token}
                    onChange={(event) => {
                        const value = event.target.value;
                        setToken(value);
                        if (errors.token && value.trim()) {
                            setErrors((prev: any) => ({ ...prev, token: undefined }));
                        }
                    }}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-white outline-none focus:border-gold-400"
                    placeholder={t('login.ui.pasteResetCode')}
                    required
                />
                {errors.token && <span className="mt-2 block text-xs text-rose-200">{errors.token}</span>}
            </div>
            <div className="mt-4">
                <label htmlFor="new-password" className="block text-sm text-white/80">
                    {t('login.ui.newPassword')}
                </label>
                <input
                    id="new-password"
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
            {status && (
                <p className={`mt-3 text-xs ${status.type === 'error' ? 'text-rose-200' : 'text-emerald-200'}`}>
                    {status.message}
                </p>
            )}
            <button
                type="submit"
                className="mt-6 w-full rounded-full bg-gold-400 px-4 py-2 text-sm font-semibold text-mystic-900 shadow-lg shadow-gold-400/30 disabled:cursor-not-allowed disabled:opacity-70"
                disabled={isSubmitting}
            >
                {isSubmitting ? `${t('login.ui.updatePassword')}...` : t('login.ui.updatePassword')}
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
