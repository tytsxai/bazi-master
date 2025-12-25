import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext.jsx';

export default function History() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [records, setRecords] = useState([]);
  const [status, setStatus] = useState(null);

  const loadRecords = async () => {
    const res = await fetch('/api/bazi/records', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      setStatus('Unable to load history.');
      return;
    }
    const data = await res.json();
    setRecords(data.records || []);
  };

  useEffect(() => {
    loadRecords();
  }, [token]);

  const handleDelete = async (id) => {
    const res = await fetch(`/api/bazi/records/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      setRecords((prev) => prev.filter((record) => record.id !== id));
    }
  };

  return (
    <main id="main-content" tabIndex={-1} className="px-6 pb-16">
      <section className="glass-card rounded-3xl border border-white/10 p-8 shadow-glass">
        <h1 className="font-display text-3xl text-gold-400">{t('nav.history')}</h1>
        <p className="mt-3 text-white/70">Your saved readings will appear here.</p>
        {status && <p className="mt-4 text-sm text-rose-200">{status}</p>}
        {records.length ? (
          <div className="mt-6 grid gap-4">
            {records.map((record) => (
              <div key={record.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
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
                    onClick={() => handleDelete(record.id)}
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
            No history yet. Complete a reading to see it here.
          </div>
        )}
      </section>
    </main>
  );
}
