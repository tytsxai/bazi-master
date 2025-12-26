export default function BaziForm({
  t,
  formData,
  errors,
  dateInputLimits,
  locationOptions,
  formatLocationLabel,
  onFieldChange,
  onSubmit,
  onOpenResetConfirm,
  onCancel,
  onFullAnalysis,
  onOpenAiConfirm,
  onSaveRecord,
  onAddFavorite,
  onOpenHistory,
  isCalculating,
  isSaving,
  isFullLoading,
  isAiLoading,
  isFavoriting,
  isAuthenticated,
  baseResult,
  fullResult,
  savedRecord,
  favoriteStatus,
  errorAnnouncement,
}) {
  return (
    <div className="glass-card rounded-3xl border border-white/10 p-8 shadow-glass">
      <h1 className="font-display text-3xl text-gold-400">{t('bazi.title')}</h1>
      <p className="mt-2 text-sm text-white/70">{t('bazi.subtitle')}</p>
      <div className="sr-only" role="alert" aria-live="assertive">
        {errorAnnouncement}
      </div>
      <form onSubmit={onSubmit} className="mt-6 grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="birthYear" className="block text-sm text-white/80">
            {t('bazi.birthYear')}
          </label>
          <input
            id="birthYear"
            type="number"
            value={formData.birthYear}
            onChange={onFieldChange('birthYear')}
            className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-white"
            placeholder="1993"
            min={dateInputLimits.birthYear.min}
            max={dateInputLimits.birthYear.max}
            required
            aria-invalid={Boolean(errors.birthYear)}
            aria-describedby={errors.birthYear ? 'bazi-birthYear-error' : undefined}
          />
          {errors.birthYear && (
            <span id="bazi-birthYear-error" className="mt-2 block text-xs text-rose-200">
              {errors.birthYear}
            </span>
          )}
        </div>
        <div>
          <label htmlFor="birthMonth" className="block text-sm text-white/80">
            {t('bazi.birthMonth')}
          </label>
          <input
            id="birthMonth"
            type="number"
            value={formData.birthMonth}
            onChange={onFieldChange('birthMonth')}
            className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-white"
            placeholder="6"
            min={dateInputLimits.birthMonth.min}
            max={dateInputLimits.birthMonth.max}
            required
            aria-invalid={Boolean(errors.birthMonth)}
            aria-describedby={errors.birthMonth ? 'bazi-birthMonth-error' : undefined}
          />
          {errors.birthMonth && (
            <span id="bazi-birthMonth-error" className="mt-2 block text-xs text-rose-200">
              {errors.birthMonth}
            </span>
          )}
        </div>
        <div>
          <label htmlFor="birthDay" className="block text-sm text-white/80">
            {t('bazi.birthDay')}
          </label>
          <input
            id="birthDay"
            type="number"
            value={formData.birthDay}
            onChange={onFieldChange('birthDay')}
            className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-white"
            placeholder="18"
            min={dateInputLimits.birthDay.min}
            max={dateInputLimits.birthDay.max}
            required
            aria-invalid={Boolean(errors.birthDay)}
            aria-describedby={errors.birthDay ? 'bazi-birthDay-error' : undefined}
          />
          {errors.birthDay && (
            <span id="bazi-birthDay-error" className="mt-2 block text-xs text-rose-200">
              {errors.birthDay}
            </span>
          )}
        </div>
        <div>
          <label htmlFor="birthHour" className="block text-sm text-white/80">
            {t('bazi.birthHour')}
          </label>
          <input
            id="birthHour"
            type="number"
            value={formData.birthHour}
            onChange={onFieldChange('birthHour')}
            className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-white"
            placeholder="14"
            min="0"
            max="23"
            required
            aria-invalid={Boolean(errors.birthHour)}
            aria-describedby={errors.birthHour ? 'bazi-birthHour-error' : undefined}
          />
          {errors.birthHour && (
            <span id="bazi-birthHour-error" className="mt-2 block text-xs text-rose-200">
              {errors.birthHour}
            </span>
          )}
        </div>
        <div>
          <label htmlFor="gender" className="block text-sm text-white/80">
            {t('bazi.gender')}
          </label>
          <select
            id="gender"
            value={formData.gender}
            onChange={onFieldChange('gender')}
            className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-white"
            required
            aria-invalid={Boolean(errors.gender)}
            aria-describedby={errors.gender ? 'bazi-gender-error' : undefined}
          >
            <option value="" disabled>
              {t('bazi.genderPlaceholder', { defaultValue: t('bazi.gender') })}
            </option>
            <option value="female">{t('bazi.genderFemale')}</option>
            <option value="male">{t('bazi.genderMale')}</option>
          </select>
          {errors.gender && (
            <span id="bazi-gender-error" className="mt-2 block text-xs text-rose-200">
              {errors.gender}
            </span>
          )}
        </div>
        <div>
          <label htmlFor="birthLocation" className="block text-sm text-white/80">
            {t('bazi.birthLocation')}
          </label>
          <input
            id="birthLocation"
            type="text"
            value={formData.birthLocation}
            onChange={onFieldChange('birthLocation')}
            list="bazi-location-options"
            className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-white"
            placeholder={t('bazi.locationPlaceholder')}
            aria-invalid={Boolean(errors.birthLocation)}
            aria-describedby={errors.birthLocation ? 'bazi-birthLocation-error' : undefined}
          />
          <datalist id="bazi-location-options">
            {locationOptions.map((location) => {
              const label = formatLocationLabel(location);
              const key = `${location.name || 'coords'}-${location.latitude}-${location.longitude}`;
              return <option key={key} value={label} />;
            })}
          </datalist>
          <p className="mt-2 text-xs text-white/50">{t('bazi.locationHint')}</p>
          {errors.birthLocation && (
            <span id="bazi-birthLocation-error" className="mt-2 block text-xs text-rose-200">
              {errors.birthLocation}
            </span>
          )}
        </div>
        <div className="md:col-span-2">
          <label htmlFor="timezone" className="block text-sm text-white/80">
            {t('bazi.timezone')}
          </label>
          <input
            id="timezone"
            type="text"
            value={formData.timezone}
            onChange={onFieldChange('timezone')}
            className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-white"
            placeholder="UTC+8"
            aria-invalid={Boolean(errors.timezone)}
            aria-describedby={errors.timezone ? 'bazi-timezone-error' : undefined}
          />
          {errors.timezone && (
            <span id="bazi-timezone-error" className="mt-2 block text-xs text-rose-200">
              {errors.timezone}
            </span>
          )}
        </div>
        <div className="mt-2 grid gap-3 md:col-span-2 md:grid-cols-3">
          <button
            type="submit"
            className="rounded-full bg-gold-400 px-4 py-2 text-sm font-semibold text-mystic-900 shadow-lg shadow-gold-400/30 disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isCalculating || isSaving}
          >
            {isCalculating ? `${t('bazi.calculate')}...` : t('bazi.calculate')}
          </button>
          <button
            type="button"
            onClick={onOpenResetConfirm}
            className="rounded-full border border-white/30 px-4 py-2 text-sm font-semibold text-white/80 transition hover:border-gold-400/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isCalculating}
          >
            {t('bazi.reset')}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-white/30 px-4 py-2 text-sm font-semibold text-white/80 transition hover:border-gold-400/60 hover:text-white"
          >
            {t('common.cancel')}
          </button>
        </div>
      </form>

      <div className="mt-6 grid gap-3 md:grid-cols-2">
        <button
          type="button"
          onClick={onFullAnalysis}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onFullAnalysis();
            }
          }}
          className="rounded-full border border-gold-400/60 px-4 py-2 text-sm text-gold-400 transition hover:bg-gold-400/10 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!baseResult || isFullLoading}
          data-testid="bazi-full-analysis"
        >
          {isFullLoading ? `${t('bazi.fullAnalysis')}...` : t('bazi.fullAnalysis')}
        </button>
        <button
          type="button"
          onClick={onOpenAiConfirm}
          className="rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 px-4 py-2 text-sm font-bold text-white shadow-lg transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!fullResult || isAiLoading}
          data-testid="bazi-ai-interpret"
          aria-label={t('bazi.aiOpen')}
        >
          ✨ {isAiLoading ? t('bazi.aiThinking') : t('bazi.aiInterpret')}
        </button>
        <button
          type="button"
          onClick={onSaveRecord}
          className="rounded-full border border-white/20 px-4 py-2 text-sm text-white/80 transition hover:border-gold-400/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!baseResult || isSaving}
          data-testid="bazi-save-record"
          aria-label="Save to History"
        >
          {isSaving ? `${t('bazi.saveRecord')}...` : t('bazi.saveRecord')}
        </button>
        <button
          type="button"
          onClick={onAddFavorite}
          className="rounded-full border border-white/20 px-4 py-2 text-sm text-white/80 transition hover:border-gold-400/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!savedRecord || isFavoriting}
        >
          {isFavoriting ? `${t('bazi.addFavorite')}...` : t('bazi.addFavorite')}
        </button>
        <button
          type="button"
          onClick={onOpenHistory}
          className="rounded-full border border-white/20 px-4 py-2 text-sm text-white/80 transition hover:border-gold-400/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!isAuthenticated}
          data-testid="bazi-view-history"
        >
          {t('nav.history')}
        </button>
      </div>
      {favoriteStatus && (
        <p className="mt-3 text-xs text-white/60">{t('bazi.favoriteReady')}</p>
      )}
    </div>
  );
}
