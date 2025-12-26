import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/AuthContext';
import Button from '../ui/Button';
import Card from '../ui/Card';
import Spinner from '../ui/Spinner';
import SEO from '../SEO';
import ShareCard from '../social/ShareCard';

export default function SoulPortrait() {
    const { t } = useTranslation();
    const { token, user } = useAuth(); // We might need user bazi data here or pass it
    const [loading, setLoading] = useState(false);
    const [imageUrl, setImageUrl] = useState(null);
    const [error, setError] = useState(null);

    // Mock data for Bazi if not available in user object
    // Ideally, this should come from a context or props after calculation.
    // For this standalone demo, we simulate it or fetch it.
    // Let's assume we can pass some default simulated data if a real chart isn't loaded.
    const baziMock = {
        dayMasterElement: 'Fire',
        strongestElement: 'Wood',
        dominantTenGod: 'Artist'
    };

    const generatePortrait = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch('/api/media/soul-portrait', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ baziData: baziMock })
            });

            if (!response.ok) {
                throw new Error('Failed to generate image');
            }

            const data = await response.json();
            setImageUrl(data.imageUrl);
        } catch (err) {
            console.error(err);
            setError('Could not generate portrait. Please try again later.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="container mx-auto max-w-4xl p-6">
            <SEO
                title={t('soul.title', 'Soul Portrait')}
                description="View my AI-generated Bazi Soul Portrait."
                image={imageUrl}
            />

            <Card className="text-center p-8 bg-black/40 backdrop-blur-xl border-white/10">
                <h1 className="text-3xl font-display text-gold-400 mb-4">{t('soul.title', 'Soul Portrait')}</h1>
                <p className="text-white/70 mb-8 max-w-lg mx-auto">
                    {t('soul.description', 'Visualize the essence of your BaZi chart through AI-generated art. Each portrait is unique to your energy signature.')}
                </p>

                <div className="flex justify-center mb-8">
                    {imageUrl ? (
                        <ShareCard fileName="my-soul-portrait.png">
                            <div className="relative w-full max-w-md aspect-square bg-black">
                                {/* Enable CORS for html2canvas if cross-origin */}
                                <img src={imageUrl} alt="Soul Portrait" className="w-full h-full object-cover" crossOrigin="anonymous" />
                                <div className="absolute bottom-4 left-0 w-full text-center">
                                    <span className="bg-black/50 text-gold-200 px-3 py-1 rounded-full text-xs backdrop-blur-sm border border-gold-500/20">
                                        Bazi Master AI Art
                                    </span>
                                </div>
                            </div>
                        </ShareCard>
                    ) : (
                        <div className="relative w-full max-w-md aspect-square rounded-lg overflow-hidden border-2 border-white/10 bg-black/20 flex items-center justify-center shadow-2xl">
                            {loading ? (
                                <div className="flex flex-col items-center gap-4">
                                    <Spinner size="lg" className="text-gold-400" />
                                    <span className="text-gold-200/80 animate-pulse">{t('soul.generating', 'Summoning Ethereal Art...')}</span>
                                </div>
                            ) : (
                                <div className="text-white/20 text-6xl">🎨</div>
                            )}
                        </div>
                    )}
                </div>

                {error && <p className="text-rose-400 mb-4">{error}</p>}

                <Button
                    onClick={generatePortrait}
                    disabled={loading}
                    variant="primary"
                    className="px-8 py-3 text-lg"
                >
                    {loading ? t('common.processing', 'Processing...') : imageUrl ? t('soul.regenerate', 'Regenerate Portrait') : t('soul.generate', 'Reveal My Soul Portrait')}
                </Button>
            </Card>
        </div>
    );
}
