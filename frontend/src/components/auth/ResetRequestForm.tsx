import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';

interface ResetRequestFormProps {
    email: string;
    setEmail: (val: string) => void;
    errors: Record<string, string | undefined>;
    setErrors: Dispatch<SetStateAction<Record<string, string | undefined>>>;
    status: { type: string; message: string } | null;
    isSubmitting: boolean;
    onSwitchMode: (mode: string) => void;
    emailPattern: RegExp;
}

export default function ResetRequestForm({
    email,
    setEmail,
    errors,
    setErrors,
    status,
    isSubmitting,
    onSwitchMode,
    emailPattern,
}: ResetRequestFormProps) {
    const { t } = useTranslation();

    return (
        <>
            <div className="mt-6">
                <label htmlFor="reset-email" className="block text-sm text-white/80">
                    {t('login.email')}
                </label>
                <input
                    id="reset-email"
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
                {isSubmitting ? t('login.ui.sending') : t('login.ui.sendResetLink')}
            </button>
            <div className="mt-4 flex flex-col gap-3 text-center text-xs text-white/70">
                <button
                    type="button"
                    className="underline decoration-white/40 underline-offset-4"
                    onClick={() => onSwitchMode('reset')}
                >
                    {t('login.ui.haveCode')}
                </button>
                <button
                    type="button"
                    className="underline decoration-white/40 underline-offset-4"
                    onClick={() => onSwitchMode('login')}
                >
                    {t('login.ui.backToLogin')}
                </button>
            </div>
        </>
    );
}
