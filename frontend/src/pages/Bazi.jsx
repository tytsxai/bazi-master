import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { useAuthFetch } from '../auth/useAuthFetch.js';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import { getPreferredAiProvider } from '../utils/aiProvider.js';
import { getClientId } from '../utils/clientId.js';
import { readApiErrorMessage } from '../utils/apiError.js';

const GUEST_STORAGE_KEY = 'bazi_guest_calculation_v1';
const LAST_SAVED_FINGERPRINT_KEY = 'bazi_last_saved_fingerprint_v1';
const PENDING_SAVE_KEY = 'bazi_pending_save_v1';
const RECENT_SAVE_KEY = 'bazi_recent_save_v1';
const PREFILL_STORAGE_KEY = 'bazi_prefill_request_v1';
const formatOffsetMinutes = (offsetMinutes) => {
  if (!Number.isFinite(offsetMinutes)) return 'UTC';
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  return `UTC${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const parseTimezoneOffsetMinutes = (raw) => {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.trunc(raw);
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^(utc|gmt|z)$/i.test(trimmed)) return 0;
  const match = trimmed.match(/^(?:utc|gmt)?\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?$/i);
  if (!match) return null;
  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] || 0);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours > 14 || minutes > 59) return null;
  return sign * (hours * 60 + minutes);
};

const getBrowserTimezoneLabel = () => {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) return tz;
  } catch {
    // Ignore Intl issues and fall back to offset label.
  }
  const offsetMinutes = -new Date().getTimezoneOffset();
  return formatOffsetMinutes(offsetMinutes);
};

const buildDefaultFormData = () => {
  const now = new Date();
  return {
    birthYear: String(now.getFullYear()),
    birthMonth: String(now.getMonth() + 1),
    birthDay: String(now.getDate()),
    birthHour: '14',
    gender: '',
    birthLocation: '',
    timezone: getBrowserTimezoneLabel(),
  };
};
const DEFAULT_FORM_KEYS = Object.keys(buildDefaultFormData());
const UNSAVED_WARNING_MESSAGE = 'You have unsaved changes. Are you sure you want to leave this page?';
const isWhitespaceOnly = (value) =>
  typeof value === 'string' && value.length > 0 && value.trim().length === 0;
const normalizeOptionalText = (value) => (typeof value === 'string' ? value.trim() : value);
const normalizeOverrideArg = (value) => {
  if (!value) return null;
  if (typeof value === 'object' && typeof value.preventDefault === 'function') return null;
  return value;
};
const NUMERIC_FIELD_LIMITS = {
  birthHour: { min: 0, max: 23 },
};
const normalizeNumericInput = (value, limits) => {
  const cleaned = value.replace(/[^\d]/g, '');
  if (!cleaned) return '';
  const numeric = Number(cleaned);
  if (!Number.isFinite(numeric)) return '';
  if (numeric < limits.min) return String(limits.min);
  if (numeric > limits.max) return String(limits.max);
  return cleaned;
};
const formatCoordinate = (value) =>
  Number.isFinite(value) ? Number(value).toFixed(4) : '—';
const formatLocationLabel = (location) => {
  if (!location || typeof location !== 'object') return '—';
  const lat = formatCoordinate(location.latitude);
  const lon = formatCoordinate(location.longitude);
  if (location.name) return `${location.name} (${lat}, ${lon})`;
  if (lat === '—' && lon === '—') return '—';
  return `${lat}, ${lon}`;
};
const coerceInt = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : null;
};
const safeJsonParse = (value) => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};
const computeFiveElementsPercent = (fiveElements) => {
  if (!fiveElements || typeof fiveElements !== 'object') return null;
  const order = ['Wood', 'Fire', 'Earth', 'Metal', 'Water'];
  const total = order.reduce((sum, element) => {
    const raw = Number(fiveElements[element]);
    return sum + (Number.isFinite(raw) ? raw : 0);
  }, 0);
  return order.reduce((acc, element) => {
    const raw = Number(fiveElements[element]);
    const safe = Number.isFinite(raw) ? raw : 0;
    acc[element] = total ? Math.round((safe / total) * 100) : 0;
    return acc;
  }, {});
};
const normalizeBaziApiResponse = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  const root =
    payload.result && typeof payload.result === 'object'
      ? payload.result
      : payload.data && typeof payload.data === 'object'
        ? payload.data
        : payload;
  const timeMeta = payload.timeMeta && typeof payload.timeMeta === 'object' ? payload.timeMeta : null;
  const merged = { ...root, ...(timeMeta || {}) };
  if (!merged.trueSolarTime && payload.trueSolarTime) {
    merged.trueSolarTime = payload.trueSolarTime;
  }
  const normalized = {
    ...merged,
    pillars: safeJsonParse(merged.pillars),
    fiveElements: safeJsonParse(merged.fiveElements),
    fiveElementsPercent: safeJsonParse(merged.fiveElementsPercent),
    tenGods: safeJsonParse(merged.tenGods),
    luckCycles: safeJsonParse(merged.luckCycles),
    trueSolarTime: safeJsonParse(merged.trueSolarTime),
  };
  if (!normalized.fiveElementsPercent) {
    normalized.fiveElementsPercent = computeFiveElementsPercent(normalized.fiveElements);
  }
  return normalized;
};
const getTodayParts = () => {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
};
const getDaysInMonth = (year, month) => {
  if (!Number.isInteger(year) || !Number.isInteger(month)) return 31;
  return new Date(year, month, 0).getDate();
};
const getDateInputLimits = (data) => {
  const today = getTodayParts();
  const year = coerceInt(data.birthYear);
  const month = coerceInt(data.birthMonth);
  const maxYear = today.year;
  const maxMonth = year === today.year ? today.month : 12;
  const daysInMonth = getDaysInMonth(year ?? today.year, month ?? 1);
  const maxDay =
    year === today.year && month === today.month ? Math.min(daysInMonth, today.day) : daysInMonth;

  return {
    birthYear: { min: 1, max: maxYear },
    birthMonth: { min: 1, max: maxMonth },
    birthDay: { min: 1, max: maxDay },
  };
};

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

const isSameFormData = (left, right) =>
  DEFAULT_FORM_KEYS.every((key) => left?.[key] === right?.[key]);

const isValidCalendarDate = (year, month, day) => {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

const getFieldErrors = (data, t) => {
  const nextErrors = {};
  const year = Number(data.birthYear);
  const month = Number(data.birthMonth);
  const day = Number(data.birthDay);
  const hour = Number(data.birthHour);
  const today = getTodayParts();

  if (!data.birthYear) {
    nextErrors.birthYear = t('bazi.errors.yearRequired');
  } else if (!Number.isInteger(year) || year < 1 || year > today.year) {
    nextErrors.birthYear = t('bazi.errors.yearInvalid');
  }

  if (!data.birthMonth) {
    nextErrors.birthMonth = t('bazi.errors.monthRequired');
  } else if (!Number.isInteger(month) || month < 1 || month > 12) {
    nextErrors.birthMonth = t('bazi.errors.monthInvalid');
  }

  if (!data.birthDay) {
    nextErrors.birthDay = t('bazi.errors.dayRequired');
  } else if (!Number.isInteger(day) || day < 1 || day > 31) {
    nextErrors.birthDay = t('bazi.errors.dayInvalid');
  } else if (
    !nextErrors.birthYear &&
    !nextErrors.birthMonth &&
    !isValidCalendarDate(year, month, day)
  ) {
    nextErrors.birthDay = t('bazi.errors.dateInvalid');
  } else if (!nextErrors.birthYear && !nextErrors.birthMonth) {
    const isFuture =
      year > today.year ||
      (year === today.year && month > today.month) ||
      (year === today.year && month === today.month && day > today.day);
    if (isFuture) {
      nextErrors.birthDay = t('bazi.errors.futureDate');
    }
  }

  if (data.birthHour === '') {
    nextErrors.birthHour = t('bazi.errors.hourRequired');
  } else if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    nextErrors.birthHour = t('bazi.errors.hourInvalid');
  }

  if (!data.gender) {
    nextErrors.gender = t('bazi.errors.genderRequired');
  }

  if (isWhitespaceOnly(data.birthLocation)) {
    nextErrors.birthLocation = t('bazi.errors.locationWhitespace');
  }

  if (isWhitespaceOnly(data.timezone)) {
    nextErrors.timezone = t('bazi.errors.timezoneWhitespace');
  }

  return nextErrors;
};

export default function Bazi() {
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
    return 'Network error. Please check your connection and try again.';
  };

  useEffect(() => {
    const controller = new AbortController();
    const loadLocations = async () => {
      try {
        const res = await fetch('/api/locations', { signal: controller.signal });
        if (!res.ok) throw new Error('Unable to load locations.');
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
        return 'Calculation';
      case 'bazi_full_analysis':
        return 'Full analysis';
      case 'bazi_save':
        return 'Save to history';
      case 'bazi_favorite':
        return 'Add to favorites';
      case 'bazi_ziwei':
        return 'Zi Wei chart';
      default:
        return 'Action';
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
      message: `${message} ${label} queued for retry.`,
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
      pushToast({ type: 'error', message: 'You are offline. Reconnect to retry.' });
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
    ? 'A save is in progress. Please wait for it to finish before leaving this page.'
    : UNSAVED_WARNING_MESSAGE;

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
    return firstMessage || 'Please correct the highlighted fields.';
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
        const message = await readErrorMessage(res, 'Calculation failed.');
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
    setIsFullLoading(true);
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
        const message = await readErrorMessage(res, 'Full analysis failed.');
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
      pushToast({ type: 'error', message: 'Run a calculation before saving to history.' });
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
      pushToast({ type: 'success', message: 'Record already saved.' });
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
              pushToast({ type: 'success', message: 'Record already saved.' });
            });
            lastSavedFingerprintRef.current = fingerprint;
            return;
          }
        }
        const message = await readErrorMessage(res, 'Save failed.');
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
        const message = await readErrorMessage(res, 'Favorite failed.');
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
        const message = await readErrorMessage(res, 'Unable to calculate Zi Wei chart.');
        runIfMounted(() => {
          pushToast({ type: 'error', message });
          setZiweiStatus({ type: 'error', message });
        });
        return;
      }

      const data = await res.json();
      runIfMounted(() => {
        setZiweiResult(data);
        setZiweiStatus({ type: 'success', message: 'Zi Wei chart generated.' });
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
  const toastLabel = (type) => (type === 'error' ? 'Error' : 'Success');

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
          pushToast({ type: 'error', message: message.message || 'AI Interpretation failed.' });
          closeAiSocket(1011, 'AI error');
        }
      };

      ws.onerror = () => {
        if (!isMountedRef.current) return;
        wsStatusRef.current.errored = true;
        setIsAiLoading(false);
        clearAiToast();
        pushToast({ type: 'error', message: 'WebSocket connection error.' });
      };

      ws.onclose = () => {
        if (!isMountedRef.current) return;
        const { done, errored } = wsStatusRef.current;
        if (!done && !errored) {
          clearAiToast();
          pushToast({ type: 'error', message: 'Connection closed unexpectedly.' });
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
              <p className="text-xs uppercase tracking-[0.2em] text-amber-200">Network interruption</p>
              <p className="mt-2 text-sm text-amber-50">
                {getRetryLabel(pendingRetry.action)} is queued.{' '}
                {isOnline ? 'Retry now or continue when ready.' : 'Waiting for connection...'}
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
                Retry now
              </button>
              <button
                type="button"
                data-testid="retry-dismiss"
                onClick={clearPendingRetry}
                className="rounded-full border border-amber-200/30 px-4 py-2 text-xs uppercase tracking-[0.2em] text-amber-100 transition hover:border-amber-200 hover:text-amber-50"
              >
                Dismiss
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
              Reset this reading?
            </h2>
            <p className="mt-2 text-sm text-white/70">
              This clears the form and any calculated results. You can re-enter details afterward.
            </p>
            <div className="mt-6 flex flex-wrap gap-3 sm:justify-end">
              <button
                ref={confirmResetCancelRef}
                type="button"
                onClick={() => setConfirmResetOpen(false)}
                className="rounded-full border border-white/20 px-4 py-2 text-xs uppercase tracking-[0.2em] text-white/70 transition hover:border-white/40 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReset}
                className="rounded-full border border-rose-400/40 bg-rose-500/10 px-4 py-2 text-xs uppercase tracking-[0.2em] text-rose-100 transition hover:border-rose-300 hover:text-rose-200"
              >
                Reset
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
              Request AI interpretation?
            </h2>
            <p className="mt-2 text-sm text-white/70">
              This sends your full analysis details for an AI summary. Continue when you are ready.
            </p>
            <div className="mt-6 flex flex-wrap gap-3 sm:justify-end">
              <button
                ref={confirmAiCancelRef}
                type="button"
                onClick={() => setConfirmAiOpen(false)}
                className="rounded-full border border-white/20 px-4 py-2 text-xs uppercase tracking-[0.2em] text-white/70 transition hover:border-white/40 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAiRequest}
                className="rounded-full border border-purple-400/40 bg-purple-500/10 px-4 py-2 text-xs uppercase tracking-[0.2em] text-purple-100 transition hover:border-purple-300 hover:text-purple-200"
              >
                Request AI
              </button>
            </div>
          </div>
        </div>
      )}
      <section className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
        <div className="glass-card rounded-3xl border border-white/10 p-8 shadow-glass">
          <h1 className="font-display text-3xl text-gold-400">{t('bazi.title')}</h1>
          <p className="mt-2 text-sm text-white/70">{t('bazi.subtitle')}</p>
          <div className="sr-only" role="alert" aria-live="assertive">
            {errorAnnouncement}
          </div>
          <form onSubmit={handleCalculate} className="mt-6 grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="birthYear" className="block text-sm text-white/80">
                {t('bazi.birthYear')}
              </label>
              <input
                id="birthYear"
                type="number"
                value={formData.birthYear}
                onChange={updateField('birthYear')}
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
                onChange={updateField('birthMonth')}
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
                onChange={updateField('birthDay')}
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
                onChange={updateField('birthHour')}
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
                onChange={updateField('gender')}
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
                onChange={updateField('birthLocation')}
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
              <p className="mt-2 text-xs text-white/50">
                {t('bazi.locationHint')}
              </p>
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
                onChange={updateField('timezone')}
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
                onClick={() => setConfirmResetOpen(true)}
                className="rounded-full border border-white/30 px-4 py-2 text-sm font-semibold text-white/80 transition hover:border-gold-400/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-70"
                disabled={isCalculating}
              >
                Reset
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-full border border-white/30 px-4 py-2 text-sm font-semibold text-white/80 transition hover:border-gold-400/60 hover:text-white"
              >
                Cancel
              </button>
            </div>
          </form>

          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <button
              type="button"
              onClick={handleFullAnalysis}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  handleFullAnalysis();
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
              onClick={() => setConfirmAiOpen(true)}
              className="rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 px-4 py-2 text-sm font-bold text-white shadow-lg transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!fullResult || isAiLoading}
              data-testid="bazi-ai-interpret"
              aria-label={t('bazi.aiOpen')}
            >
              ✨ {isAiLoading ? t('bazi.aiThinking') : t('bazi.aiInterpret')}
            </button>
            <button
              type="button"
              onClick={handleSaveRecord}
              className="rounded-full border border-white/20 px-4 py-2 text-sm text-white/80 transition hover:border-gold-400/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!baseResult || isSaving}
              data-testid="bazi-save-record"
              aria-label="Save to History"
            >
              {isSaving ? `${t('bazi.saveRecord')}...` : t('bazi.saveRecord')}
            </button>
            <button
              type="button"
              onClick={handleAddFavorite}
              className="rounded-full border border-white/20 px-4 py-2 text-sm text-white/80 transition hover:border-gold-400/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!savedRecord || isFavoriting}
            >
              {isFavoriting ? `${t('bazi.addFavorite')}...` : t('bazi.addFavorite')}
            </button>
            <button
              type="button"
              onClick={handleOpenHistory}
              className="rounded-full border border-white/20 px-4 py-2 text-sm text-white/80 transition hover:border-gold-400/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!isAuthenticated}
              data-testid="bazi-view-history"
            >
              {t('nav.history')}
            </button>
          </div>
          {favoriteStatus && (
            <p className="mt-3 text-xs text-white/60">
              {t('bazi.favoriteReady')}
            </p>
          )}
        </div>

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
                    {timeMeta.trueSolar?.applied
                      ? `${timeMeta.trueSolar.correctionMinutes} min`
                      : '—'}
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
            <h2 className="font-display text-2xl text-gold-400">Zi Wei (V2)</h2>
            <p className="mt-2 text-sm text-white/70">
              Generate a Zi Wei chart using the current BaZi inputs.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleZiweiGenerate}
                className="rounded-full bg-gold-400 px-4 py-2 text-xs font-semibold text-mystic-900 shadow-lg shadow-gold-400/30 transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={ziweiLoading}
              >
                {ziweiLoading ? 'Calculating…' : 'Generate Zi Wei Chart'}
              </button>
            </div>
            {ziweiStatus.type !== 'idle' && (
              <p
                data-testid="bazi-ziwei-status"
                role={ziweiStatus.type === 'error' ? 'alert' : 'status'}
                aria-live={ziweiStatus.type === 'error' ? 'assertive' : 'polite'}
                className={`mt-4 text-sm ${ziweiStatus.type === 'error' ? 'text-rose-200' : 'text-emerald-200'
                  }`}
              >
                {ziweiStatus.message || (ziweiStatus.type === 'loading' ? 'Calculating…' : '')}
              </p>
            )}
            {ziweiResult && (
              <div className="mt-6 grid gap-4 md:grid-cols-3" data-testid="bazi-ziwei-result">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <h3 className="text-xs uppercase text-gold-400/80">Lunar Date</h3>
                  <p className="mt-2 text-white">
                    {ziweiResult?.lunar?.year}年 {ziweiResult?.lunar?.month}月 {ziweiResult?.lunar?.day}日
                    {ziweiResult?.lunar?.isLeap ? ' (Leap)' : ''}
                  </p>
                  <p className="mt-1 text-xs text-white/60">
                    {ziweiResult?.lunar?.yearStem}{ziweiResult?.lunar?.yearBranch}年 · {ziweiResult?.lunar?.monthStem}{ziweiResult?.lunar?.monthBranch}月
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <h3 className="text-xs uppercase text-gold-400/80">Key Palaces</h3>
                  <p className="mt-2 text-white">
                    命宫: {ziweiResult?.mingPalace?.palace?.cn} · {ziweiResult?.mingPalace?.branch?.name}
                  </p>
                  <p className="mt-1 text-white">
                    身宫: {ziweiResult?.shenPalace?.palace?.cn} · {ziweiResult?.shenPalace?.branch?.name}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <h3 className="text-xs uppercase text-gold-400/80">Birth Time</h3>
                  <p className="mt-2 text-white">{ziweiResult?.birthIso || '—'}</p>
                  <p className="mt-1 text-xs text-white/60">
                    UTC offset: {Number.isFinite(ziweiResult?.timezoneOffsetMinutes)
                      ? `${ziweiResult.timezoneOffsetMinutes} mins`
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
                    <p className="text-xs uppercase tracking-[0.2em] text-white/50">{t(`bazi.${key}`)}</p>
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
                    <span className="w-20 text-xs uppercase tracking-[0.2em] text-white/70">{element}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-gold-400" style={{ width: `${percent}%` }} />
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
      </section>

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
                <div key={item.name} className="flex items-center gap-4" data-testid="ten-god-item">
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
          <div className="mt-4 grid gap-3 sm:grid-cols-2 3xl:grid-cols-3" data-testid="luck-cycles-list">
            {luckCyclesList.length ? (
              luckCyclesList.map((cycle) => (
                <div
                  key={cycle.range}
                  className="rounded-2xl border border-white/10 bg-white/5 p-4"
                  data-testid="luck-cycle-item"
                >
                  <p className="text-xs uppercase tracking-[0.2em] text-white/60">{cycle.range}</p>
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
    </main>
  );
}
