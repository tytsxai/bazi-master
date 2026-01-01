import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

export default function HistoryItem({
  record,
  highlightRecordId,
  isSelected,
  onToggleSelection,
  onStartEdit,
  onRequestDelete,
  editRecordId,
  editDraft,
  editErrors,
  editStatus,
  editSaving,
  onUpdateEditDraft,
  onEditSave,
  onCancelEdit,
}) {
  const { t } = useTranslation();
  const isEditing = editRecordId === record.id;

  return (
    <div
      data-testid="history-record-card"
      data-record-id={record.id}
      className={`rounded-2xl border p-4 ${
        highlightRecordId === record.id
          ? 'border-gold-400/60 bg-gold-500/10'
          : 'border-white/10 bg-white/5'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggleSelection}
            aria-label={`Select record ${record.birthYear}-${record.birthMonth}-${record.birthDay}`}
            className="mt-1 h-4 w-4 rounded border-white/30 bg-black/40 text-gold-400"
          />
          <div className="min-w-0">
            <p className="text-sm text-white">
              {record.birthYear}-{record.birthMonth}-{record.birthDay} · {record.birthHour}:00
            </p>
            <p className="text-xs text-white/60 break-words">
              {record.gender} · {record.birthLocation || '—'} · {record.timezone || 'UTC'}
            </p>
            <p className="mt-2 text-[0.7rem] uppercase tracking-[0.22em] text-white/40">
              {t('iching.savedAt', { date: new Date(record.createdAt).toLocaleDateString() })}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={`/history/${record.id}`}
            className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/70 transition hover:border-white/50 hover:text-white"
          >
            {t('history.viewDetails')}
          </Link>
          <button
            type="button"
            onClick={() => onStartEdit(record)}
            disabled={editSaving && isEditing}
            className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/70 transition hover:border-gold-400/60 hover:text-gold-100 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/40"
          >
            {isEditing ? t('history.editing') : t('history.edit')}
          </button>
          <button
            type="button"
            onClick={() => onRequestDelete(record)}
            className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/70 transition hover:border-rose-400/60 hover:text-rose-200"
          >
            {t('common.delete')}
          </button>
        </div>
      </div>
      <div className="mt-3 grid gap-3 text-xs text-white/70 sm:grid-cols-2">
        <div>
          <p className="text-white/50">{t('history.yearPillar')}</p>
          <p>
            {record.pillars.year.stem} · {record.pillars.year.branch}
          </p>
        </div>
        <div>
          <p className="text-white/50">{t('history.dayPillar')}</p>
          <p>
            {record.pillars.day.stem} · {record.pillars.day.branch}
          </p>
        </div>
      </div>
      {isEditing && editDraft && (
        <div className="mt-4 rounded-2xl border border-white/10 bg-black/40 p-4 text-xs text-white/70">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-[0.65rem] uppercase tracking-[0.18em] text-white/50">
                {t('bazi.birthYear')}
              </span>
              <input
                type="number"
                min="1"
                max="9999"
                value={editDraft.birthYear}
                onChange={(event) => onUpdateEditDraft('birthYear', event.target.value)}
                className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
              />
              {editErrors.birthYear && (
                <span className="text-[0.65rem] text-rose-200">{editErrors.birthYear}</span>
              )}
            </label>
            <label className="grid gap-1">
              <span className="text-[0.65rem] uppercase tracking-[0.18em] text-white/50">
                {t('bazi.birthMonth')}
              </span>
              <input
                type="number"
                min="1"
                max="12"
                value={editDraft.birthMonth}
                onChange={(event) => onUpdateEditDraft('birthMonth', event.target.value)}
                className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
              />
              {editErrors.birthMonth && (
                <span className="text-[0.65rem] text-rose-200">{editErrors.birthMonth}</span>
              )}
            </label>
            <label className="grid gap-1">
              <span className="text-[0.65rem] uppercase tracking-[0.18em] text-white/50">
                {t('bazi.birthDay')}
              </span>
              <input
                type="number"
                min="1"
                max="31"
                value={editDraft.birthDay}
                onChange={(event) => onUpdateEditDraft('birthDay', event.target.value)}
                className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
              />
              {editErrors.birthDay && (
                <span className="text-[0.65rem] text-rose-200">{editErrors.birthDay}</span>
              )}
            </label>
            <label className="grid gap-1">
              <span className="text-[0.65rem] uppercase tracking-[0.18em] text-white/50">
                {t('bazi.birthHour')}
              </span>
              <input
                type="number"
                min="0"
                max="23"
                value={editDraft.birthHour}
                onChange={(event) => onUpdateEditDraft('birthHour', event.target.value)}
                className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
              />
              {editErrors.birthHour && (
                <span className="text-[0.65rem] text-rose-200">{editErrors.birthHour}</span>
              )}
            </label>
            <label className="grid gap-1">
              <span className="text-[0.65rem] uppercase tracking-[0.18em] text-white/50">
                {t('bazi.gender')}
              </span>
              <select
                value={editDraft.gender}
                onChange={(event) => onUpdateEditDraft('gender', event.target.value)}
                className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
              >
                <option value="">{t('history.select')}</option>
                <option value="female">{t('bazi.genderFemale')}</option>
                <option value="male">{t('bazi.genderMale')}</option>
              </select>
              {editErrors.gender && (
                <span className="text-[0.65rem] text-rose-200">{editErrors.gender}</span>
              )}
            </label>
            <label className="grid gap-1">
              <span className="text-[0.65rem] uppercase tracking-[0.18em] text-white/50">
                {t('bazi.birthLocation')}
              </span>
              <input
                type="text"
                value={editDraft.birthLocation}
                onChange={(event) => onUpdateEditDraft('birthLocation', event.target.value)}
                className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
              />
              {editErrors.birthLocation && (
                <span className="text-[0.65rem] text-rose-200">{editErrors.birthLocation}</span>
              )}
            </label>
            <label className="grid gap-1">
              <span className="text-[0.65rem] uppercase tracking-[0.18em] text-white/50">
                {t('bazi.timezone')}
              </span>
              <input
                type="text"
                value={editDraft.timezone}
                onChange={(event) => onUpdateEditDraft('timezone', event.target.value)}
                className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
              />
              {editErrors.timezone && (
                <span className="text-[0.65rem] text-rose-200">{editErrors.timezone}</span>
              )}
            </label>
          </div>
          {editStatus && (
            <p className="mt-3 text-[0.7rem] text-rose-200" role="alert">
              {editStatus}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onEditSave}
              disabled={editSaving}
              className="rounded-full border border-emerald-400/50 px-4 py-1 text-xs uppercase tracking-[0.18em] text-emerald-100 transition hover:border-emerald-300 hover:text-emerald-200 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/40"
            >
              {editSaving ? t('profile.saving') : t('history.saveChanges')}
            </button>
            <button
              type="button"
              onClick={onCancelEdit}
              disabled={editSaving}
              className="rounded-full border border-white/20 px-4 py-1 text-xs uppercase tracking-[0.18em] text-white/60 transition hover:border-white/40 hover:text-white disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/40"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
