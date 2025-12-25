import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { getPreferredAiProvider } from '../utils/aiProvider.js';

export default function Tarot() {
  const { token, isAuthenticated } = useAuth();
  const [spread, setSpread] = useState(null);
  const [spreadType, setSpreadType] = useState('CelticCross');
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isInterpreting, setIsInterpreting] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [userQuestion, setUserQuestion] = useState('');
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

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
      if (!res.ok) throw new Error('Unable to load history');
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

  const handleDraw = async () => {
    if (!isAuthenticated) return setStatus({ type: 'error', message: 'Please login first.' });
    if (loading) return;
    setLoading(true);
    setStatus(null);
    setAiResult(null);

    try {
      const res = await fetch('/api/tarot/draw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ spreadType })
      });
      if (!res.ok) throw new Error('Draw failed');
      const data = await res.json();
      setSpread(data);
    } catch (e) {
      setStatus({ type: 'error', message: e.message });
    } finally {
      setLoading(false);
    }
  };

  const handleInterpret = async () => {
    if (!spread) return;
    if (isInterpreting) return;
    setIsInterpreting(true);
    setStatus({ type: 'info', message: 'Consulting the oracle...' });

    try {
      const provider = getPreferredAiProvider();
      const res = await fetch('/api/tarot/ai-interpret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          spreadType: spread.spreadType,
          cards: spread.cards,
          userQuestion,
          provider
        })
      });
      if (!res.ok) throw new Error('Interpretation failed');
      const data = await res.json();
      setAiResult(data.content);
      setStatus({ type: 'success', message: 'Interpretation received.' });
      await loadHistory();
    } catch (e) {
      setStatus({ type: 'error', message: e.message });
    } finally {
      setIsInterpreting(false);
    }
  };

  const handleDeleteHistory = async (recordId) => {
    const current = history.find((record) => record.id === recordId);
    setHistory((prev) => prev.filter((record) => record.id !== recordId));
    try {
      const res = await fetch(`/api/tarot/history/${recordId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Delete failed');
    } catch (error) {
      console.error(error);
      if (current) {
        setHistory((prev) => [current, ...prev]);
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
    <main className="container mx-auto pb-16">
      <div className="glass-card mx-auto rounded-3xl border border-white/10 p-8 shadow-glass">
        <h1 className="font-display text-4xl text-gold-400">Tarot Sanctuary</h1>
        <p className="mt-2 text-white/60">Focus on your question and choose a spread to reveal the story.</p>

        <div className="mt-6 flex flex-col gap-4 md:flex-row">
          <input
            type="text"
            placeholder="What is your question? (Optional)"
            className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-white"
            value={userQuestion}
            onChange={e => setUserQuestion(e.target.value)}
          />
          <select
            value={spreadType}
            onChange={(event) => setSpreadType(event.target.value)}
            className="rounded-xl border border-white/10 bg-black/40 px-4 py-2 text-white"
          >
            <option value="SingleCard">Single Card</option>
            <option value="ThreeCard">Three Card</option>
            <option value="CelticCross">Celtic Cross</option>
          </select>
          <button
            onClick={handleDraw}
            disabled={loading || isInterpreting}
            className="rounded-full bg-gold-400 px-8 py-2 font-bold text-mystic-900 shadow-lg transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Shuffling...' : `Draw ${spreadLabel}`}
          </button>
        </div>

        {status && (
          <div className={`mt-4 rounded-xl px-4 py-2 ${statusStyle}`}>
            {status.message}
          </div>
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
                onClick={handleInterpret}
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
                      onClick={() => handleDeleteHistory(record.id)}
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
      </div>
    </main>
  );
}
