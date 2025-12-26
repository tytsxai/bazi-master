import React from 'react';
import { useTranslation } from 'react-i18next';
import Button from '../ui/Button';

export default function ZiweiAiSection({
    onInterpret,
    onSave,
    aiLoading,
    saveLoading,
    aiResult,
}) {
    const { t } = useTranslation();

    return (
        <div className="mt-6">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div>
                    <p className="text-sm font-semibold text-white">{t('ziwei.chartReady')}</p>
                    <p className="text-xs text-white/60">{t('ziwei.chartReadyDesc')}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button
                        variant="ghost"
                        onClick={onInterpret}
                        isLoading={aiLoading}
                        disabled={aiLoading}
                    >
                        {aiLoading ? t('ziwei.interpreting') : t('ziwei.aiInterpret')}
                    </Button>
                    <Button
                        onClick={onSave}
                        isLoading={saveLoading}
                        disabled={saveLoading}
                    >
                        {saveLoading ? t('profile.saving') : t('bazi.saveRecord')}
                    </Button>
                </div>
            </div>

            {aiResult && (
                <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6">
                    <div className="prose prose-invert max-w-none whitespace-pre-wrap text-sm leading-relaxed text-white/80">
                        {aiResult}
                    </div>
                </div>
            )}
        </div>
    );
}
