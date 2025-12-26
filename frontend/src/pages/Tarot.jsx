import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import { ZODIAC_PERIODS, ZODIAC_SIGNS } from '../data/zodiac.js';
import { getPreferredAiProvider } from '../utils/aiProvider.js';
import { readApiErrorMessage } from '../utils/apiError.js';

export default function Tarot() {
  const { token, isAuthenticated } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [spread, setSpread] = useState(null);
  const [spreadType, setSpreadType] = useState('SingleCard');
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isInterpreting, setIsInterpreting] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [userQuestion, setUserQuestion] = useState('');
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
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
  const [deck, setDeck] = useState([]);
  const [deckLoading, setDeckLoading] = useState(false);
  const [deckError, setDeckError] = useState('');
  const [showDeck, setShowDeck] = useState(false);
  const [zodiacSign, setZodiacSign] = useState('aries');
  const [zodiacPeriod, setZodiacPeriod] = useState('weekly');
  const [zodiacHoroscope, setZodiacHoroscope] = useState(null);
  const [zodiacStatus, setZodiacStatus] = useState(null);
  const [zodiacLoading, setZodiacLoading] = useState(false);
  const zodiacRequestRef = useRef(0);
  const [confirmAiOpen, setConfirmAiOpen] = useState(false);
  const [confirmDeleteRecord, setConfirmDeleteRecord] = useState(null);
  const confirmAiCancelRef = useRef(null);
  const confirmDeleteCancelRef = useRef(null);
  const deletingHistoryIdsRef = useRef(new Set());
  const isGuest = !isAuthenticated;

  useEffect(() => {
    if (confirmAiOpen) {
      confirmAiCancelRef.current?.focus();
    }
    if (confirmDeleteRecord) {
      confirmDeleteCancelRef.current?.focus();
    }
  }, [confirmAiOpen, confirmDeleteRecord]);

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

  const celticCrossPositions = useMemo(() => ([
    { position: 1, label: 'Present', meaning: 'Your current situation or heart of the matter.' },
    { position: 2, label: 'Challenge', meaning: 'The obstacle, tension, or crossing influence.' },
    { position: 3, label: 'Past', meaning: 'Recent past events or influences fading.' },
    { position: 4, label: 'Future', meaning: 'Near-future direction or next steps.' },
    { position: 5, label: 'Above', meaning: 'Conscious goals, aspirations, or ideals.' },
    { position: 6, label: 'Below', meaning: 'Subconscious roots, foundations, or hidden motives.' },
    { position: 7, label: 'Advice', meaning: 'Guidance on how to respond or proceed.' },
    { position: 8, label: 'External', meaning: 'Outside influences, people, or environment.' },
    { position: 9, label: 'Hopes/Fears', meaning: 'Inner desires, anxieties, or expectations.' },
    { position: 10, label: 'Outcome', meaning: 'Likely outcome if current course continues.' }
  ]), []);

  const spreadLabel = useMemo(() => {
    if (spreadType === 'ThreeCard') return 'Three Card';
    if (spreadType === 'CelticCross') return 'Celtic Cross';
    return 'Single Card';
  }, [spreadType]);

  const loadHistory = async () => {
    if (!token) return;
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/tarot/history', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const message = await readApiErrorMessage(res, 'Unable to load history.');
        throw new Error(message);
      }
      const data = await res.json();
      setHistory(data.records || []);
    } catch (error) {
      console.error(error);
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

  useEffect(() => {
    if (!isAuthenticated) {
      setSpreadType('SingleCard');
    }
  }, [isAuthenticated]);

  const handleDraw = async () => {
    if (loading) return;
    setLoading(true);
    setStatus(null);
    setAiResult(null);

    try {
      const headers = { 'Content-Type': 'application/json' };
      let authToken = token;
      if (!authToken) {
        try {
          authToken = localStorage.getItem('bazi_token');
        } catch {
          authToken = null;
        }
      }
      if (authToken) headers.Authorization = `Bearer ${authToken}`;
      const res = await fetch('/api/tarot/draw', {
        method: 'POST',
        headers,
        body: JSON.stringify({ spreadType })
      });
      if (!res.ok) {
        const message = await readApiErrorMessage(res, 'Draw failed');
        throw new Error(message);
      }
      const data = await res.json();
      setSpread(data);
      if (isGuest) {
        setStatus({ type: 'success', message: 'Guest draw completed. Log in to unlock spreads & AI.' });
      }
    } catch (e) {
      setStatus({ type: 'error', message: e.message || 'Draw failed' });
    } finally {
      setLoading(false);
    }
  };

  const handleInterpret = async () => {
    if (!spread) return;
    if (!isAuthenticated) {
      setStatus({ type: 'error', message: 'Create an account to unlock AI interpretation.' });
      redirectToAuth('register');
      return;
    }
    if (isInterpreting) return;
    closeAiSocket();
    wsStatusRef.current = { done: false, errored: false };
    setAiResult('');
    setIsInterpreting(true);
    setStatus({ type: 'info', message: 'Consulting the oracle...' });

    try {
      const ws = new WebSocket(resolveWsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        const provider = getPreferredAiProvider();
        let authToken = token;
        if (!authToken) {
          try {
            authToken = localStorage.getItem('bazi_token');
          } catch {
            authToken = null;
          }
        }
        const message = {
          type: 'tarot_ai_request',
          token: authToken,
          provider,
          payload: {
            spreadType: spread.spreadType,
            cards: spread.cards,
            userQuestion
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
          setIsInterpreting(false);
          setStatus({ type: 'success', message: 'Interpretation received.' });
          closeAiSocket(1000, 'Stream complete');
          void loadHistory();
          return;
        }
        if (message?.type === 'error') {
          wsStatusRef.current.errored = true;
          setIsInterpreting(false);
          setStatus({ type: 'error', message: message.message || 'AI Interpretation failed.' });
          closeAiSocket(1011, 'AI error');
        }
      };

      ws.onerror = () => {
        if (!isMountedRef.current) return;
        wsStatusRef.current.errored = true;
        setIsInterpreting(false);
        setStatus({ type: 'error', message: 'WebSocket connection error.' });
      };

      ws.onclose = () => {
        if (!isMountedRef.current) return;
        const { done, errored } = wsStatusRef.current;
        if (!done && !errored) {
          setStatus({ type: 'error', message: 'Connection closed unexpectedly.' });
        }
        setIsInterpreting(false);
        wsRef.current = null;
      };
    } catch (e) {
      setIsInterpreting(false);
      setStatus({ type: 'error', message: e.message || 'Connection error' });
    }
  };

  const requestAiConfirm = () => {
    if (!spread) return;
    if (!isAuthenticated) {
      setStatus({ type: 'error', message: 'Create an account to unlock AI interpretation.' });
      redirectToAuth('register');
      return;
    }
    if (isInterpreting) return;
    setConfirmAiOpen(true);
  };

  const handleDeleteHistory = async (recordId) => {
    if (!token) return;
    const current = history.find((record) => record.id === recordId);
    setHistory((prev) => prev.filter((record) => record.id !== recordId));
    try {
      const res = await fetch(`/api/tarot/history/${recordId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const message = await readApiErrorMessage(res, 'Delete failed.');
        throw new Error(message);
      }
    } catch (error) {
      console.error(error);
      if (current) {
        setHistory((prev) => [current, ...prev]);
      }
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

  const handleLoadDeck = async () => {
    if (deckLoading) return;
    setDeckLoading(true);
    setDeckError('');
    try {
      const res = await fetch('/api/tarot/cards');
      if (!res.ok) {
        const message = await readApiErrorMessage(res, 'Unable to load deck');
        throw new Error(message);
      }
      const data = await res.json();
      setDeck(data.cards || []);
      setShowDeck(true);
    } catch (error) {
      setDeckError(error.message || 'Unable to load deck');
    } finally {
      setDeckLoading(false);
    }
  };

  const handleFetchZodiacWeekly = async () => {
    const period = zodiacPeriod || 'weekly';
    const requestId = zodiacRequestRef.current + 1;
    zodiacRequestRef.current = requestId;
    setZodiacLoading(true);
    setZodiacStatus(null);
    setZodiacHoroscope(null);

    try {
      const res = await fetch(`/api/zodiac/${zodiacSign}/horoscope?period=${period}`);
      if (!res.ok) {
        const message = await readApiErrorMessage(res, 'Unable to fetch horoscope.');
        throw new Error(message);
      }
      const data = await res.json();
      if (requestId !== zodiacRequestRef.current) return;
      setZodiacHoroscope(data);
      setZodiacStatus({
        type: 'success',
        message: `${data.sign.name} ${data.period} horoscope loaded.`
      });
    } catch (error) {
      if (requestId !== zodiacRequestRef.current) return;
      setZodiacStatus({ type: 'error', message: error.message });
    } finally {
      if (requestId === zodiacRequestRef.current) {
        setZodiacLoading(false);
      }
    }
  };

  const getCardSlotClass = (position) => {
    if (spread?.spreadType !== 'CelticCross') return '';
    switch (position) {
      case 1:
        return 'col-start-3 row-start-2';
      case 2:
        return 'col-start-4 row-start-2';
      case 3:
        return 'col-start-2 row-start-2';
      case 4:
        return 'col-start-3 row-start-3';
      case 5:
        return 'col-start-3 row-start-1';
      case 6:
        return 'col-start-3 row-start-4';
      case 7:
        return 'col-start-5 row-start-1';
      case 8:
        return 'col-start-5 row-start-2';
      case 9:
        return 'col-start-5 row-start-3';
      case 10:
        return 'col-start-5 row-start-4';
      default:
        return '';
    }
  };

  const getCardImage = (card) =>
    card?.imageUrl || card?.image || card?.image_url || card?.imagePath || card?.image_path;

  const spreadGridClass =
    spread?.spreadType === 'CelticCross'
      ? 'grid-cols-5 grid-rows-4 gap-4'
      : spread?.spreadType === 'ThreeCard'
        ? 'grid-cols-3 gap-6'
        : 'grid-cols-1 gap-6';

  const statusStyle =
    status?.type === 'error' ? 'text-rose-200 bg-rose-900/50' :
      status?.type === 'success' ? 'text-emerald-200 bg-emerald-900/50' :
        'text-blue-200 bg-blue-900/50';

  return (
    <main id="main-content" tabIndex={-1} className="responsive-container pb-16">
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
            aria-labelledby="tarot-ai-title"
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-950/95 p-6 text-white shadow-2xl backdrop-blur"
          >
            <h2 id="tarot-ai-title" className="text-lg font-semibold text-white">
              Request AI interpretation?
            </h2>
            <p className="mt-2 text-sm text-white/70">
              This sends your spread details for an AI reading. Continue when you are ready.
            </p>
            <div className="mt-6 flex flex-wrap gap-3 sm:justify-end">
              <button
                ref={confirmAiCancelRef}
                type="button"
                onClick={() => setConfirmAiOpen(false)}
                className="rounded-full border border-white/20 px-4 py-2 text-xs uppercase tracking-[0.2em] text-white/70 transition hover:border-white/40 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmAiOpen(false);
                  handleInterpret();
                }}
                className="rounded-full border border-purple-400/40 bg-purple-500/10 px-4 py-2 text-xs uppercase tracking-[0.2em] text-purple-100 transition hover:border-purple-300 hover:text-purple-200"
              >
                Request AI
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
            aria-labelledby="tarot-delete-title"
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-950/95 p-6 text-white shadow-2xl backdrop-blur"
          >
            <h2 id="tarot-delete-title" className="text-lg font-semibold text-white">
              Delete this reading?
            </h2>
            <p className="mt-2 text-sm text-white/70">
              This removes the saved reading from your history.
            </p>
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-white/70">
              {confirmDeleteRecord.userQuestion || confirmDeleteRecord.spreadType || 'Saved reading'}
            </div>
            <div className="mt-6 flex flex-wrap gap-3 sm:justify-end">
              <button
                ref={confirmDeleteCancelRef}
                type="button"
                onClick={() => setConfirmDeleteRecord(null)}
                className="rounded-full border border-white/20 px-4 py-2 text-xs uppercase tracking-[0.2em] text-white/70 transition hover:border-white/40 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="rounded-full border border-rose-400/40 bg-rose-500/10 px-4 py-2 text-xs uppercase tracking-[0.2em] text-rose-100 transition hover:border-rose-300 hover:text-rose-200"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="glass-card mx-auto rounded-3xl border border-white/10 p-8 shadow-glass">
        <h1 className="font-display text-4xl text-gold-400">Tarot Sanctuary</h1>
        <p className="mt-2 text-white/60">Focus on your question and choose a spread to reveal the story.</p>

        <section className="mt-8 rounded-3xl border border-indigo-500/30 bg-indigo-900/20 p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-display text-2xl text-indigo-200">Weekly Zodiac Snapshot</h2>
              <p className="text-sm text-white/60">
                Pull a weekly horoscope without leaving Tarot.
              </p>
            </div>
            <button
              type="button"
              onClick={handleFetchZodiacWeekly}
              disabled={zodiacLoading}
              className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-indigo-500 disabled:opacity-60"
            >
              {zodiacLoading ? 'Reading...' : `Get ${zodiacPeriod} Horoscope`}
            </button>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm text-white/70">
              Sign
              <select
                value={zodiacSign}
                onChange={(event) => setZodiacSign(event.target.value)}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-white"
              >
                {ZODIAC_SIGNS.map((sign) => (
                  <option key={sign.value} value={sign.value} className="bg-slate-900 text-white">
                    {sign.label} • {sign.range}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm text-white/70">
              Period
              <select
                value={zodiacPeriod}
                onChange={(event) => setZodiacPeriod(event.target.value)}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-white"
              >
                {ZODIAC_PERIODS.map((period) => (
                  <option key={period.value} value={period.value} className="bg-slate-900 text-white">
                    {period.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {zodiacStatus && (
            <div
              role={zodiacStatus.type === 'error' ? 'alert' : 'status'}
              aria-live={zodiacStatus.type === 'error' ? 'assertive' : 'polite'}
              className={`mt-4 rounded-2xl border px-4 py-2 text-sm ${
                zodiacStatus.type === 'error'
                  ? 'border-rose-400/40 bg-rose-500/10 text-rose-100'
                  : 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100'
              }`}
            >
              {zodiacStatus.message}
            </div>
          )}

          {zodiacHoroscope && (
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6 text-white/80">
              <div className="flex flex-col gap-1">
                <h3 className="font-display text-xl text-white">
                  {zodiacHoroscope.sign.name} {zodiacHoroscope.period.charAt(0).toUpperCase() + zodiacHoroscope.period.slice(1)} Horoscope
                </h3>
                <p className="text-xs text-white/60">
                  {zodiacHoroscope.range} • Generated {new Date(zodiacHoroscope.generatedAt).toLocaleString()}
                </p>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                  <div className="text-xs uppercase text-white/40">Overview</div>
                  <p className="mt-1 text-sm text-white/80">{zodiacHoroscope.horoscope.overview}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                  <div className="text-xs uppercase text-white/40">Love</div>
                  <p className="mt-1 text-sm text-white/80">{zodiacHoroscope.horoscope.love}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                  <div className="text-xs uppercase text-white/40">Career</div>
                  <p className="mt-1 text-sm text-white/80">{zodiacHoroscope.horoscope.career}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                  <div className="text-xs uppercase text-white/40">Wellness</div>
                  <p className="mt-1 text-sm text-white/80">{zodiacHoroscope.horoscope.wellness}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/70">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                  Lucky colors: {zodiacHoroscope.horoscope.lucky.colors.join(', ')}
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                  Lucky numbers: {zodiacHoroscope.horoscope.lucky.numbers.join(', ')}
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                  Mantra: {zodiacHoroscope.horoscope.mantra}
                </span>
              </div>
            </div>
          )}
        </section>

        <section className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-display text-2xl text-white">Zodiac Compatibility</h2>
              <p className="text-sm text-white/60">
                Jump to the Compatibility Compass to compare two signs.
              </p>
            </div>
            <Link
              to="/zodiac#compatibility"
              className="inline-flex items-center justify-center rounded-full bg-indigo-600 px-6 py-2 text-sm font-semibold text-white shadow-lg transition hover:scale-105"
            >
              Check Compatibility
            </Link>
          </div>
        </section>

        <div className="mt-6 flex flex-col gap-4 md:flex-row">
          <label htmlFor="tarot-question" className="sr-only">
            Your question (optional)
          </label>
          <input
            id="tarot-question"
            type="text"
            placeholder="What is your question? (Optional)"
            className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-white"
            value={userQuestion}
            onChange={e => setUserQuestion(e.target.value)}
          />
          <label htmlFor="tarot-spread" className="sr-only">
            Spread type
          </label>
          <select
            id="tarot-spread"
            value={spreadType}
            onChange={(event) => setSpreadType(event.target.value)}
            className="rounded-xl border border-white/10 bg-black/40 px-4 py-2 text-white"
          >
            <option value="SingleCard">Single Card</option>
            <option value="ThreeCard">Three Card</option>
            <option value="CelticCross">Celtic Cross</option>
          </select>
          {isGuest && (
            <span className="text-xs text-white/60">
              Guest mode: Single Card only
            </span>
          )}
          <button
            onClick={handleDraw}
            disabled={loading || isInterpreting}
            className="rounded-full bg-gold-400 px-8 py-2 font-bold text-mystic-900 shadow-lg transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Shuffling...' : `Draw ${spreadLabel}`}
          </button>
        </div>

        {status && (
          <div
            role={status.type === 'error' ? 'alert' : 'status'}
            aria-live={status.type === 'error' ? 'assertive' : 'polite'}
            className={`mt-4 rounded-xl px-4 py-2 ${statusStyle}`}
          >
            {status.message}
          </div>
        )}

        {!isAuthenticated && (
          <section className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-6">
            <h2 className="font-display text-2xl text-white">Unlock the full deck</h2>
            <p className="mt-2 text-sm text-white/70">
              Create an account to explore advanced spreads, save readings, and request AI interpretations.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => redirectToAuth('register')}
                className="rounded-full bg-gold-400 px-6 py-2 text-sm font-semibold text-mystic-900 shadow-lg transition hover:scale-105"
              >
                Create account
              </button>
              <button
                type="button"
                onClick={() => redirectToAuth('login')}
                className="rounded-full border border-white/30 px-6 py-2 text-sm font-semibold text-white/80 transition hover:border-white/50 hover:text-white"
              >
                Sign in
              </button>
            </div>
          </section>
        )}

        {spread && (
          <div className="mt-8">
            <h2 className="mb-4 font-display text-2xl text-white">Your Spread</h2>
            <div className={`grid place-items-center ${spreadGridClass}`}>
              {spread.cards.map((card) => {
                const cardImage = getCardImage(card);

                return (
                  <div
                    key={card.position}
                    data-testid="tarot-card"
                    className={`group relative aspect-[2/3] w-28 sm:w-32 md:w-36 perspective-1000 ${getCardSlotClass(card.position)}`}
                  >
                    <div className="relative h-full w-full transform-style-3d transition-transform duration-700 hover:rotate-y-180">
                      <div className="absolute h-full w-full rounded-xl border border-white/10 bg-indigo-900 shadow-xl backface-hidden flex items-center justify-center">
                        <span className="text-2xl text-white/20">🔮</span>
                      </div>

                      <div className="absolute h-full w-full rotate-y-180 rounded-xl border border-gold-400/50 bg-black/80 p-2 shadow-xl backface-hidden">
                        <div className="flex h-full flex-col items-center justify-between text-center">
                          <span className="text-[10px] text-gold-400">
                            {card.positionLabel || `Position ${card.position}`}
                          </span>
                          {card.positionMeaning && (
                            <span className="text-[9px] text-white/60">{card.positionMeaning}</span>
                          )}
                          {cardImage && (
                            <img
                              src={cardImage}
                              alt={card.name}
                              loading="lazy"
                              decoding="async"
                              className="h-20 w-full rounded-lg border border-white/10 object-cover"
                            />
                          )}
                          <div>
                            <div className="text-lg font-bold text-white">{card.name}</div>
                            {card.isReversed && <div className="text-xs text-rose-400 uppercase tracking-wider">Reversed</div>}
                          </div>
                          <p className="text-[10px] text-white/70 line-clamp-4">{card.isReversed ? card.meaningRev : card.meaningUp}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-8 flex justify-center">
              <button
                onClick={requestAiConfirm}
                disabled={isInterpreting}
                className="rounded-full bg-indigo-600 px-8 py-3 font-bold text-white shadow-lg transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                ✨ {isInterpreting ? 'Revealing...' : 'Reveal AI Meaning'}
              </button>
            </div>
          </div>
        )}

        {spread?.spreadType === 'CelticCross' && (
          <section className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-6">
            <h3 className="font-display text-2xl text-white">Celtic Cross Positions</h3>
            <p className="mt-2 text-sm text-white/60">Each position adds context to the story unfolding across the spread.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {(spread.spreadMeta?.positions || celticCrossPositions).map((position) => (
                <div key={position.position} className="rounded-2xl border border-white/10 bg-black/30 p-3">
                  <div className="text-xs uppercase tracking-[0.2em] text-gold-400">Position {position.position}</div>
                  <div className="text-sm font-semibold text-white">{position.label}</div>
                  <p className="mt-1 text-xs text-white/70">{position.meaning}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {aiResult && (
          <section className="mt-10 rounded-3xl border border-purple-500/30 bg-purple-900/20 p-8">
            <h3 className="font-display text-2xl text-purple-300">Often the cards whisper...</h3>
            <div className="mt-4 prose prose-invert max-w-none whitespace-pre-wrap text-white/90">
              {aiResult}
            </div>
          </section>
        )}

        {isAuthenticated && (
          <section className="mt-12 rounded-3xl border border-white/10 bg-white/5 p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-2xl text-white">Saved Readings</h3>
              <span className="text-xs text-white/60">
                {historyLoading ? 'Loading...' : `${history.length} entries`}
              </span>
            </div>
            <p className="mt-2 text-sm text-white/60">AI interpretations are automatically saved after each reading.</p>
            <div className="mt-6 space-y-4">
              {history.length === 0 && !historyLoading && (
                <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-white/50">
                  No readings saved yet. Complete an AI interpretation to begin a history trail.
                </div>
              )}
              {history.map((record) => (
                <article
                  key={record.id}
                  data-testid="tarot-history-entry"
                  className="rounded-2xl border border-white/10 bg-black/30 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-white/40">{record.spreadType}</p>
                      <h4 className="text-lg font-semibold text-white">
                        {record.userQuestion || 'General Reading'}
                      </h4>
                    </div>
                    <button
                      onClick={() => requestDeleteConfirm(record)}
                      className="rounded-full border border-rose-400/40 px-3 py-1 text-xs text-rose-200 transition hover:bg-rose-500/20"
                    >
                      Remove
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-white/50">
                    {new Date(record.createdAt).toLocaleString()}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/70">
                    {record.cards?.map((card) => (
                      <span key={`${record.id}-${card.position}`} className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                        {card.positionLabel || `#${card.position}`} · {card.name}
                      </span>
                    ))}
                  </div>
                  {record.aiInterpretation && (
                    <div className="mt-4 rounded-xl border border-purple-500/20 bg-purple-900/20 p-3 text-xs text-white/80">
                      {record.aiInterpretation}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
        )}

        <div className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl text-gold-300">Tarot Library</h2>
              <p className="mt-1 text-sm text-white/60">Browse the full 78-card deck.</p>
            </div>
            <button
              type="button"
              onClick={handleLoadDeck}
              disabled={deckLoading}
              className="rounded-full border border-gold-400/60 px-4 py-2 text-sm text-gold-200 transition hover:bg-gold-400/10 disabled:opacity-60"
            >
              {deckLoading ? 'Loading...' : deck.length ? 'Reload Deck' : 'Load Deck'}
            </button>
          </div>
          {deckError && (
            <p className="mt-3 text-sm text-rose-200" role="alert">
              {deckError}
            </p>
          )}
          {showDeck && (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {deck.map((card) => (
                <div key={card.id} className="rounded-xl border border-white/10 bg-black/40 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gold-200">{card.name} · {card.nameCN}</p>
                    <span className="text-xs text-white/40">#{card.id}</span>
                  </div>
                  <p className="mt-2 text-xs text-white/70">{card.meaningUp}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
