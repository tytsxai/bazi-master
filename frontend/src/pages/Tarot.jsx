import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import Breadcrumbs from '../components/Breadcrumbs';
import { getPreferredAiProvider } from '../utils/aiProvider';
import { readApiErrorMessage } from '../utils/apiError';
import logger from '../utils/logger';
import { sanitizeRedirectPath } from '../utils/redirect';

import TarotZodiac from '../components/tarot/TarotZodiac';
import TarotControls from '../components/tarot/TarotControls';
import TarotSpread from '../components/tarot/TarotSpread';
import TarotAiSection from '../components/tarot/TarotAiSection';
import TarotHistory from '../components/tarot/TarotHistory';
import TarotDeckLibrary from '../components/tarot/TarotDeckLibrary';
import Modal from '../components/ui/Modal';
import Button from '../components/ui/Button';

export default function Tarot() {
  const { t, i18n } = useTranslation();
  const isZh = i18n.language?.startsWith('zh');
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // State
  const [spread, setSpread] = useState(null);
  const [spreadType, setSpreadType] = useState('SingleCard');
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isInterpreting, setIsInterpreting] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [userQuestion, setUserQuestion] = useState('');

  // History
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Deck Library
  const [deck, setDeck] = useState([]);
  const [deckLoading, setDeckLoading] = useState(false);
  const [deckError, setDeckError] = useState('');
  const [showDeck, setShowDeck] = useState(false);

  // Zodiac
  const [zodiacSign, setZodiacSign] = useState('aries');
  const [zodiacPeriod, setZodiacPeriod] = useState('weekly');
  const [zodiacHoroscope, setZodiacHoroscope] = useState(null);
  const [zodiacStatus, setZodiacStatus] = useState(null);
  const [zodiacLoading, setZodiacLoading] = useState(false);
  const zodiacRequestRef = useRef(0);

  // Modals
  const [confirmAiOpen, setConfirmAiOpen] = useState(false);
  const [confirmDeleteRecord, setConfirmDeleteRecord] = useState(null);
  const confirmAiCancelRef = useRef(null);
  const confirmDeleteCancelRef = useRef(null);

  // AI / WS
  const wsRef = useRef(null);
  const wsStatusRef = useRef({ done: false, errored: false });
  const isMountedRef = useRef(true);

  const isGuest = !isAuthenticated;

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

  useEffect(() => {
    if (confirmAiOpen) confirmAiCancelRef.current?.focus();
    if (confirmDeleteRecord) confirmDeleteCancelRef.current?.focus();
  }, [confirmAiOpen, confirmDeleteRecord]);

  useEffect(() => {
    if (!isAuthenticated) setSpreadType('SingleCard');
  }, [isAuthenticated]);

  // Load History
  const loadHistory = async () => {
    if (!isAuthenticated) return;
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/tarot/history', {
        credentials: 'include',
      });
      if (!res.ok) {
        const message = await readApiErrorMessage(res, t('history.recordLoadError'));
        throw new Error(message);
      }
      const data = await res.json();
      setHistory(data.records || []);
    } catch (error) {
      logger.error({ error }, 'Tarot history load failed');
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) loadHistory();
    else setHistory([]);
  }, [isAuthenticated]);

  const redirectToAuth = (mode) => {
    const redirectPath = `${location.pathname}${location.search || ''}${location.hash || ''}`;
    const safeNext = sanitizeRedirectPath(redirectPath, null);
    const params = new URLSearchParams();
    if (safeNext) params.set('next', safeNext);
    const target = `/${mode}?${params.toString()}`;
    navigate(target, { state: { from: redirectPath } });
  };

  // --- Handlers ---
  const handleDraw = async () => {
    if (loading) return;
    setLoading(true);
    setStatus(null);
    setAiResult(null);

    try {
      const res = await fetch('/api/tarot/draw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ spreadType }),
      });
      if (!res.ok) {
        const message = await readApiErrorMessage(res, t('tarot.loadError'));
        throw new Error(message);
      }
      const data = await res.json();
      setSpread(data);
      if (isGuest) {
        setStatus({ type: 'success', message: t('tarot.guestDrawSuccess') });
      }
    } catch (e) {
      setStatus({ type: 'error', message: e.message || t('tarot.loadError') });
    } finally {
      setLoading(false);
    }
  };

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

  const handleInterpret = async () => {
    if (!spread) return;
    if (!isAuthenticated) {
      setStatus({ type: 'error', message: t('tarot.loginRequiredAi') });
      redirectToAuth('register');
      return;
    }
    if (isInterpreting) return;
    closeAiSocket();
    wsStatusRef.current = { done: false, errored: false };
    setAiResult('');
    setIsInterpreting(true);
    setStatus({ type: 'info', message: t('bazi.aiThinking') });

    try {
      const ws = new WebSocket(resolveWsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        const provider = getPreferredAiProvider();
        const message = {
          type: 'tarot_ai_request',
          provider,
          payload: {
            spreadType: spread.spreadType,
            cards: spread.cards,
            userQuestion,
          },
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
          setStatus({ type: 'success', message: t('bazi.aiReady') });
          closeAiSocket(1000, 'Stream complete');
          void loadHistory();
          return;
        }
        if (message?.type === 'error') {
          wsStatusRef.current.errored = true;
          setIsInterpreting(false);
          setStatus({ type: 'error', message: message.message || t('tarot.loadError') });
          closeAiSocket(1011, 'AI error');
        }
      };

      ws.onerror = () => {
        if (!isMountedRef.current) return;
        wsStatusRef.current.errored = true;
        setIsInterpreting(false);
        setStatus({ type: 'error', message: t('tarot.errors.wsError') });
      };

      ws.onclose = () => {
        if (!isMountedRef.current) return;
        const { done, errored } = wsStatusRef.current;
        if (!done && !errored) {
          setStatus({ type: 'error', message: t('tarot.errors.wsClosed') });
        }
        setIsInterpreting(false);
        wsRef.current = null;
      };
    } catch (e) {
      setIsInterpreting(false);
      setStatus({ type: 'error', message: e.message || t('tarot.errors.connError') });
    }
  };

  const requestAiConfirm = () => {
    if (!spread) return;
    if (!isAuthenticated) {
      setStatus({ type: 'error', message: t('tarot.loginRequiredAi') });
      redirectToAuth('register');
      return;
    }
    if (isInterpreting) return;
    setConfirmAiOpen(true);
  };

  const handleDeleteHistory = async (recordId) => {
    if (!isAuthenticated) return;
    const current = history.find((record) => record.id === recordId);
    setHistory((prev) => prev.filter((record) => record.id !== recordId));
    try {
      const res = await fetch(`/api/tarot/history/${recordId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const message = await readApiErrorMessage(res, t('history.recordLoadError'));
        throw new Error(message);
      }
    } catch (error) {
      logger.error({ error }, 'Tarot delete failed');
      if (current) setHistory((prev) => [current, ...prev]);
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
        const message = await readApiErrorMessage(res, t('tarot.loadError'));
        throw new Error(message);
      }
      const data = await res.json();
      setDeck(data.cards || []);
      setShowDeck(true);
    } catch (error) {
      setDeckError(error.message || t('tarot.loadError'));
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
        const message = await readApiErrorMessage(res, t('zodiac.errors.horoscopeFailed'));
        throw new Error(message);
      }
      const data = await res.json();
      if (requestId !== zodiacRequestRef.current) return;
      setZodiacHoroscope(data);
      setZodiacStatus({
        type: 'success',
        message: t('tarot.horoscopeLoaded', {
          name: t(`zodiac.signs.${data.sign.name.toLowerCase()}`),
          period: t(`zodiac.periods.${data.period}`),
          label: t('tarot.horoscope'),
        }),
      });
    } catch (error) {
      if (requestId !== zodiacRequestRef.current) return;
      setZodiacStatus({ type: 'error', message: error.message });
    } finally {
      if (requestId === requestId) {
        setZodiacLoading(false);
      }
    }
  };

  const statusStyle =
    status?.type === 'error'
      ? 'text-rose-200 bg-rose-900/50'
      : status?.type === 'success'
        ? 'text-emerald-200 bg-emerald-900/50'
        : 'text-blue-200 bg-blue-900/50';

  return (
    <main id="main-content" tabIndex={-1} className="responsive-container pb-16">
      <Breadcrumbs />

      {/* Confirmation Modals */}
      <Modal
        isOpen={confirmAiOpen}
        onClose={() => setConfirmAiOpen(false)}
        title={t('tarot.aiConfirmTitle')}
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
              onClick={() => {
                setConfirmAiOpen(false);
                handleInterpret();
              }}
            >
              {t('bazi.aiInterpret')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-white/70">{t('tarot.aiConfirmDesc')}</p>
      </Modal>

      <Modal
        isOpen={!!confirmDeleteRecord}
        onClose={() => setConfirmDeleteRecord(null)}
        title={t('tarot.deleteConfirmTitle')}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setConfirmDeleteRecord(null)}
              ref={confirmDeleteCancelRef}
            >
              {t('profile.cancel')}
            </Button>
            <Button variant="danger" onClick={handleConfirmDelete}>
              {t('favorites.remove')}
            </Button>
          </>
        }
      >
        <p className="mt-2 text-sm text-white/70">{t('tarot.deleteConfirmDesc')}</p>
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-white/70">
          {confirmDeleteRecord &&
            (confirmDeleteRecord.userQuestion ||
              confirmDeleteRecord.spreadType ||
              t('tarot.generalReading'))}
        </div>
      </Modal>

      <div className="glass-card mx-auto rounded-3xl border border-white/10 p-8 shadow-glass">
        <h1 className="font-display text-4xl text-gold-400">{t('tarot.title')}</h1>
        <p className="mt-2 text-white/60">{t('tarot.subtitle')}</p>

        <TarotZodiac
          sign={zodiacSign}
          period={zodiacPeriod}
          onSignChange={setZodiacSign}
          onPeriodChange={setZodiacPeriod}
          horoscope={zodiacHoroscope}
          status={zodiacStatus}
          loading={zodiacLoading}
          onFetch={handleFetchZodiacWeekly}
        />

        <section className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-display text-2xl text-white">{t('zodiac.compatibilityTitle')}</h2>
              <p className="text-sm text-white/60">{t('zodiac.compatibilitySubtitle')}</p>
            </div>
            <a
              href="/zodiac#compatibility"
              className="inline-flex items-center justify-center rounded-full bg-indigo-600 px-6 py-2 text-sm font-semibold text-white shadow-lg transition hover:scale-105"
            >
              {t('zodiac.checkCompatibility')}
            </a>
          </div>
        </section>

        <TarotControls
          question={userQuestion}
          spreadType={spreadType}
          onQuestionChange={setUserQuestion}
          onSpreadTypeChange={setSpreadType}
          loading={loading}
          interpreting={isInterpreting}
          onDraw={handleDraw}
          isGuest={isGuest}
        />

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
            <h2 className="font-display text-2xl text-white">{t('tarot.unlockDeck')}</h2>
            <p className="mt-2 text-sm text-white/70">{t('tarot.unlockDeckSubtitle')}</p>
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

        <TarotSpread
          spread={spread}
          isInterpreting={isInterpreting}
          onInterpret={requestAiConfirm}
          isZh={isZh}
        />

        <TarotAiSection result={aiResult} />

        {isAuthenticated && (
          <TarotHistory
            history={history}
            loading={historyLoading}
            onDeleteRequest={requestDeleteConfirm}
            isZh={isZh}
          />
        )}

        <TarotDeckLibrary
          deck={deck}
          loading={deckLoading}
          error={deckError}
          show={showDeck}
          onLoad={handleLoadDeck}
          isZh={isZh}
        />
      </div>
    </main>
  );
}
