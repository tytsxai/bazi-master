import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext.jsx';
import { useAuthFetch } from '../auth/useAuthFetch.js';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import { getPreferredAiProvider } from '../utils/aiProvider.js';
import { readApiErrorMessage } from '../utils/apiError.js';

const HOURS = Array.from({ length: 24 }, (_, index) => index);
const GENDERS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' }
];
const INITIAL_FORM = {
  birthYear: '',
  birthMonth: '',
  birthDay: '',
  birthHour: '',
  gender: 'female'
};

const formatTransformations = (items = []) =>
  items.map((item) => ({
    ...item,
    label: `${item.type?.toUpperCase?.() || item.type} · ${item.starCn || item.starName || item.starKey}`
  }));

const parseChartPayload = (chart) => {
  if (!chart) return null;
  if (typeof chart === 'object') return chart;
  if (typeof chart !== 'string') return null;
  try {
    return JSON.parse(chart);
  } catch {
    return null;
  }
};

const normalizeHistoryRecord = (record) => {
  if (!record) return record;
  const parsedChart = parseChartPayload(record.chart);
  return parsedChart ? { ...record, chart: parsedChart } : record;
};

export default function Ziwei() {
  const { t } = useTranslation();
  const { token, isAuthenticated } = useAuth();
  const authFetch = useAuthFetch();
  const [form, setForm] = useState(INITIAL_FORM);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const wsRef = useRef(null);
  const wsStatusRef = useRef({ done: false, errored: false });
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounted');
        wsRef.current = null;
      }
    };
  }, []);

  const resolveWsUrl = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const host = window.location.host;
    const hostname = window.location.hostname;
    const port = window.location.port;

    const configuredBackendPort = import.meta.env?.VITE_BACKEND_PORT;
    if ((hostname === 'localhost' || hostname === '127.0.0.1') && configuredBackendPort) {
      return `${protocol}://${hostname}:${configuredBackendPort}/ws/ai`;
    }

    if ((hostname === 'localhost' || hostname === '127.0.0.1') && port && port !== '4000') {
      return `${protocol}://${hostname}:4000/ws/ai`;
    }

    return `${protocol}://${host}/ws/ai`;
  };

  const closeAiSocket = (code = 1000, reason = 'Client disconnect') => {
    if (!wsRef.current) return;
    try {
      wsRef.current.close(code, reason);
    } finally {
      wsRef.current = null;
    }
  };
  const [confirmAiOpen, setConfirmAiOpen] = useState(false);
  const confirmAiCancelRef = useRef(null);

  useEffect(() => {
    if (confirmAiOpen) {
      confirmAiCancelRef.current?.focus();
    }
  }, [confirmAiOpen]);
  const [wizardStep, setWizardStep] = useState(1);
  const [hasSaved, setHasSaved] = useState(false);

  const transformationTags = useMemo(
    () => formatTransformations(result?.fourTransformations || []),
    [result]
  );

  const updateField = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const validate = (t) => {
    const nextErrors = {};
    const year = Number(form.birthYear);
    const month = Number(form.birthMonth);
    const day = Number(form.birthDay);
    const hour = Number(form.birthHour);

    if (!String(form.birthYear).trim()) nextErrors.birthYear = t('bazi.errors.yearRequired');
    else if (!Number.isInteger(year)) nextErrors.birthYear = t('bazi.errors.yearInvalid');
    if (!String(form.birthMonth).trim()) nextErrors.birthMonth = t('bazi.errors.monthRequired');
    else if (!Number.isInteger(month) || month < 1 || month > 12) nextErrors.birthMonth = t('bazi.errors.monthInvalid');
    if (!String(form.birthDay).trim()) nextErrors.birthDay = t('bazi.errors.dayRequired');
    else if (!Number.isInteger(day) || day < 1 || day > 31) nextErrors.birthDay = t('bazi.errors.dayInvalid');
    if (!String(form.birthHour).trim()) nextErrors.birthHour = t('bazi.errors.hourRequired');
    else if (!Number.isInteger(hour) || hour < 0 || hour > 23) nextErrors.birthHour = t('bazi.errors.hourInvalid');
    if (!form.gender) nextErrors.gender = t('bazi.errors.genderRequired');

    return nextErrors;
  };

  const loadHistory = async () => {
    if (!token) return;
    setHistoryLoading(true);
    try {
      const res = await authFetch('/api/ziwei/history');
      if (res.status === 401) return;
      if (!res.ok) {
        const message = await readApiErrorMessage(res, 'Unable to load history.');
        throw new Error(message);
      }
      const data = await res.json();
      const nextRecords = (data.records || []).map(normalizeHistoryRecord);
      setHistory(nextRecords);
    } catch (error) {
      setStatus({ type: 'error', message: 'Unable to load history.' });
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      setHistory([]);
      return;
    }
    loadHistory();
  }, [isAuthenticated, token]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;
    if (!token) {
      setStatus({ type: 'error', message: 'Please login to access Zi Wei charts.' });
      return;
    }
    const nextErrors = validate(t);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setLoading(true);
    setStatus(null);
    setResult(null);
    setAiResult(null);
    setHasSaved(false);
    try {
      const res = await authFetch('/api/ziwei/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          birthYear: Number(form.birthYear),
          birthMonth: Number(form.birthMonth),
          birthDay: Number(form.birthDay),
          birthHour: Number(form.birthHour),
          gender: form.gender
        })
      });

      if (res.status === 401) {
        return;
      }
      if (!res.ok) {
        const message = await readApiErrorMessage(res, 'Unable to calculate Zi Wei chart.');
        throw new Error(message);
      }
      const data = await res.json();
      setResult(data);
      setStatus({ type: 'success', message: 'Zi Wei chart generated.' });
      setWizardStep(2);
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Failed to calculate.' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!token) {
      setStatus({ type: 'error', message: 'Please login to save this chart.' });
      return false;
    }
    if (!result) {
      setStatus({ type: 'error', message: 'Generate a Zi Wei chart before saving.' });
      return false;
    }
    if (saveLoading) return;
    setSaveLoading(true);
    setStatus(null);
    try {
      const res = await authFetch('/api/ziwei/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          birthYear: Number(form.birthYear),
          birthMonth: Number(form.birthMonth),
          birthDay: Number(form.birthDay),
          birthHour: Number(form.birthHour),
          gender: form.gender,
        }),
      });
      if (res.status === 401) return;
      if (!res.ok) {
        const message = await readApiErrorMessage(res, 'Save failed.');
        throw new Error(message);
      }
      const data = await res.json();
      if (data.record) {
        setHistory((prev) => [normalizeHistoryRecord(data.record), ...prev]);
      } else {
        await loadHistory();
      }
      setStatus({ type: 'success', message: 'Zi Wei chart saved to history.' });
      setHasSaved(true);
      setWizardStep(3);
      return true;
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Save failed.' });
      return false;
    } finally {
      setSaveLoading(false);
    }
  };

  const handleAiInterpret = async () => {
    if (!token) {
      setStatus({ type: 'error', message: 'Please login to request AI interpretation.' });
      return;
    }
    if (!result) {
      setStatus({ type: 'error', message: 'Generate a Zi Wei chart before requesting AI interpretation.' });
      return;
    }
    if (aiLoading) return;
    closeAiSocket();
    wsStatusRef.current = { done: false, errored: false };
    setAiResult('');
    setAiLoading(true);
    setStatus({ type: 'info', message: 'Consulting the Zi Wei atlas...' });

    try {
      const ws = new WebSocket(resolveWsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        const provider = getPreferredAiProvider();
        const message = {
          type: 'ziwei_ai_request',
          token,
          provider,
          payload: {
            birthYear: Number(form.birthYear),
            birthMonth: Number(form.birthMonth),
            birthDay: Number(form.birthDay),
            birthHour: Number(form.birthHour),
            gender: form.gender,
            chart: result
          }
        };
        ws.send(JSON.stringify(message));
      };

      ws.onmessage = (event) => {
        if (!isMountedRef.current) return;
        let message;
        try {
          message = JSON.parse(event.data);
        } catch {
          return;
        }

        if (message?.type === 'start') {
          setAiResult('');
          return;
        }
        if (message?.type === 'chunk') {
          setAiResult((prev) => `${prev || ''}${message.content || ''}`);
          return;
        }
        if (message?.type === 'done') {
          wsStatusRef.current.done = true;
          setAiLoading(false);
          setStatus({ type: 'success', message: 'AI interpretation ready.' });
          closeAiSocket(1000, 'Stream complete');
          return;
        }
        if (message?.type === 'error') {
          wsStatusRef.current.errored = true;
          setAiLoading(false);
          setStatus({ type: 'error', message: message.message || 'AI Interpretation failed.' });
          closeAiSocket(1011, 'AI error');
        }
      };

      ws.onerror = () => {
        if (!isMountedRef.current) return;
        wsStatusRef.current.errored = true;
        setAiLoading(false);
        setStatus({ type: 'error', message: 'WebSocket connection error.' });
      };

      ws.onclose = () => {
        if (!isMountedRef.current) return;
        const { done, errored } = wsStatusRef.current;
        if (!done && !errored) {
          setStatus({ type: 'error', message: 'Connection closed unexpectedly.' });
        }
        setAiLoading(false);
        wsRef.current = null;
      };
    } catch (e) {
      setAiLoading(false);
      setStatus({ type: 'error', message: e.message || 'Connection error' });
    }
  };

  const requestAiConfirm = () => {
    if (!token) {
      setStatus({ type: 'error', message: 'Please login to request AI interpretation.' });
      return;
    }
    if (!result) {
      setStatus({ type: 'error', message: 'Generate a Zi Wei chart before requesting AI interpretation.' });
      return;
    }
    if (aiLoading) return;
    setConfirmAiOpen(true);
  };

  const handleConfirmAiRequest = () => {
    setConfirmAiOpen(false);
    handleAiInterpret();
  };

  const handleLoadHistory = (record) => {
    if (!record?.chart) {
      setStatus({ type: 'error', message: 'Unable to load this history record.' });
      return;
    }
    setForm({
      birthYear: String(record.birthYear ?? ''),
      birthMonth: String(record.birthMonth ?? ''),
      birthDay: String(record.birthDay ?? ''),
      birthHour: String(record.birthHour ?? ''),
      gender: record.gender || 'female',
    });
    setErrors({});
    setResult(record.chart);
    setAiResult(null);
    setStatus({ type: 'success', message: 'History record loaded.' });
    setHasSaved(false);
    setWizardStep(2);
  };

  const statusStyle =
    status?.type === 'error' ? 'text-rose-200 bg-rose-900/50' :
      status?.type === 'success' ? 'text-emerald-200 bg-emerald-900/50' :
        'text-blue-200 bg-blue-900/50';

  const mingIndex = result?.mingPalace?.index;
  const shenIndex = result?.shenPalace?.index;
  const wizardSteps = [
    { id: 1, title: 'Birth Details', description: 'Enter birth data to generate the chart.' },
    { id: 2, title: 'Review Chart', description: 'Review the palaces and transformations.' },
    { id: 3, title: 'Save & Finish', description: 'Save the chart to complete the wizard.' },
  ];
  const canEnterStep = (stepId) => {
    if (stepId === 1) return true;
    if (stepId === 2) return Boolean(result);
    if (stepId === 3) return Boolean(hasSaved);
    return false;
  };
  const handleStartOver = () => {
    setResult(null);
    setAiResult(null);
    setStatus(null);
    setErrors({});
    setHasSaved(false);
    setWizardStep(1);
  };

  return (
    <main id="main-content" tabIndex={-1} className="container mx-auto pb-16">
      <Breadcrumbs />
      {confirmAiOpen && (
        <div
          role="presentation"
          onClick={() => setConfirmAiOpen(false)}
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4 py-6"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Request AI interpretation?"
            className="w-full max-w-md rounded-3xl border border-white/10 bg-mystic-900/95 p-6 text-white shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-white">Request AI interpretation?</h2>
            <p className="mt-2 text-sm text-white/70">
              This sends your Zi Wei chart details for an AI summary. Continue when you are ready.
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                ref={confirmAiCancelRef}
                onClick={() => setConfirmAiOpen(false)}
                className="rounded-full border border-white/20 px-4 py-2 text-sm text-white/80 transition hover:border-white/40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAiRequest}
                className="rounded-full bg-gold-400 px-5 py-2 text-sm font-semibold text-mystic-900 shadow-lg transition hover:scale-105"
              >
                Request AI
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="glass-card mx-auto rounded-3xl border border-white/10 p-8 shadow-glass">
        <h1 className="font-display text-4xl text-gold-400">Zi Wei Atlas</h1>
        <p className="mt-2 text-white/70">
          V2 preview · Generate a lightweight Zi Wei chart with palace stars and transformations.
        </p>

        <section className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-white/50">Guided Wizard</p>
              <h2 className="text-lg font-display text-gold-300">Complete the Zi Wei flow</h2>
            </div>
            {hasSaved ? (
              <span className="rounded-full border border-emerald-300/60 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-100">
                Wizard complete
              </span>
            ) : (
              <span className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs text-white/70">
                Step {wizardStep} of 3
              </span>
            )}
          </div>
          <ol className="mt-4 grid gap-3 md:grid-cols-3">
            {wizardSteps.map((step) => {
              const isActive = wizardStep === step.id;
              const isComplete = step.id < wizardStep || (step.id === 3 && hasSaved);
              const isEnabled = canEnterStep(step.id);
              return (
                <li
                  key={step.id}
                  className={`rounded-2xl border px-4 py-3 text-sm transition ${
                    isComplete
                      ? 'border-emerald-300/60 bg-emerald-500/10 text-emerald-100'
                      : isActive
                        ? 'border-gold-400/60 bg-gold-400/10 text-gold-100'
                        : 'border-white/10 bg-white/5 text-white/60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">Step {step.id}</span>
                    {isComplete && <span className="text-xs">✓</span>}
                  </div>
                  <div className="mt-2 text-base text-white">{step.title}</div>
                  <p className="mt-1 text-xs text-white/60">{step.description}</p>
                  <button
                    type="button"
                    onClick={() => setWizardStep(step.id)}
                    disabled={!isEnabled}
                    className="mt-3 rounded-full border border-white/20 px-3 py-1 text-xs text-white/70 transition hover:border-gold-400/60 hover:text-gold-200 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isEnabled ? 'Go to step' : 'Locked'}
                  </button>
                </li>
              );
            })}
          </ol>
        </section>

        <form onSubmit={handleSubmit} className="mt-6 grid gap-4 md:grid-cols-5">
          <label className="text-sm text-white/70">
            {t('bazi.birthYear')}
            <input
              type="number"
              value={form.birthYear}
              onChange={updateField('birthYear')}
              className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white"
            />
            {errors.birthYear && <span className="mt-1 block text-xs text-rose-200">{errors.birthYear}</span>}
          </label>
          <label className="text-sm text-white/70">
            {t('bazi.birthMonth')}
            <input
              type="number"
              value={form.birthMonth}
              onChange={updateField('birthMonth')}
              className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white"
            />
            {errors.birthMonth && <span className="mt-1 block text-xs text-rose-200">{errors.birthMonth}</span>}
          </label>
          <label className="text-sm text-white/70">
            {t('bazi.birthDay')}
            <input
              type="number"
              value={form.birthDay}
              onChange={updateField('birthDay')}
              className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white"
            />
            {errors.birthDay && <span className="mt-1 block text-xs text-rose-200">{errors.birthDay}</span>}
          </label>
          <label className="text-sm text-white/70">
            {t('bazi.birthHour')}
            <select
              value={form.birthHour}
              onChange={updateField('birthHour')}
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-white"
            >
              <option value="">Select</option>
              {HOURS.map((hour) => (
                <option key={hour} value={hour}>{hour}</option>
              ))}
            </select>
            {errors.birthHour && <span className="mt-1 block text-xs text-rose-200">{errors.birthHour}</span>}
          </label>
          <label className="text-sm text-white/70">
            {t('bazi.gender')}
            <select
              value={form.gender}
              onChange={updateField('gender')}
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-white"
            >
              {GENDERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {errors.gender && <span className="mt-1 block text-xs text-rose-200">{errors.gender}</span>}
          </label>
          <div className="md:col-span-5 flex flex-col gap-3 sm:flex-row mt-2">
            <button
              type="submit"
              disabled={loading || saveLoading}
              className="flex-1 rounded-full bg-gold-400 px-8 py-2 text-sm font-semibold text-mystic-900 shadow-lg transition hover:scale-105 disabled:opacity-50"
            >
              {loading ? t('profile.calculating') : 'Generate Zi Wei Chart'}
            </button>
            <button
              type="button"
              onClick={handleStartOver}
              className="flex-1 rounded-full border border-white/30 px-8 py-2 text-sm font-semibold text-white/80 transition hover:border-gold-400/60 hover:text-white"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="flex-1 rounded-full border border-white/30 px-8 py-2 text-sm font-semibold text-white/80 transition hover:border-gold-400/60 hover:text-white"
            >
              Cancel
            </button>
          </div>
        </form>

        {status && (
          <div className={`mt-4 rounded-xl px-4 py-2 ${statusStyle}`} data-testid="ziwei-status">
            {status.message}
          </div>
        )}

        {result && (
          <div className="mt-8 space-y-6" data-testid="ziwei-result">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div>
                <p className="text-sm font-semibold text-white">Chart ready</p>
                <p className="text-xs text-white/60">Save this Zi Wei chart to your history.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={requestAiConfirm}
                  disabled={aiLoading}
                  className="rounded-full border border-gold-400/60 px-6 py-2 text-sm font-semibold text-gold-100 transition hover:bg-gold-400/10 disabled:opacity-50"
                >
                  {aiLoading ? 'Interpreting...' : 'Request AI Interpretation'}
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saveLoading}
                  className="rounded-full bg-gold-400 px-6 py-2 text-sm font-semibold text-mystic-900 shadow-lg transition hover:scale-105 disabled:opacity-50"
                >
                  {saveLoading ? 'Saving...' : t('bazi.saveRecord')}
                </button>
              </div>
            </div>
            <section className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <h2 className="text-sm uppercase text-gold-400/80">Lunar Date</h2>
                <p className="mt-2 text-white">
                  {result?.lunar?.year}年 {result?.lunar?.month}月 {result?.lunar?.day}日
                  {result?.lunar?.isLeap ? ' (Leap)' : ''}
                </p>
                <p className="mt-1 text-xs text-white/60">
                  {result?.lunar?.yearStem}{result?.lunar?.yearBranch}年 · {result?.lunar?.monthStem}{result?.lunar?.monthBranch}月
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <h2 className="text-sm uppercase text-gold-400/80">Key Palaces</h2>
                <p className="mt-2 text-white">
                  命宫: {result?.mingPalace?.palace?.cn} · {result?.mingPalace?.branch?.name}
                </p>
                <p className="mt-1 text-white">
                  身宫: {result?.shenPalace?.palace?.cn} · {result?.shenPalace?.branch?.name}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <h2 className="text-sm uppercase text-gold-400/80">Birth Time</h2>
                <p className="mt-2 text-white">{result?.birthIso || '—'}</p>
                <p className="mt-1 text-xs text-white/60">
                  UTC offset: {Number.isFinite(result?.timezoneOffsetMinutes)
                    ? `${result.timezoneOffsetMinutes} mins`
                    : '—'}
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-display text-gold-300">Four Transformations</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {transformationTags.length ? (
                  transformationTags.map((item) => (
                    <span
                      key={`${item.type}-${item.starKey}`}
                      className="rounded-full border border-gold-400/40 bg-gold-400/10 px-3 py-1 text-xs text-gold-200"
                    >
                      {item.label}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-white/60">No transformations available.</span>
                )}
              </div>
            </section>

            <section>
              <h2 className="text-xl font-display text-gold-300">Palace Grid</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-3 xl:grid-cols-4">
                {(result?.palaces || []).map((palace) => {
                  const isMing = palace.index === mingIndex;
                  const isShen = palace.index === shenIndex;
                  const highlight = isMing ? 'border-gold-400/80' : isShen ? 'border-emerald-300/80' : 'border-white/10';
                  return (
                    <div
                      key={palace.index}
                      data-testid="ziwei-palace-card"
                      className={`rounded-2xl border ${highlight} bg-white/5 p-4`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gold-400">{palace.palace?.cn || palace.palace?.name || 'Palace'}</p>
                          <p className="text-xs text-white/60">{palace.branch?.name} · {palace.branch?.element}</p>
                        </div>
                        {isMing && <span className="text-xs text-gold-200">命宫</span>}
                        {isShen && <span className="text-xs text-emerald-200">身宫</span>}
                      </div>
                      <div className="mt-3">
                        <p className="text-xs uppercase text-white/50">Major Stars</p>
                        <div className="mt-1 flex flex-wrap gap-1 text-xs text-white">
                          {(palace.stars?.major || []).length
                            ? palace.stars.major.map((star) => (
                              <span key={star.key} className="rounded-full bg-white/10 px-2 py-0.5">
                                {star.cn || star.name}
                              </span>
                            ))
                            : <span className="text-white/40">—</span>}
                        </div>
                      </div>
                      <div className="mt-3">
                        <p className="text-xs uppercase text-white/50">Minor Stars</p>
                        <div className="mt-1 flex flex-wrap gap-1 text-xs text-white">
                          {(palace.stars?.minor || []).length
                            ? palace.stars.minor.map((star) => (
                              <span key={star.key} className="rounded-full bg-white/10 px-2 py-0.5">
                                {star.cn || star.name}
                              </span>
                            ))
                            : <span className="text-white/40">—</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <h2 className="text-xl font-display text-gold-300">AI Interpretation</h2>
              <p className="mt-1 text-sm text-white/60">
                Generate a concise interpretation of your Zi Wei chart.
              </p>
              {aiResult ? (
                <div
                  className="prose prose-invert mt-4 max-w-none whitespace-pre-wrap text-sm text-white/90"
                  data-testid="ziwei-ai-result"
                >
                  {aiResult}
                </div>
              ) : (
                <p className="mt-4 text-sm text-white/50" data-testid="ziwei-ai-empty">
                  No AI interpretation yet.
                </p>
              )}
            </section>
          </div>
        )}

        {hasSaved && (
          <div className="mt-8 rounded-2xl border border-emerald-300/40 bg-emerald-500/10 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-emerald-100">Wizard complete</p>
                <p className="text-xs text-white/60">
                  Your Zi Wei chart has been saved. You can review it in history or start a new one.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  href="#ziwei-history"
                  className="rounded-full border border-emerald-300/60 px-4 py-2 text-xs text-emerald-100 transition hover:bg-emerald-500/10"
                >
                  View history
                </a>
                <button
                  type="button"
                  onClick={handleStartOver}
                  className="rounded-full border border-white/20 px-4 py-2 text-xs text-white/70 transition hover:border-gold-400/60 hover:text-gold-200"
                >
                  Start new chart
                </button>
              </div>
            </div>
          </div>
        )}

        {isAuthenticated && (
          <section id="ziwei-history" className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-display text-gold-300">Zi Wei History</h2>
                <p className="text-sm text-white/60">Review saved Zi Wei charts and reload them.</p>
              </div>
              <button
                type="button"
                onClick={loadHistory}
                disabled={historyLoading}
                className="rounded-full border border-white/20 px-4 py-2 text-sm text-white/80 transition hover:border-gold-400/60 hover:text-gold-200 disabled:opacity-50"
              >
                {historyLoading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>

            {historyLoading ? (
              <p className="mt-4 text-sm text-white/60">Loading history...</p>
            ) : history.length ? (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {history.map((record) => {
                  const chart = record?.chart || {};
                  const lunar = chart?.lunar || {};
                  const mingPalace = chart?.mingPalace?.palace?.cn || chart?.mingPalace?.palace?.name || '—';
                  const mingBranch = chart?.mingPalace?.branch?.name || '—';
                  const lunarKey = lunar.year && lunar.month && lunar.day
                    ? `${lunar.year}-${lunar.month}-${lunar.day}${lunar.isLeap ? '-L' : ''}`
                    : '—';
                  return (
                    <div
                      key={record.id}
                      data-testid="ziwei-history-card"
                      data-record-id={record.id}
                      data-ming-palace={`${mingPalace}·${mingBranch}`}
                      data-lunar={lunarKey}
                      data-birth={`${record.birthYear}-${record.birthMonth}-${record.birthDay}-${record.birthHour}`}
                      data-gender={record.gender}
                      className="rounded-2xl border border-white/10 bg-black/30 p-4"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-white">
                            {record.birthYear}年 {record.birthMonth}月 {record.birthDay}日 · {record.birthHour}时
                          </p>
                          <p className="text-xs text-white/60">
                            Gender: {record.gender} · Saved {new Date(record.createdAt).toLocaleString()}
                          </p>
                          <p className="mt-2 text-sm text-gold-200" data-testid="ziwei-history-ming">
                            命宫: {mingPalace} · {mingBranch}
                          </p>
                          <p className="text-xs text-white/60" data-testid="ziwei-history-lunar">
                            Lunar: {lunar.year}年 {lunar.month}月 {lunar.day}日 {lunar.isLeap ? '(Leap)' : ''}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleLoadHistory(record)}
                          className="rounded-full border border-gold-400/60 px-3 py-1 text-xs text-gold-200 transition hover:bg-gold-400/10"
                        >
                          Load
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-4 text-sm text-white/60">No Zi Wei history yet.</p>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
