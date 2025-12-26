import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext.jsx';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import { useAuthFetch } from '../auth/useAuthFetch.js';
import { readApiErrorMessage } from '../utils/apiError.js';

const buildShareUrl = (record) => {
  if (!record?.id) return '';
  if (typeof window === 'undefined') return '';
  try {
    const url = new URL('/history', window.location.origin);
    url.searchParams.set('recordId', String(record.id));
    return url.toString();
  } catch {
    return '';
  }
};

const buildShareText = (record, t) => {
  if (!record) return '';
  const { birthYear, birthMonth, birthDay, birthHour, gender, birthLocation, timezone, pillars } = record;
  const shareUrl = buildShareUrl(record);
  const lines = [
    t('home.title') + ' ' + t('nav.favorites'),
    `${t('common.year')}: ${birthYear}-${birthMonth}-${birthDay} · ${birthHour}:00`,
    `${t('profile.name')}: ${gender} · ${birthLocation || '—'} · ${timezone || 'UTC'}`,
    `${t('bazi.fourPillars')}: ${pillars.year.stem}/${pillars.year.branch}, ${pillars.month.stem}/${pillars.month.branch}, ${pillars.day.stem}/${pillars.day.branch}, ${pillars.hour.stem}/${pillars.hour.branch}`,
  ];
  if (shareUrl) {
    lines.push(`${t('favorites.view')}: ${shareUrl}`);
  }
  return lines.join('\n');
};

