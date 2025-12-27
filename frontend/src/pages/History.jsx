import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import Breadcrumbs from '../components/Breadcrumbs';
import HistoryFilters from '../components/history/HistoryFilters';
import HistoryList from '../components/history/HistoryList';
import useHistoryData from '../hooks/useHistoryData';

export default function History() {
  const { t } = useTranslation();
  const {
    status,
    confirmState,
    setConfirmState,
    confirmCancelRef,
    handleConfirmAction,
    handleIchingTimeDivine,
    ichingTimeLoading,
    ichingTimeStatus,
    ichingTimeResult,
    getIchingStatusStyle,
    deepLinkState,
    clearDeepLink,
    handleExport,
    isExporting,
    handleExportAll,
    isExportingAll,
    fileInputRef,
    handleImportFile,
    isImporting,
    query,
    genderFilter,
    rangeFilter,
    sortOption,
    isQueryActive,
    isGenderActive,
    isRangeActive,
    isSortActive,
    handleQueryChange,
    handleGenderChange,
    handleRangeChange,
    handleSortChange,
    handleClearFilter,
    handleResetFilters,
    orderedDeletedRecords,
    primaryRestoreId,
    showDeletedLocation,
    handleRestore,
    requestHardDelete,
    requestDelete,
    filteredRecords,
    selectedIds,
    selectedSet,
    selectAllRef,
    allFilteredSelected,
    toggleSelectAll,
    clearSelected,
    requestBulkDelete,
    toggleSelection,
    startEdit,
    editRecordId,
    editDraft,
    editErrors,
    editStatus,
    editSaving,
    updateEditDraft,
    handleEditSave,
    cancelEdit,
    highlightRecordId,
    totalPages,
    page,
    canGoPrev,
    canGoNext,
    buildPageHref,
    hasAnyRecords,
    hasActiveFilters,
    records,
    tarotHistory,
    tarotHistoryLoading,
    tarotHistoryError,
    loadTarotHistory,
  } = useHistoryData({ t });

  return (
    <main id="main-content" tabIndex={-1} className="responsive-container pb-16">
      <Breadcrumbs />
      {status && (
        <div className="pointer-events-none fixed right-6 top-6 z-50 flex w-[min(90vw,360px)] flex-col gap-2">
          <div
            role={status.type === 'error' ? 'alert' : 'status'}
            aria-live={status.type === 'error' ? 'assertive' : 'polite'}
            className={`pointer-events-auto rounded-2xl border px-4 py-3 text-sm shadow-lg backdrop-blur ${status.type === 'error'
              ? 'border-rose-400/40 bg-rose-500/10 text-rose-100'
              : 'border-emerald-300/40 bg-emerald-500/10 text-emerald-100'
              }`}
          >
            {status.message}
          </div>
        </div>
      )}
      {confirmState && (
        <div
          role="presentation"
          onClick={() => setConfirmState(null)}
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4 py-6"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-confirm-title"
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-950/95 p-6 text-white shadow-2xl backdrop-blur"
          >
            <h2 id="history-confirm-title" className="text-lg font-semibold text-white">
              {confirmState.title}
            </h2>
            <p className="mt-2 text-sm text-white/70">{confirmState.description}</p>
            {(confirmState.type === 'single' || confirmState.type === 'hard') && confirmState.record && (
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-white/70">
                <p className="text-sm text-white">
                  {confirmState.record.birthYear}-{confirmState.record.birthMonth}-{confirmState.record.birthDay} · {confirmState.record.birthHour}:00
                </p>
                <p className="mt-1 text-white/60">
                  {confirmState.record.gender} · {confirmState.record.birthLocation || '—'} · {confirmState.record.timezone || 'UTC'}
                </p>
              </div>
            )}
            <div className="mt-6 flex flex-wrap gap-3 sm:justify-end">
              <button
                ref={confirmCancelRef}
                type="button"
                onClick={() => setConfirmState(null)}
                className="rounded-full border border-white/20 px-4 py-2 text-xs uppercase tracking-[0.2em] text-white/70 transition hover:border-white/40 hover:text-white"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleConfirmAction}
                className="rounded-full border border-rose-400/40 bg-rose-500/10 px-4 py-2 text-xs uppercase tracking-[0.2em] text-rose-100 transition hover:border-rose-300 hover:text-rose-200"
              >
                {confirmState.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
      <section className="glass-card rounded-3xl border border-white/10 p-8 shadow-glass [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto sm:[&_table]:table sm:[&_table]:max-w-none sm:[&_table]:overflow-visible">
        <h1 className="font-display text-3xl text-gold-400">{t('nav.history')}</h1>
        <p className="mt-3 text-white/70">{t('history.subtitle')}</p>
        <section className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-xl text-white">{t('zodiac.timeOracleTitle')}</h2>
              <p className="text-sm text-white/60">
                {t('zodiac.timeOracleSubtitle')}
              </p>
            </div>
            <button
              type="button"
              onClick={handleIchingTimeDivine}
              disabled={ichingTimeLoading}
              className="rounded-full bg-gold-400 px-6 py-2 text-sm font-semibold text-mystic-900 shadow-lg transition hover:scale-105 disabled:opacity-50"
            >
              {ichingTimeLoading ? t('zodiac.consultingTime') : t('zodiac.revealTimeHexagram')}
            </button>
          </div>

          {ichingTimeStatus && (
            <div
              role={ichingTimeStatus.type === 'error' ? 'alert' : 'status'}
              aria-live={ichingTimeStatus.type === 'error' ? 'assertive' : 'polite'}
              className={`mt-4 rounded-2xl border px-4 py-2 ${getIchingStatusStyle(ichingTimeStatus)}`}
            >
              {ichingTimeStatus.message}
            </div>
          )}

          {ichingTimeResult?.hexagram && (
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-white/80">
                <div className="text-xs uppercase tracking-[0.2em] text-white/50">{t('iching.primaryHexagram')}</div>
                <div
                  data-testid="iching-time-hexagram-name"
                  className="mt-2 text-2xl text-gold-300"
                >
                  {ichingTimeResult.hexagram.name}
                </div>
                <div className="text-sm text-white/60">{ichingTimeResult.hexagram.title}</div>
                <div className="mt-4 text-xs text-white/50">
                  {t('iching.changingLines')}: {' '}
                  <span data-testid="iching-time-changing-lines">
                    {ichingTimeResult.changingLines?.length
                      ? ichingTimeResult.changingLines.join(', ')
                      : t('iching.none')}
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-white/80">
                <div className="text-xs uppercase tracking-[0.2em] text-white/40">{t('iching.resultingHexagram')}</div>
                <div
                  data-testid="iching-time-resulting-name"
                  className="mt-2 text-2xl text-indigo-200"
                >
                  {ichingTimeResult.resultingHexagram?.name || '—'}
                </div>
                <div className="text-sm text-white/60">{ichingTimeResult.resultingHexagram?.title}</div>
                <div className="mt-4 text-xs text-white/50">
                  {t('bazi.timeContext')}: {' '}
                  <span data-testid="iching-time-iso">
                    {ichingTimeResult.timeContext?.iso || '—'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </section>
        {deepLinkState.status === 'loading' && (
          <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-white/70">
            {t('history.recordLoading')}
          </div>
        )}
        {deepLinkState.status === 'missing' && (
          <div className="mt-5 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-100">
            <p className="font-semibold text-rose-100">{t('history.recordMissing')}</p>
            <p className="mt-1 text-rose-100/80">
              {t('history.sharedMissingDesc')}
            </p>
          </div>
        )}
        {deepLinkState.status === 'error' && (
          <div className="mt-5 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-100">
            <p className="font-semibold text-rose-100">{t('history.errorLoadingShared')}</p>
            <p className="mt-1 text-rose-100/80">{t('history.sharedErrorDesc')}</p>
          </div>
        )}
        {deepLinkState.status === 'found' && deepLinkState.record && (
          <div
            data-testid="history-shared-record"
            className="mt-5 rounded-2xl border border-gold-400/30 bg-gold-500/10 p-4 text-sm text-gold-100"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-gold-100">{t('history.sharedLoaded')}</p>
                <p className="mt-1 text-gold-100/80">
                  {t('history.detailsSubtitle')}
                </p>
              </div>
              <button
                type="button"
                onClick={clearDeepLink}
                className="rounded-full border border-gold-300/40 px-3 py-1 text-[0.7rem] uppercase tracking-[0.2em] text-gold-100 transition hover:border-gold-200 hover:text-white"
              >
                {t('history.clearLink')}
              </button>
            </div>
            <div className="mt-3 grid gap-2 text-xs text-gold-100/80 sm:grid-cols-2">
              <div>
                <p className="text-[0.65rem] uppercase tracking-[0.2em] text-gold-100/60">{t('history.birth')}</p>
                <p className="text-sm text-gold-100">
                  {deepLinkState.record.birthYear}-{deepLinkState.record.birthMonth}-{deepLinkState.record.birthDay} · {deepLinkState.record.birthHour}:00
                </p>
              </div>
              <div>
                <p className="text-[0.65rem] uppercase tracking-[0.2em] text-gold-100/60">{t('history.profile')}</p>
                <p className="text-sm text-gold-100">
                  {deepLinkState.record.gender} · {deepLinkState.record.birthLocation || '—'} · {deepLinkState.record.timezone || 'UTC'}
                </p>
              </div>
            </div>
          </div>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleExport}
            disabled={!records.length || isExporting}
            className="rounded-full border border-white/20 px-4 py-2 text-xs uppercase tracking-[0.2em] text-white/70 transition hover:border-white/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isExporting ? t('history.exporting') : t('history.exportFiltered')}
          </button>
          <button
            type="button"
            onClick={handleExportAll}
            disabled={isExportingAll}
            className="rounded-full border border-white/20 px-4 py-2 text-xs uppercase tracking-[0.2em] text-white/70 transition hover:border-white/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isExportingAll ? t('history.exporting') : t('history.exportAll')}
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="rounded-full border border-white/20 px-4 py-2 text-xs uppercase tracking-[0.2em] text-white/70 transition hover:border-white/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isImporting ? t('history.importing') : t('history.importFile')}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            onChange={handleImportFile}
            className="hidden"
          />
        </div>
        <HistoryFilters
          query={query}
          genderFilter={genderFilter}
          rangeFilter={rangeFilter}
          sortOption={sortOption}
          isQueryActive={isQueryActive}
          isGenderActive={isGenderActive}
          isRangeActive={isRangeActive}
          isSortActive={isSortActive}
          onQueryChange={handleQueryChange}
          onGenderChange={handleGenderChange}
          onRangeChange={handleRangeChange}
          onSortChange={handleSortChange}
          onClearFilter={handleClearFilter}
          onResetFilters={handleResetFilters}
        />
        <HistoryList
          orderedDeletedRecords={orderedDeletedRecords}
          primaryRestoreId={primaryRestoreId}
          showDeletedLocation={showDeletedLocation}
          onRestore={handleRestore}
          onRequestHardDelete={requestHardDelete}
          filteredRecords={filteredRecords}
          highlightRecordId={highlightRecordId}
          selectedIds={selectedIds}
          selectedSet={selectedSet}
          allFilteredSelected={allFilteredSelected}
          onToggleSelectAll={toggleSelectAll}
          onClearSelected={clearSelected}
          onRequestBulkDelete={requestBulkDelete}
          onToggleSelection={toggleSelection}
          onStartEdit={startEdit}
          onRequestDelete={requestDelete}
          editRecordId={editRecordId}
          editDraft={editDraft}
          editErrors={editErrors}
          editStatus={editStatus}
          editSaving={editSaving}
          onUpdateEditDraft={updateEditDraft}
          onEditSave={handleEditSave}
          onCancelEdit={cancelEdit}
          totalPages={totalPages}
          page={page}
          canGoPrev={canGoPrev}
          canGoNext={canGoNext}
          buildPageHref={buildPageHref}
          hasAnyRecords={hasAnyRecords}
          hasActiveFilters={hasActiveFilters}
          selectAllRef={selectAllRef}
        />
      </section>
      <section className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl text-gold-300">{t('history.tarotArchive')}</h2>
            <p className="mt-1 text-sm text-white/60">
              {t('history.tarotSubtitle')}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/tarot?spread=ThreeCard"
              className="rounded-full border border-gold-400/60 px-4 py-2 text-xs uppercase tracking-[0.2em] text-gold-200 transition hover:bg-gold-400/10"
            >
              {t('history.startThreeCard')}
            </Link>
            <button
              type="button"
              onClick={loadTarotHistory}
              disabled={tarotHistoryLoading}
              className="rounded-full border border-white/20 px-4 py-2 text-xs uppercase tracking-[0.2em] text-white/70 transition hover:border-white/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {tarotHistoryLoading ? t('history.refreshing') : t('history.refresh')}
            </button>
          </div>
        </div>
        {tarotHistoryError && (
          <p className="mt-4 text-sm text-rose-200" role="alert">
            {tarotHistoryError}
          </p>
        )}
        {!tarotHistoryError && tarotHistory.length === 0 && !tarotHistoryLoading && (
          <div className="mt-4 rounded-2xl border border-dashed border-white/20 bg-white/5 p-4 text-sm text-white/60">
            {t('history.noTarotYet')}
          </div>
        )}
        <div className="mt-5 space-y-4">
          {tarotHistory.map((record) => (
            <article
              key={record.id}
              data-testid="history-tarot-entry"
              className="rounded-2xl border border-white/10 bg-black/30 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-white/40">{record.spreadType}</p>
                  <h3 className="text-lg font-semibold text-white">
                    {record.userQuestion || t('history.generalReading')}
                  </h3>
                </div>
                <span className="text-xs text-white/50">
                  {record.createdAt ? new Date(record.createdAt).toLocaleString() : '—'}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/70">
                {record.cards?.map((card) => (
                  <span
                    key={`${record.id}-${card.position}`}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1"
                  >
                    {card.positionLabel || `#${card.position}`} · {card.name}
                  </span>
                ))}
              </div>
              {record.aiInterpretation && (
                <div className="mt-4 rounded-xl border border-purple-500/20 bg-purple-900/20 p-3 text-xs text-white/80">
                  {record.aiInterpretation}
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
