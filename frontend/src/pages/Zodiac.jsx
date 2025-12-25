import { useEffect, useMemo, useState } from 'react';

const SIGNS = [
  { value: 'aries', label: 'Aries', range: 'Mar 21 - Apr 19' },
  { value: 'taurus', label: 'Taurus', range: 'Apr 20 - May 20' },
  { value: 'gemini', label: 'Gemini', range: 'May 21 - Jun 20' },
  { value: 'cancer', label: 'Cancer', range: 'Jun 21 - Jul 22' },
  { value: 'leo', label: 'Leo', range: 'Jul 23 - Aug 22' },
  { value: 'virgo', label: 'Virgo', range: 'Aug 23 - Sep 22' },
  { value: 'libra', label: 'Libra', range: 'Sep 23 - Oct 22' },
  { value: 'scorpio', label: 'Scorpio', range: 'Oct 23 - Nov 21' },
  { value: 'sagittarius', label: 'Sagittarius', range: 'Nov 22 - Dec 21' },
  { value: 'capricorn', label: 'Capricorn', range: 'Dec 22 - Jan 19' },
  { value: 'aquarius', label: 'Aquarius', range: 'Jan 20 - Feb 18' },
  { value: 'pisces', label: 'Pisces', range: 'Feb 19 - Mar 20' }
];

const PERIODS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' }
];

