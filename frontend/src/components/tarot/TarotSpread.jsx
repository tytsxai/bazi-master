import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import TarotCard from './TarotCard';

export default function TarotSpread({ spread, isInterpreting, onInterpret, isZh }) {
  const { t } = useTranslation();

  const celticCrossPositions = useMemo(
    () => [
      {
        position: 1,
        label: t('tarot.celticPositions.p1.label'),
        meaning: t('tarot.celticPositions.p1.meaning'),
      },
      {
        position: 2,
        label: t('tarot.celticPositions.p2.label'),
        meaning: t('tarot.celticPositions.p2.meaning'),
      },
      {
        position: 3,
        label: t('tarot.celticPositions.p3.label'),
        meaning: t('tarot.celticPositions.p3.meaning'),
      },
      {
        position: 4,
        label: t('tarot.celticPositions.p4.label'),
        meaning: t('tarot.celticPositions.p4.meaning'),
      },
      {
        position: 5,
        label: t('tarot.celticPositions.p5.label'),
        meaning: t('tarot.celticPositions.p5.meaning'),
      },
      {
        position: 6,
        label: t('tarot.celticPositions.p6.label'),
        meaning: t('tarot.celticPositions.p6.meaning'),
      },
      {
        position: 7,
        label: t('tarot.celticPositions.p7.label'),
        meaning: t('tarot.celticPositions.p7.meaning'),
      },
      {
        position: 8,
        label: t('tarot.celticPositions.p8.label'),
        meaning: t('tarot.celticPositions.p8.meaning'),
      },
      {
        position: 9,
        label: t('tarot.celticPositions.p9.label'),
        meaning: t('tarot.celticPositions.p9.meaning'),
      },
      {
        position: 10,
        label: t('tarot.celticPositions.p10.label'),
        meaning: t('tarot.celticPositions.p10.meaning'),
      },
    ],
    [t]
  );

  const getCardSlotClass = (position) => {
    if (spread?.spreadType !== 'CelticCross') return '';
    switch (position) {
      case 1:
        return 'col-start-3 row-start-2';
      case 2:
        return 'col-start-4 row-start-2';
      case 3:
        return 'col-start-2 row-start-2';
      case 4:
        return 'col-start-3 row-start-3';
      case 5:
        return 'col-start-3 row-start-1';
      case 6:
        return 'col-start-3 row-start-4';
      case 7:
        return 'col-start-5 row-start-1';
      case 8:
        return 'col-start-5 row-start-2';
      case 9:
        return 'col-start-5 row-start-3';
      case 10:
        return 'col-start-5 row-start-4';
      default:
        return '';
    }
  };

  const spreadGridClass =
    spread?.spreadType === 'CelticCross'
      ? 'grid-cols-5 grid-rows-4 gap-4'
      : spread?.spreadType === 'ThreeCard'
        ? 'grid-cols-3 gap-6'
        : 'grid-cols-1 gap-6';

  if (!spread) return null;

  return (
    <div className="mt-8">
      <h2 className="mb-4 font-display text-2xl text-white">{t('tarot.yourSpread')}</h2>
      <div className={`grid place-items-center ${spreadGridClass}`}>
        {spread.cards.map((card) => (
          <TarotCard
            key={card.position}
            card={card}
            isZh={isZh}
            slotClass={getCardSlotClass(card.position)}
          />
        ))}
      </div>

      <div className="mt-8 flex justify-center">
        <button
          onClick={onInterpret}
          disabled={isInterpreting}
          className="rounded-full bg-indigo-600 px-8 py-3 font-bold text-white shadow-lg transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          ✨ {isInterpreting ? t('tarot.revealing') : t('tarot.revealAi')}
        </button>
      </div>

      {spread.spreadType === 'CelticCross' && (
        <section className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-6">
          <h3 className="font-display text-2xl text-white">{t('tarot.celticCrossPositions')}</h3>
          <p className="mt-2 text-sm text-white/60">{t('tarot.celticCrossDesc')}</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {(spread.spreadMeta?.positions || celticCrossPositions).map((position) => (
              <div
                key={position.position}
                className="rounded-2xl border border-white/10 bg-black/30 p-3"
              >
                <div className="text-xs uppercase tracking-[0.2em] text-gold-400">
                  {t('tarot.position')} {position.position}
                </div>
                <div className="text-sm font-semibold text-white">{position.label}</div>
                <p className="mt-1 text-xs text-white/70">{position.meaning}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
