import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useAuthFetch } from '../../auth/useAuthFetch.js';
import { getPreferredAiProvider } from '../../utils/aiProvider.js';
import { getClientId } from '../../utils/clientId.js';
import { readApiErrorMessage } from '../../utils/apiError.js';

// Import utilities
import {
  GUEST_STORAGE_KEY,
  LAST_SAVED_FINGERPRINT_KEY,
  PENDING_SAVE_KEY,
  RECENT_SAVE_KEY,
  PREFILL_STORAGE_KEY,
  UNSAVED_WARNING_MESSAGE,
} from './baziConstants.js';
import {
  formatOffsetMinutes,
  parseTimezoneOffsetMinutes,
  getBrowserTimezoneLabel,
} from './baziTimezoneUtils.js';
import {
  buildDefaultFormData,
  isWhitespaceOnly,
  normalizeOptionalText,
  normalizeOverrideArg,
  normalizeNumericInput,
  formatCoordinate,
  formatLocationLabel,
  coerceInt,
  safeJsonParse,
  isSameFormData,
} from './baziFormUtils.js';
import {
  getTodayParts,
  getDaysInMonth,
  getDateInputLimits,
  isValidCalendarDate,
} from './baziDateUtils.js';
import {
  computeFiveElementsPercent,
  normalizeBaziApiResponse,
} from './baziApiUtils.js';
import { getFieldErrors, hasValidationErrors } from './baziValidationUtils.js';

