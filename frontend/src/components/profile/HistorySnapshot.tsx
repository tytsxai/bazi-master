import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

interface HistoryRecord {
  id: string | number;
  birthYear: number;
  birthMonth: number;
  birthDay: number;
  birthHour: number;
  gender: string;
  birthLocation?: string;
  timezone?: string;
  createdAt: string;
}

interface HistorySnapshotProps {
  recentHistory: HistoryRecord[];
  historyMeta: {
    totalCount: number;
    hasMore: boolean;
  };
  historyLoading: boolean;
  historyStatus: {
    type: string;
    message: string;
  };
}

export default function HistorySnapshot({
  recentHistory,
  historyMeta,
  historyLoading,
  historyStatus,
}: HistorySnapshotProps) {
  const { t } = useTranslation();

  const formatBirthSummary = (record: HistoryRecord) => {
    if (!record) return '—';
    const year = String(record.birthYear ?? '').padStart(4, '0');
    const month = String(record.birthMonth ?? '').padStart(2, '0');
    const day = String(record.birthDay ?? '').padStart(2, '0');
    const hour = String(record.birthHour ?? '').padStart(2, '0');
    return `${year}-${month}-${day} · ${hour}:00`;
  };

  const formatCreatedAt = (value: string) => {
    if (!value) return '—';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleString();
  };

  return (
    <section className="mt-8 glass-card rounded-3xl border border-white/10 p-8 shadow-glass">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl text-white">{t('profile.historySnapshot')}</h2>
          <p className="mt-2 text-sm text-white/70">{t('profile.historySnapshotDesc')}</p>
        </div>
        <Link
          to="/history"
          className="rounded-full border border-white/30 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white/80 transition hover:border-gold-400/60 hover:text-white"
        >
          {t('profile.openHistory')}
        </Link>
      </div>
      <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-white/80">
          <div>
            <p className="text-xs uppercase text-white/50">{t('profile.totalRecords')}</p>
            <p className="mt-1 text-white" data-testid="profile-history-total">
              {historyMeta.totalCount}
            </p>
          </div>
          {historyMeta.hasMore && (
            <p className="text-xs text-white/50">{t('profile.showingLatest')}</p>
          )}
        </div>
        {historyLoading ? (
          <p className="mt-4 text-sm text-white/60">{t('history.recordLoading')}</p>
        ) : recentHistory.length ? (
          <div className="mt-4 grid gap-3" data-testid="profile-history-list">
            {recentHistory.map((record) => (
              <div
                key={record.id}
                data-testid="profile-history-card"
                className="rounded-2xl border border-white/10 bg-white/5 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p
                    className="text-sm font-semibold text-white"
                    data-testid="profile-history-birth"
                  >
                    {formatBirthSummary(record)}
                  </p>
                  <p className="text-xs text-white/60" data-testid="profile-history-created">
                    {t('bazi.saved')} {formatCreatedAt(record.createdAt)}
                  </p>
                </div>
                <div className="mt-2 grid gap-2 text-xs text-white/70 sm:grid-cols-2">
                  <p>
                    <span className="text-white/50">{t('bazi.birthLocation')}:</span>{' '}
                    <span data-testid="profile-history-location">
                      {record.birthLocation || t('profile.unknown')}
                    </span>
                  </p>
                  <p>
                    <span className="text-white/50">{t('bazi.timezone')}:</span>{' '}
                    <span data-testid="profile-history-timezone">
                      {record.timezone || t('profile.unknown')}
                    </span>
                  </p>
                  <p>
                    <span className="text-white/50">{t('bazi.gender')}:</span>{' '}
                    <span data-testid="profile-history-gender">
                      {record.gender || t('profile.unknown')}
                    </span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-white/60">{t('profile.noHistory')}</p>
        )}
        {historyStatus.type === 'error' && (
          <p className="mt-3 text-xs text-rose-200">{historyStatus.message}</p>
        )}
      </div>
    </section>
  );
}