export default function Favorites() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const authFetch = useAuthFetch();
  const [favorites, setFavorites] = useState([]);
  const [records, setRecords] = useState([]);
  const [status, setStatus] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [shareStatus, setShareStatus] = useState(null);
  const [pendingAddIds, setPendingAddIds] = useState(() => new Set());
  const [pendingDeleteIds, setPendingDeleteIds] = useState(() => new Set());

  const readErrorMessage = (res, fallback) => readApiErrorMessage(res, fallback);

  const loadFavorites = async () => {
    const res = await authFetch('/api/favorites', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) {
      return;
    }
    if (!res.ok) {
      setStatus(await readErrorMessage(res, t('favorites.loadError')));
      return;
    }
    const data = await res.json();
    setFavorites(data.favorites || []);
  };

  const loadRecords = async () => {
    const res = await authFetch('/api/bazi/records', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) {
      return;
    }
    if (!res.ok) {
      setStatus(await readErrorMessage(res, t('favorites.recordsLoadError')));
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

  const handleDelete = async (favorite) => {
    if (!favorite) return;
    setStatus(null);
    const rollbackFavorite = favorite;
    const rollbackIndex = favorites.findIndex((item) => item.id === favorite.id);
    const shouldRestoreExpanded = expandedId === favorite.id;

    setPendingDeleteIds((prev) => {
      const next = new Set(prev);
      next.add(favorite.id);
      return next;
    });
    setFavorites((prev) => prev.filter((item) => item.id !== favorite.id));
    if (shouldRestoreExpanded) setExpandedId(null);

    const res = await authFetch(`/api/favorites/${favorite.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
      keepalive: true,
    });
    if (res.status === 401) {
      setFavorites((prev) => {
        if (prev.some((item) => item.id === rollbackFavorite.id)) return prev;
        const next = [...prev];
        const insertIndex = rollbackIndex >= 0 ? Math.min(rollbackIndex, next.length) : 0;
        next.splice(insertIndex, 0, rollbackFavorite);
        return next;
      });
      if (shouldRestoreExpanded) {
        setExpandedId((current) => (current == null ? rollbackFavorite.id : current));
      }
      setPendingDeleteIds((prev) => {
        const next = new Set(prev);
        next.delete(rollbackFavorite.id);
        return next;
      });
      return;
    }
    if (!res.ok) {
      const message = await readErrorMessage(res, t('favorites.removeError'));
      setStatus(message);
      setFavorites((prev) => {
        if (prev.some((item) => item.id === rollbackFavorite.id)) return prev;
        const next = [...prev];
        const insertIndex = rollbackIndex >= 0 ? Math.min(rollbackIndex, next.length) : 0;
        next.splice(insertIndex, 0, rollbackFavorite);
        return next;
      });
      if (shouldRestoreExpanded) {
        setExpandedId((current) => (current == null ? rollbackFavorite.id : current));
      }
    } else {
      await loadFavorites();
    }
    setPendingDeleteIds((prev) => {
      const next = new Set(prev);
      next.delete(rollbackFavorite.id);
      return next;
    });
  };

  const handleAdd = async (record) => {
    if (!record?.id) return;
    setStatus(null);
    if (favorites.some((item) => item.recordId === record.id)) return;

    const tempId = `temp-${record.id}-${Date.now()}`;
    const optimisticFavorite = {
      id: tempId,
      recordId: record.id,
      record,
      createdAt: new Date().toISOString(),
    };
    setPendingAddIds((prev) => {
      const next = new Set(prev);
      next.add(record.id);
      return next;
    });
    setFavorites((prev) => [optimisticFavorite, ...prev]);

    const res = await authFetch('/api/favorites', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ recordId: record.id }),
    });
    if (res.status === 401) {
      setFavorites((prev) => prev.filter((item) => item.id !== tempId));
      setPendingAddIds((prev) => {
        const next = new Set(prev);
        next.delete(record.id);
        return next;
      });
      return;
    }
    if (!res.ok) {
      const message = await readErrorMessage(res, t('favorites.addError'));
      setStatus(message);
      setFavorites((prev) => prev.filter((item) => item.id !== tempId));
      setPendingAddIds((prev) => {
        const next = new Set(prev);
        next.delete(record.id);
        return next;
      });
      return;
    }
    const data = await res.json();
    if (data.favorite) {
      setFavorites((prev) => {
        const replaced = prev.map((item) => (item.id === tempId ? data.favorite : item));
        if (replaced.some((item) => item.id === data.favorite.id)) return replaced;
        return [data.favorite, ...replaced];
      });
    } else {
      setFavorites((prev) => prev.filter((item) => item.id !== tempId));
      loadFavorites();
    }
    setPendingAddIds((prev) => {
      const next = new Set(prev);
      next.delete(record.id);
      return next;
    });
  };

  const handleShare = async (record) => {
    const shareText = buildShareText(record, t);
    const shareUrl = buildShareUrl(record);
    if (!shareText) return;
    setShareStatus(null);

    try {
      if (navigator.share) {
        await navigator.share({
          title: t('home.title') + ' ' + t('nav.favorites'),
          text: shareText,
          url: shareUrl || undefined,
        });
        setShareStatus(t('favorites.shareSuccess'));
        return;
      }
    } catch (error) {
      setShareStatus(t('favorites.shareFailed'));
    }

    try {
      await navigator.clipboard.writeText(shareText);
      setShareStatus(t('favorites.copied'));
    } catch (error) {
      setShareStatus(t('favorites.copyFailed'));
    }
  };

  return (
    <main id="main-content" tabIndex={-1} className="responsive-container pb-16">
      <Breadcrumbs />
      <section className="glass-card rounded-3xl border border-white/10 p-8 shadow-glass">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl text-gold-400">{t('nav.favorites')}</h1>
            <p className="mt-3 text-white/70">{t('favorites.subtitle')}</p>
          </div>
          <div className="text-xs text-white/60">
            {t('favorites.savedCount', { count: favorites.length })} · {t('favorites.availableToAdd', { count: unfavoritedRecords.length })}
          </div>
        </div>
        {status && (
          <p className="mt-4 text-sm text-rose-200" role="alert" aria-live="assertive">
            {status}
          </p>
        )}
        {shareStatus && (
          <p className="mt-2 text-xs text-emerald-200" role="status" aria-live="polite">
            {shareStatus}
          </p>
        )}
        {favorites.length ? (
          <div className="mt-6 grid gap-4" data-testid="favorites-list">
            {favorites.map((favorite) => {
              const record = favorite.record;
              const isExpanded = expandedId === favorite.id;
              return (
                <div
                  key={favorite.id}
                  data-testid="favorite-record-card"
                  data-record-id={record?.id}
                  className="rounded-2xl border border-white/10 bg-white/5 p-4"
                >
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
                        {isExpanded ? t('favorites.hide') : t('favorites.view')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleShare(record)}
                        data-share-url={buildShareUrl(record)}
                        className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/70 transition hover:border-emerald-400/60 hover:text-emerald-200"
                      >
                        {t('favorites.share')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(favorite)}
                        disabled={pendingDeleteIds.has(favorite.id)}
                        className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/70 transition hover:border-rose-400/60 hover:text-rose-200"
                      >
                        {pendingDeleteIds.has(favorite.id) ? t('favorites.removing') : t('favorites.remove')}
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 text-xs text-white/70 sm:grid-cols-2">
                    <div>
                      <p className="text-white/50">{t('bazi.month')}</p>
                      <p>{record.pillars.month.stem} · {record.pillars.month.branch}</p>
                    </div>
                    <div>
                      <p className="text-white/50">{t('bazi.hour')}</p>
                      <p>{record.pillars.hour.stem} · {record.pillars.hour.branch}</p>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="mt-4 grid gap-3 rounded-2xl border border-white/10 bg-white/10 p-4 text-xs text-white/70 sm:grid-cols-2">
                      <div>
                        <p className="text-white/50">{t('bazi.year')}</p>
                        <p>{record.pillars.year.stem} · {record.pillars.year.branch}</p>
                      </div>
                      <div>
                        <p className="text-white/50">{t('bazi.day')}</p>
                        <p>{record.pillars.day.stem} · {record.pillars.day.branch}</p>
                      </div>
                      <div>
                        <p className="text-white/50">{t('bazi.fiveElements')}</p>
                        <p>
                          {t(`bazi.elements.Wood`)} {record.fiveElements.Wood} · {t(`bazi.elements.Fire`)} {record.fiveElements.Fire} · {t(`bazi.elements.Earth`)} {record.fiveElements.Earth}
                        </p>
                      </div>
                      <div>
                        <p className="text-white/50">{t('bazi.fiveElements')}</p>
                        <p>
                          {t(`bazi.elements.Metal`)} {record.fiveElements.Metal} · {t(`bazi.elements.Water`)} {record.fiveElements.Water}
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
              <p className="text-sm font-semibold text-white">{t('favorites.noFavorites')}</p>
              <p className="text-white/60">{t('favorites.noFavoritesDesc')}</p>
            </div>
          </div>
        )}

        <div className="mt-10 border-t border-white/10 pt-6">
          <h2 className="text-lg text-white">{t('favorites.addFromHistory')}</h2>
          <p className="mt-2 text-sm text-white/60">{t('favorites.addFromHistoryDesc')}</p>
          {unfavoritedRecords.length ? (
            <div className="mt-4 grid gap-3" data-testid="favorites-add-list">
              {unfavoritedRecords.map((record) => (
                <div
                  key={record.id}
                  data-testid="favorite-add-card"
                  data-record-id={record.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-4"
                >
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
                    onClick={() => handleAdd(record)}
                    disabled={pendingAddIds.has(record.id)}
                    className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/70 transition hover:border-gold-400/60 hover:text-gold-100"
                  >
                    {pendingAddIds.has(record.id) ? t('favorites.adding') : t('favorites.add')}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-white/20 bg-white/5 p-4 text-sm text-white/60">
              <div className="grid gap-2">
                <p className="text-sm font-semibold text-white">
                  {records.length ? t('favorites.allFavorited') : t('favorites.noHistoryYet')}
                </p>
                <p className="text-white/60">
                  {records.length
                    ? t('favorites.allFavoritedDesc', { defaultValue: 'You have already added every saved record to favorites.' })
                    : t('favorites.noHistoryYetDesc')}
                </p>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
