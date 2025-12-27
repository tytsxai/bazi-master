import React from 'react';
import { useTranslation } from 'react-i18next';
import Button from '../ui/Button';
import { ZODIAC_PERIODS, ZODIAC_SIGNS } from '../../data/zodiac';

export default function TarotZodiac({
    sign,
    period,
    onSignChange,
    onPeriodChange,
    horoscope,
    status,
    loading,
    onFetch
}) {
    const { t } = useTranslation();

    return (
        <section className="mt-8 rounded-3xl border border-indigo-500/30 bg-indigo-900/20 p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h2 className="font-display text-2xl text-indigo-200">{t('tarot.weeklySnapshot')}</h2>
                    <p className="text-sm text-white/60">
                        {t('tarot.weeklySnapshotSubtitle')}
                    </p>
                </div>
                <Button
                    onClick={onFetch}
                    disabled={loading}
                    isLoading={loading}
                    variant="secondary"
                >
                    {loading ? t('tarot.loading') : t('tarot.getPeriodHoroscope', { period })}
                </Button>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm text-white/70">
                    {t('tarot.sign')}
                    <select
                        value={sign}
                        onChange={(e) => onSignChange(e.target.value)}
                        className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-white"
                    >
                        {ZODIAC_SIGNS.map((s) => (
                            <option key={s.value} value={s.value} className="bg-slate-900 text-white">
                                {t(`zodiac.signs.${s.value}`)} • {t(`zodiac.ranges.${s.value}`)}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="flex flex-col gap-2 text-sm text-white/70">
                    {t('tarot.period')}
                    <select
                        value={period}
                        onChange={(e) => onPeriodChange(e.target.value)}
                        className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-white"
                    >
                        {ZODIAC_PERIODS.map((p) => (
                            <option key={p.value} value={p.value} className="bg-slate-900 text-white">
                                {t(`zodiac.periods.${p.value}`)}
                            </option>
                        ))}
                    </select>
                </label>
            </div>

            {status && (
                <div
                    role={status.type === 'error' ? 'alert' : 'status'}
                    aria-live={status.type === 'error' ? 'assertive' : 'polite'}
                    className={`mt-4 rounded-2xl border px-4 py-2 text-sm ${status.type === 'error'
                        ? 'border-rose-400/40 bg-rose-500/10 text-rose-100'
                        : 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100'
                        }`}
                >
                    {status.message}
                </div>
            )}

            {horoscope && (
                <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6 text-white/80">
                    <div className="flex flex-col gap-1">
                        <h3 className="font-display text-xl text-white">
                            {t(`zodiac.signs.${horoscope.sign.name.toLowerCase()}`)} {t(`zodiac.periods.${horoscope.period}`)} {t('tarot.horoscope')}
                        </h3>
                        <p className="text-xs text-white/60">
                            {horoscope.range} • {t(`zodiac.ranges.${horoscope.sign.name.toLowerCase()}`)} • {t('zodiac.generatedAt', { date: new Date(horoscope.generatedAt).toLocaleString() })}
                        </p>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                            <div className="text-xs uppercase text-white/40">{t('zodiac.overview')}</div>
                            <p className="mt-1 text-sm text-white/80">{horoscope.horoscope.overview}</p>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                            <div className="text-xs uppercase text-white/40">{t('zodiac.love')}</div>
                            <p className="mt-1 text-sm text-white/80">{horoscope.horoscope.love}</p>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                            <div className="text-xs uppercase text-white/40">{t('zodiac.career')}</div>
                            <p className="mt-1 text-sm text-white/80">{horoscope.horoscope.career}</p>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                            <div className="text-xs uppercase text-white/40">{t('zodiac.wellness')}</div>
                            <p className="mt-1 text-sm text-white/80">{horoscope.horoscope.wellness}</p>
                        </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/70">
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                            {t('zodiac.luckyColors')}: {horoscope.horoscope.lucky.colors.join(', ')}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                            {t('zodiac.luckyNumbers')}: {horoscope.horoscope.lucky.numbers.join(', ')}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                            {t('zodiac.mantra')}: {horoscope.horoscope.mantra}
                        </span>
                    </div>
                </div>
            )}
        </section>
    );
}
