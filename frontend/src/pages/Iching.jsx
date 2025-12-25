import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { getPreferredAiProvider } from '../utils/aiProvider.js';

export default function Iching() {
  const { token, isAuthenticated } = useAuth();
  const [numbers, setNumbers] = useState({ first: '', second: '', third: '' });
  const [question, setQuestion] = useState('');
  const [divination, setDivination] = useState(null);
  const [hexagrams, setHexagrams] = useState([]);
  const [filter, setFilter] = useState('');
  const [status, setStatus] = useState(null);
  const [aiResult, setAiResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    fetch('/api/iching/hexagrams')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Failed to load hexagrams'))))
      .then((data) => {
        if (isMounted) setHexagrams(data.hexagrams || []);
      })
      .catch(() => {
        if (isMounted) setStatus({ type: 'error', message: 'Unable to load hexagram library.' });
      });
    return () => { isMounted = false; };
  }, []);

  const loadHistory = async () => {
    if (!token) return;
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/iching/history', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Unable to load history');
      const data = await res.json();
      setHistory(data.records || []);
    } catch (error) {
      console.error(error);
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

  const filteredHexagrams = useMemo(() => {
    if (!filter.trim()) return hexagrams;
    const term = filter.trim().toLowerCase();
    return hexagrams.filter((hex) => {
      const name = `${hex.name} ${hex.title || ''}`.toLowerCase();
      return name.includes(term);
    });
  }, [filter, hexagrams]);

  const updateNumber = (field) => (event) => {
    setNumbers((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleDivine = async (event) => {
    event.preventDefault();
    setStatus(null);
    setAiResult(null);
    setLoading(true);

    const parsed = [numbers.first, numbers.second, numbers.third].map((value) => Number(value));
    if (parsed.some((value) => !Number.isFinite(value))) {
      setStatus({ type: 'error', message: 'Enter three valid numbers to begin.' });
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/iching/divine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'number', numbers: parsed })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Divination failed.');
      }
      const data = await res.json();
      setDivination(data);
      setStatus({ type: 'success', message: 'The hexagram is revealed.' });
    } catch (error) {
      setStatus({ type: 'error', message: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleTimeDivine = async () => {
    setStatus(null);
    setAiResult(null);
    setLoading(true);

    try {
      const res = await fetch('/api/iching/divine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'time' })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Divination failed.');
      }
      const data = await res.json();
      setDivination(data);
      setStatus({ type: 'success', message: 'The time hexagram is revealed.' });
    } catch (error) {
      setStatus({ type: 'error', message: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleAiInterpret = async () => {
    if (!isAuthenticated) {
      setStatus({ type: 'error', message: 'Please login to unlock AI interpretation.' });
      return;
    }
    if (!divination?.hexagram) {
      setStatus({ type: 'error', message: 'Divine a hexagram first.' });
      return;
    }
    setAiLoading(true);
    setStatus({ type: 'info', message: 'Listening to the oracle...' });

    try {
      const provider = getPreferredAiProvider();
      const res = await fetch('/api/iching/ai-interpret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          hexagram: divination.hexagram,
          changingLines: divination.changingLines,
          resultingHexagram: divination.resultingHexagram,
          method: divination.method,
          timeContext: divination.timeContext,
          userQuestion: question,
          provider
        })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Interpretation failed.');
      }
      const data = await res.json();
      setAiResult(data.content);
      setStatus({ type: 'success', message: 'Interpretation received.' });
    } catch (error) {
      setStatus({ type: 'error', message: error.message });
    } finally {
      setAiLoading(false);
    }
  };

  const handleSave = async () => {
    if (!isAuthenticated) {
      setStatus({ type: 'error', message: 'Please login to save this reading.' });
      return;
    }
    if (!divination?.hexagram) {
      setStatus({ type: 'error', message: 'Divine a hexagram before saving.' });
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
        const err = await res.json();
        throw new Error(err.error || 'Save failed.');
      }
      const data = await res.json();
      if (data.record) {
        setHistory((prev) => [data.record, ...prev]);
      } else {
        await loadHistory();
      }
      setStatus({ type: 'success', message: 'Reading saved to history.' });
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Save failed.' });
    } finally {
      setSaveLoading(false);
    }
  };

  const handleDeleteHistory = async (recordId) => {
    if (!token) return;
    const current = history.find((record) => record.id === recordId);
    setHistory((prev) => prev.filter((record) => record.id !== recordId));
    try {
      const res = await fetch(`/api/iching/history/${recordId}`, {
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
              <span className="text-xs text-white/50">Line {item.number}</span>
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
      <section className="grid gap-8 lg:grid-cols-[1.2fr_0.9fr]">
        <div className="glass-card rounded-3xl border border-white/10 p-8 shadow-glass">
          <h1 className="font-display text-3xl text-gold-400">I Ching Oracle</h1>
          <p className="mt-2 text-sm text-white/70">
            Focus on your question and let the numbers reveal the pattern beneath.
          </p>

          <form onSubmit={handleDivine} className="mt-6 grid gap-4">
            <div className="grid gap-4 md:grid-cols-3">
              <label className="text-sm text-white/80">
                First number
                <input
                  type="number"
                  min="1"
                  value={numbers.first}
                  onChange={updateNumber('first')}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-white"
                  placeholder="12"
                  required
                />
              </label>
              <label className="text-sm text-white/80">
                Second number
                <input
                  type="number"
                  min="1"
                  value={numbers.second}
                  onChange={updateNumber('second')}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-white"
                  placeholder="27"
                  required
                />
              </label>
              <label className="text-sm text-white/80">
                Third number
                <input
                  type="number"
                  min="1"
                  value={numbers.third}
                  onChange={updateNumber('third')}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-white"
                  placeholder="44"
                  required
                />
              </label>
            </div>

            <label className="text-sm text-white/80">
              Your question (optional)
              <input
                type="text"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-white"
                placeholder="What guidance do I need today?"
              />
            </label>

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={loading}
                className="rounded-full bg-gold-400 px-8 py-2 font-bold text-mystic-900 shadow-lg transition hover:scale-105 disabled:opacity-50"
              >
                {loading ? 'Divining...' : 'Divine with Numbers'}
              </button>
              <button
                type="button"
                onClick={handleTimeDivine}
                disabled={loading}
                className="rounded-full border border-gold-400/50 px-6 py-2 text-sm font-semibold text-gold-200 transition hover:bg-gold-400/10 disabled:opacity-50"
              >
                Use Current Time
              </button>
            </div>
          </form>

          {status && (
            <div className={`mt-6 rounded-2xl border px-4 py-3 text-sm ${statusStyle}`}>
              {status.message}
            </div>
          )}

          {divination?.hexagram && (
            <div className="mt-8 grid gap-6 md:grid-cols-2">
              <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <h2 className="font-display text-xl text-white">Primary Hexagram</h2>
                <p className="mt-1 text-sm text-white/70">{divination.hexagram.name}</p>
                <p className="text-xs text-white/50">{divination.hexagram.title}</p>
                {divination.method === 'time' && divination.timeContext && (
                  <p className="mt-2 text-xs text-white/60">
                    Time used: {formatTimeContext(divination.timeContext)}
                  </p>
                )}
                <div className="mt-4">{renderLines(divination.hexagram, divination.changingLines)}</div>
                <div className="mt-4 text-xs text-white/60">
                  Changing lines: {divination.changingLines?.length ? divination.changingLines.join(', ') : 'None'}
                </div>
              </section>

              <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <h2 className="font-display text-xl text-white">Resulting Hexagram</h2>
                {divination.resultingHexagram ? (
                  <>
                    <p className="mt-1 text-sm text-white/70">{divination.resultingHexagram.name}</p>
                    <p className="text-xs text-white/50">{divination.resultingHexagram.title}</p>
                    <div className="mt-4">{renderLines(divination.resultingHexagram)}</div>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-white/60">No resulting hexagram yet.</p>
                )}
              </section>
            </div>
          )}

          {divination?.hexagram && (
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={handleAiInterpret}
                disabled={aiLoading}
                className="rounded-full bg-indigo-600 px-8 py-3 font-bold text-white shadow-lg transition hover:bg-indigo-500 disabled:opacity-60"
              >
                {aiLoading ? 'Interpreting...' : 'Reveal AI Interpretation'}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saveLoading}
                className="rounded-full border border-emerald-400/40 px-8 py-3 text-sm font-semibold text-emerald-100 transition hover:border-emerald-300 hover:text-white disabled:opacity-60"
              >
                {saveLoading ? 'Saving...' : 'Save to History'}
              </button>
            </div>
          )}

          {aiResult && (
            <section className="mt-10 rounded-3xl border border-purple-500/30 bg-purple-900/20 p-8">
              <h3 className="font-display text-2xl text-purple-300">Oracle Reflection</h3>
              <div className="mt-4 prose prose-invert max-w-none whitespace-pre-wrap text-white/90">
                {aiResult}
              </div>
            </section>
          )}
          {isAuthenticated && (
            <section className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-display text-2xl text-white">I Ching History</h3>
                  <p className="text-sm text-white/60">Saved hexagrams from your recent consultations.</p>
                </div>
                <div className="text-xs text-white/60">
                  {history.length} saved
                </div>
              </div>
              {historyLoading ? (
                <p className="mt-4 text-sm text-white/60">Loading history...</p>
              ) : history.length ? (
                <div className="mt-4 grid gap-4">
                  {history.map((record) => (
                    <div key={record.id} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm text-white">
                            {record.hexagram?.name} → {record.resultingHexagram?.name || 'No change'}
                          </p>
                          <p className="mt-1 text-xs text-white/60">
                            Lines: {record.changingLines?.length ? record.changingLines.join(', ') : 'None'} · Method: {record.method}
                          </p>
                          {record.userQuestion && (
                            <p className="mt-2 text-xs text-white/70">Question: {record.userQuestion}</p>
                          )}
                          <p className="mt-2 text-[0.7rem] uppercase tracking-[0.2em] text-white/40">
                            Saved {new Date(record.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteHistory(record.id)}
                          className="rounded-full border border-rose-400/40 px-3 py-1 text-xs text-rose-100 transition hover:border-rose-300 hover:text-rose-200"
                        >
                          Delete
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
                <p className="mt-4 text-sm text-white/60">No saved readings yet.</p>
              )}
            </section>
          )}
        </div>

        <aside className="glass-card rounded-3xl border border-white/10 p-8 shadow-glass">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl text-white">Hexagram Library</h2>
              <p className="text-sm text-white/60">{hexagrams.length} hexagrams loaded</p>
            </div>
            <input
              type="text"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Search"
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
              <p className="text-sm text-white/60">No hexagrams match that search.</p>
            )}
          </div>
        </aside>
      </section>
    </main>
  );
}
