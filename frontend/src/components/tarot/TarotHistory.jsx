import React from 'react';
import { useTranslation } from 'react-i18next';

export default function TarotHistory({ history, loading, onDeleteRequest, isZh }) {
  const { t } = useTranslation();

  return (
    <section className="mt-12 rounded-3xl border border-white/10 bg-white/5 p-6">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-2xl text-white">{t('tarot.historyTitle')}</h3>
        <span className="text-xs text-white/60">
          {loading ? t('tarot.loading') : t('tarot.historyCount', { count: history.length })}
        </span>
      </div>
      <p className="mt-2 text-sm text-white/60">{t('tarot.historySubtitle')}</p>
      <div className="mt-6 space-y-4">
        {history.length === 0 && !loading && (
          <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-white/50">
            {t('tarot.noHistory')}
          </div>
        )}
        {history.map((record) => (
          <article
            key={record.id}
            data-testid="tarot-history-entry"
            className="rounded-2xl border border-white/10 bg-black/30 p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-white/40">
                  {t(`tarot.spreads.${record.spreadType}`)}
                </p>
                <h4 className="text-lg font-semibold text-white">
                  {record.userQuestion || t('tarot.generalReading')}
                </h4>
              </div>
              <button
                onClick={() => onDeleteRequest(record)}
                className="rounded-full border border-rose-400/40 px-3 py-1 text-xs text-rose-200 transition hover:bg-rose-500/20"
              >
                {t('favorites.remove')}
              </button>
            </div>
            <p className="mt-2 text-xs text-white/50">
              {new Date(record.createdAt).toLocaleString()}
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/70">
              {record.cards?.map((card) => (
                <span
                  key={`${record.id}-${card.position}`}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1"
                >
                  {card.positionLabel || `#${card.position}`} ·{' '}
                  {isZh && card.nameCN ? card.nameCN : card.name}
                </span>
              ))}
            </div>
            {record.aiInterpretation && (
              <div className="mt-4 rounded-xl border border-purple-500/20 bg-purple-900/20 p-3 text-xs text-white/80">
                {record.aiInterpretation}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
