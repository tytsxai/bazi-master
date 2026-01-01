import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import Button from '../ui/Button';

export default function TarotControls({
  question,
  spreadType,
  onQuestionChange,
  onSpreadTypeChange,
  loading,
  interpreting,
  onDraw,
  isGuest,
}) {
  const { t } = useTranslation();

  const spreadLabel = useMemo(() => {
    if (spreadType === 'ThreeCard') return t('tarot.spreads.three');
    if (spreadType === 'CelticCross') return t('tarot.spreads.celtic');
    return t('tarot.spreads.single');
  }, [spreadType, t]);

  return (
    <div className="mt-6 flex flex-col gap-4 md:flex-row">
      <label htmlFor="tarot-question" className="sr-only">
        {t('iching.question')}
      </label>
      <input
        id="tarot-question"
        type="text"
        placeholder={t('tarot.questionPlaceholder')}
        className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-white"
        value={question}
        onChange={(e) => onQuestionChange(e.target.value)}
      />
      <label htmlFor="tarot-spread" className="sr-only">
        {t('tarot.spreadType')}
      </label>
      <select
        id="tarot-spread"
        value={spreadType}
        onChange={(e) => onSpreadTypeChange(e.target.value)}
        className="rounded-xl border border-white/10 bg-black/40 px-4 py-2 text-white"
      >
        <option value="SingleCard">{t('tarot.spreads.single')}</option>
        <option value="ThreeCard">{t('tarot.spreads.three')}</option>
        <option value="CelticCross">{t('tarot.spreads.celtic')}</option>
      </select>
      {isGuest && (
        <span className="flex items-center text-xs text-white/60">{t('tarot.guestMode')}</span>
      )}
      <Button onClick={onDraw} disabled={loading || interpreting} isLoading={loading}>
        {loading ? t('tarot.shuffling') : t('tarot.drawCard', { label: spreadLabel })}
      </Button>
    </div>
  );
}
