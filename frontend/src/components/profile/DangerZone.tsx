import { useTranslation } from 'react-i18next';

interface DangerZoneProps {
    onOpenConfirm: () => void;
}

export default function DangerZone({ onOpenConfirm }: DangerZoneProps) {
    const { t } = useTranslation();

    return (
        <section className="mt-8 glass-card rounded-3xl border border-rose-500/30 bg-rose-900/10 p-8 shadow-glass">
            <h2 className="font-display text-2xl text-rose-300">{t('profile.dangerZone')}</h2>
            <p className="mt-2 text-sm text-white/70">
                {t('profile.dangerZoneDesc')}
            </p>
            <div className="mt-6">
                <button
                    type="button"
                    onClick={onOpenConfirm}
                    className="rounded-full border border-rose-400/40 bg-rose-500/10 px-6 py-2 text-sm font-semibold text-rose-100 transition hover:border-rose-300 hover:text-rose-50"
                >
                    {t('profile.deleteAccount')}
                </button>
            </div>
        </section>
    );
}
