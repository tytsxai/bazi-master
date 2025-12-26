import React from 'react';
import { useTranslation } from 'react-i18next';

export default function TarotAiSection({ result }) {
    const { t } = useTranslation();

    if (!result) return null;

    return (
        <section className="mt-10 rounded-3xl border border-purple-500/30 bg-purple-900/20 p-8">
            <h3 className="font-display text-2xl text-purple-300">{t('tarot.whisper')}</h3>
            <div className="mt-4 prose prose-invert max-w-none whitespace-pre-wrap text-white/90">
                {result}
            </div>
        </section>
    );
}
