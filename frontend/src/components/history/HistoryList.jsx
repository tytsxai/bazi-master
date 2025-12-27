import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import HistoryItem from './HistoryItem';
import VirtualList from '../ui/VirtualList';

const ITEM_HEIGHT = 160; // Estimated height of HistoryItem

export default function HistoryList({
  orderedDeletedRecords,
  primaryRestoreId,
  showDeletedLocation,
  onRestore,
  onRequestHardDelete,
  filteredRecords,
  highlightRecordId,
  selectedIds,
  selectedSet,
  allFilteredSelected,
  onToggleSelectAll,
  onClearSelected,
  onRequestBulkDelete,
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
  totalPages,
  page,
  canGoPrev,
  canGoNext,
  buildPageHref,
  hasAnyRecords,
  hasActiveFilters,
  selectAllRef,
}) {
  const { t } = useTranslation();

  return (
    <>
      {!!orderedDeletedRecords.length && (
        <div className="mt-6 rounded-2xl border border-amber-300/20 bg-amber-500/10 p-4 text-xs text-amber-100">
          <p className="font-semibold text-amber-100">{t('history.deletedRecords')}</p>
          <p className="mt-1 text-amber-100/80">{t('history.deletedRecordsDesc')}</p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2" role="list">
            {orderedDeletedRecords.map((record) => {
              const isPrimaryRestore = primaryRestoreId === record.id;
              const label = isPrimaryRestore ? t('history.restore') : t('history.recover');
              return (
                <li key={record.id} className="list-none">
                  <div
                    data-testid="history-deleted-card"
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200/20 bg-black/20 px-3 py-2"
                  >
                    <span className="text-xs">
                      {record.birthYear}-{record.birthMonth}-{record.birthDay} · {record.birthHour}:00
                      {showDeletedLocation ? ` · ${record.birthLocation || '—'}` : ''}
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onRestore(record.id)}
                        className="rounded-full border border-amber-200/40 px-3 py-1 text-[0.7rem] uppercase tracking-[0.18em] text-amber-100 transition hover:border-amber-200 hover:text-white"
                      >
                        {label}
                      </button>
                      <button
                        type="button"
                        onClick={() => onRequestHardDelete(record)}
                        className="rounded-full border border-rose-300/40 px-3 py-1 text-[0.7rem] uppercase tracking-[0.18em] text-rose-100 transition hover:border-rose-300 hover:text-rose-200"
                      >
                        {t('history.deletePermanently')}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {filteredRecords.length ? (
        <div className="mt-6 grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/70">
            <label className="flex items-center gap-3">
              <input
                ref={selectAllRef}
                type="checkbox"
                checked={allFilteredSelected}
                onChange={onToggleSelectAll}
                aria-label={t('history.selectAll')}
                className="h-4 w-4 rounded border-white/30 bg-black/40 text-gold-400"
              />
              <span className="uppercase tracking-[0.18em] text-white/60">{t('history.selectAll')}</span>
              {selectedIds.length > 0 && (
                <span className="rounded-full border border-white/10 px-2 py-0.5 text-[0.65rem] text-white/60">
                  {t('history.selectedCount', { count: selectedIds.length })}
                </span>
              )}
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onClearSelected}
                className="rounded-full border border-white/10 px-3 py-1 text-[0.7rem] uppercase tracking-[0.2em] text-white/50 transition hover:border-white/40 hover:text-white disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/40"
                disabled={!selectedIds.length}
              >
                {t('history.clear')}
              </button>
              <button
                type="button"
                onClick={onRequestBulkDelete}
                className="rounded-full border border-rose-400/40 px-4 py-1 text-[0.7rem] uppercase tracking-[0.2em] text-rose-100 transition hover:border-rose-300 hover:text-rose-200 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/40"
                disabled={!selectedIds.length}
              >
                {t('history.deleteSelected')}
              </button>
            </div>
          </div>
          <div className="min-h-[600px]">
            <VirtualList
              items={filteredRecords}
              itemHeight={ITEM_HEIGHT}
              renderItem={(record) => (
                <HistoryItem
                  key={record.id}
                  record={record}
                  highlightRecordId={highlightRecordId}
                  isSelected={selectedSet.has(record.id)}
                  onToggleSelection={() => onToggleSelection(record.id)}
                  onStartEdit={onStartEdit}
                  onRequestDelete={onRequestDelete}
                  editRecordId={editRecordId}
                  editDraft={editDraft}
                  editErrors={editErrors}
                  editStatus={editStatus}
                  editSaving={editSaving}
                  onUpdateEditDraft={onUpdateEditDraft}
                  onEditSave={onEditSave}
                  onCancelEdit={onCancelEdit}
                />
              )}
            />
          </div>
          {totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/60">
              <span>
                {t('history.pageOf', { current: page, total: totalPages })}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  to={buildPageHref(page - 1)}
                  aria-disabled={!canGoPrev}
                  className={`rounded-full border px-3 py-1 text-[0.7rem] uppercase tracking-[0.2em] transition ${canGoPrev
                    ? 'border-white/20 text-white/70 hover:border-white/50 hover:text-white'
                    : 'pointer-events-none border-white/10 text-white/30'
                    }`}
                >
                  {t('common.prev')}
                </Link>
                <Link
                  to={buildPageHref(page + 1)}
                  aria-disabled={!canGoNext}
                  className={`rounded-full border px-3 py-1 text-[0.7rem] uppercase tracking-[0.2em] transition ${canGoNext
                    ? 'border-white/20 text-white/70 hover:border-white/50 hover:text-white'
                    : 'pointer-events-none border-white/10 text-white/30'
                    }`}
                >
                  {t('common.next')}
                </Link>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-dashed border-white/20 bg-white/5 p-6 text-sm text-white/60">
          {hasAnyRecords ? (
            <div className="grid gap-2">
              <p className="text-sm font-semibold text-white">{t('history.noResults')}</p>
              <p className="text-white/60">
                {hasActiveFilters
                  ? t('history.noResultsDesc')
                  : t('history.noRecordsYet')}
              </p>
            </div>
          ) : (
            <div className="grid gap-2">
              <p className="text-sm font-semibold text-white">{t('history.noHistoryYet')}</p>
              <p className="text-white/60">{t('history.noHistoryYetDesc')}</p>
            </div>
          )}
        </div>
      )}
    </>
  );
}
