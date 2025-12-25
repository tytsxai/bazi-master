import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext.jsx';

export default function Bazi() {
  const { t } = useTranslation();
  const { token, isAuthenticated } = useAuth();
  const [formData, setFormData] = useState({
    birthYear: '',
    birthMonth: '',
    birthDay: '',
    birthHour: '',
    gender: 'female',
    birthLocation: '',
    timezone: 'UTC+8',
  });
  const [baseResult, setBaseResult] = useState(null);
  const [fullResult, setFullResult] = useState(null);
  const [savedRecord, setSavedRecord] = useState(null);
  const [favoriteStatus, setFavoriteStatus] = useState(null);
  const [status, setStatus] = useState(null);

  const elements = useMemo(() => {
    if (!baseResult?.fiveElements) return [];
    return Object.entries(baseResult.fiveElements);
  }, [baseResult]);

  const updateField = (field) => (event) => {
    setFormData((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleCalculate = async (event) => {
    event.preventDefault();
    setStatus(null);
    setFullResult(null);
    setSavedRecord(null);
    setFavoriteStatus(null);
    const payload = {
      ...formData,
      birthYear: Number(formData.birthYear),
      birthMonth: Number(formData.birthMonth),
      birthDay: Number(formData.birthDay),
      birthHour: Number(formData.birthHour),
    };

    const res = await fetch('/api/bazi/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json();
      setStatus({ type: 'error', message: err.error || 'Calculation failed.' });
      return;
    }

    const data = await res.json();
    setBaseResult(data);
    setStatus({ type: 'success', message: t('bazi.calculated') });
  };

  const handleFullAnalysis = async () => {
    if (!isAuthenticated) {
      setStatus({ type: 'error', message: t('bazi.loginRequired') });
      return;
    }

    setStatus(null);
    const payload = {
      ...formData,
      birthYear: Number(formData.birthYear),
      birthMonth: Number(formData.birthMonth),
      birthDay: Number(formData.birthDay),
      birthHour: Number(formData.birthHour),
    };

    const res = await fetch('/api/bazi/full-analysis', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json();
      setStatus({ type: 'error', message: err.error || 'Full analysis failed.' });
      return;
    }

    const data = await res.json();
    setFullResult(data);
    setStatus({ type: 'success', message: t('bazi.fullReady') });
  };

  const handleSaveRecord = async () => {
    if (!isAuthenticated) {
      setStatus({ type: 'error', message: t('bazi.loginRequired') });
      return;
    }
    setStatus(null);

    const payload = {
      ...formData,
      birthYear: Number(formData.birthYear),
      birthMonth: Number(formData.birthMonth),
      birthDay: Number(formData.birthDay),
      birthHour: Number(formData.birthHour),
    };

    const res = await fetch('/api/bazi/records', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json();
      setStatus({ type: 'error', message: err.error || 'Save failed.' });
      return;
    }

    const data = await res.json();
    setSavedRecord(data.record);
    setStatus({ type: 'success', message: t('bazi.saved') });
  };

  const handleAddFavorite = async () => {
    if (!savedRecord) {
      setStatus({ type: 'error', message: t('bazi.saveFirst') });
      return;
    }
    setStatus(null);

    const res = await fetch('/api/favorites', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ recordId: savedRecord.id }),
    });

    if (!res.ok) {
      const err = await res.json();
      setStatus({ type: 'error', message: err.error || 'Favorite failed.' });
      return;
    }

    const data = await res.json();
    setFavoriteStatus(data.favorite);
    setStatus({ type: 'success', message: t('bazi.favorited') });
  };

  const statusStyle =
    status?.type === 'error'
      ? 'border-rose-400/40 bg-rose-500/10 text-rose-100'
      : 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100';

  const [aiResult, setAiResult] = useState(null);

  const handleAIInterpret = async () => {
    if (!isAuthenticated) {
      setStatus({ type: 'error', message: t('bazi.loginRequired') });
      return;
    }
    if (!fullResult) {
      setStatus({ type: 'error', message: t('bazi.fullRequired') });
      return;
    }
    setStatus({ type: 'success', message: t('bazi.aiThinking') }); // Reuse success type for info

    // Construct payload from fullResult
    const payload = {
      pillars: fullResult.pillars,
      fiveElements: fullResult.fiveElements,
      tenGods: fullResult.tenGods,
      luckCycles: fullResult.luckCycles
    };

    const res = await fetch('/api/bazi/ai-interpret', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json();
      setStatus({ type: 'error', message: err.error || 'AI Interpretation failed.' });
      return;
    }

    const data = await res.json();
    setAiResult(data.content);
    setStatus({ type: 'success', message: t('bazi.aiReady') });
  };

  return (
    <main id="main-content" tabIndex={-1} className="px-6 pb-16">
      <section className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
        <div className="glass-card rounded-3xl border border-white/10 p-8 shadow-glass">
          <h1 className="font-display text-3xl text-gold-400">{t('bazi.title')}</h1>
          <p className="mt-2 text-sm text-white/70">{t('bazi.subtitle')}</p>
          <form onSubmit={handleCalculate} className="mt-6 grid gap-4 md:grid-cols-2">
            <label className="text-sm text-white/80">
              {t('bazi.birthYear')}
              <input
                type="number"
                value={formData.birthYear}
                onChange={updateField('birthYear')}
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-white"
                placeholder="1993"
                required
              />
            </label>
            <label className="text-sm text-white/80">
              {t('bazi.birthMonth')}
              <input
                type="number"
                value={formData.birthMonth}
                onChange={updateField('birthMonth')}
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-white"
                placeholder="6"
                min="1"
                max="12"
                required
              />
            </label>
            <label className="text-sm text-white/80">
              {t('bazi.birthDay')}
              <input
                type="number"
                value={formData.birthDay}
                onChange={updateField('birthDay')}
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-white"
                placeholder="18"
                min="1"
                max="31"
                required
              />
            </label>
            <label className="text-sm text-white/80">
              {t('bazi.birthHour')}
              <input
                type="number"
                value={formData.birthHour}
                onChange={updateField('birthHour')}
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-white"
                placeholder="14"
                min="0"
                max="23"
                required
              />
            </label>
            <label className="text-sm text-white/80">
              {t('bazi.gender')}
              <select
                value={formData.gender}
                onChange={updateField('gender')}
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-white"
              >
                <option value="female">{t('bazi.genderFemale')}</option>
                <option value="male">{t('bazi.genderMale')}</option>
              </select>
            </label>
            <label className="text-sm text-white/80">
              {t('bazi.birthLocation')}
              <input
                type="text"
                value={formData.birthLocation}
                onChange={updateField('birthLocation')}
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-white"
                placeholder={t('bazi.locationPlaceholder')}
              />
            </label>
            <label className="text-sm text-white/80 md:col-span-2">
              {t('bazi.timezone')}
              <input
                type="text"
                value={formData.timezone}
                onChange={updateField('timezone')}
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-white"
                placeholder="UTC+8"
              />
            </label>
            <button
              type="submit"
              className="mt-2 rounded-full bg-gold-400 px-4 py-2 text-sm font-semibold text-mystic-900 shadow-lg shadow-gold-400/30 md:col-span-2"
            >
              {t('bazi.calculate')}
            </button>
          </form>

          {status && (
            <div className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${statusStyle}`}>
              {status.message}
            </div>
          )}

          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <button
              type="button"
              onClick={handleFullAnalysis}
              className="rounded-full border border-gold-400/60 px-4 py-2 text-sm text-gold-400 transition hover:bg-gold-400/10"
              disabled={!baseResult}
            >
              {t('bazi.fullAnalysis')}
            </button>
            <button
              type="button"
              onClick={handleAIInterpret}
              className="rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 px-4 py-2 text-sm font-bold text-white shadow-lg transition hover:scale-105"
              disabled={!fullResult}
            >
              ✨ {t('bazi.aiInterpret')}
            </button>
            <button
              type="button"
              onClick={handleSaveRecord}
              className="rounded-full border border-white/20 px-4 py-2 text-sm text-white/80 transition hover:border-gold-400/60 hover:text-white"
              disabled={!fullResult}
            >
              {t('bazi.saveRecord')}
            </button>
            <button
              type="button"
              onClick={handleAddFavorite}
              className="rounded-full border border-white/20 px-4 py-2 text-sm text-white/80 transition hover:border-gold-400/60 hover:text-white"
              disabled={!savedRecord}
            >
              {t('bazi.addFavorite')}
            </button>
          </div>
          {favoriteStatus && (
            <p className="mt-3 text-xs text-white/60">
              {t('bazi.favoriteReady')}
            </p>
          )}
        </div>

        <div className="space-y-6">
          <section className="glass-card rounded-3xl border border-white/10 p-6 shadow-glass">
            <h2 className="font-display text-2xl text-gold-400">{t('bazi.fourPillars')}</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2" data-testid="pillars-grid">
              {baseResult ? (
                Object.entries(baseResult.pillars).map(([key, pillar]) => (
                  <div key={key} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-white/50">{t(`bazi.${key}`)}</p>
                    <p className="mt-2 text-lg text-white">
                      {pillar.stem} · {pillar.branch}
                    </p>
                    <p className="text-xs text-white/60">
                      {pillar.elementStem} / {pillar.elementBranch}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-white/60" data-testid="pillars-empty">
                  {t('bazi.waiting')}
                </p>
              )}
            </div>
          </section>

          <section className="glass-card rounded-3xl border border-white/10 p-6 shadow-glass">
            <h2 className="font-display text-2xl text-gold-400">{t('bazi.fiveElements')}</h2>
            <div className="mt-4 space-y-3" data-testid="elements-chart">
              {elements.length ? (
                elements.map(([element, value]) => (
                  <div key={element} className="flex items-center gap-3">
                    <span className="w-20 text-xs uppercase tracking-[0.2em] text-white/70">{element}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-gold-400" style={{ width: `${value * 10}%` }} />
                    </div>
                    <span className="text-xs text-white/60">{value}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-white/60" data-testid="elements-empty">
                  {t('bazi.waiting')}
                </p>
              )}
            </div>
          </section>
        </div>
      </section>

      {aiResult && (
        <section className="mt-10 glass-card rounded-3xl border border-purple-500/30 bg-purple-900/10 p-8 shadow-glass">
          <h2 className="font-display text-2xl text-purple-300">✨ {t('bazi.aiAnalysis')}</h2>
          <div className="mt-4 prose prose-invert max-w-none whitespace-pre-wrap text-white/90">
            {aiResult}
          </div>
        </section>
      )}

      <section className="mt-10 grid gap-6 lg:grid-cols-2">
        <div className="glass-card rounded-3xl border border-white/10 p-6 shadow-glass">
          <h2 className="font-display text-2xl text-gold-400">{t('bazi.tenGods')}</h2>
          <div className="mt-4 space-y-3">
            {fullResult?.tenGods ? (
              fullResult.tenGods.map((item) => (
                <div key={item.name} className="flex items-center gap-4">
                  <span className="w-32 text-sm text-white/80">{item.name}</span>
                  <div className="h-2 flex-1 rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-purple-300" style={{ width: `${item.strength * 8}%` }} />
                  </div>
                  <span className="text-xs text-white/60">{item.strength}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-white/60">{t('bazi.fullWaiting')}</p>
            )}
          </div>
        </div>

        <div className="glass-card rounded-3xl border border-white/10 p-6 shadow-glass">
          <h2 className="font-display text-2xl text-gold-400">{t('bazi.luckCycles')}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {fullResult?.luckCycles ? (
              fullResult.luckCycles.map((cycle) => (
                <div key={cycle.range} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-white/60">{cycle.range}</p>
                  <p className="mt-2 text-lg text-white">
                    {cycle.stem} · {cycle.branch}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-white/60">{t('bazi.fullWaiting')}</p>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
