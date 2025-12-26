import { useTranslation } from 'react-i18next';

export default function HistoryFilters({
  query,
  genderFilter,
  rangeFilter,
  sortOption,
  isQueryActive,
  isGenderActive,
  isRangeActive,
  isSortActive,
  onQueryChange,
  onGenderChange,
  onRangeChange,
  onSortChange,
  onClearFilter,
  onResetFilters,
}) {
  const { t } = useTranslation();

  return (
    <>
      <div className="mt-6 grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-white/70 md:grid-cols-4">
        <label className="grid gap-2">
          <div className="flex items-center justify-between text-[0.7rem] uppercase tracking-[0.2em] text-white/50">
            <span>{t('history.searchPlaceholder')}</span>
            {isQueryActive && (
              <button
                type="button"
                onClick={() => onClearFilter('query')}
                className="rounded-full border border-white/10 px-2 py-0.5 text-[0.55rem] uppercase tracking-[0.2em] text-white/50 transition hover:border-white/40 hover:text-white"
              >
                {t('history.clear')}
              </button>
            )}
          </div>
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={t('history.searchPlaceholder')}
            className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/30"
          />
        </label>
        <label className="grid gap-2">
          <div className="flex items-center justify-between text-[0.7rem] uppercase tracking-[0.2em] text-white/50">
            <span>{t('bazi.gender')}</span>
            {isGenderActive && (
              <button
                type="button"
                onClick={() => onClearFilter('gender')}
                className="rounded-full border border-white/10 px-2 py-0.5 text-[0.55rem] uppercase tracking-[0.2em] text-white/50 transition hover:border-white/40 hover:text-white"
              >
                {t('history.clear')}
              </button>
            )}
          </div>
          <select
            value={genderFilter}
            onChange={(event) => onGenderChange(event.target.value)}
            className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
          >
            <option value="all">{t('history.allGenders')}</option>
            <option value="male">{t('bazi.genderMale')}</option>
            <option value="female">{t('bazi.genderFemale')}</option>
          </select>
        </label>
        <label className="grid gap-2">
          <div className="flex items-center justify-between text-[0.7rem] uppercase tracking-[0.2em] text-white/50">
            <span>{t('history.birth')}</span>
            {isRangeActive && (
              <button
                type="button"
                onClick={() => onClearFilter('range')}
                className="rounded-full border border-white/10 px-2 py-0.5 text-[0.55rem] uppercase tracking-[0.2em] text-white/50 transition hover:border-white/40 hover:text-white"
              >
                {t('history.clear')}
              </button>
            )}
          </div>
          <select
            value={rangeFilter}
            onChange={(event) => onRangeChange(event.target.value)}
            className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
          >
            <option value="all">{t('history.allTime')}</option>
            <option value="today">{t('history.today')}</option>
            <option value="week">{t('history.thisWeek')}</option>
            <option value="7">{t('history.last7Days')}</option>
            <option value="30">{t('history.last30Days')}</option>
            <option value="90">{t('history.last90Days')}</option>
          </select>
        </label>
        <label className="grid gap-2">
          <div className="flex items-center justify-between text-[0.7rem] uppercase tracking-[0.2em] text-white/50">
            <span>{t('history.sortOption')}</span>
            {isSortActive && (
              <button
                type="button"
                onClick={() => onClearFilter('sort')}
                className="rounded-full border border-white/10 px-2 py-0.5 text-[0.55rem] uppercase tracking-[0.2em] text-white/50 transition hover:border-white/40 hover:text-white"
              >
                {t('history.clear')}
              </button>
            )}
          </div>
          <select
            value={sortOption}
            onChange={(event) => onSortChange(event.target.value)}
            className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
          >
            <option value="created-desc">{t('history.newestSaved')}</option>
            <option value="created-asc">{t('history.oldestSaved')}</option>
            <option value="birth-desc">{t('history.newestBirth')}</option>
            <option value="birth-asc">{t('history.oldestBirth')}</option>
          </select>
        </label>
      </div>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={onResetFilters}
          className="rounded-full border border-white/20 px-4 py-2 text-xs uppercase tracking-[0.2em] text-white/70 transition hover:border-gold-400/60 hover:text-white"
        >
          {t('history.resetFilters')}
        </button>
      </div>
    </>
  );
}
