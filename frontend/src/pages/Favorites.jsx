import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext.jsx';

const buildShareText = (record) => {
  if (!record) return '';
  const { birthYear, birthMonth, birthDay, birthHour, gender, birthLocation, timezone, pillars } = record;
  return [
    'BaZi Master Favorite',
    `Date: ${birthYear}-${birthMonth}-${birthDay} · ${birthHour}:00`,
    `Profile: ${gender} · ${birthLocation || '—'} · ${timezone || 'UTC'}`,
    `Pillars: ${pillars.year.stem}/${pillars.year.branch}, ${pillars.month.stem}/${pillars.month.branch}, ${pillars.day.stem}/${pillars.day.branch}, ${pillars.hour.stem}/${pillars.hour.branch}`,
  ].join('\n');
};

export default function Favorites() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [favorites, setFavorites] = useState([]);
  const [records, setRecords] = useState([]);
  const [status, setStatus] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [shareStatus, setShareStatus] = useState(null);

  const loadFavorites = async () => {
    const res = await fetch('/api/favorites', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      setStatus('Unable to load favorites.');
      return;
    }
    const data = await res.json();
    setFavorites(data.favorites || []);
  };

  const loadRecords = async () => {
    const res = await fetch('/api/bazi/records', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      setStatus('Unable to load records.');
      return;
    }
    const data = await res.json();
    setRecords(data.records || []);
  };

  useEffect(() => {
    if (!token) return;
    loadFavorites();
    loadRecords();
  }, [token]);

  const favoriteRecordIds = useMemo(
    () => new Set(favorites.map((favorite) => favorite.recordId)),
    [favorites],
  );

  const unfavoritedRecords = useMemo(
    () => records.filter((record) => !favoriteRecordIds.has(record.id)),
    [records, favoriteRecordIds],
  );

  const handleDelete = async (id) => {
    const res = await fetch(`/api/favorites/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      setFavorites((prev) => prev.filter((favorite) => favorite.id !== id));
    }
  };

  const handleAdd = async (recordId) => {
    setStatus(null);
    const res = await fetch('/api/favorites', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ recordId }),
    });
    if (!res.ok) {
      const err = await res.json();
      setStatus(err.error || 'Unable to add favorite.');
      return;
    }
    const data = await res.json();
    if (data.favorite) {
      setFavorites((prev) => {
        if (prev.some((favorite) => favorite.id === data.favorite.id)) return prev;
        return [data.favorite, ...prev];
      });
    } else {
      loadFavorites();
    }
  };

  const handleShare = async (record) => {
    const shareText = buildShareText(record);
    if (!shareText) return;
    setShareStatus(null);

    try {
      if (navigator.share) {
        await navigator.share({
          title: 'BaZi Master Favorite',
          text: shareText,
        });
        setShareStatus('Shared successfully.');
        return;
      }
    } catch (error) {
      setShareStatus('Share failed. Copying instead.');
    }

    try {
      await navigator.clipboard.writeText(shareText);
      setShareStatus('Copied to clipboard.');
    } catch (error) {
      setShareStatus('Unable to copy share text.');
    }
  };

  return (
    <main id="main-content" tabIndex={-1} className="container mx-auto pb-16">
      <section className="glass-card rounded-3xl border border-white/10 p-8 shadow-glass">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl text-gold-400">{t('nav.favorites')}</h1>
            <p className="mt-3 text-white/70">Curated destiny charts you saved for quick access.</p>
          </div>
          <div className="text-xs text-white/60">
            {favorites.length} saved · {unfavoritedRecords.length} available to add
          </div>
        </div>
        {status && <p className="mt-4 text-sm text-rose-200">{status}</p>}
        {shareStatus && <p className="mt-2 text-xs text-emerald-200">{shareStatus}</p>}
        {favorites.length ? (
          <div className="mt-6 grid gap-4">
            {favorites.map((favorite) => {
              const record = favorite.record;
              const isExpanded = expandedId === favorite.id;
              return (
                <div key={favorite.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm text-white">
                        {record.birthYear}-{record.birthMonth}-{record.birthDay} · {record.birthHour}:00
                      </p>
                      <p className="text-xs text-white/60">
                        {record.gender} · {record.birthLocation || '—'} · {record.timezone || 'UTC'}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : favorite.id)}
                        className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/70 transition hover:border-gold-400/60 hover:text-gold-100"
                      >
                        {isExpanded ? 'Hide' : 'View'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleShare(record)}
                        className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/70 transition hover:border-emerald-400/60 hover:text-emerald-200"
                      >
                        Share
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(favorite.id)}
                        className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/70 transition hover:border-rose-400/60 hover:text-rose-200"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 text-xs text-white/70 sm:grid-cols-2">
                    <div>
                      <p className="text-white/50">Month Pillar</p>
                      <p>{record.pillars.month.stem} · {record.pillars.month.branch}</p>
                    </div>
                    <div>
                      <p className="text-white/50">Hour Pillar</p>
                      <p>{record.pillars.hour.stem} · {record.pillars.hour.branch}</p>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="mt-4 grid gap-3 rounded-2xl border border-white/10 bg-white/10 p-4 text-xs text-white/70 sm:grid-cols-2">
                      <div>
                        <p className="text-white/50">Year Pillar</p>
                        <p>{record.pillars.year.stem} · {record.pillars.year.branch}</p>
                      </div>
                      <div>
                        <p className="text-white/50">Day Pillar</p>
                        <p>{record.pillars.day.stem} · {record.pillars.day.branch}</p>
                      </div>
                      <div>
                        <p className="text-white/50">Elements</p>
                        <p>
                          Wood {record.fiveElements.Wood} · Fire {record.fiveElements.Fire} · Earth {record.fiveElements.Earth}
                        </p>
                      </div>
                      <div>
                        <p className="text-white/50">Elements</p>
                        <p>
                          Metal {record.fiveElements.Metal} · Water {record.fiveElements.Water}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-dashed border-white/20 bg-white/5 p-6 text-sm text-white/60">
            <div className="grid gap-2">
              <p className="text-sm font-semibold text-white">No favorites yet</p>
              <p className="text-white/60">Save a record to keep it handy here.</p>
            </div>
          </div>
        )}

        <div className="mt-10 border-t border-white/10 pt-6">
          <h2 className="text-lg text-white">Add from history</h2>
          <p className="mt-2 text-sm text-white/60">Pick from your saved records to add them to favorites.</p>
          {unfavoritedRecords.length ? (
            <div className="mt-4 grid gap-3">
              {unfavoritedRecords.map((record) => (
                <div key={record.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div>
                    <p className="text-sm text-white">
                      {record.birthYear}-{record.birthMonth}-{record.birthDay} · {record.birthHour}:00
                    </p>
                    <p className="text-xs text-white/60">
                      {record.gender} · {record.birthLocation || '—'} · {record.timezone || 'UTC'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAdd(record.id)}
                    className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/70 transition hover:border-gold-400/60 hover:text-gold-100"
                  >
                    Add to favorites
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-white/20 bg-white/5 p-4 text-sm text-white/60">
              <div className="grid gap-2">
                <p className="text-sm font-semibold text-white">
                  {records.length ? 'All saved records are favorited' : 'No saved history yet'}
                </p>
                <p className="text-white/60">
                  {records.length
                    ? 'You have already added every saved record to favorites.'
                    : 'Complete a reading first, then add it here.'}
                </p>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
