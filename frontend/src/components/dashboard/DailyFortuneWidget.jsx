import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/AuthContext';
import Card from '../ui/Card';
import Spinner from '../ui/Spinner';

export default function DailyFortuneWidget() {
    const { t } = useTranslation();
    const { token, user } = useAuth();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchDaily = async () => {
            try {
                const query = user?.birthYear
                    ? `?birthYear=${user.birthYear}&birthMonth=${user.birthMonth}&birthDay=${user.birthDay}&birthHour=${user.birthHour}&gender=${user.gender}`
                    : '';

                const response = await fetch(`/api/calendar/daily${query}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.ok) {
                    const result = await response.json();
                    setData(result);
                }
            } catch (e) {
                console.error('Failed to load daily fortune', e);
            } finally {
                setLoading(false);
            }
        };

        if (token) fetchDaily();
        else setLoading(false);
    }, [token, user]);

    if (loading) return <Card className="p-4 flex justify-center"><Spinner /></Card>;
    if (!data) return null;

    const { dailyPillar, fortune } = data;

    return (
        <Card className="p-6 bg-gradient-to-br from-indigo-900/40 to-purple-900/40 border-gold-500/20">
            <div className="flex justify-between items-start mb-4">
                <div>
                    <h3 className="text-gold-400 font-display text-lg">{t('calendar.today', "Today's Energy")}</h3>
                    <div className="text-white/60 text-sm">{dailyPillar.date}</div>
                </div>
                <div className="text-right">
                    <div className="text-2xl font-bold text-white">
                        {dailyPillar.charStem}{dailyPillar.charBranch}
                    </div>
                    <div className="text-xs text-white/40 uppercase tracking-widest">
                        {dailyPillar.elementStem} {dailyPillar.branch}
                    </div>
                </div>
            </div>

            <div className="border-t border-white/10 pt-4 mt-2">
                {fortune.score ? (
                    <div className="flex items-center gap-4">
                        <div className="relative w-12 h-12 flex items-center justify-center rounded-full border-2 border-gold-500/30 text-gold-300 font-bold bg-black/20">
                            {fortune.score}
                        </div>
                        <div>
                            <div className="text-white font-medium mb-1">luck Score</div>
                            <p className="text-sm text-white/70 leading-relaxed">{fortune.advice}</p>
                        </div>
                    </div>
                ) : (
                    <p className="text-sm text-white/50">{t('calendar.noData', 'Update profile for personalized insights.')}</p>
                )}
            </div>
        </Card>
    );
}
