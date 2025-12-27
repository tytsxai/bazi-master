import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import Breadcrumbs from '../components/Breadcrumbs';
import { getPreferredAiProvider } from '../utils/aiProvider';
import { readApiErrorMessage } from '../utils/apiError';

export default function Iching() {
  const { t } = useTranslation();
  const { token, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [numbers, setNumbers] = useState({ first: '', second: '', third: '' });
  const [question, setQuestion] = useState('');
  const [divination, setDivination] = useState(null);
  const [hexagrams, setHexagrams] = useState([]);
  const [filter, setFilter] = useState('');
  const [numberErrors, setNumberErrors] = useState({});
  const [status, setStatus] = useState(null);
  const [aiResult, setAiResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
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
  const [confirmAiOpen, setConfirmAiOpen] = useState(false);
  const [confirmDeleteRecord, setConfirmDeleteRecord] = useState(null);
  const confirmAiCancelRef = useRef(null);
  const confirmDeleteCancelRef = useRef(null);
  const deletingHistoryIdsRef = useRef(new Set());

  useEffect(() => {
    if (confirmAiOpen) {
      confirmAiCancelRef.current?.focus();
    }
    if (confirmDeleteRecord) {
      confirmDeleteCancelRef.current?.focus();
    }
  }, [confirmAiOpen, confirmDeleteRecord]);

  useEffect(() => {
    let isMounted = true;
    fetch('/api/iching/hexagrams')
      .then(async (res) => {
        if (!res.ok) {
          const message = await readApiErrorMessage(res, t('iching.loadingHexagrams'));
          throw new Error(message);
        }
        return res.json();
      })
      .then((data) => {
        if (isMounted) setHexagrams(data.hexagrams || []);
      })
      .catch(() => {
        if (isMounted) setStatus({ type: 'error', message: t('iching.loadingHexagrams') });
      });
    return () => { isMounted = false; };
  }, [t]);

  const loadHistory = async () => {
    if (!token) return;
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/iching/history', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const message = await readApiErrorMessage(res, t('iching.historyLoadError'));
        throw new Error(message);
      }
      const data = await res.json();
      setHistory(data.records || []);
    } catch (error) {
      console.error(error);
      setStatus({ type: 'error', message: t('iching.historyLoadError') });
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

  const filteredHexagrams = useMemo(() => {
    if (!filter.trim()) return hexagrams;
    const term = filter.trim().toLowerCase();
    return hexagrams.filter((hex) => {
      const name = `${hex.name} ${hex.title || ''}`.toLowerCase();
      return name.includes(term);
    });
  }, [filter, hexagrams]);

  const getNumberErrors = (values) => {
    const nextErrors = {};
    ['first', 'second', 'third'].forEach((field) => {
      const rawValue = values[field];
      if (rawValue === '' || rawValue === null || rawValue === undefined) {
        nextErrors[field] = t('iching.errors.numberRequired');
        return;
      }
      const parsed = Number(rawValue);
      if (!Number.isFinite(parsed)) {
        nextErrors[field] = t('iching.errors.numberInvalid');
      } else if (parsed < 1) {
        nextErrors[field] = t('iching.errors.numberMin');
      }
    });
    return nextErrors;
  };

  const getFirstErrorMessage = (nextErrors) => {
    const firstMessage = Object.values(nextErrors).find((value) => typeof value === 'string' && value.trim());
    return firstMessage || t('iching.errors.correctFields');
  };

  const numberErrorAnnouncement =
    Object.keys(numberErrors).length > 0 ? getFirstErrorMessage(numberErrors) : '';

  const updateNumber = (field) => (event) => {
    const value = event.target.value;
    setNumbers((prev) => {
      const next = { ...prev, [field]: value };
      setNumberErrors((prevErrors) => {
        if (!prevErrors || !prevErrors[field]) return prevErrors;
        const nextErrors = getNumberErrors(next);
        if (!nextErrors[field]) {
          const trimmed = { ...prevErrors };
          delete trimmed[field];
          return trimmed;
        }
        return prevErrors;
      });
      return next;
    });
  };

  const handleDivine = async (event) => {
    event.preventDefault();
    setStatus(null);
    setAiResult(null);

    const nextErrors = getNumberErrors(numbers);
    setNumberErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setStatus({ type: 'error', message: getFirstErrorMessage(nextErrors) });
      return;
    }

    const parsed = [numbers.first, numbers.second, numbers.third].map((value) => Number(value));
    setLoading(true);
    try {
      const res = await fetch('/api/iching/divine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'number', numbers: parsed })
      });
      if (!res.ok) {
        const message = await readApiErrorMessage(res, t('iching.saveFailed'));
        throw new Error(message);
      }
      const data = await res.json();
      setDivination(data);
      setStatus({ type: 'success', message: t('iching.revealed') });
    } catch (error) {
      setStatus({ type: 'error', message: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleTimeDivine = async () => {
    setStatus(null);
    setAiResult(null);
    setNumberErrors({});
    setLoading(true);

    try {
      const res = await fetch('/api/iching/divine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'time' })
      });
      if (!res.ok) {
        const message = await readApiErrorMessage(res, t('iching.saveFailed'));
        throw new Error(message);
      }
      const data = await res.json();
      setDivination(data);
      setStatus({ type: 'success', message: t('iching.timeRevealed') });
    } catch (error) {
      setStatus({ type: 'error', message: error.message });
    } finally {
      setLoading(false);
    }
  };

  const redirectToAuth = (mode) => {
    const redirectPath = `${location.pathname}${location.search || ''}${location.hash || ''}`;
    const params = new URLSearchParams({ next: redirectPath });
    const target = `/${mode}?${params.toString()}`;
    navigate(target, { state: { from: redirectPath } });
    window.setTimeout(() => {
      const currentPath = `${window.location.pathname}${window.location.search || ''}${window.location.hash || ''}`;
      if (currentPath !== target) {
        window.location.assign(target);
      }
    }, 50);
  };

  const handleAiInterpret = async () => {
    if (!isAuthenticated) {
      setStatus({ type: 'error', message: t('iching.loginRequiredAi') });
      redirectToAuth('register');
      return;
    }
    if (!divination?.hexagram) {
      setStatus({ type: 'error', message: t('iching.divineFirst') });
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
          type: 'iching_ai_request',
          token,
          provider,
          payload: {
            hexagram: divination.hexagram,
            changingLines: divination.changingLines,
            resultingHexagram: divination.resultingHexagram,
            method: divination.method,
            timeContext: divination.timeContext,
            userQuestion: question
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
          setStatus({ type: 'success', message: t('iching.revealed') });
          closeAiSocket(1000, 'Stream complete');
          return;
        }
        if (message?.type === 'error') {
          wsStatusRef.current.errored = true;
          setAiLoading(false);
          setStatus({ type: 'error', message: message.message || t('iching.saveFailed') });
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
    if (!isAuthenticated) {
      setStatus({ type: 'error', message: t('iching.loginRequiredAi') });
      redirectToAuth('register');
      return;
    }
    if (!divination?.hexagram) {
      setStatus({ type: 'error', message: t('iching.divineFirst') });
      return;
    }
    setConfirmAiOpen(true);
  };

  const handleSave = async () => {
    if (!isAuthenticated) {
      setStatus({ type: 'error', message: t('iching.loginRequiredSave') });
      redirectToAuth('register');
      return;
    }
    if (!divination?.hexagram) {
      setStatus({ type: 'error', message: t('iching.divineFirstSave') });
      return;
    }
    if (saveLoading) return;
    setSaveLoading(true);
    setStatus(null);
    try {
      const res = await fetch('/api/iching/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          method: divination.method,
          numbers: divination.numbers,
          hexagram: divination.hexagram,
          resultingHexagram: divination.resultingHexagram,
          changingLines: divination.changingLines,
          timeContext: divination.timeContext,
          userQuestion: question,
          aiInterpretation: aiResult,
        }),
      });
      if (!res.ok) {
        const message = await readApiErrorMessage(res, t('iching.saveFailed'));
        throw new Error(message);
      }
      const data = await res.json();
      if (data.record) {
        setHistory((prev) => [data.record, ...prev]);
      } else {
        await loadHistory();
      }
      setStatus({ type: 'success', message: t('iching.saveSuccess') });
    } catch (error) {
      setStatus({ type: 'error', message: error.message || t('iching.saveFailed') });
    } finally {
      setSaveLoading(false);
    }
  };

  const handleDeleteHistory = async (recordId) => {
    if (!token) return;
    if (deletingHistoryIdsRef.current.has(recordId)) return;
    deletingHistoryIdsRef.current.add(recordId);
    const current = history.find((record) => record.id === recordId);
    setHistory((prev) => prev.filter((record) => record.id !== recordId));
    let responseStatus = null;
    try {
      const res = await fetch(`/api/iching/history/${recordId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      responseStatus = res.status;
      if (res.status === 404) {
        return;
      }
      if (!res.ok) {
        const message = await readApiErrorMessage(res, t('history.recordLoadError'));
        throw new Error(message);
      }
    } catch (error) {
      console.error(error);
      if (responseStatus !== 404 && current) {
        setHistory((prev) => (
          prev.some((record) => record.id === recordId) ? prev : [current, ...prev]
        ));
      }
    } finally {
      deletingHistoryIdsRef.current.delete(recordId);
    }
  };

  const requestDeleteConfirm = (record) => {
    if (!record) return;
    setConfirmDeleteRecord(record);
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteRecord) return;
    const recordId = confirmDeleteRecord.id;
    setConfirmDeleteRecord(null);
    await handleDeleteHistory(recordId);
  };

  const statusStyle =
    status?.type === 'error'
      ? 'border-rose-400/40 bg-rose-500/10 text-rose-100'
      : status?.type === 'info'
        ? 'border-blue-400/40 bg-blue-500/10 text-blue-100'
        : 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100';

  const renderLines = (hexagram, changingLines = []) => {
    if (!hexagram?.lines) return null;
    const lineItems = hexagram.lines.map((line, index) => ({
      line,
      number: index + 1
    })).reverse();

    return (
      <div className="flex flex-col gap-3">
        {lineItems.map((item) => {
          const isChanging = changingLines.includes(item.number);
          return (
            <div key={`${hexagram.id}-${item.number}`} className="flex items-center gap-3">
              <div className={`flex-1 ${isChanging ? 'shadow-[0_0_12px_rgba(212,175,55,0.35)]' : ''}`}>
                {item.line === 1 ? (
                  <div className={`h-2 rounded-full ${isChanging ? 'bg-gold-400' : 'bg-white/80'}`} />
                ) : (
                  <div className="flex gap-2">
                    <div className={`h-2 flex-1 rounded-full ${isChanging ? 'bg-gold-400' : 'bg-white/60'}`} />
                    <div className={`h-2 flex-1 rounded-full ${isChanging ? 'bg-gold-400' : 'bg-white/60'}`} />
                  </div>
                )}
              </div>
              <span className="text-xs text-white/50">{t('iching.line')} {item.number}</span>
            </div>
          );
        })}
      </div>
    );
  };

  const formatTimeContext = (context) => {
    if (!context) return null;
    const pad = (value) => String(value).padStart(2, '0');
    return `${context.year}-${pad(context.month)}-${pad(context.day)} ${pad(context.hour)}:${pad(context.minute)}`;
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
            aria-labelledby="iching-ai-title"
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-950/95 p-6 text-white shadow-2xl backdrop-blur"
          >
            <h2 id="iching-ai-title" className="text-lg font-semibold text-white">
              {t('iching.aiConfirmTitle')}
            </h2>
            <p className="mt-2 text-sm text-white/70">
              {t('iching.aiConfirmDesc')}
            </p>
            <div className="mt-6 flex flex-wrap gap-3 sm:justify-end">
              <button
                ref={confirmAiCancelRef}
                type="button"
                onClick={() => setConfirmAiOpen(false)}
                className="rounded-full border border-white/20 px-4 py-2 text-xs uppercase tracking-[0.2em] text-white/70 transition hover:border-white/40 hover:text-white"
              >
                {t('profile.cancel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmAiOpen(false);
                  handleAiInterpret();
                }}
                className="rounded-full border border-purple-400/40 bg-purple-500/10 px-4 py-2 text-xs uppercase tracking-[0.2em] text-purple-100 transition hover:border-purple-300 hover:text-purple-200"
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
            aria-labelledby="iching-delete-title"
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-950/95 p-6 text-white shadow-2xl backdrop-blur"
          >
            <h2 id="iching-delete-title" className="text-lg font-semibold text-white">
              {t('iching.deleteConfirmTitle')}
            </h2>
            <p className="mt-2 text-sm text-white/70">
              {t('iching.deleteConfirmDesc')}
            </p>
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-white/70">
              {confirmDeleteRecord.userQuestion || t('iching.historySubtitle')}
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
                {t('favorites.remove')}
              </button>
            </div>
          </div>
        </div>
      )}
      <section className="grid gap-8 lg:grid-cols-[1.2fr_0.9fr]">
        <div className="glass-card rounded-3xl border border-white/10 p-8 shadow-glass">
          <h1 className="font-display text-3xl text-gold-400">{t('iching.title')}</h1>
          <p className="mt-2 text-sm text-white/70">
            {t('iching.subtitle')}
          </p>
          <div className="sr-only" role="alert" aria-live="assertive">
            {numberErrorAnnouncement}
          </div>

          <form onSubmit={handleDivine} className="mt-6 grid gap-4">
            <div className="grid gap-4 md:grid-cols-3">
              <label className="text-sm text-white/80">
                {t('iching.firstNumber')}
                <input
                  type="number"
                  min="1"
                  value={numbers.first}
                  onChange={updateNumber('first')}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-white"
                  placeholder="12"
                  required
                  aria-invalid={Boolean(numberErrors.first)}
                  aria-describedby={numberErrors.first ? 'iching-first-error' : undefined}
                />
                {numberErrors.first && (
                  <span id="iching-first-error" className="mt-2 block text-xs text-rose-200">
                    {numberErrors.first}
                  </span>
                )}
              </label>
              <label className="text-sm text-white/80">
                {t('iching.secondNumber')}
                <input
                  type="number"
                  min="1"
                  value={numbers.second}
                  onChange={updateNumber('second')}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-white"
                  placeholder="27"
                  required
                  aria-invalid={Boolean(numberErrors.second)}
                  aria-describedby={numberErrors.second ? 'iching-second-error' : undefined}
                />
                {numberErrors.second && (
                  <span id="iching-second-error" className="mt-2 block text-xs text-rose-200">
                    {numberErrors.second}
                  </span>
                )}
              </label>
              <label className="text-sm text-white/80">
                {t('iching.thirdNumber')}
                <input
                  type="number"
                  min="1"
                  value={numbers.third}
                  onChange={updateNumber('third')}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-white"
                  placeholder="44"
                  required
                  aria-invalid={Boolean(numberErrors.third)}
                  aria-describedby={numberErrors.third ? 'iching-third-error' : undefined}
                />
                {numberErrors.third && (
                  <span id="iching-third-error" className="mt-2 block text-xs text-rose-200">
                    {numberErrors.third}
                  </span>
                )}
              </label>
            </div>

            <label className="text-sm text-white/80">
              {t('iching.question')}
              <input
                type="text"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-white"
                placeholder={t('iching.questionPlaceholder')}
              />
            </label>

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={loading || saveLoading}
                className="rounded-full bg-gold-400 px-8 py-2 font-bold text-mystic-900 shadow-lg transition hover:scale-105 disabled:opacity-50"
              >
                {loading ? t('iching.divining') : t('iching.divineNumbers')}
              </button>
              <button
                type="button"
                onClick={handleTimeDivine}
                disabled={loading || saveLoading}
                className="rounded-full border border-gold-400/50 px-6 py-2 text-sm font-semibold text-gold-200 transition hover:bg-gold-400/10 disabled:opacity-50"
              >
                {t('iching.divineTime')}
              </button>
            </div>
          </form>

          {status && (
            <div
              role={status.type === 'error' ? 'alert' : 'status'}
              aria-live={status.type === 'error' ? 'assertive' : 'polite'}
              className={`mt-6 rounded-2xl border px-4 py-3 text-sm ${statusStyle}`}
            >
              {status.message}
            </div>
          )}

          {!isAuthenticated && (
            <section className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-6">
              <h2 className="font-display text-2xl text-white">{t('protected.title')}</h2>
              <p className="mt-2 text-sm text-white/70">
                {t('iching.loginRequiredSave')}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => redirectToAuth('register')}
                  className="rounded-full bg-gold-400 px-6 py-2 text-sm font-semibold text-mystic-900 shadow-lg transition hover:scale-105"
                >
                  {t('login.registerSubmit')}
                </button>
                <button
                  type="button"
                  onClick={() => redirectToAuth('login')}
                  className="rounded-full border border-white/30 px-6 py-2 text-sm font-semibold text-white/80 transition hover:border-white/50 hover:text-white"
                >
                  {t('nav.login')}
                </button>
              </div>
            </section>
          )}

          {divination?.hexagram && (
            <div className="mt-8 grid gap-6 md:grid-cols-2">
              <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <h2 className="font-display text-xl text-white">{t('iching.primaryHexagram')}</h2>
                <p className="mt-1 text-sm text-white/70">{divination.hexagram.name}</p>
                <p className="text-xs text-white/50">{divination.hexagram.title}</p>
                {divination.method === 'time' && divination.timeContext && (
                  <p className="mt-2 text-xs text-white/60">
                    {t('iching.timeUsed')}: {formatTimeContext(divination.timeContext)}
                  </p>
                )}
                <div className="mt-4">{renderLines(divination.hexagram, divination.changingLines)}</div>
                <div className="mt-4 text-xs text-white/60" data-testid="iching-changing-lines">
                  {t('iching.changingLines')}: {divination.changingLines?.length ? divination.changingLines.join(', ') : t('iching.none')}
                </div>
              </section>

              <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <h2 className="font-display text-xl text-white">{t('iching.resultingHexagram')}</h2>
                {divination.resultingHexagram ? (
                  <>
                    <p className="mt-1 text-sm text-white/70">{divination.resultingHexagram.name}</p>
                    <p className="text-xs text-white/50">{divination.resultingHexagram.title}</p>
                    <div className="mt-4">{renderLines(divination.resultingHexagram)}</div>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-white/60">{t('iching.noResulting')}</p>
                )}
              </section>
            </div>
          )}

          {divination?.hexagram && (
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={requestAiConfirm}
                disabled={aiLoading}
                className="rounded-full bg-indigo-600 px-8 py-3 font-bold text-white shadow-lg transition hover:bg-indigo-500 disabled:opacity-60"
              >
                {aiLoading ? t('iching.interpreting') : t('iching.aiInterpret')}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saveLoading}
                className="rounded-full border border-emerald-400/40 px-8 py-3 text-sm font-semibold text-emerald-100 transition hover:border-emerald-300 hover:text-white disabled:opacity-60"
              >
                {saveLoading ? t('profile.saving') : t('bazi.saveRecord')}
              </button>
            </div>
          )}

          {aiResult && (
            <section className="mt-10 rounded-3xl border border-purple-500/30 bg-purple-900/20 p-8">
              <h3 className="font-display text-2xl text-purple-300">{t('iching.oracleReflection')}</h3>
              <div
                data-testid="iching-ai-result"
                className="mt-4 prose prose-invert max-w-none whitespace-pre-wrap text-white/90"
              >
                {aiResult}
              </div>
            </section>
          )}
          {isAuthenticated && (
            <section className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-display text-2xl text-white">{t('iching.historyTitle')}</h3>
                  <p className="text-sm text-white/60">{t('iching.historySubtitle')}</p>
                </div>
                <div className="text-xs text-white/60">
                  {t('iching.hexagramsLoaded', { count: history.length })}
                </div>
              </div>
              {historyLoading ? (
                <p className="mt-4 text-sm text-white/60">{t('history.recordLoading')}</p>
              ) : history.length ? (
                <div className="mt-4 grid gap-4">
                  {history.map((record) => (
                    <div key={record.id} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm text-white">
                            {record.hexagram?.name} → {record.resultingHexagram?.name || t('iching.none')}
                          </p>
                          <p className="mt-1 text-xs text-white/60">
                            {t('iching.changingLines')}: {record.changingLines?.length ? record.changingLines.join(', ') : t('iching.none')} · {t('iching.method')}: {record.method}
                          </p>
                          {record.userQuestion && (
                            <p className="mt-2 text-xs text-white/70">{t('iching.question')}: {record.userQuestion}</p>
                          )}
                          <p className="mt-2 text-[0.7rem] uppercase tracking-[0.2em] text-white/40">
                            {t('iching.savedAt', { date: new Date(record.createdAt).toLocaleDateString() })}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => requestDeleteConfirm(record)}
                          className="rounded-full border border-rose-400/40 px-3 py-1 text-xs text-rose-100 transition hover:border-rose-300 hover:text-rose-200"
                        >
                          {t('favorites.remove')}
                        </button>
                      </div>
                      {record.aiInterpretation && (
                        <div className="mt-3 rounded-2xl border border-purple-400/30 bg-purple-900/20 p-3 text-xs text-white/80">
                          {record.aiInterpretation}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-white/60">{t('iching.noHistory')}</p>
              )}
            </section>
          )}
        </div>

        <aside className="glass-card rounded-3xl border border-white/10 p-8 shadow-glass">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
            <h2 className="font-display text-xl text-white">{t('zodiac.compatibilityTitle')}</h2>
            <p className="mt-2 text-sm text-white/70">
              {t('zodiac.compatibilitySubtitle')}
            </p>
            <Link
              to="/zodiac#compatibility"
              className="mt-4 inline-flex rounded-full bg-indigo-600 px-5 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white transition hover:scale-105"
            >
              {t('zodiac.checkCompatibility')}
            </Link>
          </div>
          <div className="mt-6 flex items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl text-white">{t('iching.hexagramLibrary')}</h2>
              <p className="text-sm text-white/60">{t('iching.hexagramsLoaded', { count: hexagrams.length })}</p>
            </div>
            <label htmlFor="iching-search" className="sr-only">
              {t('iching.searchPlaceholder')}
            </label>
            <input
              id="iching-search"
              type="text"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder={t('iching.searchPlaceholder')}
              className="w-32 rounded-xl border border-white/10 bg-white/10 px-3 py-1 text-xs text-white"
            />
          </div>

          <div className="mt-6 grid max-h-[520px] gap-3 overflow-y-auto pr-2">
            {filteredHexagrams.map((hex) => (
              <div key={hex.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between text-xs text-white/60">
                  <span>#{hex.id}</span>
                  <span>{hex.title}</span>
                </div>
                <h3 className="mt-2 text-sm font-semibold text-white">{hex.name}</h3>
                <p className="mt-1 text-xs text-white/60">{hex.summary}</p>
              </div>
            ))}
            {!filteredHexagrams.length && (
              <p className="text-sm text-white/60">{t('iching.noMatches')}</p>
            )}
          </div>
        </aside>
      </section>
    </main>
  );
}
