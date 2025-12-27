import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext.jsx';
import { useAuthFetch } from '../auth/useAuthFetch.js';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import { getPreferredAiProvider } from '../utils/aiProvider.js';
import { readApiErrorMessage } from '../utils/apiError.js';
import ZiweiForm from '../components/ziwei/ZiweiForm';
import ZiweiChart from '../components/ziwei/ZiweiChart';
import ZiweiAiSection from '../components/ziwei/ZiweiAiSection';
import Modal from '../components/ui/Modal';
import Button from '../components/ui/Button';

const INITIAL_FORM = {
  birthYear: '',
  birthMonth: '',
  birthDay: '',
  birthHour: '',
  gender: 'female'
};

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

  // --- Lifecycle & WS Cleanup ---
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

  // --- History Loading ---
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

  // --- Input Handlers ---
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

      if (res.status === 401) return;
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

  // --- Save Logic ---
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

  // --- AI Logic ---
  const resolveWsUrl = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const host = window.location.host;
    const hostname = window.location.hostname;

    const configuredBackendPort = import.meta.env?.VITE_BACKEND_PORT;
    if ((hostname === 'localhost' || hostname === '127.0.0.1') && configuredBackendPort) {
      return `${protocol}://${hostname}:${configuredBackendPort}/ws/ai`;
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

  const [confirmAiOpen, setConfirmAiOpen] = useState(false);
  const [confirmDeleteRecord, setConfirmDeleteRecord] = useState(null);
  const confirmAiCancelRef = useRef(null);
  const confirmDeleteCancelRef = useRef(null);

  useEffect(() => {
    if (confirmAiOpen) confirmAiCancelRef.current?.focus();
    if (confirmDeleteRecord) confirmDeleteCancelRef.current?.focus();
  }, [confirmAiOpen, confirmDeleteRecord]);

  const [wizardStep, setWizardStep] = useState(1);
  const [hasSaved, setHasSaved] = useState(false);

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

  const handleStartOver = () => {
    setResult(null);
    setAiResult(null);
    setStatus(null);
    setErrors({});
    setHasSaved(false);
    setWizardStep(1);
  };

  const statusStyle =
    status?.type === 'error' ? 'text-rose-200 bg-rose-900/50' :
      status?.type === 'success' ? 'text-emerald-200 bg-emerald-900/50' :
        'text-blue-200 bg-blue-900/50';

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

  return (
    <main id="main-content" tabIndex={-1} className="container mx-auto pb-16">
      <Breadcrumbs />

      {/* Confirmation Modals */}
      <Modal
        isOpen={confirmAiOpen}
        onClose={() => setConfirmAiOpen(false)}
        title={t('ziwei.aiConfirmTitle')}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setConfirmAiOpen(false)}
              ref={confirmAiCancelRef}
            >
              {t('profile.cancel')}
            </Button>
            <Button
              onClick={handleConfirmAiRequest}
            >
              {t('bazi.aiInterpret')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-white/70">{t('ziwei.aiConfirmDesc')}</p>
      </Modal>

      <Modal
        isOpen={!!confirmDeleteRecord}
        onClose={() => setConfirmDeleteRecord(null)}
        title={t('ziwei.deleteConfirmTitle')}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setConfirmDeleteRecord(null)}
              ref={confirmDeleteCancelRef}
            >
              {t('profile.cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={handleConfirmDelete}
            >
              {t('common.delete')}
            </Button>
          </>
        }
      >
        <p className="mt-2 text-sm text-white/70">{t('ziwei.deleteConfirmDesc')}</p>
        {confirmDeleteRecord && (
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-white/70">
            {confirmDeleteRecord.birthYear}-{confirmDeleteRecord.birthMonth}-{confirmDeleteRecord.birthDay} · {confirmDeleteRecord.birthHour}:00
          </div>
        )}
      </Modal>

      <div className="glass-card mx-auto rounded-3xl border border-white/10 p-8 shadow-glass">
        <h1 className="font-display text-4xl text-gold-400">{t('ziwei.title')}</h1>
        <p className="mt-2 text-white/70">{t('ziwei.subtitle')}</p>

        {/* Wizard Steps */}
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

        {/* Components */}
        <ZiweiForm
          form={form}
          onChange={updateField}
          onSubmit={handleSubmit}
          loading={loading}
          saveLoading={saveLoading}
          errors={errors}
          onReset={handleStartOver}
        />

        {status && (
          <div className={`mt-4 rounded-xl px-4 py-2 ${statusStyle}`} data-testid="ziwei-status">
            {status.message}
          </div>
        )}

        {result && (
          <>
            <ZiweiChart result={result} />
            <ZiweiAiSection
              onInterpret={requestAiConfirm}
              onSave={handleSave}
              aiLoading={aiLoading}
              saveLoading={saveLoading}
              aiResult={aiResult}
            />
          </>
        )}
      </div>
    </main>
  );
}
