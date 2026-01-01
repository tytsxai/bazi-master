export default function BaziResult({
  variant = 'column',
  t,
  formData,
  timeMeta,
  displayResult,
  elements,
  onZiweiGenerate,
  ziweiLoading,
  ziweiStatus,
  ziweiResult,
  formatLocationLabel,
  aiResult,
  displayAiResult,
  isAiLoading,
  tenGodsList,
  maxTenGodStrength,
  luckCyclesList,
}) {
  if (variant === 'details') {
    return (
      <>
        {(aiResult !== null || isAiLoading) && (
          <section className="mt-10 glass-card rounded-3xl border border-purple-500/30 bg-purple-900/10 p-8 shadow-glass">
            <h2 className="font-display text-2xl text-purple-300">✨ {t('bazi.aiAnalysis')}</h2>
            <div
              className="mt-4 prose prose-invert max-w-none whitespace-pre-wrap text-white/90"
              data-testid="bazi-ai-result"
            >
              {displayAiResult || (isAiLoading ? t('bazi.aiThinking') : '')}
            </div>
          </section>
        )}

        <section className="mt-10 grid gap-6 lg:grid-cols-2">
          <div
            className="glass-card rounded-3xl border border-white/10 p-6 shadow-glass"
            data-testid="ten-gods-section"
          >
            <h2 className="font-display text-2xl text-gold-400">{t('bazi.tenGods')}</h2>
            <div className="mt-4 grid gap-x-10 gap-y-3 3xl:grid-cols-2" data-testid="ten-gods-list">
              {tenGodsList.length ? (
                tenGodsList.map((item) => (
                  <div
                    key={item.name}
                    className="flex items-center gap-4"
                    data-testid="ten-god-item"
                  >
                    <span className="w-32 text-sm text-white/80">{item.name}</span>
                    <div className="h-2 flex-1 rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-purple-300"
                        style={{
                          width: maxTenGodStrength
                            ? `${Math.round((item.strength / maxTenGodStrength) * 100)}%`
                            : '0%',
                        }}
                      />
                    </div>
                    <span className="text-xs text-white/60">{item.strength}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-white/60">{t('bazi.fullWaiting')}</p>
              )}
            </div>
          </div>

          <div
            className="glass-card rounded-3xl border border-white/10 p-6 shadow-glass"
            data-testid="luck-cycles-section"
          >
            <h2 className="font-display text-2xl text-gold-400">{t('bazi.luckCycles')}</h2>
            <div
              className="mt-4 grid gap-3 sm:grid-cols-2 3xl:grid-cols-3"
              data-testid="luck-cycles-list"
            >
              {luckCyclesList.length ? (
                luckCyclesList.map((cycle) => (
                  <div
                    key={cycle.range}
                    className="rounded-2xl border border-white/10 bg-white/5 p-4"
                    data-testid="luck-cycle-item"
                  >
                    <p className="text-xs uppercase tracking-[0.2em] text-white/60">
                      {cycle.range}
                    </p>
                    <p className="mt-2 text-lg text-white">
                      {cycle.stem} · {cycle.branch}
                    </p>
                    {cycle.startYear && cycle.endYear ? (
                      <p className="mt-1 text-xs text-white/50">
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
        </section>
      </>
    );
  }

  return (
    <div className="space-y-6">
      <section className="glass-card rounded-3xl border border-white/10 p-6 shadow-glass">
        <h2 className="font-display text-2xl text-gold-400">{t('bazi.timeContext')}</h2>
        {timeMeta ? (
          <div className="mt-4 space-y-3 text-sm text-white/80">
            <div className="flex flex-col gap-1">
              <span className="text-xs uppercase tracking-[0.2em] text-white/50">
                {t('bazi.timezoneInput')}
              </span>
              <span data-testid="timezone-input">{formData.timezone || '—'}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs uppercase tracking-[0.2em] text-white/50">
                {t('bazi.timezoneResolved')}
              </span>
              <span data-testid="timezone-resolved">
                {timeMeta.offsetLabel || t('bazi.timezoneUnavailable')}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs uppercase tracking-[0.2em] text-white/50">
                {t('bazi.birthUtc')}
              </span>
              <span data-testid="birth-utc">
                {timeMeta.birthIso || t('bazi.timezoneUnavailable')}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs uppercase tracking-[0.2em] text-white/50">
                {t('bazi.trueSolarTime')}
              </span>
              <span data-testid="true-solar-time">
                {timeMeta.trueSolar?.applied
                  ? timeMeta.trueSolar.correctedIso
                  : t('bazi.trueSolarUnavailable')}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs uppercase tracking-[0.2em] text-white/50">
                {t('bazi.trueSolarCorrection')}
              </span>
              <span data-testid="true-solar-correction">
                {timeMeta.trueSolar?.applied ? `${timeMeta.trueSolar.correctionMinutes} min` : '—'}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs uppercase tracking-[0.2em] text-white/50">
                {t('bazi.trueSolarLocation')}
              </span>
              <span data-testid="true-solar-location">
                {formatLocationLabel(timeMeta.trueSolar?.location)}
              </span>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-white/60">{t('bazi.waiting')}</p>
        )}
      </section>
      <section className="glass-card rounded-3xl border border-white/10 p-6 shadow-glass">
        <h2 className="font-display text-2xl text-gold-400">{t('nav.ziwei')} (V2)</h2>
        <p className="mt-2 text-sm text-white/70">{t('profile.ziweiQuickChartDesc')}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onZiweiGenerate}
            className="rounded-full bg-gold-400 px-4 py-2 text-xs font-semibold text-mystic-900 shadow-lg shadow-gold-400/30 transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={ziweiLoading}
          >
            {ziweiLoading ? `${t('profile.calculating')}...` : t('ziwei.generateChart')}
          </button>
        </div>
        {ziweiStatus.type !== 'idle' && (
          <p
            data-testid="bazi-ziwei-status"
            role={ziweiStatus.type === 'error' ? 'alert' : 'status'}
            aria-live={ziweiStatus.type === 'error' ? 'assertive' : 'polite'}
            className={`mt-4 text-sm ${
              ziweiStatus.type === 'error' ? 'text-rose-200' : 'text-emerald-200'
            }`}
          >
            {ziweiStatus.message ||
              (ziweiStatus.type === 'loading' ? `${t('profile.calculating')}...` : '')}
          </p>
        )}
        {ziweiResult && (
          <div className="mt-6 grid gap-4 md:grid-cols-3" data-testid="bazi-ziwei-result">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <h3 className="text-xs uppercase text-gold-400/80">{t('ziwei.lunarDate')}</h3>
              <p className="mt-2 text-white">
                {ziweiResult?.lunar
                  ? `${ziweiResult.lunar.year}年 ${ziweiResult.lunar.month}月 ${ziweiResult.lunar.day}日${ziweiResult.lunar.isLeap ? ' (Leap)' : ''}`
                  : '—'}
              </p>
              <p className="mt-1 text-xs text-white/60">
                {ziweiResult?.lunar
                  ? `${ziweiResult.lunar.yearStem}${ziweiResult.lunar.yearBranch}年 · ${ziweiResult.lunar.monthStem}${ziweiResult.lunar.monthBranch}月`
                  : '—'}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <h3 className="text-xs uppercase text-gold-400/80">{t('ziwei.keyPalaces')}</h3>
              <p className="mt-2 text-white">
                命宫: {ziweiResult?.mingPalace?.palace?.cn} ·{' '}
                {ziweiResult?.mingPalace?.branch?.name}
              </p>
              <p className="mt-1 text-white">
                身宫: {ziweiResult?.shenPalace?.palace?.cn} ·{' '}
                {ziweiResult?.shenPalace?.branch?.name}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <h3 className="text-xs uppercase text-gold-400/80">{t('ziwei.birthTime')}</h3>
              <p className="mt-2 text-white">{ziweiResult?.birthIso || '—'}</p>
              <p className="mt-1 text-xs text-white/60">
                {t('ziwei.utcOffset')}:{' '}
                {Number.isFinite(ziweiResult?.timezoneOffsetMinutes)
                  ? `${ziweiResult.timezoneOffsetMinutes} ${t('profile.mins')}`
                  : '—'}
              </p>
            </div>
          </div>
        )}
      </section>
      <section className="glass-card rounded-3xl border border-white/10 p-6 shadow-glass">
        <h2 className="font-display text-2xl text-gold-400">{t('bazi.fourPillars')}</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2" data-testid="pillars-grid">
          {displayResult ? (
            Object.entries(displayResult.pillars).map(([key, pillar]) => (
              <div key={key} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-white/50">
                  {t(`bazi.${key}`)}
                </p>
                <p className="mt-2 text-lg text-white">
                  {pillar.stem} · {pillar.branch}
                </p>
                <p className="text-xs text-white/60">
                  {pillar.elementStem} / {pillar.elementBranch}
                </p>
              </div>
            ))
          ) : (
            <p className="text-sm text-white/60" data-testid="pillars-empty">
              {t('bazi.waiting')}
            </p>
          )}
        </div>
      </section>

      <section className="glass-card rounded-3xl border border-white/10 p-6 shadow-glass">
        <h2 className="font-display text-2xl text-gold-400">{t('bazi.fiveElements')}</h2>
        <div className="mt-4 space-y-3" data-testid="elements-chart">
          {elements.length ? (
            elements.map(({ element, count, percent }) => (
              <div key={element} className="flex items-center gap-3">
                <span className="w-20 text-xs uppercase tracking-[0.2em] text-white/70">
                  {t(`bazi.elements.${element}`)}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gold-400"
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <span className="text-xs text-white/60">
                  {count} · {percent}%
                </span>
              </div>
            ))
          ) : (
            <p className="text-sm text-white/60" data-testid="elements-empty">
              {t('bazi.waiting')}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
