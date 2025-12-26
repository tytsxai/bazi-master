import React, { useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { useTranslation } from 'react-i18next';
import Button from '../ui/Button';
import Spinner from '../ui/Spinner';

export default function ShareCard({ children, fileName = 'bazi-share.png', onShare }) {
    const { t } = useTranslation();
    const cardRef = useRef(null);
    const [capturing, setCapturing] = useState(false);

    const capture = async () => {
        if (!cardRef.current) return;
        setCapturing(true);

        try {
            // Small delay to ensure styles/fonts are ready if needed
            await new Promise(resolve => setTimeout(resolve, 100));

            const canvas = await html2canvas(cardRef.current, {
                useCORS: true, // Crucial for external images (like Soul Portrait from OpenAI/Placeholder)
                backgroundColor: '#0f172a', // Dark background for the card context
                scale: 2, // Retina quality
                logging: false,
            });

            const dataUrl = canvas.toDataURL('image/png');

            // Auto download
            const link = document.createElement('a');
            link.href = dataUrl;
            link.download = fileName;
            link.click();

            if (onShare) onShare(dataUrl);

        } catch (err) {
            console.error('Snapshot failed', err);
        } finally {
            setCapturing(false);
        }
    };

    return (
        <div className="flex flex-col items-center gap-4">
            <div
                ref={cardRef}
                className="relative overflow-hidden rounded-xl bg-slate-900 shadow-2xl"
            >
                {children}
                {/* Branding Overlay for Share */}
                <div className="absolute bottom-2 right-4 text-[10px] text-white/30 font-display pointer-events-none opacity-0 group-hover:opacity-100 print:opacity-100">
                    Generations Bazi
                </div>
            </div>

            <Button onClick={capture} disabled={capturing} variant="secondary" className="gap-2">
                {capturing ? <Spinner size="sm" /> : <span className="text-lg">📸</span>}
                {t('share.download', 'Save Image')}
            </Button>
        </div>
    );
}
