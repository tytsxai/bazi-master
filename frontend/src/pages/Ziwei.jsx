import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { useAuthFetch } from '../auth/useAuthFetch.js';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import { getPreferredAiProvider } from '../utils/aiProvider.js';
import { readApiErrorMessage } from '../utils/apiError.js';

const HOURS = Array.from({ length: 24 }, (_, index) => index);
const GENDERS = [
  { value: 'male' },
  { value: 'female' }
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
  const navigate = useNavigate();
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
  const [confirmDeleteRecord, setConfirmDeleteRecord] = useState(null);
  const confirmAiCancelRef = useRef(null);
  const confirmDeleteCancelRef = useRef(null);

  useEffect(() => {
    if (confirmAiOpen) {
      confirmAiCancelRef.current?.focus();
    }
    if (confirmDeleteRecord) {
      confirmDeleteCancelRef.current?.focus();
    }
  }, [confirmAiOpen, confirmDeleteRecord]);
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
        const message = await readApiErrorMessage(res, t('ziwei.errors.loadHistoryFailed'));
        throw new Error(message);
      }
      const data = await res.json();
      const nextRecords = (data.records || []).map(normalizeHistoryRecord);
      setHistory(nextRecords);
    } catch (error) {
      setStatus({ type: 'error', message: t('ziwei.errors.loadHistoryFailed') });
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
      setStatus({ type: 'error', message: t('ziwei.errors.loginRequired') });
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
        const message = await readApiErrorMessage(res, t('ziwei.errors.calculateFailed'));
        throw new Error(message);
      }
      const data = await res.json();
      setResult(data);
      setStatus({ type: 'success', message: t('ziwei.chartReady') });
      setWizardStep(2);
    } catch (error) {
      setStatus({ type: 'error', message: error.message || t('ziwei.errors.calculateFailed') });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!token) {
      setStatus({ type: 'error', message: t('ziwei.errors.loginRequiredSave') });
      return false;
    }
    if (!result) {
      setStatus({ type: 'error', message: t('ziwei.errors.generateFirst') });
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
        const message = await readApiErrorMessage(res, t('ziwei.errors.saveFailed'));
        throw new Error(message);
      }
      const data = await res.json();
      if (data.record) {
        setHistory((prev) => [normalizeHistoryRecord(data.record), ...prev]);
      } else {
        await loadHistory();
      }
      setStatus({ type: 'success', message: t('ziwei.wizardComplete') });
      setHasSaved(true);
      setWizardStep(3);
      return true;
    } catch (error) {
      setStatus({ type: 'error', message: error.message || t('ziwei.errors.saveFailed') });
      return false;
    } finally {
      setSaveLoading(false);
    }
  };

  const handleAiInterpret = async () => {
    if (!token) {
      setStatus({ type: 'error', message: t('ziwei.errors.loginRequiredAi') });
      return;
    }
    if (!result) {
      setStatus({ type: 'error', message: t('ziwei.errors.generateFirstAi') });
      return;
    }
    if (aiLoading) return;
    closeAiSocket();
    wsStatusRef.current = { done: false, errored: false };
    setAiResult('');
    setAiLoading(true);
    setStatus({ type: 'info', message: t('bazi.aiThinking') });

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
          setStatus({ type: 'success', message: t('ziwei.errors.aiInterpretReady') || t('bazi.aiReady') });
          closeAiSocket(1000, 'Stream complete');
          return;
        }
        if (message?.type === 'error') {
          wsStatusRef.current.errored = true;
          setAiLoading(false);
          setStatus({ type: 'error', message: message.message || t('ziwei.errors.calculateFailed') });
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
      setStatus({ type: 'error', message: t('ziwei.errors.loginRequiredAi') });
      return;
    }
    if (!result) {
      setStatus({ type: 'error', message: t('ziwei.errors.generateFirstAi') });
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
      setStatus({ type: 'error', message: t('ziwei.errors.loadRecordFailed') });
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
    setStatus({ type: 'success', message: t('ziwei.errors.aiInterpretReady') || t('bazi.calculated') });
    setHasSaved(false);
    setWizardStep(2);
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteRecord) return;
    const recordId = confirmDeleteRecord.id;
    setStatus(null);
    try {
      const res = await authFetch(`/api/ziwei/history/${recordId}`, { method: 'DELETE' });
      if (res.status === 401) return;
      if (!res.ok) {
        const message = await readApiErrorMessage(res, t('history.deleteError'));
        throw new Error(message);
      }
      setHistory((prev) => prev.filter((record) => record.id !== recordId));
      setConfirmDeleteRecord(null);
      setStatus({ type: 'success', message: t('history.recordDeleted') });
    } catch (error) {
      setStatus({ type: 'error', message: error.message || t('history.deleteError') });
    }
  };

  const statusStyle =
    status?.type === 'error' ? 'text-rose-200 bg-rose-900/50' :
      status?.type === 'success' ? 'text-emerald-200 bg-emerald-900/50' :
        'text-blue-200 bg-blue-900/50';

  const mingIndex = result?.mingPalace?.index;
  const shenIndex = result?.shenPalace?.index;
  const wizardSteps = [
    { id: 1, title: t('ziwei.steps.birth.title'), description: t('ziwei.steps.birth.desc') },
    { id: 2, title: t('ziwei.steps.review.title'), description: t('ziwei.steps.review.desc') },
    { id: 3, title: t('ziwei.steps.save.title'), description: t('ziwei.steps.save.desc') },
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
            aria-label={t('ziwei.aiConfirmTitle')}
            className="w-full max-w-md rounded-3xl border border-white/10 bg-mystic-900/95 p-6 text-white shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-white">{t('ziwei.aiConfirmTitle')}</h2>
            <p className="mt-2 text-sm text-white/70">
              {t('ziwei.aiConfirmDesc')}
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                ref={confirmAiCancelRef}
                onClick={() => setConfirmAiOpen(false)}
                className="rounded-full border border-white/20 px-4 py-2 text-sm text-white/80 transition hover:border-white/40"
              >
                {t('profile.cancel')}
              </button>
              <button
                type="button"
                onClick={handleConfirmAiRequest}
                className="rounded-full bg-gold-400 px-5 py-2 text-sm font-semibold text-mystic-900 shadow-lg transition hover:scale-105"
              >
                {t('bazi.aiInterpret')}
              </button>
            </div>
          </div>
        </div>
      )}
      {confirmDeleteRecord && (
        <div
          role="presentation"
          onClick={() => setConfirmDeleteRecord(null)}
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4 py-6"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ziwei-delete-title"
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-md rounded-3xl border border-white/10 bg-mystic-900/95 p-6 text-white shadow-xl"
          >
            <h2 id="ziwei-delete-title" className="text-lg font-semibold text-white">
              {t('ziwei.deleteConfirmTitle')}
            </h2>
            <p className="mt-2 text-sm text-white/70">
              {t('ziwei.deleteConfirmDesc')}
            </p>
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-white/70">
              {confirmDeleteRecord.birthYear}-{confirmDeleteRecord.birthMonth}-{confirmDeleteRecord.birthDay} · {confirmDeleteRecord.birthHour}:00
            </div>
            <div className="mt-6 flex flex-wrap gap-3 sm:justify-end">
              <button
                ref={confirmDeleteCancelRef}
                type="button"
                onClick={() => setConfirmDeleteRecord(null)}
                className="rounded-full border border-white/20 px-4 py-2 text-xs uppercase tracking-[0.2em] text-white/70 transition hover:border-white/40 hover:text-white"
              >
                {t('profile.cancel')}
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="rounded-full border border-rose-400/40 bg-rose-500/10 px-4 py-2 text-xs uppercase tracking-[0.2em] text-rose-100 transition hover:border-rose-300 hover:text-rose-200"
              >
                {t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="glass-card mx-auto rounded-3xl border border-white/10 p-8 shadow-glass">
        <h1 className="font-display text-4xl text-gold-400">{t('ziwei.title')}</h1>
        <p className="mt-2 text-white/70">
          {t('ziwei.subtitle')}
        </p>

        <section className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-white/50">{t('ziwei.wizardTitle')}</p>
              <h2 className="text-lg font-display text-gold-300">{t('ziwei.wizardSubtitle')}</h2>
            </div>
            {hasSaved ? (
              <span className="rounded-full border border-emerald-300/60 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-100">
                {t('ziwei.wizardComplete')}
              </span>
            ) : (
              <span className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs text-white/70">
                {t('ziwei.step', { current: wizardStep, total: 3 })}
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
                  className={`rounded-2xl border px-4 py-3 text-sm transition ${isComplete
                      ? 'border-emerald-300/60 bg-emerald-500/10 text-emerald-100'
                      : isActive
                        ? 'border-gold-400/60 bg-gold-400/10 text-gold-100'
                        : 'border-white/10 bg-white/5 text-white/60'
                    }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{t('ziwei.palace')} {step.id}</span>
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
                    {isEnabled ? t('ziwei.goToStep') : t('ziwei.locked')}
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
              <option value="">{t('common.select')}</option>
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
                  {option.value === 'male' ? t('bazi.genderMale') : t('bazi.genderFemale')}
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
              {loading ? t('profile.calculating') : t('ziwei.generateChart')}
            </button>
            <button
              type="button"
              onClick={handleStartOver}
              className="flex-1 rounded-full border border-white/30 px-8 py-2 text-sm font-semibold text-white/80 transition hover:border-gold-400/60 hover:text-white"
            >
              {t('ziwei.reset')}
            </button>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="flex-1 rounded-full border border-white/30 px-8 py-2 text-sm font-semibold text-white/80 transition hover:border-gold-400/60 hover:text-white"
            >
              {t('profile.cancel')}
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
                <p className="text-sm font-semibold text-white">{t('ziwei.chartReady')}</p>
                <p className="text-xs text-white/60">{t('ziwei.chartReadyDesc')}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={requestAiConfirm}
                  disabled={aiLoading}
                  className="rounded-full border border-gold-400/60 px-6 py-2 text-sm font-semibold text-gold-100 transition hover:bg-gold-400/10 disabled:opacity-50"
                >
                  {aiLoading ? t('ziwei.interpreting') : t('ziwei.aiInterpret')}
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saveLoading}
                  className="rounded-full bg-gold-400 px-6 py-2 text-sm font-semibold text-mystic-900 shadow-lg transition hover:scale-105 disabled:opacity-50"
                >
                  {saveLoading ? t('profile.saving') : t('bazi.saveRecord')}
                </button>
              </div>
            </div>
            <section className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <h2 className="text-sm uppercase text-gold-400/80">{t('ziwei.lunarDate')}</h2>
                <p className="mt-2 text-white">
                  {result?.lunar
                    ? `${result.lunar.year}年 ${result.lunar.month}月 ${result.lunar.day}日${result.lunar.isLeap ? ' (Leap)' : ''}`
                    : '—'}
                </p>
                <p className="mt-1 text-xs text-white/60">
                  {result?.lunar
                    ? `${result.lunar.yearStem}${result.lunar.yearBranch}年 · ${result.lunar.monthStem}${result.lunar.monthBranch}月`
                    : '—'}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <h2 className="text-sm uppercase text-gold-400/80">{t('ziwei.keyPalaces')}</h2>
                <p className="mt-2 text-white">
                  {t('ziwei.palace')}: {result?.mingPalace?.palace?.cn} · {result?.mingPalace?.branch?.name}
                </p>
                <p className="mt-1 text-white">
                  {t('ziwei.palace')}: {result?.shenPalace?.palace?.cn} · {result?.shenPalace?.branch?.name}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <h2 className="text-sm uppercase text-gold-400/80">{t('ziwei.birthTime')}</h2>
                <p className="mt-2 text-white">{result?.birthIso || '—'}</p>
                <p className="mt-1 text-xs text-white/60">
                  {t('ziwei.utcOffset')}: {Number.isFinite(result?.timezoneOffsetMinutes)
                    ? `${result.timezoneOffsetMinutes} ${t('profile.mins')}`
                    : '—'}
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-display text-gold-300">{t('ziwei.transformations')}</h2>
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
                  <span className="text-sm text-white/60">{t('ziwei.noTransformations')}</span>
                )}
              </div>
            </section>

            <section>
              <h2 className="text-xl font-display text-gold-300">{t('ziwei.palaceGrid')}</h2>
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
                          <p className="text-sm text-gold-400">{palace.palace?.cn || palace.palace?.name || t('ziwei.palace')}</p>
                          <p className="text-xs text-white/60">{palace.branch?.name} · {palace.branch?.element}</p>
                        </div>
                        {isMing && <span className="text-xs text-gold-200">{t('ziwei.mingPalace')}</span>}
                        {isShen && <span className="text-xs text-emerald-200">{t('ziwei.shenPalace')}</span>}
                      </div>
                      <div className="mt-3">
                        <p className="text-xs uppercase text-white/50">{t('ziwei.majorStars')}</p>
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
                        <p className="text-xs uppercase text-white/50">{t('ziwei.minorStars')}</p>
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
              <h2 className="text-xl font-display text-gold-300">{t('ziwei.aiAnalysis')}</h2>
              <p className="mt-1 text-sm text-white/60">
                {t('ziwei.aiAnalysisDesc')}
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
                  {t('ziwei.noAiYet')}
                </p>
              )}
            </section>
          </div>
        )}

        {hasSaved && (
          <div className="mt-8 rounded-2xl border border-emerald-300/40 bg-emerald-500/10 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-emerald-100">{t('ziwei.wizardComplete')}</p>
                <p className="text-xs text-white/60">
                  {t('ziwei.wizardCompleteDesc')}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  href="#ziwei-history"
                  className="rounded-full border border-emerald-300/60 px-4 py-2 text-xs text-emerald-100 transition hover:bg-emerald-500/10"
                >
                  {t('profile.openHistory')}
                </a>
                <button
                  type="button"
                  onClick={handleStartOver}
                  className="rounded-full border border-white/20 px-4 py-2 text-xs text-white/70 transition hover:border-gold-400/60 hover:text-gold-200"
                >
                  {t('ziwei.startNew')}
                </button>
              </div>
            </div>
          </div>
        )}

        {isAuthenticated && (
          <section id="ziwei-history" className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-display text-gold-300">{t('ziwei.historyTitle')}</h2>
                <p className="text-sm text-white/60">{t('ziwei.historySubtitle')}</p>
              </div>
              <button
                type="button"
                onClick={loadHistory}
                disabled={historyLoading}
                className="rounded-full border border-white/20 px-4 py-2 text-sm text-white/80 transition hover:border-gold-400/60 hover:text-gold-200 disabled:opacity-50"
              >
                {historyLoading ? t('ziwei.refreshing') : t('ziwei.refresh')}
              </button>
            </div>

            {historyLoading ? (
              <p className="mt-4 text-sm text-white/60">{t('history.recordLoading')}</p>
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
                            {record.birthYear}{t('common.year')} {record.birthMonth}{t('common.month')} {record.birthDay}{t('common.day')} · {record.birthHour}{t('bazi.hour')}
                          </p>
                          <p className="text-xs text-white/60">
                            {t('bazi.gender')}: {record.gender === 'male' ? t('bazi.genderMale') : t('bazi.genderFemale')} · {t('iching.savedAt', { date: new Date(record.createdAt).toLocaleString() })}
                          </p>
                          <p className="mt-2 text-sm text-gold-200" data-testid="ziwei-history-ming">
                            {t('ziwei.palace')}: {mingPalace} · {mingBranch}
                          </p>
                          <p className="text-xs text-white/60" data-testid="ziwei-history-lunar">
                            {t('ziwei.lunarDate')}: {lunar.year && lunar.month && lunar.day
                              ? `${lunar.year}年 ${lunar.month}月 ${lunar.day}日${lunar.isLeap ? ' (Leap)' : ''}`
                              : '—'}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleLoadHistory(record)}
                            className="rounded-full border border-gold-400/60 px-3 py-1 text-xs text-gold-200 transition hover:bg-gold-400/10"
                          >
                            {t('ziwei.load')}
                          </button>
                          <button
                            type="button"
                            data-testid="ziwei-history-delete"
                            onClick={() => setConfirmDeleteRecord(record)}
                            className="rounded-full border border-rose-400/60 px-3 py-1 text-xs text-rose-200 transition hover:bg-rose-400/10"
                          >
                            {t('common.delete')}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-4 text-sm text-white/60">{t('ziwei.noHistory')}</p>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
