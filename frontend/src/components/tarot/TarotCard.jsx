import React from 'react';
import { useTranslation } from 'react-i18next';

export default function TarotCard({ card, slotClass, isZh }) {
    const { t } = useTranslation();

    const getCardImage = (c) =>
        c?.imageUrl || c?.image || c?.image_url || c?.imagePath || c?.image_path;

    const cardImage = getCardImage(card);

    return (
        <div
            data-testid="tarot-card"
            className={`group relative aspect-[2/3] w-28 sm:w-32 md:w-36 perspective-1000 ${slotClass}`}
        >
            <div className="relative h-full w-full transform-style-3d transition-transform duration-700 hover:rotate-y-180">
                <div className="absolute h-full w-full rounded-xl border border-white/10 bg-indigo-900 shadow-xl backface-hidden flex items-center justify-center">
                    <span className="text-2xl text-white/20">🔮</span>
                </div>

                <div className="absolute h-full w-full rotate-y-180 rounded-xl border border-gold-400/50 bg-black/80 p-2 shadow-xl backface-hidden">
                    <div className="flex h-full flex-col items-center justify-between text-center">
                        <span className="text-[10px] text-gold-400">
                            {card.positionLabel || `${t('tarot.position')} ${card.position}`}
                        </span>
                        {card.positionMeaning && (
                            <span className="text-[9px] text-white/60">{card.positionMeaning}</span>
                        )}
                        {cardImage && (
                            <img
                                src={cardImage}
                                alt={card.name}
                                loading="lazy"
                                decoding="async"
                                className="h-20 w-full rounded-lg border border-white/10 object-cover"
                            />
                        )}
                        <div>
                            <div className="text-lg font-bold text-white">
                                {isZh && card.nameCN ? card.nameCN : card.name}
                            </div>
                            {card.isReversed && (
                                <div className="text-xs text-rose-400 uppercase tracking-wider">
                                    {t('tarot.reversed')}
                                </div>
                            )}
                        </div>
                        <p className="text-[10px] text-white/70 line-clamp-4">
                            {card.isReversed ? card.meaningRev : card.meaningUp}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
