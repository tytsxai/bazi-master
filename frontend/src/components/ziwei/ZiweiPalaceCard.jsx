import React from 'react';
import { useTranslation } from 'react-i18next';

export default function ZiweiPalaceCard({ palace, isMing, isShen }) {
  const { t } = useTranslation();
  const highlight = isMing
    ? 'border-gold-400/80'
    : isShen
      ? 'border-emerald-300/80'
      : 'border-white/10';

  return (
    <div
      data-testid="ziwei-palace-card"
      className={`rounded-2xl border ${highlight} bg-white/5 p-4`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gold-400">
            {palace.palace?.cn || palace.palace?.name || t('ziwei.palace')}
          </p>
          <p className="text-xs text-white/60">
            {palace.branch?.name} · {palace.branch?.element}
          </p>
        </div>
        {isMing && <span className="text-xs text-gold-200">{t('ziwei.mingPalace')}</span>}
        {isShen && <span className="text-xs text-emerald-200">{t('ziwei.shenPalace')}</span>}
      </div>
      <div className="mt-3">
        <p className="text-xs uppercase text-white/50">{t('ziwei.majorStars')}</p>
        <div className="mt-1 flex flex-wrap gap-1 text-xs text-white">
          {(palace.stars?.major || []).length ? (
            palace.stars.major.map((star) => (
              <span key={star.key} className="rounded-full bg-white/10 px-2 py-0.5">
                {star.cn || star.name}
              </span>
            ))
          ) : (
            <span className="text-white/40">—</span>
          )}
        </div>
      </div>
      <div className="mt-3">
        <p className="text-xs uppercase text-white/50">{t('ziwei.minorStars')}</p>
        <div className="mt-1 flex flex-wrap gap-1 text-xs text-white">
          {(palace.stars?.minor || []).length ? (
            palace.stars.minor.map((star) => (
              <span key={star.key} className="rounded-full bg-white/10 px-2 py-0.5">
                {star.cn || star.name}
              </span>
            ))
          ) : (
            <span className="text-white/40">—</span>
          )}
        </div>
      </div>
    </div>
  );
}
