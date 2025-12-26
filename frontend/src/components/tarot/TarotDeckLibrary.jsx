import React from 'react';
import { useTranslation } from 'react-i18next';

export default function TarotDeckLibrary({
    deck,
    loading,
    error,
    show,
    onLoad,
    isZh
}) {
    const { t } = useTranslation();

    return (
        <div className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h2 className="font-display text-2xl text-gold-300">{t('tarot.libraryTitle')}</h2>
                    <p className="mt-1 text-sm text-white/60">{t('tarot.librarySubtitle')}</p>
                </div>
                <button
                    type="button"
                    onClick={onLoad}
                    disabled={loading}
                    className="rounded-full border border-gold-400/60 px-4 py-2 text-sm text-gold-200 transition hover:bg-gold-400/10 disabled:opacity-60"
                >
                    {loading ? t('tarot.loading') : deck.length ? t('tarot.reloadDeck') : t('tarot.loadDeck')}
                </button>
            </div>
            {error && (
                <p className="mt-3 text-sm text-rose-200" role="alert">
                    {error}
                </p>
            )}
            {show && (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {deck.map((card) => (
                        <div key={card.id} className="rounded-xl border border-white/10 bg-black/40 p-3">
                            <div className="flex items-center justify-between">
                                <p className="text-sm text-gold-200">{isZh && card.nameCN ? card.nameCN : card.name}</p>
                                <span className="text-xs text-white/40">#{card.id}</span>
                            </div>
                            <p className="mt-2 text-xs text-white/70">{card.meaningUp}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
