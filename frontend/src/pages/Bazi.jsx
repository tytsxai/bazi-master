import Breadcrumbs from '../components/Breadcrumbs';
import BaziForm from '../components/bazi/BaziForm';
import BaziResult from '../components/bazi/BaziResult';
import useBaziCalculation from '../components/bazi/useBaziCalculation';

export default function Bazi() {
  const {
    t,
    formData,
    locationOptions,
    baseResult,
    fullResult,
    savedRecord,
    favoriteStatus,
    ziweiStatus,
    ziweiResult,
    ziweiLoading,
    toasts,
    errors,
    isCalculating,
    isFullLoading,
    isSaving,
    isFavoriting,
    isAiLoading,
    confirmResetOpen,
    confirmAiOpen,
    pendingRetry,
    isOnline,
    confirmResetCancelRef,
    confirmAiCancelRef,
    getRetryLabel,
    attemptRetry,
    clearPendingRetry,
    statusStyle,
    toastLabel,
    updateField,
    dateInputLimits,
    handleCalculate,
    handleFullAnalysis,
    handleSaveRecord,
    handleAddFavorite,
    handleOpenHistory,
    handleZiweiGenerate,
    timeMeta,
    displayResult,
    elements,
    tenGodsList,
    maxTenGodStrength,
    luckCyclesList,
    aiResult,
    displayAiResult,
    handleConfirmReset,
    handleCancel,
    handleConfirmAiRequest,
    setConfirmResetOpen,
    setConfirmAiOpen,
    formatLocationLabel,
    errorAnnouncement,
    isAuthenticated,
  } = useBaziCalculation();

  return (
    <main id="main-content" tabIndex={-1} className="responsive-container pb-16">
      <Breadcrumbs />
      {pendingRetry && (
        <section
          data-testid="retry-banner"
          role="status"
          className="mt-6 rounded-3xl border border-amber-400/40 bg-amber-500/10 px-6 py-4 text-sm text-amber-50 shadow-glass"
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-amber-200">{t('common.warning')}</p>
              <p className="mt-2 text-sm text-amber-50">
                {getRetryLabel(pendingRetry.action)}{' '}
                {t('errors.actionQueued', { label: '' })
                  .replace('已加入重试队列。', '')
                  .replace('queued for retry.', '')
                  .trim()}.{' '}
                {isOnline ? t('bazi.retryNow') : t('errors.offline')}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                data-testid="retry-action"
                onClick={() => attemptRetry('manual')}
                disabled={!isOnline}
                className="rounded-full border border-amber-200/60 bg-amber-200/10 px-4 py-2 text-xs uppercase tracking-[0.2em] text-amber-100 transition hover:border-amber-100 hover:text-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {t('bazi.retryNow')}
              </button>
              <button
                type="button"
                data-testid="retry-dismiss"
                onClick={clearPendingRetry}
                className="rounded-full border border-amber-200/30 px-4 py-2 text-xs uppercase tracking-[0.2em] text-amber-100 transition hover:border-amber-200 hover:text-amber-50"
              >
                {t('bazi.dismiss')}
              </button>
            </div>
          </div>
        </section>
      )}
      {toasts.length > 0 && (
        <div className="pointer-events-none fixed right-6 top-6 z-50 flex w-[min(90vw,360px)] flex-col gap-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              role={toast.type === 'error' ? 'alert' : 'status'}
              aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
              className={`pointer-events-auto rounded-2xl border px-4 py-3 text-sm shadow-lg backdrop-blur ${statusStyle(
                toast.type
              )}`}
            >
              <span className="mr-2 inline-flex items-center rounded-full border border-current/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em]">
                {toastLabel(toast.type)}
              </span>
              {toast.message}
            </div>
          ))}
        </div>
      )}
      {confirmResetOpen && (
        <div
          role="presentation"
          onClick={() => setConfirmResetOpen(false)}
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4 py-6"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="bazi-reset-title"
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-950/95 p-6 text-white shadow-2xl backdrop-blur"
          >
            <h2 id="bazi-reset-title" className="text-lg font-semibold text-white">
              {t('bazi.reset')}?
            </h2>
            <p className="mt-2 text-sm text-white/70">{t('errors.unsavedChanges')}</p>
            <div className="mt-6 flex flex-wrap gap-3 sm:justify-end">
              <button
                ref={confirmResetCancelRef}
                type="button"
                onClick={() => setConfirmResetOpen(false)}
                className="rounded-full border border-white/20 px-4 py-2 text-xs uppercase tracking-[0.2em] text-white/70 transition hover:border-white/40 hover:text-white"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleConfirmReset}
                className="rounded-full border border-rose-400/40 bg-rose-500/10 px-4 py-2 text-xs uppercase tracking-[0.2em] text-rose-100 transition hover:border-rose-300 hover:text-rose-200"
              >
                {t('bazi.reset')}
              </button>
            </div>
          </div>
        </div>
      )}
      {confirmAiOpen && (
        <div
          role="presentation"
          onClick={() => setConfirmAiOpen(false)}
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4 py-6"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="bazi-ai-title"
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-950/95 p-6 text-white shadow-2xl backdrop-blur"
          >
            <h2 id="bazi-ai-title" className="text-lg font-semibold text-white">
              {t('ziwei.aiConfirmTitle')}
            </h2>
            <p className="mt-2 text-sm text-white/70">{t('ziwei.aiConfirmDesc')}</p>
            <div className="mt-6 flex flex-wrap gap-3 sm:justify-end">
              <button
                ref={confirmAiCancelRef}
                type="button"
                onClick={() => setConfirmAiOpen(false)}
                className="rounded-full border border-white/20 px-4 py-2 text-xs uppercase tracking-[0.2em] text-white/70 transition hover:border-white/40 hover:text-white"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleConfirmAiRequest}
                className="rounded-full border border-purple-400/40 bg-purple-500/10 px-4 py-2 text-xs uppercase tracking-[0.2em] text-purple-100 transition hover:border-purple-300 hover:text-purple-200"
              >
                {t('ziwei.aiInterpret')}
              </button>
            </div>
          </div>
        </div>
      )}
      <section className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
        <BaziForm
          t={t}
          formData={formData}
          errors={errors}
          dateInputLimits={dateInputLimits}
          locationOptions={locationOptions}
          formatLocationLabel={formatLocationLabel}
          onFieldChange={updateField}
          onSubmit={handleCalculate}
          onOpenResetConfirm={() => setConfirmResetOpen(true)}
          onCancel={handleCancel}
          onFullAnalysis={handleFullAnalysis}
          onOpenAiConfirm={() => setConfirmAiOpen(true)}
          onSaveRecord={handleSaveRecord}
          onAddFavorite={handleAddFavorite}
          onOpenHistory={handleOpenHistory}
          isCalculating={isCalculating}
          isSaving={isSaving}
          isFullLoading={isFullLoading}
          isAiLoading={isAiLoading}
          isFavoriting={isFavoriting}
          isAuthenticated={isAuthenticated}
          baseResult={baseResult}
          fullResult={fullResult}
          savedRecord={savedRecord}
          favoriteStatus={favoriteStatus}
          errorAnnouncement={errorAnnouncement}
        />
        <BaziResult
          t={t}
          formData={formData}
          timeMeta={timeMeta}
          displayResult={displayResult}
          elements={elements}
          onZiweiGenerate={handleZiweiGenerate}
          ziweiLoading={ziweiLoading}
          ziweiStatus={ziweiStatus}
          ziweiResult={ziweiResult}
          formatLocationLabel={formatLocationLabel}
        />
      </section>
      <BaziResult
        variant="details"
        t={t}
        aiResult={aiResult}
        displayAiResult={displayAiResult}
        isAiLoading={isAiLoading}
        tenGodsList={tenGodsList}
        maxTenGodStrength={maxTenGodStrength}
        luckCyclesList={luckCyclesList}
      />
    </main>
  );
}
