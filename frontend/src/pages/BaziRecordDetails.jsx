import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Breadcrumbs from '../components/Breadcrumbs';
import { useAuthFetch } from '../auth/useAuthFetch';

const formatOffsetLabel = (offsetMinutes) => {
  if (!Number.isFinite(offsetMinutes)) return null;
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  return `UTC${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const formatDateTime = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : null;
};

export default function BaziRecordDetails() {
  const { t } = useTranslation();
  const authFetch = useAuthFetch();
  const { id } = useParams();
  const recordId = Number(id);
  const [status, setStatus] = useState('loading');
  const [record, setRecord] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let isActive = true;
    const loadRecord = async () => {
      if (!Number.isInteger(recordId) || recordId <= 0) {
        setStatus('invalid');
        setRecord(null);
        return;
      }

      setStatus('loading');
      setErrorMessage('');
      try {
        const res = await authFetch(`/api/bazi/records/${recordId}`, { method: 'GET' });
        if (!res.ok) {
          if (res.status === 404) {
            if (isActive) {
              setStatus('missing');
              setRecord(null);
            }
            return;
          }
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || t('history.recordLoadError', { defaultValue: 'Unable to load record.' }));
        }
        const data = await res.json();
        if (isActive) {
          if (data?.record) {
            setRecord(data.record);
            setStatus('ready');
          } else {
            setStatus('missing');
            setRecord(null);
          }
        }
      } catch (error) {
        if (isActive) {
          setStatus('error');
          setRecord(null);
          setErrorMessage(error?.message || t('history.recordLoadError', { defaultValue: 'Unable to load record.' }));
        }
      }
    };

    void loadRecord();
    return () => {
      isActive = false;
    };
  }, [authFetch, recordId, t]);

  const pillars = useMemo(() => {
    if (!record?.pillars) return [];
    return [
      { key: 'year', label: t('bazi.year'), data: record.pillars.year },
      { key: 'month', label: t('bazi.month'), data: record.pillars.month },
      { key: 'day', label: t('bazi.day'), data: record.pillars.day },
      { key: 'hour', label: t('bazi.hour'), data: record.pillars.hour },
    ];
  }, [record, t]);

  const elements = useMemo(() => {
    if (!record?.fiveElements) return [];
    const source = record.fiveElements;
    return [
      { key: 'Wood', label: t('bazi.elements.Wood'), value: source.Wood ?? source.wood },
      { key: 'Fire', label: t('bazi.elements.Fire'), value: source.Fire ?? source.fire },
      { key: 'Earth', label: t('bazi.elements.Earth'), value: source.Earth ?? source.earth },
      { key: 'Metal', label: t('bazi.elements.Metal'), value: source.Metal ?? source.metal },
      { key: 'Water', label: t('bazi.elements.Water'), value: source.Water ?? source.water },
    ];
  }, [record, t]);

  const tenGods = useMemo(() => (Array.isArray(record?.tenGods) ? record.tenGods : []), [record]);
  const luckCycles = useMemo(() => (Array.isArray(record?.luckCycles) ? record.luckCycles : []), [record]);
  const offsetLabel = formatOffsetLabel(record?.timezoneOffsetMinutes);
  const createdAtLabel = formatDateTime(record?.createdAt);
  const updatedAtLabel = formatDateTime(record?.updatedAt);
  const birthUtcLabel = record?.birthIso ? formatDateTime(record.birthIso) : null;

  return (
    <main id="main-content" tabIndex={-1} className="responsive-container pb-16">
      <Breadcrumbs />
      <section className="glass-card rounded-3xl border border-white/10 p-8 shadow-glass">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-white/50">
              {t('history.detailsTitle', { defaultValue: 'BaZi Record' })}
            </p>
            <h1 className="mt-2 font-display text-3xl text-gold-400">
              {t('history.recordHeading', {
                defaultValue: `Record #${Number.isFinite(recordId) ? recordId : ''}`,
                id: Number.isFinite(recordId) ? recordId : '',
              })}
            </h1>
            <p className="mt-2 text-sm text-white/70">
              {t('history.detailsSubtitle', { defaultValue: 'Review your saved chart details and time context.' })}
            </p>
          </div>
          <Link
            to="/history"
            className="rounded-full border border-white/20 px-4 py-2 text-xs uppercase tracking-[0.2em] text-white/70 transition hover:border-white/50 hover:text-white"
          >
            {t('history.backToHistory', { defaultValue: 'Back to history' })}
          </Link>
        </div>

        {status === 'loading' && (
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
            {t('history.recordLoading', { defaultValue: 'Loading record...' })}
          </div>
        )}
        {status === 'invalid' && (
          <div className="mt-6 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-100">
            {t('history.recordInvalid', { defaultValue: 'Invalid record id.' })}
          </div>
        )}
        {status === 'missing' && (
          <div className="mt-6 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-100">
            {t('history.recordMissing', { defaultValue: 'Record not found.' })}
          </div>
        )}
        {status === 'error' && (
          <div className="mt-6 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-100">
            {errorMessage || t('history.recordLoadError', { defaultValue: 'Unable to load record.' })}
          </div>
        )}
        {status === 'ready' && record && (
          <div data-testid="bazi-record-details" className="mt-6 grid gap-6">
            <div className="grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/80 sm:grid-cols-2">
              <div>
                <p className="text-[0.65rem] uppercase tracking-[0.2em] text-white/50">{t('bazi.birthUtc')}</p>
                <p className="mt-2 text-base text-white">
                  {record.birthYear}-{record.birthMonth}-{record.birthDay} · {record.birthHour}:00
                </p>
                <p className="mt-1 text-xs text-white/60">{record.gender}</p>
              </div>
              <div>
                <p className="text-[0.65rem] uppercase tracking-[0.2em] text-white/50">{t('bazi.timeContext')}</p>
                <p className="mt-2 text-sm text-white/80">
                  {record.birthLocation || '—'} · {record.timezone || 'UTC'}
                </p>
                <p className="mt-1 text-xs text-white/60">
                  {t('history.savedAt', { date: createdAtLabel || t('history.dateUnavailable') })}
                </p>
                <p className="mt-1 text-xs text-white/60">
                  {t('history.updatedAt', { date: updatedAtLabel || t('history.dateUnavailable') })}
                </p>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <h2 className="font-display text-xl text-gold-300">{t('bazi.timeContext')}</h2>
                <div className="mt-4 grid gap-3 text-xs text-white/70">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-white/50">{t('bazi.timezoneInput')}</span>
                    <span className="text-white/80">{record.timezone || 'UTC'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-white/50">{t('bazi.timezoneResolved')}</span>
                    <span className="text-white/80">{offsetLabel || t('bazi.timezoneUnavailable')}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-white/50">{t('bazi.birthUtc')}</span>
                    <span className="text-white/80">{birthUtcLabel || t('bazi.timezoneUnavailable')}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <h2 className="font-display text-xl text-gold-300">{t('bazi.fiveElements')}</h2>
                <div className="mt-4 grid gap-3 text-xs text-white/80 sm:grid-cols-2">
                  {elements.length ? (
                    elements.map((item) => (
                      <div key={item.key} className="flex items-center justify-between gap-3">
                        <span className="text-white/50">{item.label}</span>
                        <span className="text-white">{item.value ?? '—'}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-white/60">{t('bazi.waiting')}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <h2 className="font-display text-xl text-gold-300">{t('bazi.fourPillars')}</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {pillars.length ? (
                  pillars.map((pillar) => (
                    <div key={pillar.key} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                      <p className="text-[0.65rem] uppercase tracking-[0.2em] text-white/50">{pillar.label}</p>
                      <p className="mt-2 text-lg text-white">
                        {pillar.data?.stem || '—'} · {pillar.data?.branch || '—'}
                      </p>
                      <p className="mt-2 text-xs text-white/60">
                        {pillar.data?.elementStem || '—'} / {pillar.data?.elementBranch || '—'}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-white/60">{t('bazi.waiting')}</p>
                )}
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <h2 className="font-display text-xl text-gold-300">{t('bazi.tenGods')}</h2>
                <div className="mt-4 grid gap-3 text-xs text-white/70">
                  {tenGods.length ? (
                    tenGods.map((item) => (
                      <div key={item.name} className="flex items-center justify-between gap-4">
                        <span>{item.name}</span>
                        <span className="text-white/50">{item.strength ?? '—'}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-white/60">{t('bazi.fullWaiting')}</p>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <h2 className="font-display text-xl text-gold-300">{t('bazi.luckCycles')}</h2>
                <div className="mt-4 grid gap-3 text-xs text-white/70 sm:grid-cols-2">
                  {luckCycles.length ? (
                    luckCycles.map((cycle) => (
                      <div key={cycle.range} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                        <p className="text-[0.65rem] uppercase tracking-[0.2em] text-white/50">{cycle.range}</p>
                        <p className="mt-2 text-sm text-white">
                          {cycle.stem} · {cycle.branch}
                        </p>
                        {cycle.startYear && cycle.endYear ? (
                          <p className="mt-1 text-[0.7rem] text-white/50">
                            {cycle.startYear} - {cycle.endYear}
                          </p>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-white/60">{t('bazi.fullWaiting')}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
