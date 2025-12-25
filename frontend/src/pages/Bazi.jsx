import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext.jsx';

const GUEST_STORAGE_KEY = 'bazi_guest_calculation_v1';
const DEFAULT_FORM_DATA = {
  birthYear: '1993',
  birthMonth: '6',
  birthDay: '18',
  birthHour: '14',
  gender: 'female',
  birthLocation: '',
  timezone: 'UTC+8',
};

export default function Bazi() {
  const { t } = useTranslation();
  const { token, isAuthenticated } = useAuth();
  const [formData, setFormData] = useState(DEFAULT_FORM_DATA);
  const [baseResult, setBaseResult] = useState(null);
  const [fullResult, setFullResult] = useState(null);
  const [savedRecord, setSavedRecord] = useState(null);
  const [favoriteStatus, setFavoriteStatus] = useState(null);
  const [status, setStatus] = useState(null);
  const [errors, setErrors] = useState({});
  const [isCalculating, setIsCalculating] = useState(false);
  const [isFullLoading, setIsFullLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isFavoriting, setIsFavoriting] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const calculateInFlightRef = useRef(false);
  const saveInFlightRef = useRef(false);

  const readErrorMessage = async (response, fallback) => {
    const text = await response.text();
    if (!text) return fallback;
    try {
      const parsed = JSON.parse(text);
      return parsed?.error || parsed?.message || fallback;
    } catch {
      return text;
    }
  };

  const getNetworkErrorMessage = (error) => {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return 'Network error. Please check your connection and try again.';
  };

  useEffect(() => {
    if (isAuthenticated) {
      localStorage.removeItem(GUEST_STORAGE_KEY);
      return;
    }

    const raw = localStorage.getItem(GUEST_STORAGE_KEY);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw);
      if (parsed?.formData) {
        setFormData((prev) => ({ ...prev, ...parsed.formData }));
      }
      if (parsed?.baseResult) {
        setBaseResult(parsed.baseResult);
      }
      setStatus({ type: 'success', message: t('bazi.restored') });
    } catch (error) {
      localStorage.removeItem(GUEST_STORAGE_KEY);
    }
  }, [isAuthenticated, t]);

  useEffect(() => {
    if (isAuthenticated) return;
    if (!baseResult) return;

    const payload = {
      formData,
      baseResult,
      savedAt: new Date().toISOString()
    };
    localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(payload));
  }, [baseResult, formData, isAuthenticated]);

  useEffect(() => {
    if (!status) return;
    const timeoutMs = status.type === 'error' ? 6000 : 3500;
    const timer = setTimeout(() => setStatus(null), timeoutMs);
    return () => clearTimeout(timer);
  }, [status]);

  const elements = useMemo(() => {
    if (!baseResult?.fiveElements) return [];
    const order = ['Wood', 'Fire', 'Earth', 'Metal', 'Water'];
    const counts = baseResult.fiveElements;
    const total = order.reduce((sum, element) => sum + (counts[element] ?? 0), 0);
    const percents = baseResult.fiveElementsPercent;

    return order.map((element) => {
      const count = counts[element] ?? 0;
      const percent = percents
        ? (percents[element] ?? 0)
        : total
          ? Math.round((count / total) * 100)
          : 0;
      return { element, count, percent };
    });
  }, [baseResult]);

  const tenGodsList = useMemo(() => {
    if (!Array.isArray(fullResult?.tenGods)) return [];
    return fullResult.tenGods;
  }, [fullResult]);

  const luckCyclesList = useMemo(() => {
    if (!Array.isArray(fullResult?.luckCycles)) return [];
    return fullResult.luckCycles;
  }, [fullResult]);

  const maxTenGodStrength = useMemo(() => {
    if (!tenGodsList.length) return 0;
    return tenGodsList.reduce((max, item) => Math.max(max, item?.strength || 0), 0);
  }, [tenGodsList]);

  const updateField = (field) => (event) => {
    const value = event.target.value;
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const validate = () => {
    const nextErrors = {};
    const year = Number(formData.birthYear);
    const month = Number(formData.birthMonth);
    const day = Number(formData.birthDay);
    const hour = Number(formData.birthHour);

    if (!formData.birthYear) {
      nextErrors.birthYear = 'Birth year is required.';
    } else if (!Number.isInteger(year) || year < 1 || year > 9999) {
      nextErrors.birthYear = 'Enter a valid year.';
    }

    if (!formData.birthMonth) {
      nextErrors.birthMonth = 'Birth month is required.';
    } else if (!Number.isInteger(month) || month < 1 || month > 12) {
      nextErrors.birthMonth = 'Enter a valid month (1-12).';
    }

    if (!formData.birthDay) {
      nextErrors.birthDay = 'Birth day is required.';
    } else if (!Number.isInteger(day) || day < 1 || day > 31) {
      nextErrors.birthDay = 'Enter a valid day (1-31).';
    }

    if (formData.birthHour === '') {
      nextErrors.birthHour = 'Birth hour is required.';
    } else if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
      nextErrors.birthHour = 'Enter a valid hour (0-23).';
    }

    return nextErrors;
  };

  const handleCalculate = async (event) => {
    event.preventDefault();
    if (calculateInFlightRef.current || isCalculating) return;
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setStatus({ type: 'error', message: 'Please correct the highlighted fields.' });
      return;
    }
    setStatus(null);
    setFullResult(null);
    setSavedRecord(null);
    setFavoriteStatus(null);
    calculateInFlightRef.current = true;
    setIsCalculating(true);
    const payload = {
      ...formData,
      birthYear: Number(formData.birthYear),
      birthMonth: Number(formData.birthMonth),
      birthDay: Number(formData.birthDay),
      birthHour: Number(formData.birthHour),
    };

    try {
      const res = await fetch('/api/bazi/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const message = await readErrorMessage(res, 'Calculation failed.');
        setStatus({ type: 'error', message });
        return;
      }

      const data = await res.json();
      setBaseResult(data);
      setStatus({ type: 'success', message: t('bazi.calculated') });
    } catch (error) {
      setStatus({ type: 'error', message: getNetworkErrorMessage(error) });
    } finally {
      calculateInFlightRef.current = false;
      setIsCalculating(false);
    }
  };

  const handleFullAnalysis = async () => {
    if (!isAuthenticated) {
      setStatus({ type: 'error', message: t('bazi.loginRequired') });
      return;
    }
    if (isFullLoading) return;

    setStatus(null);
    setAiResult(null);
    setIsFullLoading(true);
    const payload = {
      ...formData,
      birthYear: Number(formData.birthYear),
      birthMonth: Number(formData.birthMonth),
      birthDay: Number(formData.birthDay),
      birthHour: Number(formData.birthHour),
    };

    try {
      const res = await fetch('/api/bazi/full-analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const message = await readErrorMessage(res, 'Full analysis failed.');
        setStatus({ type: 'error', message });
        return;
      }

      const data = await res.json();
      setFullResult(data);
      setStatus({ type: 'success', message: t('bazi.fullReady') });
    } catch (error) {
      setStatus({ type: 'error', message: getNetworkErrorMessage(error) });
    } finally {
      setIsFullLoading(false);
    }
  };

  const handleSaveRecord = async () => {
    if (!isAuthenticated) {
      setStatus({ type: 'error', message: t('bazi.loginRequired') });
      return;
    }
    if (!baseResult) {
      setStatus({ type: 'error', message: 'Run a calculation before saving to history.' });
      return;
    }
    if (saveInFlightRef.current || isSaving) return;
    setStatus(null);
    saveInFlightRef.current = true;
    setIsSaving(true);

    const payload = {
      ...formData,
      birthYear: Number(formData.birthYear),
      birthMonth: Number(formData.birthMonth),
      birthDay: Number(formData.birthDay),
      birthHour: Number(formData.birthHour),
      result: fullResult
        ? {
            pillars: fullResult.pillars,
            fiveElements: fullResult.fiveElements,
            tenGods: fullResult.tenGods,
            luckCycles: fullResult.luckCycles,
          }
        : baseResult
          ? {
              pillars: baseResult.pillars,
              fiveElements: baseResult.fiveElements,
            }
          : null,
    };

    try {
      const res = await fetch('/api/bazi/records', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const message = await readErrorMessage(res, 'Save failed.');
        setStatus({ type: 'error', message });
        return;
      }

      const data = await res.json();
      setSavedRecord(data.record);
      setStatus({ type: 'success', message: t('bazi.saved') });
    } catch (error) {
      setStatus({ type: 'error', message: getNetworkErrorMessage(error) });
    } finally {
      saveInFlightRef.current = false;
      setIsSaving(false);
    }
  };

  const handleAddFavorite = async () => {
    if (!savedRecord) {
      setStatus({ type: 'error', message: t('bazi.saveFirst') });
      return;
    }
    if (isFavoriting) return;
    setStatus(null);
    setIsFavoriting(true);

    try {
      const res = await fetch('/api/favorites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ recordId: savedRecord.id }),
      });

      if (!res.ok) {
        const message = await readErrorMessage(res, 'Favorite failed.');
        setStatus({ type: 'error', message });
        return;
      }

      const data = await res.json();
      setFavoriteStatus(data.favorite);
      setStatus({ type: 'success', message: t('bazi.favorited') });
    } catch (error) {
      setStatus({ type: 'error', message: getNetworkErrorMessage(error) });
    } finally {
      setIsFavoriting(false);
    }
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
    if (isAiLoading) return;
    setStatus({ type: 'success', message: t('bazi.aiThinking') }); // Reuse success type for info
    setIsAiLoading(true);

    // Construct payload from fullResult
    const payload = {
      pillars: fullResult.pillars,
      fiveElements: fullResult.fiveElements,
      tenGods: fullResult.tenGods,
      luckCycles: fullResult.luckCycles
    };

    try {
      const res = await fetch('/api/bazi/ai-interpret', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const message = await readErrorMessage(res, 'AI Interpretation failed.');
        setStatus({ type: 'error', message });
        return;
      }

      const data = await res.json();
      setAiResult(data.content);
      setStatus({ type: 'success', message: t('bazi.aiReady') });
    } catch (error) {
      setStatus({ type: 'error', message: getNetworkErrorMessage(error) });
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleResetForm = () => {
    setFormData(DEFAULT_FORM_DATA);
    setErrors({});
    setBaseResult(null);
    setFullResult(null);
    setSavedRecord(null);
    setFavoriteStatus(null);
    setAiResult(null);
    setStatus(null);
    localStorage.removeItem(GUEST_STORAGE_KEY);
  };

  return (
    <main id="main-content" tabIndex={-1} className="container mx-auto pb-16">
      {status && (
        <div className="pointer-events-none fixed right-6 top-6 z-50 flex w-[min(90vw,360px)] flex-col gap-2">
          <div
            role={status.type === 'error' ? 'alert' : 'status'}
            aria-live={status.type === 'error' ? 'assertive' : 'polite'}
            className={`pointer-events-auto rounded-2xl border px-4 py-3 text-sm shadow-lg backdrop-blur ${statusStyle}`}
          >
            {status.message}
          </div>
        </div>
      )}
      <section className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
        <div className="glass-card rounded-3xl border border-white/10 p-8 shadow-glass">
          <h1 className="font-display text-3xl text-gold-400">{t('bazi.title')}</h1>
          <p className="mt-2 text-sm text-white/70">{t('bazi.subtitle')}</p>
          <form onSubmit={handleCalculate} className="mt-6 grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="birthYear" className="block text-sm text-white/80">
                {t('bazi.birthYear')}
              </label>
              <input
                id="birthYear"
                type="number"
                value={formData.birthYear}
                onChange={updateField('birthYear')}
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-white"
                placeholder="1993"
                required
                aria-invalid={Boolean(errors.birthYear)}
                aria-describedby={errors.birthYear ? 'bazi-birthYear-error' : undefined}
              />
              {errors.birthYear && (
                <span id="bazi-birthYear-error" className="mt-2 block text-xs text-rose-200">
                  {errors.birthYear}
                </span>
              )}
            </div>
            <div>
              <label htmlFor="birthMonth" className="block text-sm text-white/80">
                {t('bazi.birthMonth')}
              </label>
              <input
                id="birthMonth"
                type="number"
                value={formData.birthMonth}
                onChange={updateField('birthMonth')}
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-white"
                placeholder="6"
                min="1"
                max="12"
                required
                aria-invalid={Boolean(errors.birthMonth)}
                aria-describedby={errors.birthMonth ? 'bazi-birthMonth-error' : undefined}
              />
              {errors.birthMonth && (
                <span id="bazi-birthMonth-error" className="mt-2 block text-xs text-rose-200">
                  {errors.birthMonth}
                </span>
              )}
            </div>
            <div>
              <label htmlFor="birthDay" className="block text-sm text-white/80">
                {t('bazi.birthDay')}
              </label>
              <input
                id="birthDay"
                type="number"
                value={formData.birthDay}
                onChange={updateField('birthDay')}
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-white"
                placeholder="18"
                min="1"
                max="31"
                required
                aria-invalid={Boolean(errors.birthDay)}
                aria-describedby={errors.birthDay ? 'bazi-birthDay-error' : undefined}
              />
              {errors.birthDay && (
                <span id="bazi-birthDay-error" className="mt-2 block text-xs text-rose-200">
                  {errors.birthDay}
                </span>
              )}
            </div>
            <div>
              <label htmlFor="birthHour" className="block text-sm text-white/80">
                {t('bazi.birthHour')}
              </label>
              <input
                id="birthHour"
                type="number"
                value={formData.birthHour}
                onChange={updateField('birthHour')}
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-white"
                placeholder="14"
                min="0"
                max="23"
                required
                aria-invalid={Boolean(errors.birthHour)}
                aria-describedby={errors.birthHour ? 'bazi-birthHour-error' : undefined}
              />
              {errors.birthHour && (
                <span id="bazi-birthHour-error" className="mt-2 block text-xs text-rose-200">
                  {errors.birthHour}
                </span>
              )}
            </div>
            <div>
              <label htmlFor="gender" className="block text-sm text-white/80">
                {t('bazi.gender')}
              </label>
              <select
                id="gender"
                value={formData.gender}
                onChange={updateField('gender')}
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-white"
              >
                <option value="female">{t('bazi.genderFemale')}</option>
                <option value="male">{t('bazi.genderMale')}</option>
              </select>
            </div>
            <div>
              <label htmlFor="birthLocation" className="block text-sm text-white/80">
                {t('bazi.birthLocation')}
              </label>
              <input
                id="birthLocation"
                type="text"
                value={formData.birthLocation}
                onChange={updateField('birthLocation')}
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-white"
                placeholder={t('bazi.locationPlaceholder')}
              />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="timezone" className="block text-sm text-white/80">
                {t('bazi.timezone')}
              </label>
              <input
                id="timezone"
                type="text"
                value={formData.timezone}
                onChange={updateField('timezone')}
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-white"
                placeholder="UTC+8"
              />
            </div>
            <div className="mt-2 grid gap-3 md:col-span-2 md:grid-cols-2">
              <button
                type="submit"
                className="rounded-full bg-gold-400 px-4 py-2 text-sm font-semibold text-mystic-900 shadow-lg shadow-gold-400/30 disabled:cursor-not-allowed disabled:opacity-70"
                disabled={isCalculating}
              >
                {isCalculating ? `${t('bazi.calculate')}...` : t('bazi.calculate')}
              </button>
              <button
                type="button"
                onClick={handleResetForm}
                className="rounded-full border border-white/30 px-4 py-2 text-sm font-semibold text-white/80 transition hover:border-gold-400/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-70"
                disabled={isCalculating}
              >
                Reset
              </button>
            </div>
          </form>

          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <button
              type="button"
              onClick={handleFullAnalysis}
              className="rounded-full border border-gold-400/60 px-4 py-2 text-sm text-gold-400 transition hover:bg-gold-400/10 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!baseResult || isFullLoading}
            >
              {isFullLoading ? `${t('bazi.fullAnalysis')}...` : t('bazi.fullAnalysis')}
            </button>
            <button
              type="button"
              onClick={handleAIInterpret}
              className="rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 px-4 py-2 text-sm font-bold text-white shadow-lg transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!fullResult || isAiLoading}
            >
              ✨ {isAiLoading ? t('bazi.aiThinking') : t('bazi.aiInterpret')}
            </button>
            <button
              type="button"
              onClick={handleSaveRecord}
              className="rounded-full border border-white/20 px-4 py-2 text-sm text-white/80 transition hover:border-gold-400/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!baseResult || isSaving}
            >
              {isSaving ? `${t('bazi.saveRecord')}...` : t('bazi.saveRecord')}
            </button>
            <button
              type="button"
              onClick={handleAddFavorite}
              className="rounded-full border border-white/20 px-4 py-2 text-sm text-white/80 transition hover:border-gold-400/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!savedRecord || isFavoriting}
            >
              {isFavoriting ? `${t('bazi.addFavorite')}...` : t('bazi.addFavorite')}
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
                elements.map(({ element, count, percent }) => (
                  <div key={element} className="flex items-center gap-3">
                    <span className="w-20 text-xs uppercase tracking-[0.2em] text-white/70">{element}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-gold-400" style={{ width: `${percent}%` }} />
                    </div>
                    <span className="text-xs text-white/60">
                      {count} · {percent}%
                    </span>
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
            {tenGodsList.length ? (
              tenGodsList.map((item) => (
                <div key={item.name} className="flex items-center gap-4">
                  <span className="w-32 text-sm text-white/80">{item.name}</span>
                  <div className="h-2 flex-1 rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-purple-300"
                      style={{
                        width: maxTenGodStrength
                          ? `${Math.round((item.strength / maxTenGodStrength) * 100)}%`
                          : '0%',
                      }}
                    />
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
            {luckCyclesList.length ? (
              luckCyclesList.map((cycle) => (
                <div key={cycle.range} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-white/60">{cycle.range}</p>
                  <p className="mt-2 text-lg text-white">
                    {cycle.stem} · {cycle.branch}
                  </p>
                  {cycle.startYear && cycle.endYear ? (
                    <p className="mt-1 text-xs text-white/50">
                      {cycle.startYear} - {cycle.endYear}
                    </p>
                  ) : null}
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
