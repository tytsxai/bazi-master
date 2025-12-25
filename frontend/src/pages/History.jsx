import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext.jsx';

const DELETE_UNDO_WINDOW_MS = 5000;
const DEFAULT_FILTERS = {
  query: '',
  genderFilter: 'all',
  rangeFilter: 'all',
  sortOption: 'created-desc',
};

export default function History() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [records, setRecords] = useState([]);
  const [status, setStatus] = useState(null);
  const [query, setQuery] = useState(DEFAULT_FILTERS.query);
  const [genderFilter, setGenderFilter] = useState(DEFAULT_FILTERS.genderFilter);
  const [rangeFilter, setRangeFilter] = useState(DEFAULT_FILTERS.rangeFilter);
  const [sortOption, setSortOption] = useState(DEFAULT_FILTERS.sortOption);
  const [pendingDeletes, setPendingDeletes] = useState([]);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const deleteTimersRef = useRef(new Map());
  const fileInputRef = useRef(null);

  const loadRecords = async () => {
    const res = await fetch('/api/bazi/records', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      setStatus({ type: 'error', message: 'Unable to load history.' });
      return;
    }
    const data = await res.json();
    setRecords(data.records || []);
  };

  useEffect(() => {
    loadRecords();
  }, [token]);

  useEffect(() => {
    if (!status) return;
    const timeoutMs = status.type === 'error' ? 6000 : 3500;
    const timer = setTimeout(() => setStatus(null), timeoutMs);
    return () => clearTimeout(timer);
  }, [status]);

  useEffect(() => () => {
    deleteTimersRef.current.forEach((timerId) => clearTimeout(timerId));
    deleteTimersRef.current.clear();
  }, []);

  const finalizeDelete = async (record) => {
    const res = await fetch(`/api/bazi/records/${record.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      setRecords((prev) => [record, ...prev]);
      setStatus({ type: 'error', message: 'Unable to delete record. It has been restored.' });
    }
  };

  const handleDelete = (record) => {
    setStatus(null);
    setRecords((prev) => prev.filter((item) => item.id !== record.id));

    const timerId = setTimeout(async () => {
      deleteTimersRef.current.delete(record.id);
      setPendingDeletes((prev) => prev.filter((entry) => entry.record.id !== record.id));
      await finalizeDelete(record);
    }, DELETE_UNDO_WINDOW_MS);

    deleteTimersRef.current.set(record.id, timerId);
    setPendingDeletes((prev) => [
      { record, deadline: Date.now() + DELETE_UNDO_WINDOW_MS },
      ...prev,
    ]);
  };

  const handleRestore = (recordId) => {
    const timerId = deleteTimersRef.current.get(recordId);
    if (timerId) {
      clearTimeout(timerId);
      deleteTimersRef.current.delete(recordId);
    }
    const restored = pendingDeletes.find((entry) => entry.record.id === recordId)?.record;
    setPendingDeletes((prev) => prev.filter((entry) => entry.record.id !== recordId));
    if (restored) {
      setRecords((prev) => [restored, ...prev]);
      setStatus({ type: 'success', message: 'Record restored.' });
    }
  };

  const filteredRecords = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const now = Date.now();
    const rangeDays = rangeFilter === '7' ? 7 : rangeFilter === '30' ? 30 : rangeFilter === '90' ? 90 : null;
    let list = records.filter((record) => {
      if (genderFilter !== 'all' && record.gender !== genderFilter) return false;
      if (rangeDays) {
        const createdAt = new Date(record.createdAt).getTime();
        if (Number.isNaN(createdAt) || createdAt < now - rangeDays * 24 * 60 * 60 * 1000) return false;
      }
      if (!normalizedQuery) return true;
      const haystack = [
        record.birthLocation,
        record.timezone,
        record.gender,
        record.pillars?.year?.stem,
        record.pillars?.year?.branch,
        record.pillars?.day?.stem,
        record.pillars?.day?.branch,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });

    const getBirthTimestamp = (record) => Date.UTC(
      record.birthYear,
      record.birthMonth - 1,
      record.birthDay,
      record.birthHour || 0,
      0,
      0,
    );

    list = [...list].sort((a, b) => {
      switch (sortOption) {
        case 'created-asc':
          return new Date(a.createdAt) - new Date(b.createdAt);
        case 'birth-desc':
          return getBirthTimestamp(b) - getBirthTimestamp(a);
        case 'birth-asc':
          return getBirthTimestamp(a) - getBirthTimestamp(b);
        case 'created-desc':
        default:
          return new Date(b.createdAt) - new Date(a.createdAt);
      }
    });

    return list;
  }, [records, query, genderFilter, rangeFilter, sortOption]);

  const handleResetFilters = () => {
    setQuery(DEFAULT_FILTERS.query);
    setGenderFilter(DEFAULT_FILTERS.genderFilter);
    setRangeFilter(DEFAULT_FILTERS.rangeFilter);
    setSortOption(DEFAULT_FILTERS.sortOption);
  };

  const hasAnyRecords = records.length > 0;
  const hasActiveFilters = Boolean(query.trim()) || genderFilter !== 'all' || rangeFilter !== 'all';

  return (
    <main id="main-content" tabIndex={-1} className="container mx-auto pb-16">
      {status && (
        <div className="pointer-events-none fixed right-6 top-6 z-50 flex w-[min(90vw,360px)] flex-col gap-2">
          <div
            role={status.type === 'error' ? 'alert' : 'status'}
            aria-live={status.type === 'error' ? 'assertive' : 'polite'}
            className={`pointer-events-auto rounded-2xl border px-4 py-3 text-sm shadow-lg backdrop-blur ${
              status.type === 'error'
                ? 'border-rose-400/40 bg-rose-500/10 text-rose-100'
                : 'border-emerald-300/40 bg-emerald-500/10 text-emerald-100'
            }`}
          >
            {status.message}
          </div>
        </div>
      )}
      <section className="glass-card rounded-3xl border border-white/10 p-8 shadow-glass">
        <h1 className="font-display text-3xl text-gold-400">{t('nav.history')}</h1>
        <p className="mt-3 text-white/70">Your saved readings will appear here.</p>
        <div className="mt-6 grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-white/70 md:grid-cols-4">
          <label className="grid gap-2">
            <span className="text-[0.7rem] uppercase tracking-[0.2em] text-white/50">Search</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Location, timezone, pillar"
              className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/30"
            />
          </label>
          <label className="grid gap-2">
            <span className="text-[0.7rem] uppercase tracking-[0.2em] text-white/50">Gender</span>
            <select
              value={genderFilter}
              onChange={(event) => setGenderFilter(event.target.value)}
              className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
            >
              <option value="all">All</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </label>
          <label className="grid gap-2">
            <span className="text-[0.7rem] uppercase tracking-[0.2em] text-white/50">Created</span>
            <select
              value={rangeFilter}
              onChange={(event) => setRangeFilter(event.target.value)}
              className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
            >
              <option value="all">All time</option>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
            </select>
          </label>
          <label className="grid gap-2">
            <span className="text-[0.7rem] uppercase tracking-[0.2em] text-white/50">Sort</span>
            <select
              value={sortOption}
              onChange={(event) => setSortOption(event.target.value)}
              className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
            >
              <option value="created-desc">Newest saved</option>
              <option value="created-asc">Oldest saved</option>
              <option value="birth-desc">Newest birthdate</option>
              <option value="birth-asc">Oldest birthdate</option>
            </select>
          </label>
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={handleResetFilters}
            className="rounded-full border border-white/20 px-4 py-2 text-xs uppercase tracking-[0.2em] text-white/70 transition hover:border-gold-400/60 hover:text-white"
          >
            Reset filters
          </button>
        </div>
        {!!pendingDeletes.length && (
          <div className="mt-6 rounded-2xl border border-amber-300/20 bg-amber-500/10 p-4 text-xs text-amber-100">
            <p className="font-semibold text-amber-100">Recently deleted</p>
            <p className="mt-1 text-amber-100/80">Undo is available for a few seconds after deletion.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {pendingDeletes.map((entry) => (
                <div key={entry.record.id} className="flex items-center justify-between rounded-xl border border-amber-200/20 bg-black/20 px-3 py-2">
                  <span className="text-xs">
                    {entry.record.birthYear}-{entry.record.birthMonth}-{entry.record.birthDay} · {entry.record.birthHour}:00
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRestore(entry.record.id)}
                    className="rounded-full border border-amber-200/40 px-3 py-1 text-[0.7rem] uppercase tracking-[0.18em] text-amber-100 transition hover:border-amber-200 hover:text-white"
                  >
                    Restore
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        {filteredRecords.length ? (
          <div className="mt-6 grid gap-4">
            {filteredRecords.map((record) => (
              <div key={record.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-white">
                      {record.birthYear}-{record.birthMonth}-{record.birthDay} · {record.birthHour}:00
                    </p>
                    <p className="text-xs text-white/60">
                      {record.gender} · {record.birthLocation || '—'} · {record.timezone || 'UTC'}
                    </p>
                    <p className="mt-2 text-[0.7rem] uppercase tracking-[0.22em] text-white/40">
                      Saved {new Date(record.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(record)}
                    className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/70 transition hover:border-rose-400/60 hover:text-rose-200"
                  >
                    Delete
                  </button>
                </div>
                <div className="mt-3 grid gap-3 text-xs text-white/70 sm:grid-cols-2">
                  <div>
                    <p className="text-white/50">Year Pillar</p>
                    <p>{record.pillars.year.stem} · {record.pillars.year.branch}</p>
                  </div>
                  <div>
                    <p className="text-white/50">Day Pillar</p>
                    <p>{record.pillars.day.stem} · {record.pillars.day.branch}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-dashed border-white/20 bg-white/5 p-6 text-sm text-white/60">
            {hasAnyRecords ? (
              <div className="grid gap-2">
                <p className="text-sm font-semibold text-white">No results found</p>
                <p className="text-white/60">
                  {hasActiveFilters
                    ? 'Try clearing a filter or searching a different location or pillar.'
                    : 'No records match your current view yet.'}
                </p>
              </div>
            ) : (
              <div className="grid gap-2">
                <p className="text-sm font-semibold text-white">No history yet</p>
                <p className="text-white/60">Complete a reading to see it saved here.</p>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