export default function Zodiac() {
  const [selectedSign, setSelectedSign] = useState('aries');
  const [selectedPeriod, setSelectedPeriod] = useState('daily');
  const [signInfo, setSignInfo] = useState(null);
  const [horoscope, setHoroscope] = useState(null);
  const [status, setStatus] = useState(null);
  const [loadingSign, setLoadingSign] = useState(false);
  const [loadingHoroscope, setLoadingHoroscope] = useState(false);
  const [risingForm, setRisingForm] = useState({
    birthDate: '',
    birthTime: '',
    timezoneOffset: '',
    latitude: '',
    longitude: ''
  });
  const [risingResult, setRisingResult] = useState(null);
  const [risingStatus, setRisingStatus] = useState(null);
  const [risingLoading, setRisingLoading] = useState(false);
  const [compatibilitySign, setCompatibilitySign] = useState('taurus');
  const [compatibilityResult, setCompatibilityResult] = useState(null);
  const [compatibilityStatus, setCompatibilityStatus] = useState(null);
  const [loadingCompatibility, setLoadingCompatibility] = useState(false);

  useEffect(() => {
    if (!selectedSign) return;

    const controller = new AbortController();
    setLoadingSign(true);
    setStatus(null);
    setHoroscope(null);

    fetch(`/api/zodiac/${selectedSign}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Unable to load sign info.');
        }
        return res.json();
      })
      .then((data) => setSignInfo(data.sign))
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setStatus({ type: 'error', message: error.message });
        }
      })
      .finally(() => setLoadingSign(false));

    return () => controller.abort();
  }, [selectedSign]);

  const handleFetchHoroscope = async () => {
    if (!selectedSign) return;
    setLoadingHoroscope(true);
    setStatus(null);

    try {
      const res = await fetch(`/api/zodiac/${selectedSign}/horoscope?period=${selectedPeriod}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Unable to fetch horoscope.');
      }
      const data = await res.json();
      setHoroscope(data);
    } catch (error) {
      setStatus({ type: 'error', message: error.message });
    } finally {
      setLoadingHoroscope(false);
    }
  };

  const handleRisingChange = (event) => {
    const { name, value } = event.target;
    setRisingForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleRisingSubmit = async (event) => {
    event.preventDefault();
    setRisingStatus(null);
    setRisingResult(null);

    const { birthDate, birthTime, timezoneOffset, latitude, longitude } = risingForm;
    if (
      birthDate === '' ||
      birthTime === '' ||
      latitude === '' ||
      longitude === '' ||
      timezoneOffset === ''
    ) {
      setRisingStatus({ type: 'error', message: 'Please complete all rising sign fields.' });
      return;
    }

    const payload = {
      birthDate,
      birthTime,
      latitude: Number(latitude),
      longitude: Number(longitude),
      timezoneOffsetMinutes: Number(timezoneOffset) * 60
    };

    setRisingLoading(true);
    try {
      const res = await fetch('/api/zodiac/rising', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Unable to calculate rising sign.');
      }
      const data = await res.json();
      setRisingResult(data);
    } catch (error) {
      setRisingStatus({ type: 'error', message: error.message });
    } finally {
      setRisingLoading(false);
    }
  };

  const handleFetchCompatibility = async () => {
    if (!selectedSign || !compatibilitySign) return;
    setLoadingCompatibility(true);
    setCompatibilityStatus(null);

    try {
      const res = await fetch(
        `/api/zodiac/compatibility?primary=${selectedSign}&secondary=${compatibilitySign}`
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Unable to calculate compatibility.');
      }
      const data = await res.json();
      setCompatibilityResult(data);
    } catch (error) {
      setCompatibilityStatus({ type: 'error', message: error.message });
    } finally {
      setLoadingCompatibility(false);
    }
  };

  useEffect(() => {
    setCompatibilityResult(null);
    setCompatibilityStatus(null);
  }, [selectedSign, compatibilitySign]);

  const getStatusStyle = (state) =>
    state?.type === 'error'
      ? 'border-rose-400/40 bg-rose-500/10 text-rose-100'
      : 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100';

  const signDisplay = useMemo(
    () => SIGNS.find((sign) => sign.value === selectedSign),
    [selectedSign]
  );

  return (
    <main className="container mx-auto pb-16">
      <div className="glass-card mx-auto rounded-3xl border border-white/10 p-8 shadow-glass">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-4xl text-gold-400">Zodiac Chronicles</h1>
          <p className="text-white/60">
            Select your sign and tap into daily, weekly, or monthly guidance.
          </p>
        </div>

        <section className="mt-8">
          <h2 className="font-display text-xl text-white">Choose your sign</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {SIGNS.map((sign) => {
              const active = sign.value === selectedSign;
              return (
                <button
                  key={sign.value}
                  type="button"
                  onClick={() => setSelectedSign(sign.value)}
                  className={`rounded-2xl border px-4 py-3 text-left transition ${
                    active
                      ? 'border-gold-400/70 bg-gold-400/10 text-gold-200'
                      : 'border-white/10 bg-white/5 text-white/70 hover:border-white/30 hover:text-white'
                  }`}
                >
                  <div className="font-semibold">{sign.label}</div>
                  <div className="text-xs text-white/50">{sign.range}</div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="mt-8 flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm uppercase tracking-[0.2em] text-white/40">Focus</div>
            <div className="mt-1 text-lg text-white">
              {signDisplay?.label} {signDisplay ? '•' : ''} {signDisplay?.range}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {PERIODS.map((period) => {
              const active = period.value === selectedPeriod;
              return (
                <button
                  key={period.value}
                  type="button"
                  onClick={() => setSelectedPeriod(period.value)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    active
                      ? 'bg-indigo-600 text-white'
                      : 'border border-white/10 bg-white/5 text-white/60 hover:text-white'
                  }`}
                >
                  {period.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleFetchHoroscope}
            disabled={loadingHoroscope || loadingSign}
            className="rounded-full bg-gold-400 px-6 py-2 font-semibold text-mystic-900 shadow-lg transition hover:scale-105 disabled:opacity-50"
          >
            {loadingHoroscope ? 'Reading the stars...' : 'Get Horoscope'}
          </button>
        </section>

        {status && (
          <div className={`mt-4 rounded-2xl border px-4 py-2 ${getStatusStyle(status)}`}>
            {status.message}
          </div>
        )}

        {loadingSign && (
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-white/60">
            Loading sign details...
          </div>
        )}

        {signInfo && (
          <section className="mt-8 grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <h3 className="font-display text-2xl text-white">Sign Profile</h3>
              <dl className="mt-4 grid grid-cols-2 gap-4 text-sm text-white/70">
                <div>
                  <dt className="uppercase text-white/40">Element</dt>
                  <dd className="mt-1 text-white">{signInfo.element}</dd>
                </div>
                <div>
                  <dt className="uppercase text-white/40">Modality</dt>
                  <dd className="mt-1 text-white">{signInfo.modality}</dd>
                </div>
                <div>
                  <dt className="uppercase text-white/40">Ruling Planet</dt>
                  <dd className="mt-1 text-white">{signInfo.rulingPlanet}</dd>
                </div>
                <div>
                  <dt className="uppercase text-white/40">Symbol</dt>
                  <dd className="mt-1 text-white">{signInfo.symbol}</dd>
                </div>
              </dl>
              <div className="mt-4 text-sm text-white/70">
                <span className="uppercase text-white/40">Keywords</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {signInfo.keywords.map((keyword) => (
                    <span key={keyword} className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/80">
                      {keyword}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <h3 className="font-display text-2xl text-white">Cosmic Patterns</h3>
              <div className="mt-4 grid gap-4 text-sm text-white/70">
                <div>
                  <div className="uppercase text-white/40">Strengths</div>
                  <div className="mt-1 text-white">{signInfo.strengths.join(', ')}</div>
                </div>
                <div>
                  <div className="uppercase text-white/40">Challenges</div>
                  <div className="mt-1 text-white">{signInfo.challenges.join(', ')}</div>
                </div>
                <div>
                  <div className="uppercase text-white/40">Compatibility</div>
                  <div className="mt-1 text-white">{signInfo.compatibility.join(', ')}</div>
                </div>
                <div>
                  <div className="uppercase text-white/40">Lucky Colors</div>
                  <div className="mt-1 text-white">{signInfo.luckyColors.join(', ')}</div>
                </div>
              </div>
            </div>
          </section>
        )}

        <section className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="font-display text-2xl text-white">Compatibility Compass</h3>
              <p className="text-sm text-white/60">
                Compare your sign with another to reveal the cosmic chemistry.
              </p>
            </div>
            <button
              type="button"
              onClick={handleFetchCompatibility}
              disabled={loadingCompatibility || loadingSign}
              className="rounded-full bg-indigo-600 px-6 py-2 text-sm font-semibold text-white shadow-lg transition hover:scale-105 disabled:opacity-50"
            >
              {loadingCompatibility ? 'Calculating...' : 'Check Compatibility'}
            </button>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-white/40">Primary</div>
              <div className="mt-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white">
                {signDisplay?.label} {signDisplay ? '•' : ''} {signDisplay?.range}
              </div>
            </div>
            <label className="flex flex-col gap-2 text-sm text-white/70">
              <span className="text-xs uppercase tracking-[0.2em] text-white/40">Match with</span>
              <select
                value={compatibilitySign}
                onChange={(event) => setCompatibilitySign(event.target.value)}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white"
              >
                {SIGNS.map((sign) => (
                  <option key={sign.value} value={sign.value} className="bg-slate-900 text-white">
                    {sign.label} • {sign.range}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {compatibilityStatus && (
            <div className={`mt-4 rounded-2xl border px-4 py-2 ${getStatusStyle(compatibilityStatus)}`}>
              {compatibilityStatus.message}
            </div>
          )}

          {compatibilityResult && (
            <div className="mt-6 grid gap-6 md:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-white/40">Score</div>
                <div className="mt-2 text-4xl font-semibold text-gold-300">
                  {compatibilityResult.score}
                  <span className="text-lg text-white/50">/100</span>
                </div>
                <div className="mt-2 text-sm text-white/70">{compatibilityResult.level}</div>
                <div className="mt-4 h-2 w-full rounded-full bg-white/10">
                  <div
                    className="h-2 rounded-full bg-gold-400"
                    style={{ width: `${compatibilityResult.score}%` }}
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 md:col-span-2">
                <div className="text-xs uppercase tracking-[0.2em] text-white/40">Summary</div>
                <p className="mt-2 text-sm text-white/70">{compatibilityResult.summary}</p>
                <div className="mt-4 grid gap-3 text-sm text-white/70 sm:grid-cols-2">
                  {compatibilityResult.highlights.map((item) => (
                    <div
                      key={item}
                      className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2"
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>

        {horoscope && (
          <section className="mt-10 rounded-3xl border border-indigo-500/30 bg-indigo-900/20 p-8">
            <div className="flex flex-col gap-2">
              <h3 className="font-display text-2xl text-indigo-200">
                {horoscope.sign.name} {horoscope.period.charAt(0).toUpperCase() + horoscope.period.slice(1)} Horoscope
              </h3>
              <div className="text-sm text-white/60">
                {horoscope.range} • Generated {new Date(horoscope.generatedAt).toLocaleString()}
              </div>
            </div>

            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-white/80">
                <div className="text-sm uppercase text-white/40">Overview</div>
                <p className="mt-2 text-sm text-white/80">{horoscope.horoscope.overview}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-white/80">
                <div className="text-sm uppercase text-white/40">Love</div>
                <p className="mt-2 text-sm text-white/80">{horoscope.horoscope.love}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-white/80">
                <div className="text-sm uppercase text-white/40">Career</div>
                <p className="mt-2 text-sm text-white/80">{horoscope.horoscope.career}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-white/80">
                <div className="text-sm uppercase text-white/40">Wellness</div>
                <p className="mt-2 text-sm text-white/80">{horoscope.horoscope.wellness}</p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-4">
              <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80">
                Lucky colors: {horoscope.horoscope.lucky.colors.join(', ')}
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80">
                Lucky numbers: {horoscope.horoscope.lucky.numbers.join(', ')}
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80">
                Mantra: {horoscope.horoscope.mantra}
              </div>
            </div>
          </section>
        )}

        <section className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-8">
          <div className="flex flex-col gap-2">
            <h3 className="font-display text-2xl text-white">Calculate Your Rising Sign</h3>
            <p className="text-sm text-white/60">
              Enter your birth date, time, and location to reveal your ascendant.
            </p>
          </div>

          <form onSubmit={handleRisingSubmit} className="mt-6 grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm text-white/70">
              Birth date
              <input
                type="date"
                name="birthDate"
                value={risingForm.birthDate}
                onChange={handleRisingChange}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-white"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-white/70">
              Birth time
              <input
                type="time"
                name="birthTime"
                value={risingForm.birthTime}
                onChange={handleRisingChange}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-white"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-white/70">
              Timezone offset (UTC hours)
              <input
                type="number"
                step="0.5"
                name="timezoneOffset"
                value={risingForm.timezoneOffset}
                onChange={handleRisingChange}
                placeholder="-5"
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-white"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-white/70">
              Latitude
              <input
                type="number"
                step="0.0001"
                name="latitude"
                value={risingForm.latitude}
                onChange={handleRisingChange}
                placeholder="40.7128"
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-white"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-white/70">
              Longitude
              <input
                type="number"
                step="0.0001"
                name="longitude"
                value={risingForm.longitude}
                onChange={handleRisingChange}
                placeholder="-74.0060"
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-white"
              />
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={risingLoading}
                className="w-full rounded-full bg-indigo-600 px-6 py-3 font-semibold text-white shadow-lg transition hover:scale-105 disabled:opacity-50"
              >
                {risingLoading ? 'Calculating...' : 'Reveal Rising Sign'}
              </button>
            </div>
          </form>

          {risingStatus && (
            <div className="mt-4 rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-2 text-rose-100">
              {risingStatus.message}
            </div>
          )}

          {risingResult && (
            <div className="mt-6 grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-6 text-white/80 md:grid-cols-2">
              <div>
                <div className="text-sm uppercase text-white/40">Rising Sign</div>
                <div className="mt-2 text-2xl text-gold-300">{risingResult.rising.name}</div>
                <div className="mt-1 text-sm text-white/60">{risingResult.rising.dateRange}</div>
              </div>
              <div className="grid gap-2 text-sm text-white/70">
                <div>
                  <span className="uppercase text-white/40">Ascendant Longitude</span>
                  <div className="mt-1 text-white">{risingResult.ascendant.longitude}°</div>
                </div>
                <div>
                  <span className="uppercase text-white/40">Local Sidereal Time</span>
                  <div className="mt-1 text-white">{risingResult.ascendant.localSiderealTime}h</div>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
