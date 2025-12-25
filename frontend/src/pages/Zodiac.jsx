import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import { readApiErrorMessage } from '../utils/apiError.js';

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
const PREFILL_STORAGE_KEY = 'bazi_prefill_request_v1';

export default function Zodiac() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
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
  const [risingErrors, setRisingErrors] = useState({});
  const [risingResult, setRisingResult] = useState(null);
  const [risingStatus, setRisingStatus] = useState(null);
  const [risingLoading, setRisingLoading] = useState(false);
  const [compatibilitySign, setCompatibilitySign] = useState('taurus');
  const [compatibilityResult, setCompatibilityResult] = useState(null);
  const [compatibilityStatus, setCompatibilityStatus] = useState(null);
  const [loadingCompatibility, setLoadingCompatibility] = useState(false);
  const urlHydratedRef = useRef(false);
  const autoFetchRef = useRef(false);

  const normalizeSignParam = useCallback((value) => {
    if (!value) return null;
    const normalized = value.toLowerCase().trim();
    return SIGNS.some((sign) => sign.value === normalized) ? normalized : null;
  }, []);

  const normalizePeriodParam = useCallback((value) => {
    if (!value) return null;
    const normalized = value.toLowerCase().trim();
    return PERIODS.some((period) => period.value === normalized) ? normalized : null;
  }, []);
  const compatibilityAbortRef = useRef(null);
  const compatibilityRequestRef = useRef(0);
  const risingAbortRef = useRef(null);
  const risingRequestRef = useRef(0);
  const risingInFlightRef = useRef(false);
  const [ichingTimeResult, setIchingTimeResult] = useState(null);
  const [ichingTimeStatus, setIchingTimeStatus] = useState(null);
  const [ichingTimeLoading, setIchingTimeLoading] = useState(false);
  const baziPrefill = useMemo(
    () => ({
      birthYear: '1994',
      birthMonth: '7',
      birthDay: '19',
      birthHour: '16',
      gender: 'female',
      birthLocation: 'Zodiac Gate',
      timezone: 'UTC+8'
    }),
    []
  );

  useEffect(() => {
    if (!selectedSign) return;

    const controller = new AbortController();
    setLoadingSign(true);
    setStatus(null);
    setHoroscope(null);

    fetch(`/api/zodiac/${selectedSign}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          const message = await readApiErrorMessage(res, 'Unable to load sign info.');
          throw new Error(message);
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

  const handleFetchHoroscope = useCallback(async () => {
    if (!selectedSign) return;
    setLoadingHoroscope(true);
    setStatus(null);

    try {
      const res = await fetch(`/api/zodiac/${selectedSign}/horoscope?period=${selectedPeriod}`);
      if (!res.ok) {
        const message = await readApiErrorMessage(res, 'Unable to fetch horoscope.');
        throw new Error(message);
      }
      const data = await res.json();
      setHoroscope(data);
    } catch (error) {
      setStatus({ type: 'error', message: error.message });
    } finally {
      setLoadingHoroscope(false);
    }
  }, [selectedPeriod, selectedSign]);

  useEffect(() => {
    if (urlHydratedRef.current) return;
    const signParam = normalizeSignParam(searchParams.get('sign'));
    const periodParam = normalizePeriodParam(searchParams.get('period'));
    const hasSignParam = searchParams.has('sign');
    const hasPeriodParam = searchParams.has('period');

    if (hasSignParam && !signParam) {
      setStatus({ type: 'error', message: 'Unknown zodiac sign in URL.' });
    }
    if (hasPeriodParam && !periodParam) {
      setStatus({ type: 'error', message: 'Unknown horoscope period in URL.' });
    }

    if (signParam) setSelectedSign(signParam);
    if (periodParam) setSelectedPeriod(periodParam);

    if (signParam || periodParam) {
      autoFetchRef.current = true;
    }

    urlHydratedRef.current = true;
  }, [normalizePeriodParam, normalizeSignParam, searchParams]);

  useEffect(() => {
    if (!autoFetchRef.current) return;
    if (!selectedSign || !selectedPeriod) return;
    autoFetchRef.current = false;
    void handleFetchHoroscope();
  }, [handleFetchHoroscope, selectedPeriod, selectedSign]);

  const getRisingErrors = (form, t) => {
    const nextErrors = {};
    const { birthDate, birthTime, timezoneOffset, latitude, longitude } = form;

    if (!birthDate) {
      nextErrors.birthDate = t('bazi.errors.dayRequired'); // Reuse date/day required
    } else {
      const [year, month, day] = birthDate.split('-').map(Number);
      const date = new Date(Date.UTC(year, month - 1, day));
      if (
        !Number.isFinite(year) ||
        !Number.isFinite(month) ||
        !Number.isFinite(day) ||
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
      ) {
        nextErrors.birthDate = t('bazi.errors.dateInvalid');
      }
    }

    if (!birthTime) {
      nextErrors.birthTime = t('bazi.errors.hourRequired');
    } else {
      const [hour, minute] = birthTime.split(':').map(Number);
      if (
        !Number.isFinite(hour) ||
        !Number.isFinite(minute) ||
        hour < 0 ||
        hour > 23 ||
        minute < 0 ||
        minute > 59
      ) {
        nextErrors.birthTime = t('bazi.errors.hourInvalid');
      }
    }

    if (timezoneOffset === '' || timezoneOffset === null || timezoneOffset === undefined) {
      nextErrors.timezoneOffset = t('bazi.errors.timezoneWhitespace');
    } else {
      const offset = Number(timezoneOffset);
      if (!Number.isFinite(offset)) {
        nextErrors.timezoneOffset = t('bazi.errors.timezoneWhitespace');
      } else if (offset < -14 || offset > 14) {
        nextErrors.timezoneOffset = t('bazi.errors.timezoneWhitespace');
      }
    }

    if (latitude === '' || latitude === null || latitude === undefined) {
      nextErrors.latitude = t('bazi.errors.locationWhitespace');
    } else {
      const lat = Number(latitude);
      if (!Number.isFinite(lat)) {
        nextErrors.latitude = t('bazi.errors.locationWhitespace');
      } else if (lat < -90 || lat > 90) {
        nextErrors.latitude = t('bazi.errors.locationWhitespace');
      }
    }

    if (longitude === '' || longitude === null || longitude === undefined) {
      nextErrors.longitude = t('bazi.errors.locationWhitespace');
    } else {
      const lon = Number(longitude);
      if (!Number.isFinite(lon)) {
        nextErrors.longitude = t('bazi.errors.locationWhitespace');
      } else if (lon < -180 || lon > 180) {
        nextErrors.longitude = t('bazi.errors.locationWhitespace');
      }
    }

    return nextErrors;
  };

  const getFirstErrorMessage = (nextErrors) => {
    const firstMessage = Object.values(nextErrors).find((value) => typeof value === 'string' && value.trim());
    return firstMessage || 'Please correct the highlighted fields.';
  };

  const risingErrorAnnouncement =
    Object.keys(risingErrors).length > 0 ? getFirstErrorMessage(risingErrors) : '';

  const handleRisingChange = (event) => {
    const { name, value } = event.target;
    setRisingForm((prev) => {
      const next = { ...prev, [name]: value };
      setRisingErrors((prevErrors) => {
        if (!prevErrors || !prevErrors[name]) return prevErrors;
        const nextErrors = getRisingErrors(next, t);
        if (!nextErrors[name]) {
          const trimmed = { ...prevErrors };
          delete trimmed[name];
          return trimmed;
        }
        return prevErrors;
      });
      return next;
    });
  };

  const handleRisingSubmit = async (event) => {
    event.preventDefault();
    if (risingLoading || risingInFlightRef.current) return;
    setRisingStatus(null);
    setRisingResult(null);

    const nextErrors = getRisingErrors(risingForm, t);
    setRisingErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setRisingStatus({ type: 'error', message: getFirstErrorMessage(nextErrors) });
      return;
    }

    const { birthDate, birthTime, timezoneOffset, latitude, longitude } = risingForm;
    const payload = {
      birthDate,
      birthTime,
      latitude: Number(latitude),
      longitude: Number(longitude),
      timezoneOffsetMinutes: Number(timezoneOffset) * 60
    };

    risingInFlightRef.current = true;
    risingAbortRef.current?.abort();
    const controller = new AbortController();
    risingAbortRef.current = controller;
    const requestId = risingRequestRef.current + 1;
    risingRequestRef.current = requestId;
    setRisingLoading(true);
    try {
      const res = await fetch('/api/zodiac/rising', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      if (!res.ok) {
        const message = await readApiErrorMessage(res, 'Unable to calculate rising sign.');
        throw new Error(message);
      }
      const data = await res.json();
      if (risingRequestRef.current !== requestId) return;
      setRisingResult(data);
    } catch (error) {
      if (error.name !== 'AbortError') {
        setRisingStatus({ type: 'error', message: error.message });
      }
    } finally {
      if (risingRequestRef.current === requestId) {
        setRisingLoading(false);
      }
      if (risingRequestRef.current === requestId) {
        risingInFlightRef.current = false;
      }
    }
  };

  const handleFetchCompatibility = async () => {
    if (!selectedSign || !compatibilitySign) return;
    compatibilityAbortRef.current?.abort();
    const controller = new AbortController();
    compatibilityAbortRef.current = controller;
    const requestId = compatibilityRequestRef.current + 1;
    compatibilityRequestRef.current = requestId;
    setLoadingCompatibility(true);
    setCompatibilityStatus(null);

    try {
      const res = await fetch(
        `/api/zodiac/compatibility?primary=${selectedSign}&secondary=${compatibilitySign}`,
        { signal: controller.signal }
      );
      if (!res.ok) {
        const message = await readApiErrorMessage(res, 'Unable to calculate compatibility.');
        throw new Error(message);
      }
      const data = await res.json();
      if (compatibilityRequestRef.current !== requestId) return;
      setCompatibilityResult(data);
    } catch (error) {
      if (error.name !== 'AbortError') {
        setCompatibilityStatus({ type: 'error', message: error.message });
      }
    } finally {
      if (compatibilityRequestRef.current === requestId) {
        setLoadingCompatibility(false);
      }
    }
  };

  useEffect(() => {
    compatibilityAbortRef.current?.abort();
    setCompatibilityResult(null);
    setCompatibilityStatus(null);
    setLoadingCompatibility(false);
  }, [selectedSign, compatibilitySign]);

  const handleIchingTimeDivine = async () => {
    setIchingTimeStatus(null);
    setIchingTimeResult(null);
    setIchingTimeLoading(true);

    try {
      const res = await fetch('/api/iching/divine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'time' })
      });
      if (!res.ok) {
        const message = await readApiErrorMessage(res, 'Unable to reveal the time hexagram.');
        throw new Error(message);
      }
      const data = await res.json();
      setIchingTimeResult(data);
      setIchingTimeStatus({ type: 'success', message: 'Time divination complete.' });
    } catch (error) {
      setIchingTimeStatus({ type: 'error', message: error.message });
    } finally {
      setIchingTimeLoading(false);
    }
  };

  const handleBaziFullAnalysis = () => {
    const payload = { ...baziPrefill };
    const request = {
      formData: payload,
      autoFullAnalysis: true,
      source: 'zodiac',
      createdAt: new Date().toISOString()
    };
    try {
      sessionStorage.setItem(PREFILL_STORAGE_KEY, JSON.stringify(request));
    } catch {
      // Ignore storage failures.
    }

    if (isAuthenticated) {
      navigate('/bazi', {
        state: { baziPrefill: payload, autoFullAnalysis: true, source: 'zodiac' }
      });
      return;
    }

    navigate('/login', { state: { from: '/bazi' } });
  };

  const getStatusStyle = (state) =>
    state?.type === 'error'
      ? 'border-rose-400/40 bg-rose-500/10 text-rose-100'
      : 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100';

  const signDisplay = useMemo(
    () => SIGNS.find((sign) => sign.value === selectedSign),
    [selectedSign]
  );
  const displaySignInfo = signInfo || (signDisplay && {
    name: signDisplay.label,
    dateRange: signDisplay.range
  });
  const compatibilityPrimary = compatibilityResult?.primary || displaySignInfo;
  const compatibilitySecondary = useMemo(() => {
    if (compatibilityResult?.secondary) return compatibilityResult.secondary;
    const fallback = SIGNS.find((sign) => sign.value === compatibilitySign);
    return fallback ? { name: fallback.label, dateRange: fallback.range } : null;
  }, [compatibilityResult, compatibilitySign]);
  const primaryLabel = compatibilityPrimary?.name || '';
  const primaryRange = compatibilityPrimary?.dateRange || '';
  const secondaryLabel = compatibilitySecondary?.name || '';
  const secondaryRange = compatibilitySecondary?.dateRange || '';
  const focusLabel = displaySignInfo?.name || '';
  const focusRange = displaySignInfo?.dateRange || '';

  return (
    <main id="main-content" tabIndex={-1} className="responsive-container pb-16">
      <Breadcrumbs />
      <div className="glass-card mx-auto rounded-3xl border border-white/10 p-8 shadow-glass">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-4xl text-gold-400">Zodiac Chronicles</h1>
          <p className="text-white/60">
            Select your sign and tap into daily, weekly, or monthly guidance.
          </p>
        </div>

        <section className="mt-6 flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-display text-white">Zi Wei</h2>
            <p className="text-sm text-white/60">
              Jump into the V2 palace chart flow (login required).
            </p>
          </div>
          <Link
            to="/ziwei"
            className="inline-flex items-center justify-center rounded-full border border-gold-400/60 px-5 py-2 text-sm font-semibold text-gold-200 transition hover:bg-gold-400/10"
          >
            Zi Wei
          </Link>
        </section>

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
              {focusLabel} {focusRange ? '•' : ''} {focusRange}
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
          <div
            role={status.type === 'error' ? 'alert' : 'status'}
            aria-live={status.type === 'error' ? 'assertive' : 'polite'}
            className={`mt-4 rounded-2xl border px-4 py-2 ${getStatusStyle(status)}`}
          >
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

        <section id="compatibility" className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-6">
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
                {primaryLabel} {primaryRange ? '•' : ''} {primaryRange}
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
            {compatibilityResult && (
              <div className="md:col-span-2 text-xs text-white/50">
                Backend pairing: {primaryLabel}
                {primaryRange ? ` (${primaryRange})` : ''}
                {' + '}
                {secondaryLabel}
                {secondaryRange ? ` (${secondaryRange})` : ''}
              </div>
            )}
          </div>

          {compatibilityStatus && (
            <div
              role={compatibilityStatus.type === 'error' ? 'alert' : 'status'}
              aria-live={compatibilityStatus.type === 'error' ? 'assertive' : 'polite'}
              className={`mt-4 rounded-2xl border px-4 py-2 ${getStatusStyle(compatibilityStatus)}`}
            >
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

        <section id="rising" className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-8">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="font-display text-2xl text-white">I Ching Time Oracle</h3>
              <p className="text-sm text-white/60">
                Draw a hexagram using the current moment to reveal hidden currents.
              </p>
            </div>
            <button
              type="button"
              onClick={handleIchingTimeDivine}
              disabled={ichingTimeLoading}
              className="rounded-full bg-gold-400 px-6 py-2 text-sm font-semibold text-mystic-900 shadow-lg transition hover:scale-105 disabled:opacity-50"
            >
              {ichingTimeLoading ? 'Consulting time...' : 'Reveal Time Hexagram'}
            </button>
          </div>

          {ichingTimeStatus && (
            <div
              role={ichingTimeStatus.type === 'error' ? 'alert' : 'status'}
              aria-live={ichingTimeStatus.type === 'error' ? 'assertive' : 'polite'}
              className={`mt-4 rounded-2xl border px-4 py-2 ${getStatusStyle(ichingTimeStatus)}`}
            >
              {ichingTimeStatus.message}
            </div>
          )}

          {ichingTimeResult?.hexagram && (
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-white/80">
                <div className="text-xs uppercase tracking-[0.2em] text-white/40">Primary Hexagram</div>
                <div
                  data-testid="iching-time-hexagram-name"
                  className="mt-2 text-2xl text-gold-300"
                >
                  {ichingTimeResult.hexagram.name}
                </div>
                <div className="text-sm text-white/60">{ichingTimeResult.hexagram.title}</div>
                <div className="mt-4 text-xs text-white/50">
                  Changing lines:{' '}
                  <span data-testid="iching-time-changing-lines">
                    {ichingTimeResult.changingLines?.length
                      ? ichingTimeResult.changingLines.join(', ')
                      : 'None'}
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-white/80">
                <div className="text-xs uppercase tracking-[0.2em] text-white/40">Resulting Hexagram</div>
                <div
                  data-testid="iching-time-resulting-name"
                  className="mt-2 text-2xl text-indigo-200"
                >
                  {ichingTimeResult.resultingHexagram?.name || '—'}
                </div>
                <div className="text-sm text-white/60">{ichingTimeResult.resultingHexagram?.title}</div>
                <div className="mt-4 text-xs text-white/50">
                  Time context:{' '}
                  <span data-testid="iching-time-iso">
                    {ichingTimeResult.timeContext?.iso || '—'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-8">
          <div className="flex flex-col gap-2">
            <h3 className="font-display text-2xl text-white">Calculate Your Rising Sign</h3>
            <p className="text-sm text-white/60">
              Enter your birth date, time, and location to reveal your ascendant.
            </p>
          </div>
          <div className="sr-only" role="alert" aria-live="assertive">
            {risingErrorAnnouncement}
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
                required
                aria-invalid={Boolean(risingErrors.birthDate)}
                aria-describedby={risingErrors.birthDate ? 'rising-birthDate-error' : undefined}
              />
              {risingErrors.birthDate && (
                <span id="rising-birthDate-error" className="text-xs text-rose-200">
                  {risingErrors.birthDate}
                </span>
              )}
            </label>
            <label className="flex flex-col gap-2 text-sm text-white/70">
              Birth time
              <input
                type="time"
                name="birthTime"
                value={risingForm.birthTime}
                onChange={handleRisingChange}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-white"
                required
                aria-invalid={Boolean(risingErrors.birthTime)}
                aria-describedby={risingErrors.birthTime ? 'rising-birthTime-error' : undefined}
              />
              {risingErrors.birthTime && (
                <span id="rising-birthTime-error" className="text-xs text-rose-200">
                  {risingErrors.birthTime}
                </span>
              )}
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
                required
                aria-invalid={Boolean(risingErrors.timezoneOffset)}
                aria-describedby={risingErrors.timezoneOffset ? 'rising-timezoneOffset-error' : undefined}
              />
              {risingErrors.timezoneOffset && (
                <span id="rising-timezoneOffset-error" className="text-xs text-rose-200">
                  {risingErrors.timezoneOffset}
                </span>
              )}
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
                required
                aria-invalid={Boolean(risingErrors.latitude)}
                aria-describedby={risingErrors.latitude ? 'rising-latitude-error' : undefined}
              />
              {risingErrors.latitude && (
                <span id="rising-latitude-error" className="text-xs text-rose-200">
                  {risingErrors.latitude}
                </span>
              )}
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
                required
                aria-invalid={Boolean(risingErrors.longitude)}
                aria-describedby={risingErrors.longitude ? 'rising-longitude-error' : undefined}
              />
              {risingErrors.longitude && (
                <span id="rising-longitude-error" className="text-xs text-rose-200">
                  {risingErrors.longitude}
                </span>
              )}
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
            <div
              role={risingStatus.type === 'error' ? 'alert' : 'status'}
              aria-live={risingStatus.type === 'error' ? 'assertive' : 'polite'}
              className="mt-4 rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-2 text-rose-100"
            >
              {risingStatus.message}
            </div>
          )}

          {risingResult && (
            <div className="mt-6 grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-6 text-white/80 md:grid-cols-2">
              <div>
                <div className="text-sm uppercase text-white/40">Rising Sign</div>
                <div data-testid="rising-sign-name" className="mt-2 text-2xl text-gold-300">
                  {risingResult.rising.name}
                </div>
                <div data-testid="rising-sign-range" className="mt-1 text-sm text-white/60">
                  {risingResult.rising.dateRange}
                </div>
              </div>
              <div className="grid gap-2 text-sm text-white/70">
                <div>
                  <span className="uppercase text-white/40">Ascendant Longitude</span>
                  <div data-testid="rising-ascendant-longitude" className="mt-1 text-white">
                    {risingResult.ascendant.longitude}°
                  </div>
                </div>
                <div>
                  <span className="uppercase text-white/40">Local Sidereal Time</span>
                  <div data-testid="rising-local-sidereal-time" className="mt-1 text-white">
                    {risingResult.ascendant.localSiderealTime}h
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
