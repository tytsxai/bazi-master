import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Spinner from '../ui/Spinner';

export default function Synastry() {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);

    const [personA, setPersonA] = useState({
        name: 'Person A', birthYear: 1990, birthMonth: 1, birthDay: 1, birthHour: 12, gender: 'male'
    });
    const [personB, setPersonB] = useState({
        name: 'Person B', birthYear: 1992, birthMonth: 1, birthDay: 1, birthHour: 12, gender: 'female'
    });

    const handleChange = (person, field, value) => {
        const setter = person === 'A' ? setPersonA : setPersonB;
        const currentState = person === 'A' ? personA : personB;
        setter({ ...currentState, [field]: value });
    };

    const analyze = async () => {
        setLoading(true);
        setError(null);
        setResult(null);
        try {
            const response = await fetch('/api/synastry/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ personA, personB })
            });

            if (!response.ok) throw new Error('Analysis failed');

            const data = await response.json();
            setResult(data);
        } catch (err) {
            setError('Could not complete analysis. Check inputs.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="container mx-auto p-6 max-w-4xl">
            <h1 className="text-3xl font-display text-gold-400 mb-8 text-center">{t('synastry.title', 'Relationship Compatibility')}</h1>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                {/* Person A Form */}
                <Card className="p-6 bg-white/5 border-white/10">
                    <h3 className="text-xl text-white mb-4">Person A</h3>
                    <div className="space-y-4">
                        <input className="w-full bg-white/10 p-2 rounded text-white" placeholder="Name" value={personA.name} onChange={e => handleChange('A', 'name', e.target.value)} />
                        <div className="grid grid-cols-3 gap-2">
                            <input type="number" className="bg-white/10 p-2 rounded text-white" placeholder="YYYY" value={personA.birthYear} onChange={e => handleChange('A', 'birthYear', e.target.value)} />
                            <input type="number" className="bg-white/10 p-2 rounded text-white" placeholder="MM" value={personA.birthMonth} onChange={e => handleChange('A', 'birthMonth', e.target.value)} />
                            <input type="number" className="bg-white/10 p-2 rounded text-white" placeholder="DD" value={personA.birthDay} onChange={e => handleChange('A', 'birthDay', e.target.value)} />
                        </div>
                        <select className="w-full bg-white/10 p-2 rounded text-white" value={personA.gender} onChange={e => handleChange('A', 'gender', e.target.value)}>
                            <option value="male">Male</option>
                            <option value="female">Female</option>
                        </select>
                    </div>
                </Card>

                {/* Person B Form */}
                <Card className="p-6 bg-white/5 border-white/10">
                    <h3 className="text-xl text-white mb-4">Person B</h3>
                    <div className="space-y-4">
                        <input className="w-full bg-white/10 p-2 rounded text-white" placeholder="Name" value={personB.name} onChange={e => handleChange('B', 'name', e.target.value)} />
                        <div className="grid grid-cols-3 gap-2">
                            <input type="number" className="bg-white/10 p-2 rounded text-white" placeholder="YYYY" value={personB.birthYear} onChange={e => handleChange('B', 'birthYear', e.target.value)} />
                            <input type="number" className="bg-white/10 p-2 rounded text-white" placeholder="MM" value={personB.birthMonth} onChange={e => handleChange('B', 'birthMonth', e.target.value)} />
                            <input type="number" className="bg-white/10 p-2 rounded text-white" placeholder="DD" value={personB.birthDay} onChange={e => handleChange('B', 'birthDay', e.target.value)} />
                        </div>
                        <select className="w-full bg-white/10 p-2 rounded text-white" value={personB.gender} onChange={e => handleChange('B', 'gender', e.target.value)}>
                            <option value="female">Female</option>
                            <option value="male">Male</option>
                        </select>
                    </div>
                </Card>
            </div>

            <div className="flex justify-center mb-8">
                <Button onClick={analyze} disabled={loading} className="px-8 py-3 text-lg" variant="primary">
                    {loading ? <Spinner /> : t('synastry.analyze', 'Analyze Compatibility')}
                </Button>
            </div>

            {error && <p className="text-center text-rose-400">{error}</p>}

            {result && (
                <Card className="p-8 bg-black/40 backdrop-blur-xl border-gold-500/30 animate-fade-in">
                    <div className="text-center mb-8">
                        <div className="text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-gold-400 mb-2">
                            {result.compatibility.score}%
                        </div>
                        <div className="text-white/60 uppercase tracking-widest text-sm">Compatibility Score</div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-8">
                        <div>
                            <h4 className="text-gold-400 border-b border-white/10 pb-2 mb-4">Profile Comparison</h4>
                            <p className="text-white mb-2"><span className="text-white/50">{result.personA.name}:</span> {result.personA.element} {result.personA.dayMaster}</p>
                            <p className="text-white mb-2"><span className="text-white/50">{result.personB.name}:</span> {result.personB.element} {result.personB.dayMaster}</p>
                        </div>
                        <div>
                            <h4 className="text-gold-400 border-b border-white/10 pb-2 mb-4">Key Insights</h4>
                            <ul className="space-y-2">
                                {result.compatibility.insights.map((insight, i) => (
                                    <li key={i} className="text-white/90 flex items-start gap-2">
                                        <span className="text-gold-500 mt-1">✦</span>
                                        {insight}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </Card>
            )}
        </div>
    );
}
