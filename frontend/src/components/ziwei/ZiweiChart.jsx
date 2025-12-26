import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import ZiweiPalaceCard from './ZiweiPalaceCard';

const formatTransformations = (items = []) =>
    items.map((item) => ({
        ...item,
        label: `${item.type?.toUpperCase?.() || item.type} · ${item.starCn || item.starName || item.starKey}`
    }));

export default function ZiweiChart({ result }) {
    const { t } = useTranslation();

    const transformationTags = useMemo(
        () => formatTransformations(result?.fourTransformations || []),
        [result]
    );

    const mingIndex = result?.mingPalace?.index;
    const shenIndex = result?.shenPalace?.index;

    if (!result) return null;

    return (
        <div className="mt-8 space-y-6" data-testid="ziwei-result">
            <section className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <h2 className="text-sm uppercase text-gold-400/80">{t('ziwei.lunarDate')}</h2>
                    <p className="mt-2 text-white">
                        {result?.lunar
                            ? `${result.lunar.year}年 ${result.lunar.month}月 ${result.lunar.day}日${result.lunar.isLeap ? ' (Leap)' : ''}`
                            : '—'}
                    </p>
                    <p className="mt-1 text-xs text-white/60">
                        {result?.lunar
                            ? `${result.lunar.yearStem}${result.lunar.yearBranch}年 · ${result.lunar.monthStem}${result.lunar.monthBranch}月`
                            : '—'}
                    </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <h2 className="text-sm uppercase text-gold-400/80">{t('ziwei.keyPalaces')}</h2>
                    <p className="mt-2 text-white">
                        命宫: {result?.mingPalace?.palace?.cn} · {result?.mingPalace?.branch?.name}
                    </p>
                    <p className="mt-1 text-white">
                        身宫: {result?.shenPalace?.palace?.cn} · {result?.shenPalace?.branch?.name}
                    </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <h2 className="text-sm uppercase text-gold-400/80">{t('ziwei.birthTime')}</h2>
                    <p className="mt-2 text-white">{result?.birthIso || '—'}</p>
                    <p className="mt-1 text-xs text-white/60">
                        {t('ziwei.utcOffset')}: {Number.isFinite(result?.timezoneOffsetMinutes)
                            ? `${result.timezoneOffsetMinutes} ${t('profile.mins')}`
                            : '—'}
                    </p>
                </div>
            </section>

            <section>
                <h2 className="text-xl font-display text-gold-300">{t('ziwei.transformations')}</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                    {transformationTags.length ? (
                        transformationTags.map((item) => (
                            <span
                                key={`${item.type}-${item.starKey}`}
                                className="rounded-full border border-gold-400/40 bg-gold-400/10 px-3 py-1 text-xs text-gold-200"
                            >
                                {item.label}
                            </span>
                        ))
                    ) : (
                        <span className="text-sm text-white/60">{t('ziwei.noTransformations')}</span>
                    )}
                </div>
            </section>

            <section>
                <h2 className="text-xl font-display text-gold-300">{t('ziwei.palaceGrid')}</h2>
                <div className="mt-4 grid gap-4 md:grid-cols-3 xl:grid-cols-4">
                    {(result?.palaces || []).map((palace) => {
                        const isMing = palace.index === mingIndex;
                        const isShen = palace.index === shenIndex;
                        return (
                            <ZiweiPalaceCard
                                key={palace.index}
                                palace={palace}
                                isMing={isMing}
                                isShen={isShen}
                            />
                        );
                    })}
                </div>
            </section>
        </div>
    );
}