const useUnsavedChangesWarning = (shouldBlock, message = UNSAVED_WARNING_MESSAGE) => {
  useEffect(() => {
    if (!shouldBlock) return undefined;
    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = message;
      return message;
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [message, shouldBlock]);
};


export default function useBaziCalculation() {
  const { t } = useTranslation();
  const {
    token,
    isAuthenticated,
    logout,
    setRetryAction,
    getRetryAction,
    clearRetryAction,
  } = useAuth();
  const authFetch = useAuthFetch();
  const location = useLocation();
  const navigate = useNavigate();
  const defaultFormDataRef = useRef(buildDefaultFormData());
  const [formData, setFormData] = useState(() => ({ ...defaultFormDataRef.current }));
  const [locationOptions, setLocationOptions] = useState([]);
  const [baseResult, setBaseResult] = useState(null);
  const [fullResult, setFullResult] = useState(null);
  const [savedRecord, setSavedRecord] = useState(null);
  const [favoriteStatus, setFavoriteStatus] = useState(null);
  const [ziweiStatus, setZiweiStatus] = useState({ type: 'idle', message: '' });
  const [ziweiResult, setZiweiResult] = useState(null);
  const [ziweiLoading, setZiweiLoading] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [errors, setErrors] = useState({});
  const [isCalculating, setIsCalculating] = useState(false);
  const [isFullLoading, setIsFullLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isFavoriting, setIsFavoriting] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [confirmAiOpen, setConfirmAiOpen] = useState(false);
  const [pendingRetry, setPendingRetry] = useState(null);
  const [isOnline, setIsOnline] = useState(() => {
    if (typeof navigator === 'undefined') return true;
    return navigator.onLine;
  });
  const calculateInFlightRef = useRef(false);
  const saveInFlightRef = useRef(false);
  const confirmResetCancelRef = useRef(null);
  const confirmAiCancelRef = useRef(null);
  const retryHandledRef = useRef(null);
  const retryAutoAttemptRef = useRef(null);
  const prefillHandledRef = useRef(false);
  const wasOnlineRef = useRef(isOnline);
  const wsRef = useRef(null);
  const wsStatusRef = useRef({ done: false, errored: false });
  const isMountedRef = useRef(true);
  const hasInitializedRef = useRef(false);
  const lastCommittedFormRef = useRef(formData);
  const lastSavedFingerprintRef = useRef(null);
  const clientIdRef = useRef(getClientId());
  const toastIdRef = useRef(0);
  const toastTimeoutsRef = useRef(new Map());
  const aiToastIdRef = useRef(null);
  const runIfMounted = (fn) => {
    if (!isMountedRef.current) return;
    fn();
  };

  const removeToast = (id) => {
    const timeoutId = toastTimeoutsRef.current.get(id);
    if (timeoutId) {
      clearTimeout(timeoutId);
      toastTimeoutsRef.current.delete(id);
    }
    if (!isMountedRef.current) return;
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
    if (aiToastIdRef.current === id) {
      aiToastIdRef.current = null;
    }
  };

  const pushToast = (toast) => {
    if (!isMountedRef.current) return null;
    const id = toastIdRef.current + 1;
    toastIdRef.current = id;
    setToasts((prev) => [...prev, { id, ...toast }]);
    if (toast.autoDismiss !== false) {
      const timeoutMs = Number.isFinite(toast.durationMs)
        ? toast.durationMs
        : toast.type === 'error'
          ? 6000
          : 3500;
      const timeoutId = window.setTimeout(() => removeToast(id), timeoutMs);
      toastTimeoutsRef.current.set(id, timeoutId);
    }
    return id;
  };

  const clearToasts = () => {
    toastTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
    toastTimeoutsRef.current.clear();
    aiToastIdRef.current = null;
    if (!isMountedRef.current) return;
    setToasts([]);
  };

  const clearAiToast = () => {
    if (!aiToastIdRef.current) return;
    removeToast(aiToastIdRef.current);
    aiToastIdRef.current = null;
  };

  const readErrorMessage = (response, fallback) => readApiErrorMessage(response, fallback);

  const getNetworkErrorMessage = (error) => {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return t('errors.network');
  };

  useEffect(() => {
    const controller = new AbortController();
    const loadLocations = async () => {
      try {
        const res = await fetch('/api/locations', { signal: controller.signal });
        if (!res.ok) throw new Error(t('errors.loadLocations'));
        const data = await res.json();
        const locations = Array.isArray(data?.locations) ? data.locations : [];
        if (!controller.signal.aborted) {
          setLocationOptions(locations);
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        console.warn('Failed to load locations:', error);
        setLocationOptions([]);
      }
    };
    loadLocations();
    return () => controller.abort();
  }, []);

  const getRetryLabel = (action) => {
    switch (action) {
      case 'bazi_calculate':
        return t('bazi.retry.bazi_calculate');
      case 'bazi_full_analysis':
        return t('bazi.retry.bazi_full_analysis');
      case 'bazi_save':
        return t('bazi.retry.bazi_save');
      case 'bazi_favorite':
        return t('bazi.retry.bazi_favorite');
      case 'bazi_ziwei':
        return t('bazi.retry.bazi_ziwei');
      default:
        return t('common.action');
    }
  };

  const getCurrentPath = () =>
    `${location.pathname}${location.search || ''}${location.hash || ''}`;

  const queueNetworkRetry = (action, payload, message) => {
    const redirectPath = getCurrentPath();
    const retryPayload = {
      action,
      payload,
      redirectPath,
      reason: 'network_error',
    };
    try {
      setRetryAction(retryPayload);
    } catch {
      // Ignore retry persistence failures.
    }
    const stored = getRetryAction();
    setPendingRetry(stored && stored.action ? stored : { ...retryPayload, createdAt: Date.now() });
    const label = getRetryLabel(action);
    pushToast({
      type: 'error',
      message: t('errors.actionQueued', { label }),
    });
  };

  const clearPendingRetry = () => {
    clearRetryAction();
    setPendingRetry(null);
    retryAutoAttemptRef.current = null;
  };

  const attemptRetry = (source = 'manual') => {
    const retry = pendingRetry || getRetryAction();
    if (!retry || retry.reason !== 'network_error') return;
    if (retryHandledRef.current === retry.createdAt) return;
    if (!isOnline) {
      pushToast({ type: 'error', message: t('errors.offline') });
      return;
    }
    if (retry.action !== 'bazi_calculate' && !isAuthenticated) {
      pushToast({ type: 'error', message: t('bazi.loginRequired') });
      clearPendingRetry();
      return;
    }
    retryHandledRef.current = retry.createdAt;
    clearPendingRetry();
    if (retry.action === 'bazi_calculate') {
      performCalculation(retry.payload, { skipValidation: true });
      return;
    }
    if (retry.action === 'bazi_full_analysis') {
      handleFullAnalysis(retry.payload || null);
      return;
    }
    if (retry.action === 'bazi_save') {
      handleSaveRecord(retry.payload || null);
      return;
    }
    if (retry.action === 'bazi_favorite') {
      handleAddFavorite(retry.payload?.recordId || null);
      return;
    }
    if (retry.action === 'bazi_ziwei') {
      handleZiweiGenerate(retry.payload || null);
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      clearToasts();
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounted');
        wsRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    try {
      lastSavedFingerprintRef.current = sessionStorage.getItem(LAST_SAVED_FINGERPRINT_KEY);
    } catch {
      lastSavedFingerprintRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      localStorage.removeItem(GUEST_STORAGE_KEY);
      return;
    }

    const raw = localStorage.getItem(GUEST_STORAGE_KEY);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw);
      if (parsed?.formData) {
        setFormData((prev) => {
          const next = { ...prev, ...parsed.formData };
          lastCommittedFormRef.current = next;
          hasInitializedRef.current = true;
          return next;
        });
      }
      if (parsed?.baseResult) {
        setBaseResult(normalizeBaziApiResponse(parsed.baseResult));
      }
      pushToast({ type: 'success', message: t('bazi.restored') });
    } catch (error) {
      localStorage.removeItem(GUEST_STORAGE_KEY);
    }
  }, [isAuthenticated, t]);

  useEffect(() => {
    if (isAuthenticated) return;
    const hasBaseResult = Boolean(baseResult);
    const hasDraftChanges = !isSameFormData(formData, defaultFormDataRef.current);

    if (!hasBaseResult && !hasDraftChanges) {
      localStorage.removeItem(GUEST_STORAGE_KEY);
      return;
    }

    const payload = {
      formData,
      baseResult: hasBaseResult ? baseResult : null,
      savedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage failures.
    }
  }, [baseResult, formData, isAuthenticated]);

  useEffect(() => {
    if (!confirmResetOpen && !confirmAiOpen) return;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setConfirmResetOpen(false);
        setConfirmAiOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    if (confirmResetOpen) {
      confirmResetCancelRef.current?.focus();
    }
    if (confirmAiOpen) {
      confirmAiCancelRef.current?.focus();
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmAiOpen, confirmResetOpen]);

  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;
    lastCommittedFormRef.current = formData;
  }, [formData]);

  const hasUnsavedChanges =
    hasInitializedRef.current && !isSameFormData(formData, lastCommittedFormRef.current);
  const shouldBlockNavigation = hasUnsavedChanges || isSaving;
  const navigationBlockMessage = isSaving
    ? t('errors.saveInProgress')
    : t('errors.unsavedChanges');

  useUnsavedChangesWarning(shouldBlockNavigation, navigationBlockMessage);

  const displayResult = fullResult || baseResult;

  const elements = useMemo(() => {
    if (!displayResult?.fiveElements) return [];
    const order = ['Wood', 'Fire', 'Earth', 'Metal', 'Water'];
    const counts = displayResult.fiveElements;
    const total = order.reduce((sum, element) => sum + (counts[element] ?? 0), 0);
    const percents = displayResult.fiveElementsPercent;

    return order.map((element) => {
      const count = counts[element] ?? 0;
      const percent = percents
        ? (percents[element] ?? 0)
        : total
          ? Math.round((count / total) * 100)
          : 0;
      return { element, count, percent };
    });
  }, [displayResult]);

  const timeMeta = useMemo(() => {
    if (!displayResult) return null;
    const offsetMinutes = Number.isFinite(displayResult.timezoneOffsetMinutes)
      ? displayResult.timezoneOffsetMinutes
      : null;
    const trueSolar = displayResult?.trueSolarTime && typeof displayResult.trueSolarTime === 'object'
      ? displayResult.trueSolarTime
      : null;
    return {
      offsetMinutes,
      offsetLabel: Number.isFinite(offsetMinutes) ? formatOffsetMinutes(offsetMinutes) : null,
      birthIso: typeof displayResult.birthIso === 'string' ? displayResult.birthIso : null,
      trueSolar,
    };
  }, [displayResult]);

  const tenGodsList = useMemo(() => {
    if (!Array.isArray(fullResult?.tenGods)) return [];
    return fullResult.tenGods;
  }, [fullResult]);

  const luckCyclesList = useMemo(() => {
    if (!Array.isArray(fullResult?.luckCycles)) return [];
    return fullResult.luckCycles;
  }, [fullResult]);

  const maxTenGodStrength = useMemo(() => {
    if (!tenGodsList.length) return 0;
    return tenGodsList.reduce((max, item) => Math.max(max, item?.strength || 0), 0);
  }, [tenGodsList]);

  const updateField = (field) => (event) => {
    const value = event.target.value;
    setFormData((prev) => {
      const next = { ...prev };
      if (field === 'birthYear' || field === 'birthMonth' || field === 'birthDay') {
        const tentative = { ...prev, [field]: value };
        const dateLimits = getDateInputLimits(tentative);
        const nextValue = normalizeNumericInput(value, dateLimits[field]);
        next[field] = nextValue;

        const refreshedLimits = getDateInputLimits(next);
        if (field !== 'birthYear') {
          next.birthYear = normalizeNumericInput(next.birthYear, refreshedLimits.birthYear);
        }
        if (field !== 'birthMonth') {
          next.birthMonth = normalizeNumericInput(next.birthMonth, refreshedLimits.birthMonth);
        }
        next.birthDay = normalizeNumericInput(next.birthDay, refreshedLimits.birthDay);
      } else {
        const limits = NUMERIC_FIELD_LIMITS[field];
        const nextValue = limits ? normalizeNumericInput(value, limits) : value;
        next[field] = nextValue;
      }
      setErrors((prevErrors) => {
        if (!prevErrors || Object.keys(prevErrors).length === 0) return prevErrors;
        const fieldErrors = getFieldErrors(next, t);
        const nextErrors = { ...prevErrors };

        if (nextErrors[field] && !fieldErrors[field]) {
          delete nextErrors[field];
        }

        if (
          (field === 'birthYear' || field === 'birthMonth' || field === 'birthDay') &&
          nextErrors.birthDay &&
          !fieldErrors.birthDay
        ) {
          delete nextErrors.birthDay;
        }

        return nextErrors;
      });
      return next;
    });
  };

  const validate = () => {
    return getFieldErrors(formData, t);
  };

  const dateInputLimits = getDateInputLimits(formData);

  const getFirstErrorMessage = (nextErrors) => {
    const firstMessage = Object.values(nextErrors).find((value) => typeof value === 'string' && value.trim());
    return firstMessage || t('iching.errors.correctFields');
  };
  const errorAnnouncement = Object.keys(errors).length ? getFirstErrorMessage(errors) : '';

  const resolveTimezoneOffsetMinutesFor = (timezone) => {
    const parsed = parseTimezoneOffsetMinutes(timezone);
    if (Number.isFinite(parsed)) return parsed;
    const trimmed = typeof timezone === 'string' ? timezone.trim() : '';
    if (trimmed) return null;
    return -new Date().getTimezoneOffset();
  };

  const buildPayloadFrom = (data) => ({
    ...data,
    birthYear: Number(data.birthYear),
    birthMonth: Number(data.birthMonth),
    birthDay: Number(data.birthDay),
    birthHour: Number(data.birthHour),
    birthLocation: normalizeOptionalText(data.birthLocation),
    timezone: normalizeOptionalText(data.timezone),
    timezoneOffsetMinutes: resolveTimezoneOffsetMinutesFor(data.timezone),
  });

  const buildPayload = () => buildPayloadFrom(formData);

  const performCalculation = async (payload, { skipValidation = false } = {}) => {
    if (calculateInFlightRef.current || isCalculating) return;
    if (!skipValidation) {
      const nextErrors = validate();
      setErrors(nextErrors);
      if (Object.keys(nextErrors).length > 0) {
        pushToast({ type: 'error', message: getFirstErrorMessage(nextErrors) });
        return;
      }
    }
    setFullResult(null);
    setSavedRecord(null);
    setFavoriteStatus(null);
    calculateInFlightRef.current = true;
    setIsCalculating(true);

    try {
      const res = await fetch('/api/bazi/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const message = await readErrorMessage(res, t('bazi.errors.calculateFailed'));
        runIfMounted(() => pushToast({ type: 'error', message }));
        return;
      }

      const data = await res.json();
      runIfMounted(() => {
        setBaseResult(normalizeBaziApiResponse(data));
        pushToast({ type: 'success', message: t('bazi.calculated') });
      });
      lastCommittedFormRef.current = formData;
    } catch (error) {
      const message = getNetworkErrorMessage(error);
      runIfMounted(() => queueNetworkRetry('bazi_calculate', payload, message));
    } finally {
      calculateInFlightRef.current = false;
      runIfMounted(() => setIsCalculating(false));
    }
  };

  const handleCalculate = async (event) => {
    event.preventDefault();
    const nextErrors = getFieldErrors(formData, t);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const payload = buildPayload();
    await performCalculation(payload);
  };

  const handleFullAnalysis = async (overridePayload = null) => {
    if (!isAuthenticated) {
      pushToast({ type: 'error', message: t('bazi.loginRequired') });
      return;
    }
    if (isFullLoading) return;

    const nextErrors = getFieldErrors(formData, t);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 && !overridePayload) return;

    setAiResult(null);
    flushSync(() => setIsFullLoading(true));
    const payload = normalizeOverrideArg(overridePayload) || buildPayload();

    try {
      const res = await authFetch(
        '/api/bazi/full-analysis',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
        { action: 'bazi_full_analysis', payload }
      );

      if (res.status === 401) {
        redirectForSessionExpired('bazi_full_analysis', payload);
        return;
      }

      if (!res.ok) {
        const message = await readErrorMessage(res, t('bazi.errors.calculateFailed'));
        runIfMounted(() => pushToast({ type: 'error', message }));
        return;
      }

      const data = await res.json();
      runIfMounted(() => {
        const normalized = normalizeBaziApiResponse(data);
        setFullResult(normalized);
        setBaseResult(normalized);
        pushToast({ type: 'success', message: t('bazi.fullReady') });
      });
      lastCommittedFormRef.current = formData;
    } catch (error) {
      const message = getNetworkErrorMessage(error);
      runIfMounted(() => queueNetworkRetry('bazi_full_analysis', payload, message));
    } finally {
      runIfMounted(() => setIsFullLoading(false));
    }
  };

  useEffect(() => {
    if (prefillHandledRef.current) return;
    const statePrefill = location.state?.baziPrefill;
    const stateAutoFull = location.state?.autoFullAnalysis;
    const stateAutoCalc = location.state?.autoCalculate;
    let request = statePrefill
      ? { formData: statePrefill, autoFullAnalysis: stateAutoFull, autoCalculate: stateAutoCalc }
      : null;

    if (!request) {
      const stored = safeJsonParse(sessionStorage.getItem(PREFILL_STORAGE_KEY));
      if (stored && typeof stored === 'object') {
        request = stored;
      }
    }

    if (!request?.formData) return;
    prefillHandledRef.current = true;
    try {
      sessionStorage.removeItem(PREFILL_STORAGE_KEY);
    } catch {
      // Ignore storage failures.
    }

    const nextForm = { ...defaultFormDataRef.current, ...request.formData };
    setFormData(nextForm);
    setErrors({});
    setBaseResult(null);
    setFullResult(null);
    setSavedRecord(null);
    setFavoriteStatus(null);
    lastCommittedFormRef.current = nextForm;

    const payload = buildPayloadFrom(nextForm);
    if (request.autoFullAnalysis) {
      handleFullAnalysis(payload);
      return;
    }
    if (request.autoCalculate) {
      performCalculation(payload, { skipValidation: true });
    }
  }, [location.state, handleFullAnalysis, performCalculation, buildPayloadFrom]);

  const handleSaveRecord = async (overridePayload = null) => {
    if (!isAuthenticated) {
      pushToast({ type: 'error', message: t('bazi.loginRequired') });
      return;
    }
    if (!baseResult && !overridePayload) {
      pushToast({ type: 'error', message: t('bazi.errors.saveBeforeFavorite') });
      return;
    }
    const payload =
      normalizeOverrideArg(overridePayload) ||
      {
        ...buildPayload(),
        result: fullResult
          ? {
            pillars: fullResult.pillars,
            fiveElements: fullResult.fiveElements,
            tenGods: fullResult.tenGods,
            luckCycles: fullResult.luckCycles,
          }
          : baseResult
            ? {
              pillars: baseResult.pillars,
              fiveElements: baseResult.fiveElements,
            }
            : null,
      };
    const fingerprint = JSON.stringify(payload);
    if (lastSavedFingerprintRef.current === fingerprint) {
      pushToast({ type: 'success', message: t('bazi.errors.alreadySaved') });
      return;
    }

    const clientId = clientIdRef.current;
    const requestPayload = clientId ? { ...payload, clientId } : payload;

    if (saveInFlightRef.current || isSaving) return;
    saveInFlightRef.current = true;
    setIsSaving(true);
    try {
      sessionStorage.setItem(PENDING_SAVE_KEY, JSON.stringify({ payload: requestPayload }));
      sessionStorage.setItem(
        RECENT_SAVE_KEY,
        JSON.stringify({ payload: requestPayload, createdAt: Date.now() })
      );
    } catch {
      // Ignore storage failures.
    }

    try {
      const res = await authFetch(
        '/api/bazi/records',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(clientId ? { 'X-Client-ID': clientId } : {}),
          },
          body: JSON.stringify(requestPayload),
        },
        { action: 'bazi_save', payload }
      );

      if (res.status === 401) {
        return;
      }

      if (!res.ok) {
        if (res.status === 409) {
          const data = await res.json().catch(() => ({}));
          if (data.record) {
            runIfMounted(() => {
              setSavedRecord(data.record);
              pushToast({ type: 'success', message: t('bazi.errors.alreadySaved') });
            });
            lastSavedFingerprintRef.current = fingerprint;
            return;
          }
        }
        const message = await readErrorMessage(res, t('ziwei.errors.saveFailed'));
        runIfMounted(() => pushToast({ type: 'error', message }));
        return;
      }

      const data = await res.json();
      try {
        sessionStorage.removeItem(PENDING_SAVE_KEY);
      } catch {
        // Ignore storage failures.
      }
      runIfMounted(() => {
        setSavedRecord(data.record);
        pushToast({ type: 'success', message: t('bazi.saved') });
      });
      lastSavedFingerprintRef.current = fingerprint;
      try {
        sessionStorage.setItem(LAST_SAVED_FINGERPRINT_KEY, fingerprint);
      } catch {
        // Ignore storage issues in private mode.
      }
    } catch (error) {
      const message = getNetworkErrorMessage(error);
      runIfMounted(() => queueNetworkRetry('bazi_save', payload, message));
    } finally {
      saveInFlightRef.current = false;
      runIfMounted(() => setIsSaving(false));
    }
  };

  const handleAddFavorite = async (overrideRecordId = null) => {
    if (!isAuthenticated) {
      pushToast({ type: 'error', message: t('bazi.loginRequired') });
      return;
    }
    const recordId = normalizeOverrideArg(overrideRecordId) || savedRecord?.id;
    if (!recordId) {
      pushToast({ type: 'error', message: t('bazi.saveFirst') });
      return;
    }
    if (isFavoriting) return;
    setIsFavoriting(true);

    try {
      const res = await authFetch(
        '/api/favorites',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ recordId }),
        },
        { action: 'bazi_favorite', payload: { recordId } }
      );

      if (res.status === 401) {
        return;
      }

      if (!res.ok) {
        const message = await readErrorMessage(res, t('favorites.addError'));
        runIfMounted(() => pushToast({ type: 'error', message }));
        return;
      }

      const data = await res.json();
      runIfMounted(() => {
        setFavoriteStatus(data.favorite);
        pushToast({ type: 'success', message: t('bazi.favorited') });
      });
    } catch (error) {
      const message = getNetworkErrorMessage(error);
      runIfMounted(() => queueNetworkRetry('bazi_favorite', { recordId }, message));
    } finally {
      runIfMounted(() => setIsFavoriting(false));
    }
  };

  const handleZiweiGenerate = async (overridePayload = null) => {
    if (ziweiLoading) return;
    if (!isAuthenticated) {
      const message = t('bazi.loginRequired');
      pushToast({ type: 'error', message });
      setZiweiStatus({ type: 'error', message });
      return;
    }
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      const message = getFirstErrorMessage(nextErrors);
      pushToast({ type: 'error', message });
      setZiweiStatus({ type: 'error', message });
      return;
    }

    const payload = normalizeOverrideArg(overridePayload) || buildPayload();
    const ziweiPayload = {
      birthYear: payload.birthYear,
      birthMonth: payload.birthMonth,
      birthDay: payload.birthDay,
      birthHour: payload.birthHour,
      gender: payload.gender,
    };

    setZiweiLoading(true);
    setZiweiStatus({ type: 'loading', message: '' });
    setZiweiResult(null);
    try {
      const res = await authFetch(
        '/api/ziwei/calculate',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ziweiPayload),
        },
        { action: 'bazi_ziwei', payload: ziweiPayload }
      );

      if (res.status === 401) {
        return;
      }

      if (!res.ok) {
        const message = await readErrorMessage(res, t('ziwei.errors.calculateFailed'));
        runIfMounted(() => {
          pushToast({ type: 'error', message });
          setZiweiStatus({ type: 'error', message });
        });
        return;
      }

      const data = await res.json();
      runIfMounted(() => {
        setZiweiResult(data);
        setZiweiStatus({ type: 'success', message: t('ziwei.chartReady') });
      });
    } catch (error) {
      const message = getNetworkErrorMessage(error);
      runIfMounted(() => {
        setZiweiStatus({ type: 'error', message });
        queueNetworkRetry('bazi_ziwei', ziweiPayload, message);
      });
    } finally {
      runIfMounted(() => setZiweiLoading(false));
    }
  };

  const handleOpenHistory = () => {
    const recordId = savedRecord?.id;
    if (recordId) {
      navigate(`/history?recordId=${recordId}`);
      return;
    }
    navigate('/history');
  };

  useEffect(() => {
    const retry = getRetryAction();
    if (!retry) return;
    const currentPath = getCurrentPath();
    if (retry.redirectPath && retry.redirectPath !== currentPath) return;
    if (retry.reason === 'network_error') {
      setPendingRetry(retry);
      return;
    }
    if (!isAuthenticated) return;
    if (retryHandledRef.current === retry.createdAt) return;
    retryHandledRef.current = retry.createdAt;
    clearRetryAction();

    if (retry.action === 'bazi_full_analysis') {
      handleFullAnalysis(retry.payload || null);
      return;
    }
    if (retry.action === 'bazi_save') {
      handleSaveRecord(retry.payload || null);
      return;
    }
    if (retry.action === 'bazi_favorite') {
      handleAddFavorite(retry.payload?.recordId || null);
      return;
    }
    if (retry.action === 'bazi_ziwei') {
      handleZiweiGenerate(retry.payload || null);
    }
  }, [
    isAuthenticated,
    getRetryAction,
    clearRetryAction,
    location.pathname,
    location.search,
    location.hash,
  ]);

  useEffect(() => {
    if (wasOnlineRef.current === isOnline) return;
    wasOnlineRef.current = isOnline;
    if (!isOnline || !pendingRetry) return;
    if (retryAutoAttemptRef.current === pendingRetry.createdAt) return;
    retryAutoAttemptRef.current = pendingRetry.createdAt;
    attemptRetry('online');
  }, [pendingRetry, isOnline]);

  const statusStyle = (type) =>
    type === 'error'
      ? 'border-rose-400/40 bg-rose-500/10 text-rose-100'
      : 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100';
  const toastLabel = (type) => (type === 'error' ? t('common.error') : t('common.success'));

  const [aiResult, setAiResult] = useState(null);
  const displayAiResult = aiResult;
  const redirectForSessionExpired = (action, payload) => {
    const redirectPath = `${location.pathname}${location.search || ''}${location.hash || ''}`;
    try {
      if (action) {
        setRetryAction({ action, payload, redirectPath, reason: 'session_expired' });
      }
    } catch {
      // Ignore retry persistence failures.
    }
    try {
      logout({ preserveRetry: true });
    } catch {
      // Ignore logout failures.
    }
    try {
      localStorage.setItem('bazi_session_expired', '1');
    } catch {
      // Ignore storage failures.
    }
    const params = new URLSearchParams({ reason: 'session_expired', next: redirectPath });
    const target = `/login?${params.toString()}`;
    navigate(target, { replace: true, state: { from: redirectPath } });
    window.setTimeout(() => {
      const currentPath = `${window.location.pathname}${window.location.search || ''}${window.location.hash || ''}`;
      if (currentPath !== target) {
        window.location.assign(target);
      }
    }, 50);
  };

  const resolveWsUrl = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const host = window.location.host;
    const hostname = window.location.hostname;
    const port = window.location.port;

    const configuredBackendPort = import.meta.env?.VITE_BACKEND_PORT;
    if ((hostname === 'localhost' || hostname === '127.0.0.1') && configuredBackendPort) {
      return `${protocol}://${hostname}:${configuredBackendPort}/ws/ai`;
    }

    // Local dev: frontend (any port) + backend (4000) without a reverse-proxy for websocket upgrades.
    if ((hostname === 'localhost' || hostname === '127.0.0.1') && port && port !== '4000') {
      return `${protocol}://${hostname}:4000/ws/ai`;
    }

    // Production / reverse-proxied deployments.
    return `${protocol}://${host}/ws/ai`;
  };

  const closeAiSocket = (code = 1000, reason = 'Client disconnect') => {
    if (!wsRef.current) return;
    try {
      wsRef.current.close(code, reason);
    } finally {
      wsRef.current = null;
    }
  };

  const handleAIInterpret = async () => {
    if (!isAuthenticated) {
      pushToast({ type: 'error', message: t('bazi.loginRequired') });
      return;
    }
    if (!fullResult) {
      pushToast({ type: 'error', message: t('bazi.fullRequired') });
      return;
    }
    if (isAiLoading) return;
    closeAiSocket();
    wsStatusRef.current = { done: false, errored: false };
    clearAiToast();
    aiToastIdRef.current = pushToast({
      type: 'success',
      message: t('bazi.aiThinking'),
      autoDismiss: false,
    });
    setAiResult('');
    setIsAiLoading(true);

    // Construct payload from fullResult
    const payload = {
      pillars: fullResult.pillars,
      fiveElements: fullResult.fiveElements,
      tenGods: fullResult.tenGods,
      luckCycles: fullResult.luckCycles,
      strength: fullResult.strength
    };

    try {
      const ws = new WebSocket(resolveWsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        const provider = getPreferredAiProvider();
        const message = {
          type: 'bazi_ai_request',
          token,
          provider,
          payload
        };
        ws.send(JSON.stringify(message));
      };

      ws.onmessage = (event) => {
        if (!isMountedRef.current) return;
        let message;
        try {
          message = JSON.parse(event.data);
        } catch {
          return;
        }

        if (message?.type === 'start') {
          setAiResult('');
          return;
        }
        if (message?.type === 'chunk') {
          setAiResult((prev) => `${prev || ''}${message.content || ''}`);
          return;
        }
        if (message?.type === 'done') {
          wsStatusRef.current.done = true;
          setIsAiLoading(false);
          clearAiToast();
          pushToast({ type: 'success', message: t('bazi.aiReady') });
          closeAiSocket(1000, 'Stream complete');
          return;
        }
        if (message?.type === 'error') {
          wsStatusRef.current.errored = true;
          setIsAiLoading(false);
          clearAiToast();
          pushToast({ type: 'error', message: message.message || t('bazi.errors.calculateFailed') });
          closeAiSocket(1011, 'AI error');
        }
      };

      ws.onerror = () => {
        if (!isMountedRef.current) return;
        wsStatusRef.current.errored = true;
        setIsAiLoading(false);
        clearAiToast();
        pushToast({ type: 'error', message: t('errors.network') });
      };

      ws.onclose = () => {
        if (!isMountedRef.current) return;
        const { done, errored } = wsStatusRef.current;
        if (!done && !errored) {
          clearAiToast();
          pushToast({ type: 'error', message: t('errors.network') });
        }
        setIsAiLoading(false);
        wsRef.current = null;
      };
    } catch (error) {
      runIfMounted(() => {
        setIsAiLoading(false);
        clearAiToast();
        pushToast({ type: 'error', message: getNetworkErrorMessage(error) });
      });
    }
  };

  const handleResetForm = () => {
    const nextDefaults = buildDefaultFormData();
    setFormData(nextDefaults);
    setErrors({});
    setBaseResult(null);
    setFullResult(null);
    setSavedRecord(null);
    setFavoriteStatus(null);
    setZiweiResult(null);
    setZiweiStatus({ type: 'idle', message: '' });
    setZiweiLoading(false);
    setAiResult(null);
    clearToasts();
    clearPendingRetry();
    setIsAiLoading(false);
    closeAiSocket();
    localStorage.removeItem(GUEST_STORAGE_KEY);
    try {
      sessionStorage.removeItem(LAST_SAVED_FINGERPRINT_KEY);
      sessionStorage.removeItem(PENDING_SAVE_KEY);
      sessionStorage.removeItem(RECENT_SAVE_KEY);
    } catch {
      // Ignore storage cleanup failures.
    }
    lastSavedFingerprintRef.current = null;
    lastCommittedFormRef.current = nextDefaults;
  };

  const handleConfirmReset = () => {
    setConfirmResetOpen(false);
    handleResetForm();
  };

  const handleCancel = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  const handleConfirmAiRequest = () => {
    setConfirmAiOpen(false);
    handleAIInterpret();
  };

  return {
    t,
    formData,
    setFormData,
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
  };
}
