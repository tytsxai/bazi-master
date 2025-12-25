import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext.jsx';

export default function Favorites() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [favorites, setFavorites] = useState([]);
  const [status, setStatus] = useState(null);

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

  useEffect(() => {
    loadFavorites();
  }, [token]);

  const handleDelete = async (id) => {
    const res = await fetch(`/api/favorites/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      setFavorites((prev) => prev.filter((favorite) => favorite.id !== id));
    }
  };

  return (
    <main id="main-content" tabIndex={-1} className="px-6 pb-16">
      <section className="glass-card rounded-3xl border border-white/10 p-8 shadow-glass">
        <h1 className="font-display text-3xl text-gold-400">{t('nav.favorites')}</h1>
        <p className="mt-3 text-white/70">Curated destiny charts you saved for quick access.</p>
        {status && <p className="mt-4 text-sm text-rose-200">{status}</p>}
        {favorites.length ? (
          <div className="mt-6 grid gap-4">
            {favorites.map((favorite) => (
              <div key={favorite.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-white">
                      {favorite.record.birthYear}-{favorite.record.birthMonth}-{favorite.record.birthDay} · {favorite.record.birthHour}:00
                    </p>
                    <p className="text-xs text-white/60">
                      {favorite.record.gender} · {favorite.record.birthLocation || '—'} · {favorite.record.timezone || 'UTC'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(favorite.id)}
                    className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/70 transition hover:border-rose-400/60 hover:text-rose-200"
                  >
                    Remove
                  </button>
                </div>
                <div className="mt-3 grid gap-3 text-xs text-white/70 sm:grid-cols-2">
                  <div>
                    <p className="text-white/50">Month Pillar</p>
                    <p>{favorite.record.pillars.month.stem} · {favorite.record.pillars.month.branch}</p>
                  </div>
                  <div>
                    <p className="text-white/50">Hour Pillar</p>
                    <p>{favorite.record.pillars.hour.stem} · {favorite.record.pillars.hour.branch}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-dashed border-white/20 bg-white/5 p-6 text-sm text-white/60">
            No favorites yet. Save a record to see it here.
          </div>
        )}
      </section>
    </main>
  );
}
