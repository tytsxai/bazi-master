import { useTranslation } from 'react-i18next';

interface LunarData {
  year: number;
  month: number;
  day: number;
  isLeap: boolean;
  yearStem: string;
  yearBranch: string;
  monthStem: string;
  monthBranch: string;
}

interface ZiweiResult {
  lunar: LunarData;
  mingPalace: { palace: { cn: string }; branch: { name: string } };
  shenPalace: { palace: { cn: string }; branch: { name: string } };
  birthIso: string;
  timezoneOffsetMinutes: number;
}

interface ZiweiQuickChartProps {
  latestBaziRecord: {
    id: string | number;
    birthYear: number;
    birthMonth: number;
    birthDay: number;
    birthHour: number;
    gender: string;
    birthLocation?: string;
    timezone?: string;
    createdAt: string;
  } | null;
  latestBirthSummary: string;
  ziweiLoading: boolean;
  latestBaziStatus: { type: string; message: string };
  handleZiweiGenerate: () => void;
  ziweiStatus: { type: string; message: string };
  ziweiResult: ZiweiResult | null;
}

export default function ZiweiQuickChart({
  latestBaziRecord,
  latestBirthSummary,
  ziweiLoading,
  latestBaziStatus,
  handleZiweiGenerate,
  ziweiStatus,
  ziweiResult,
}: ZiweiQuickChartProps) {
  const { t } = useTranslation();

  return (
    <section className="mt-8 glass-card rounded-3xl border border-white/10 p-8 shadow-glass">
      <h2 className="font-display text-2xl text-white">{t('profile.ziweiQuickChart')}</h2>
      <p className="mt-2 text-sm text-white/70">{t('profile.ziweiQuickChartDesc')}</p>

      <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-white/80">
          <div>
            <p className="text-xs uppercase text-white/50">{t('profile.latestBaziRecord')}</p>
            <p className="mt-1 text-white">
              {latestBaziRecord
                ? `${latestBirthSummary} · ${latestBaziRecord.gender}`
                : t('profile.noRecordAvailable')}
            </p>
          </div>
          <button
            type="button"
            onClick={handleZiweiGenerate}
            disabled={!latestBaziRecord || ziweiLoading || latestBaziStatus.type === 'loading'}
            className="rounded-full bg-gold-400 px-4 py-2 text-xs font-semibold text-mystic-900 shadow-lg shadow-gold-400/30 transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {ziweiLoading ? t('profile.calculating') : t('profile.generateZiwei')}
          </button>
        </div>
        {latestBaziStatus.type === 'error' && (
          <p className="mt-3 text-xs text-rose-200">{latestBaziStatus.message}</p>
        )}
        {latestBaziStatus.type === 'success' && !latestBaziRecord && (
          <p className="mt-3 text-xs text-white/60">{t('profile.createBaziFirst')}</p>
        )}
      </div>

      {ziweiStatus.type !== 'idle' && (
        <p
          data-testid="profile-ziwei-status"
          className={`mt-4 text-sm ${ziweiStatus.type === 'error' ? 'text-rose-200' : 'text-emerald-200'}`}
        >
          {ziweiStatus.message || (ziweiStatus.type === 'loading' ? t('profile.calculating') : '')}
        </p>
      )}

      {ziweiResult && (
        <div className="mt-6 grid gap-4 md:grid-cols-3" data-testid="profile-ziwei-result">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <h3 className="text-xs uppercase text-gold-400/80">{t('bazi.year')}</h3>
            <p className="mt-2 text-white">
              {ziweiResult.lunar
                ? `${ziweiResult.lunar.year}年 ${ziweiResult.lunar.month}月 ${ziweiResult.lunar.day}日${ziweiResult.lunar.isLeap ? ' (Leap)' : ''}`
                : '—'}
            </p>
            <p className="mt-1 text-xs text-white/60">
              {ziweiResult.lunar
                ? `${ziweiResult.lunar.yearStem}${ziweiResult.lunar.yearBranch}年 · ${ziweiResult.lunar.monthStem}${ziweiResult.lunar.monthBranch}月`
                : '—'}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <h3 className="text-xs uppercase text-gold-400/80">{t('bazi.fourPillars')}</h3>
            <p className="mt-2 text-white">
              命宫: {ziweiResult.mingPalace?.palace?.cn} · {ziweiResult.mingPalace?.branch?.name}
            </p>
            <p className="mt-1 text-white">
              身宫: {ziweiResult.shenPalace?.palace?.cn} · {ziweiResult.shenPalace?.branch?.name}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <h3 className="text-xs uppercase text-gold-400/80">{t('bazi.birthUtc')}</h3>
            <p className="mt-2 text-white">{ziweiResult.birthIso || '—'}</p>
            <p className="mt-1 text-xs text-white/60">
              UTC offset:{' '}
              {Number.isFinite(ziweiResult.timezoneOffsetMinutes)
                ? `${ziweiResult.timezoneOffsetMinutes} ${t('profile.mins')}`
                : '—'}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
