import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { useAuthFetch } from '../auth/useAuthFetch.js';
import { getClientId } from '../utils/clientId.js';
import { readApiErrorMessage } from '../utils/apiError.js';
import Breadcrumbs from '../components/Breadcrumbs.jsx';

const SEARCH_DEBOUNCE_MS = 350;
const PAGE_SIZE = 100;
const MAX_SORT_PAGE_SIZE = 1000;
const DEFAULT_FILTERS = {
  query: '',
  genderFilter: 'all',
  rangeFilter: 'all',
  sortOption: 'created-desc',
};
const PENDING_SAVE_KEY = 'bazi_pending_save_v1';
const RECENT_SAVE_KEY = 'bazi_recent_save_v1';
const toTimestamp = (value) => {
  const time = new Date(value ?? 0).getTime();
  return Number.isFinite(time) ? time : 0;
};
const isWhitespaceOnly = (value) =>
  typeof value === 'string' && value.length > 0 && value.trim().length === 0;
const isValidCalendarDate = (year, month, day) => {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
  );
};

const getBirthTimestamp = (record) => {
  const year = Number(record?.birthYear);
  const month = Number(record?.birthMonth);
  const day = Number(record?.birthDay);
  const hour = Number(record?.birthHour);
  if (![year, month, day].every(Number.isFinite)) return null;
  const safeHour = Number.isFinite(hour) ? hour : 0;
  return Date.UTC(year, month - 1, day, safeHour, 0, 0);
};

const sortRecordsForDisplay = (records, sortOption) => {
  if (!Array.isArray(records) || records.length < 2) return records;
  const list = [...records];
  const createdDesc = (a, b) => {
    const diff = toTimestamp(b?.createdAt) - toTimestamp(a?.createdAt);
    if (diff) return diff;
    return (Number(b?.id) || 0) - (Number(a?.id) || 0);
  };
  const createdAsc = (a, b) => {
    const diff = toTimestamp(a?.createdAt) - toTimestamp(b?.createdAt);
    if (diff) return diff;
    return (Number(a?.id) || 0) - (Number(b?.id) || 0);
  };
  const compareBirth = (direction) => (a, b) => {
    const aKey = getBirthTimestamp(a);
    const bKey = getBirthTimestamp(b);
    const aFinite = Number.isFinite(aKey);
    const bFinite = Number.isFinite(bKey);
    if (aFinite && bFinite && aKey !== bKey) return (aKey - bKey) * direction;
    if (aFinite && !bFinite) return -1;
    if (!aFinite && bFinite) return 1;
    return createdDesc(a, b);
  };

  switch (sortOption) {
    case 'created-asc':
      list.sort(createdAsc);
      return list;
    case 'birth-asc':
      list.sort(compareBirth(1));
      return list;
    case 'birth-desc':
      list.sort(compareBirth(-1));
      return list;
    case 'created-desc':
    default:
      list.sort(createdDesc);
      return list;
  }
};

const sortDeletedRecordsForDisplay = (records, primaryId) => {
  if (!Array.isArray(records) || records.length < 2) return records;
  const list = [...records];
  list.sort((a, b) => {
    if (primaryId) {
      if (a?.id === primaryId) return -1;
      if (b?.id === primaryId) return 1;
    }
    const createdDiff = toTimestamp(b?.createdAt) - toTimestamp(a?.createdAt);
    if (createdDiff) return createdDiff;
    return (Number(b?.id) || 0) - (Number(a?.id) || 0);
  });
  return list;
};

export default function History() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const authFetch = useAuthFetch();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [records, setRecords] = useState([]);
  const [status, setStatus] = useState(null);
  const [query, setQuery] = useState(DEFAULT_FILTERS.query);
  const [debouncedQuery, setDebouncedQuery] = useState(DEFAULT_FILTERS.query);
  const [genderFilter, setGenderFilter] = useState(DEFAULT_FILTERS.genderFilter);
  const [rangeFilter, setRangeFilter] = useState(DEFAULT_FILTERS.rangeFilter);
  const [sortOption, setSortOption] = useState(DEFAULT_FILTERS.sortOption);
  const [deletedRecords, setDeletedRecords] = useState([]);
  const [lastDeletedId, setLastDeletedId] = useState(null);
  const [pendingSaveChecked, setPendingSaveChecked] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingAll, setIsExportingAll] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [editRecordId, setEditRecordId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [editErrors, setEditErrors] = useState({});
  const [editStatus, setEditStatus] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [filteredCount, setFilteredCount] = useState(0);
  const [tarotHistory, setTarotHistory] = useState([]);
  const [tarotHistoryLoading, setTarotHistoryLoading] = useState(false);
  const [tarotHistoryError, setTarotHistoryError] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [ichingTimeStatus, setIchingTimeStatus] = useState(null);
  const [ichingTimeResult, setIchingTimeResult] = useState(null);
  const [ichingTimeLoading, setIchingTimeLoading] = useState(false);
  const [confirmState, setConfirmState] = useState(null);
  const [deepLinkState, setDeepLinkState] = useState({ status: 'idle', record: null, id: null });
  const deletingIdsRef = useRef(new Set());
  const selectAllRef = useRef(null);
  const fileInputRef = useRef(null);
  const abortRef = useRef(null);
  const deletedAbortRef = useRef(null);
  const deepLinkAbortRef = useRef(null);
  const confirmCancelRef = useRef(null);
  const queryDebounceRef = useRef(null);
  const statusIdRef = useRef(0);
  const recordsRequestIdRef = useRef(0);
  const filtersKeyRef = useRef('');
  const lastSetSearchRef = useRef('');
  const pendingSearchSyncRef = useRef('');
  const hasInitializedUrlSyncRef = useRef(false);
  const hasRestoredFiltersRef = useRef(false);
  const clientIdRef = useRef(getClientId());
  const pendingSaveRef = useRef(null);
  const lastSearchSyncRef = useRef(null);
  const lastDeletedRecordRef = useRef(null);
  const lastDeletedIdRef = useRef(null);
  const lastDeletedRecord = lastDeletedRecordRef.current?.record || null;
  const shouldExpandPageSize =
    sortOption.startsWith('birth-')
    && debouncedQuery.trim() === ''
    && genderFilter === DEFAULT_FILTERS.genderFilter
    && rangeFilter === DEFAULT_FILTERS.rangeFilter;
  const effectivePageSize = useMemo(
    () => (
      shouldExpandPageSize
        ? Math.min(Math.max(PAGE_SIZE, totalCount || PAGE_SIZE), MAX_SORT_PAGE_SIZE)
        : PAGE_SIZE
    ),
    [shouldExpandPageSize, totalCount],
  );
  const filterKey = useMemo(
    () => [debouncedQuery.trim(), genderFilter, rangeFilter, sortOption, effectivePageSize].join('|'),
    [debouncedQuery, genderFilter, rangeFilter, sortOption, effectivePageSize],
  );
  const showDeletedLocation =
    Boolean(debouncedQuery.trim())
    || genderFilter !== DEFAULT_FILTERS.genderFilter
    || rangeFilter !== DEFAULT_FILTERS.rangeFilter
    || sortOption !== DEFAULT_FILTERS.sortOption;
  const orderedDeletedRecords = useMemo(() => {
    const primaryId = lastDeletedId || lastDeletedRecord?.id || null;
    return sortDeletedRecordsForDisplay(deletedRecords, primaryId);
  }, [deletedRecords, lastDeletedId, lastDeletedRecord?.id]);
  const primaryRestoreId = orderedDeletedRecords[0]?.id ?? null;
  const shouldResetPage = filtersKeyRef.current !== filterKey && page !== 1;

  const showStatus = (nextStatus) => {
    const nextId = statusIdRef.current + 1;
    statusIdRef.current = nextId;
    setStatus({ id: nextId, ...nextStatus });
  };

  const clearStatus = () => {
    statusIdRef.current += 1;
    setStatus(null);
  };

  const readErrorMessage = (response, fallback) => readApiErrorMessage(response, fallback);

  const handleIchingTimeDivine = async () => {
    setIchingTimeStatus(null);
    setIchingTimeResult(null);
    setIchingTimeLoading(true);

    try {
      const res = await authFetch('/api/iching/divine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'time' }),
      });
      if (!res.ok) {
        const message = await readErrorMessage(res, 'Unable to reveal the time hexagram.');
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

  const getIchingStatusStyle = (state) =>
    state?.type === 'error'
      ? 'border-rose-400/40 bg-rose-500/10 text-rose-100'
      : 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100';

  const readPendingSave = () => {
    try {
      const raw = sessionStorage.getItem(PENDING_SAVE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed?.payload || null;
    } catch {
      return null;
    }
  };

  const clearPendingSave = () => {
    try {
      sessionStorage.removeItem(PENDING_SAVE_KEY);
    } catch {
      // Ignore storage failures.
    }
  };

  const readRecentSave = () => {
    try {
      const raw = sessionStorage.getItem(RECENT_SAVE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed?.payload || null;
    } catch {
      return null;
    }
  };

  const clearRecentSave = () => {
    try {
      sessionStorage.removeItem(RECENT_SAVE_KEY);
    } catch {
      // Ignore storage failures.
    }
  };

  const normalizeText = (value) => (typeof value === 'string' ? value.trim() : '');
  const buildEditDraft = (record) => ({
    birthYear: record?.birthYear ?? '',
    birthMonth: record?.birthMonth ?? '',
    birthDay: record?.birthDay ?? '',
    birthHour: record?.birthHour ?? '',
    gender: record?.gender ?? '',
    birthLocation: record?.birthLocation ?? '',
    timezone: record?.timezone ?? '',
  });

  const validateEditDraft = (draft) => {
    const errors = {};
    const birthYear = Number(draft?.birthYear);
    const birthMonth = Number(draft?.birthMonth);
    const birthDay = Number(draft?.birthDay);
    const birthHour = Number(draft?.birthHour);
    const gender = typeof draft?.gender === 'string' ? draft.gender.trim() : '';
    const birthLocation = typeof draft?.birthLocation === 'string' ? draft.birthLocation.trim() : '';
    const timezone = typeof draft?.timezone === 'string' ? draft.timezone.trim() : '';

    if (!Number.isInteger(birthYear) || birthYear < 1 || birthYear > 9999) {
      errors.birthYear = 'Enter a valid year.';
    }
    if (!Number.isInteger(birthMonth) || birthMonth < 1 || birthMonth > 12) {
      errors.birthMonth = 'Enter a valid month.';
    }
    if (!Number.isInteger(birthDay) || birthDay < 1 || birthDay > 31) {
      errors.birthDay = 'Enter a valid day.';
    }
    if (!Number.isInteger(birthHour) || birthHour < 0 || birthHour > 23) {
      errors.birthHour = 'Enter a valid hour.';
    }
    if (!errors.birthYear && !errors.birthMonth && !errors.birthDay) {
      if (!isValidCalendarDate(birthYear, birthMonth, birthDay)) {
        errors.birthDay = 'Date is not valid.';
      }
    }
    if (!gender) {
      errors.gender = 'Select a gender.';
    }
    if (isWhitespaceOnly(draft?.birthLocation)) {
      errors.birthLocation = 'Birth location cannot be only whitespace.';
    }
    if (isWhitespaceOnly(draft?.timezone)) {
      errors.timezone = 'Timezone cannot be only whitespace.';
    }

    return {
      errors,
      payload: {
        birthYear,
        birthMonth,
        birthDay,
        birthHour,
        gender,
        birthLocation: birthLocation || null,
        timezone: timezone || null,
      },
    };
  };

  const recordMatchesPending = (record, payload) => {
    if (!record || !payload) return false;
    if (Number(record.birthYear) !== Number(payload.birthYear)) return false;
    if (Number(record.birthMonth) !== Number(payload.birthMonth)) return false;
    if (Number(record.birthDay) !== Number(payload.birthDay)) return false;
    if (Number(record.birthHour) !== Number(payload.birthHour)) return false;
    if (normalizeText(record.gender).toLowerCase() !== normalizeText(payload.gender).toLowerCase()) {
      return false;
    }
    if (normalizeText(record.birthLocation || '') !== normalizeText(payload.birthLocation || '')) return false;
    if (normalizeText(record.timezone || '') !== normalizeText(payload.timezone || '')) return false;
    return true;
  };

  const scheduleQueryDebounce = useCallback((nextQuery, { immediate = false } = {}) => {
    if (queryDebounceRef.current) {
      clearTimeout(queryDebounceRef.current);
      queryDebounceRef.current = null;
    }
    if (immediate) {
      setDebouncedQuery(nextQuery.trim());
      return;
    }
    queryDebounceRef.current = setTimeout(() => {
      setDebouncedQuery(nextQuery.trim());
      queryDebounceRef.current = null;
    }, SEARCH_DEBOUNCE_MS);
  }, []);

  const buildFilterParams = ({ page: targetPage, queryValue } = {}) => {
    const params = new URLSearchParams();
    const rawQuery = typeof queryValue === 'string' ? queryValue : debouncedQuery;
    const trimmedQuery = rawQuery.trim();
    if (trimmedQuery) params.set('q', trimmedQuery);
    if (genderFilter !== 'all') params.set('gender', genderFilter);
    if (rangeFilter !== 'all') params.set('rangeDays', rangeFilter);
    if (rangeFilter === 'today' || rangeFilter === 'week') {
      params.set('timezoneOffsetMinutes', String(-new Date().getTimezoneOffset()));
    }
    if (sortOption && sortOption !== DEFAULT_FILTERS.sortOption) params.set('sort', sortOption);
    if (targetPage && targetPage > 1) params.set('page', String(targetPage));
    return params;
  };

  const buildPageHref = (targetPage) => {
    const params = buildFilterParams({ page: targetPage, queryValue: query });
    const search = params.toString();
    return {
      pathname: location.pathname,
      search: search ? `?${search}` : '',
    };
  };

  const loadRecords = async ({ page: nextPage = 1 } = {}) => {
    if (!token) return;
    const requestId = recordsRequestIdRef.current + 1;
    recordsRequestIdRef.current = requestId;
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const params = buildFilterParams({ page: nextPage });
    params.set('pageSize', String(effectivePageSize));

    try {
      const res = await authFetch(`/api/bazi/records?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (res.status === 401) {
        return;
      }
      if (!res.ok) {
        const message = await readErrorMessage(res, 'Unable to load history.');
        showStatus({ type: 'error', message });
        return;
      }
      const data = await res.json();
      if (recordsRequestIdRef.current !== requestId || controller.signal.aborted) {
        return;
      }
      const nextRecords = data.records || [];
      let mergedRecords = nextRecords;
      const pendingPayload = pendingSaveRef.current;
      if (pendingPayload && Array.isArray(nextRecords)) {
        const alreadyIncluded = nextRecords.some((record) => recordMatchesPending(record, pendingPayload));
        if (alreadyIncluded) {
          pendingSaveRef.current = null;
          clearRecentSave();
        } else {
          const locationQuery = normalizeText(pendingPayload.birthLocation);
          if (locationQuery) {
            try {
              const lookupParams = new URLSearchParams();
              lookupParams.set('q', locationQuery);
              lookupParams.set('pageSize', '5');
              const lookupRes = await authFetch(`/api/bazi/records?${lookupParams.toString()}`, {
                headers: { Authorization: `Bearer ${token}` },
                signal: controller.signal,
              });
              if (recordsRequestIdRef.current !== requestId || controller.signal.aborted) {
                return;
              }
              if (lookupRes.ok) {
                const lookupData = await lookupRes.json();
                const lookupRecords = Array.isArray(lookupData.records) ? lookupData.records : [];
                const match = lookupRecords.find((record) => recordMatchesPending(record, pendingPayload));
                if (match) {
                  mergedRecords = [
                    match,
                    ...nextRecords.filter((record) => record.id !== match.id),
                  ];
                  pendingSaveRef.current = null;
                  clearRecentSave();
                }
              }
            } catch (error) {
              if (error.name === 'AbortError') {
                return;
              }
            }
          }
        }
      }
      setRecords(mergedRecords);
      setPage(nextPage);
      setTotalCount(typeof data.totalCount === 'number' ? data.totalCount : nextRecords.length);
      setFilteredCount(typeof data.filteredCount === 'number' ? data.filteredCount : nextRecords.length);
    } catch (error) {
      if (error.name !== 'AbortError') {
        showStatus({ type: 'error', message: 'Unable to load history.' });
      }
    }
  };

  const loadTarotHistory = useCallback(async () => {
    if (!token) return;
    setTarotHistoryLoading(true);
    setTarotHistoryError('');
    try {
      const res = await authFetch('/api/tarot/history', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) return;
      if (!res.ok) {
        const message = await readErrorMessage(res, 'Unable to load tarot history.');
        throw new Error(message);
      }
      const data = await res.json();
      setTarotHistory(Array.isArray(data.records) ? data.records : []);
    } catch (error) {
      console.error(error);
      setTarotHistoryError(error.message || 'Unable to load tarot history.');
    } finally {
      setTarotHistoryLoading(false);
    }
  }, [authFetch, token]);

  const loadDeletedRecords = async (fallbackRecord = null) => {
    if (!token) return;
    if (deletedAbortRef.current) deletedAbortRef.current.abort();
    const controller = new AbortController();
    deletedAbortRef.current = controller;
    try {
      const params = new URLSearchParams();
      params.set('status', 'deleted');
      params.set('pageSize', '50');
      const res = await authFetch(`/api/bazi/records?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          ...(clientIdRef.current ? { 'X-Client-ID': clientIdRef.current } : {}),
        },
        signal: controller.signal,
      });
      if (res.status === 401) {
        return;
      }
      if (!res.ok) {
        const message = await readErrorMessage(res, 'Unable to load deleted records.');
        setDeletedRecords([]);
        showStatus({ type: 'error', message });
        return;
      }
      const data = await res.json();
      const serverRecords = Array.isArray(data.records) ? data.records : [];
      const lastDeletedSnapshot = lastDeletedRecordRef.current;
      const preferredRecord = fallbackRecord || lastDeletedSnapshot?.record || null;
      let mergedRecords = serverRecords;
      if (preferredRecord?.id) {
        const exists = serverRecords.some((record) => record.id === preferredRecord.id);
        const isFresh = Boolean(fallbackRecord)
          || (Date.now() - (lastDeletedSnapshot?.deletedAt || 0) < 60000);
        if (!exists && isFresh) {
          mergedRecords = [preferredRecord, ...serverRecords];
        } else if (exists && isFresh) {
          mergedRecords = serverRecords.map((record) =>
            record.id === preferredRecord.id ? { ...preferredRecord, ...record } : record
          );
        }
      }
      const primaryId = lastDeletedIdRef.current || lastDeletedId || preferredRecord?.id || null;
      setDeletedRecords(sortDeletedRecordsForDisplay(mergedRecords, primaryId));
    } catch (error) {
      if (error.name !== 'AbortError') {
        setDeletedRecords([]);
      }
    }
  };

  useEffect(() => {
    if (hasRestoredFiltersRef.current) return;
    const hasRecordParam = searchParams.get('recordId')
      || searchParams.get('id')
      || searchParams.get('record');
    const hasFilterParams = ['q', 'gender', 'rangeDays', 'sort', 'page'].some((param) => searchParams.has(param));
    if (hasRecordParam || hasFilterParams) {
      hasRestoredFiltersRef.current = true;
      return;
    }
    hasRestoredFiltersRef.current = true;
  }, [searchParams]);

  useEffect(() => {
    const currentSearch = searchParams.toString();
    if (lastSearchSyncRef.current === currentSearch) {
      return;
    }
    lastSearchSyncRef.current = currentSearch;
    if (currentSearch !== lastSetSearchRef.current) {
      pendingSearchSyncRef.current = currentSearch;
    }
    const searchQuery = searchParams.get('q') || '';
    const nextQuery = searchQuery.trim();
    const nextGender = searchParams.get('gender') || DEFAULT_FILTERS.genderFilter;
    const nextRange = searchParams.get('rangeDays') || DEFAULT_FILTERS.rangeFilter;
    const nextSort = searchParams.get('sort') || DEFAULT_FILTERS.sortOption;
    const nextFilterKey = [nextQuery, nextGender, nextRange, nextSort, effectivePageSize].join('|');
    const parsedPage = Number(searchParams.get('page') || 1);
    const nextPage = filtersKeyRef.current && filtersKeyRef.current !== nextFilterKey
      ? 1
      : Number.isFinite(parsedPage) && parsedPage > 0
        ? parsedPage
        : 1;
    filtersKeyRef.current = nextFilterKey;

    setQuery((prev) => (prev !== nextQuery ? nextQuery : prev));
    scheduleQueryDebounce(nextQuery, { immediate: true });
    setGenderFilter((prev) => (prev !== nextGender ? nextGender : prev));
    setRangeFilter((prev) => (prev !== nextRange ? nextRange : prev));
    setSortOption((prev) => (prev !== nextSort ? nextSort : prev));
    setPage((prev) => (prev !== nextPage ? nextPage : prev));
  }, [scheduleQueryDebounce, searchParams, token]);

  useEffect(() => {
    if (!token) return;
    const recordParam = searchParams.get('recordId')
      || searchParams.get('id')
      || searchParams.get('record');
    if (!recordParam) {
      setDeepLinkState((prev) => (prev.status === 'idle' ? prev : { status: 'idle', record: null, id: null }));
      return;
    }
    const recordId = Number(recordParam);
    if (!Number.isInteger(recordId) || recordId <= 0) {
      setDeepLinkState({ status: 'missing', record: null, id: recordParam });
      return;
    }
    if (deepLinkAbortRef.current) deepLinkAbortRef.current.abort();
    const controller = new AbortController();
    deepLinkAbortRef.current = controller;
    setDeepLinkState({ status: 'loading', record: null, id: recordId });
    authFetch(`/api/bazi/records/${recordId}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then(async (res) => {
        if (res.status === 401) {
          return;
        }
        if (res.ok) {
          const data = await res.json();
          setDeepLinkState({ status: 'found', record: data.record, id: recordId });
          return;
        }
        if (res.status === 404) {
          setDeepLinkState({ status: 'missing', record: null, id: recordId });
          return;
        }
        setDeepLinkState({ status: 'error', record: null, id: recordId });
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setDeepLinkState({ status: 'error', record: null, id: recordId });
        }
      });
  }, [searchParams, token]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const flushPendingSave = async () => {
      const pendingPayload = readPendingSave();
      const recentPayload = readRecentSave();
      const effectivePayload = pendingPayload || recentPayload;
      pendingSaveRef.current = effectivePayload;
      if (!cancelled) setPendingSaveChecked(true);
      if (!effectivePayload) {
        return;
      }
      let matchesExisting = false;
      const locationQuery = normalizeText(effectivePayload.birthLocation);
      if (locationQuery) {
        try {
          const params = new URLSearchParams();
          params.set('q', locationQuery);
          params.set('pageSize', '20');
          const res = await authFetch(`/api/bazi/records?${params.toString()}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            const records = Array.isArray(data.records) ? data.records : [];
            matchesExisting = records.some((record) => recordMatchesPending(record, effectivePayload));
          }
        } catch {
          // Ignore search errors.
        }
      }
      if (!matchesExisting) {
        try {
          const res = await authFetch('/api/bazi/records', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(effectivePayload),
            keepalive: true,
          });
          if (res.ok) {
            matchesExisting = true;
          }
        } catch {
          // Ignore retry errors.
        }
      }
      if (matchesExisting) {
        clearPendingSave();
        clearRecentSave();
      }
      if (!cancelled) setPendingSaveChecked(true);
    };

    flushPendingSave();
    return () => {
      cancelled = true;
    };
  }, [authFetch, token]);

  useEffect(() => {
    if (!token || !pendingSaveChecked) return;
    if (filtersKeyRef.current !== filterKey) {
      filtersKeyRef.current = filterKey;
      if (page !== 1) {
        setPage(1);
        return;
      }
    }
    loadRecords({ page });
  }, [filterKey, page, pendingSaveChecked, token]);

  useEffect(() => {
    if (!token || !pendingSaveChecked) return;
    const recentSave = readRecentSave();
    if (!recentSave) return;
    const timer = setTimeout(() => {
      loadRecords({ page: 1 });
    }, 800);
    return () => clearTimeout(timer);
  }, [pendingSaveChecked, token]);

  useEffect(() => {
    if (!token) return;
    loadDeletedRecords();
  }, [token]);

  useEffect(() => {
    if (!token) {
      setTarotHistory([]);
      return;
    }
    loadTarotHistory();
  }, [token, loadTarotHistory]);

  useEffect(() => {
    const params = buildFilterParams({ page, queryValue: query });
    const nextSearch = params.toString();
    const currentSearch = searchParams.toString();

    if (!hasInitializedUrlSyncRef.current) {
      if (nextSearch === currentSearch) {
        hasInitializedUrlSyncRef.current = true;
      }
      return;
    }

    if (pendingSearchSyncRef.current) {
      if (nextSearch === pendingSearchSyncRef.current) {
        pendingSearchSyncRef.current = '';
      }
      return;
    }

    if (shouldResetPage) return;
    if (nextSearch !== currentSearch) {
      lastSetSearchRef.current = nextSearch;
      setSearchParams(params, { replace: true });
    }
  }, [page, filterKey, query, searchParams, setSearchParams, shouldResetPage]);

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => records.some((record) => record.id === id)));
  }, [records]);

  useEffect(() => {
    if (!status) return;
    const timeoutMs = status.type === 'error' ? 6000 : 3500;
    const statusId = status.id;
    const timer = setTimeout(() => {
      if (statusIdRef.current === statusId) {
        setStatus(null);
      }
    }, timeoutMs);
    return () => clearTimeout(timer);
  }, [status]);

  useEffect(() => {
    if (!confirmState) return;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setConfirmState(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    confirmCancelRef.current?.focus();
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmState]);

  useEffect(() => () => {
    if (abortRef.current) abortRef.current.abort();
    if (deletedAbortRef.current) deletedAbortRef.current.abort();
    if (deepLinkAbortRef.current) deepLinkAbortRef.current.abort();
    if (queryDebounceRef.current) clearTimeout(queryDebounceRef.current);
  }, []);

  const clampCount = (value) => Math.max(0, value);

  const handleDelete = async (record) => {
    if (deletingIdsRef.current.has(record.id)) {
      return;
    }
    deletingIdsRef.current.add(record.id);
    clearStatus();
    setRecords((prev) => prev.filter((item) => item.id !== record.id));
    setSelectedIds((prev) => prev.filter((id) => id !== record.id));
    setTotalCount((prev) => clampCount(prev - 1));
    setFilteredCount((prev) => clampCount(prev - 1));

    try {
      const deleteParams = new URLSearchParams();
      if (clientIdRef.current) {
        deleteParams.set('clientId', clientIdRef.current);
      }
      const deleteUrl = deleteParams.toString()
        ? `/api/bazi/records/${record.id}?${deleteParams.toString()}`
        : `/api/bazi/records/${record.id}`;
      const res = await authFetch(deleteUrl, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Client-ID': clientIdRef.current,
        },
      });
      if (res.status === 401) {
        setRecords((prev) => [record, ...prev]);
        setTotalCount((prev) => clampCount(prev + 1));
        setFilteredCount((prev) => clampCount(prev + 1));
        return;
      }
      if (res.status === 404) {
        await Promise.all([loadRecords({ page }), loadDeletedRecords()]);
        if (deepLinkState.status === 'found' && deepLinkState.id === record.id) {
          setDeepLinkState({ status: 'missing', record: null, id: record.id });
        }
        showStatus({ type: 'success', message: 'Record already deleted.' });
        return;
      }
      if (!res.ok) {
        const message = await readErrorMessage(res, 'Unable to delete record. It has been restored.');
        setRecords((prev) => [record, ...prev]);
        setTotalCount((prev) => clampCount(prev + 1));
        setFilteredCount((prev) => clampCount(prev + 1));
        showStatus({ type: 'error', message });
        return;
      }
      lastDeletedRecordRef.current = { record: { ...record }, deletedAt: Date.now() };
      lastDeletedIdRef.current = record.id;
      setLastDeletedId(record.id);
      setDeletedRecords((prev) => {
        const exists = prev.some((entry) => entry.id === record.id);
        const merged = exists ? prev : [record, ...prev];
        return sortDeletedRecordsForDisplay(merged, record.id);
      });
      showStatus({ type: 'success', message: 'Record deleted.' });
      await Promise.all([loadRecords({ page }), loadDeletedRecords(record)]);
    } finally {
      deletingIdsRef.current.delete(record.id);
    }
  };

  const handleRestore = async (recordId) => {
    if (deletingIdsRef.current.has(recordId)) return;
    deletingIdsRef.current.add(recordId);
    clearStatus();
    try {
      const restoreParams = new URLSearchParams();
      if (clientIdRef.current) {
        restoreParams.set('clientId', clientIdRef.current);
      }
      const restoreUrl = restoreParams.toString()
        ? `/api/bazi/records/${recordId}/restore?${restoreParams.toString()}`
        : `/api/bazi/records/${recordId}/restore`;
      const res = await authFetch(restoreUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Client-ID': clientIdRef.current,
        },
      });
      if (res.status === 401) {
        return;
      }
      if (res.status === 404) {
        await Promise.all([loadRecords({ page }), loadDeletedRecords()]);
        showStatus({ type: 'error', message: 'Record is no longer available to restore.' });
        return;
      }
      if (!res.ok) {
        const message = await readErrorMessage(res, 'Unable to restore record.');
        showStatus({ type: 'error', message });
        return;
      }
      const normalizedId = Number(recordId);
      setDeletedRecords((prev) => prev.filter((record) => Number(record.id) !== normalizedId));
      if (lastDeletedIdRef.current === recordId) {
        lastDeletedIdRef.current = null;
      }
      if (lastDeletedRecordRef.current?.record?.id === recordId) {
        lastDeletedRecordRef.current = null;
      }
      setLastDeletedId((prev) => (prev === recordId ? null : prev));
      setLastDeletedRecord((prev) => (prev?.id === recordId ? null : prev));
      await Promise.all([loadRecords({ page }), loadDeletedRecords()]);
      showStatus({ type: 'success', message: 'Record restored.' });
    } finally {
      deletingIdsRef.current.delete(recordId);
    }
  };

  const handleHardDelete = async (recordId) => {
    if (deletingIdsRef.current.has(recordId)) return;
    deletingIdsRef.current.add(recordId);
    clearStatus();
    try {
      const deleteParams = new URLSearchParams();
      if (clientIdRef.current) {
        deleteParams.set('clientId', clientIdRef.current);
      }
      const deleteUrl = deleteParams.toString()
        ? `/api/bazi/records/${recordId}/hard-delete?${deleteParams.toString()}`
        : `/api/bazi/records/${recordId}/hard-delete`;
      const res = await authFetch(deleteUrl, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Client-ID': clientIdRef.current,
        },
      });
      if (res.status === 401) {
        return;
      }
      if (res.status === 404) {
        setDeletedRecords((prev) => prev.filter((record) => record.id !== recordId));
        showStatus({ type: 'success', message: 'Record already removed.' });
        return;
      }
      if (!res.ok) {
        const message = await readErrorMessage(res, 'Unable to permanently delete record.');
        showStatus({ type: 'error', message });
        return;
      }
      setDeletedRecords((prev) => prev.filter((record) => record.id !== recordId));
      setLastDeletedId((prev) => (prev === recordId ? null : prev));
      if (lastDeletedIdRef.current === recordId) {
        lastDeletedIdRef.current = null;
      }
      if (lastDeletedRecordRef.current?.record?.id === recordId) {
        lastDeletedRecordRef.current = null;
      }
      showStatus({ type: 'success', message: 'Record permanently deleted.' });
      await Promise.all([loadRecords({ page }), loadDeletedRecords()]);
    } finally {
      deletingIdsRef.current.delete(recordId);
    }
  };

  const handleExport = async () => {
    if (!records.length) {
      showStatus({ type: 'error', message: 'No records available to export.' });
      return;
    }
    clearStatus();
    setIsExporting(true);
    let downloadUrl = '';
    try {
      const params = buildFilterParams();
      if (clientIdRef.current) {
        params.set('clientId', clientIdRef.current);
      }
      const queryString = params.toString();
      const res = await authFetch(`/api/bazi/records/export${queryString ? `?${queryString}` : ''}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          ...(clientIdRef.current ? { 'X-Client-ID': clientIdRef.current } : {}),
        },
      });
      if (res.status === 401) {
        return;
      }
      if (!res.ok) {
        const message = await readErrorMessage(res, 'Unable to export history.');
        throw new Error(message);
      }
      const data = await res.json();
      const exportedRecords = Array.isArray(data) ? data : data?.records;
      if (!Array.isArray(exportedRecords) || exportedRecords.length === 0) {
        showStatus({ type: 'error', message: 'No records matched your export filters.' });
        return;
      }
      const payload = JSON.stringify(data, null, 2);
      const blob = new Blob([payload], { type: 'application/json' });
      downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = `bazi-history-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      showStatus({ type: 'success', message: 'History exported.' });
    } catch (error) {
      console.error(error);
      showStatus({ type: 'error', message: error.message || 'Unable to export history.' });
    } finally {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      setIsExporting(false);
    }
  };

  const handleExportAll = async () => {
    clearStatus();
    setIsExportingAll(true);
    let downloadUrl = '';
    try {
      const params = new URLSearchParams();
      params.set('status', 'all');
      params.set('includeDeletedStatus', '1');
      if (clientIdRef.current) {
        params.set('clientId', clientIdRef.current);
      }
      const res = await authFetch(`/api/bazi/records/export?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          ...(clientIdRef.current ? { 'X-Client-ID': clientIdRef.current } : {}),
        },
      });
      if (res.status === 401) {
        return;
      }
      if (!res.ok) {
        const message = await readErrorMessage(res, 'Unable to export history.');
        throw new Error(message);
      }
      const data = await res.json();
      const exportedRecords = Array.isArray(data) ? data : data?.records;
      if (!Array.isArray(exportedRecords) || exportedRecords.length === 0) {
        showStatus({ type: 'error', message: 'No records available to export.' });
        return;
      }
      const payload = JSON.stringify(data, null, 2);
      const blob = new Blob([payload], { type: 'application/json' });
      downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = `bazi-history-full-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      showStatus({ type: 'success', message: 'Full history exported.' });
    } catch (error) {
      console.error(error);
      showStatus({ type: 'error', message: error.message || 'Unable to export history.' });
    } finally {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      setIsExportingAll(false);
    }
  };

  const handleImportFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    clearStatus();
    setIsImporting(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const recordsToImport = Array.isArray(parsed) ? parsed : parsed?.records;
      if (!Array.isArray(recordsToImport) || !recordsToImport.length) {
        throw new Error('No records found in file.');
      }
      const res = await authFetch('/api/bazi/records/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(clientIdRef.current ? { 'X-Client-ID': clientIdRef.current } : {}),
        },
        body: JSON.stringify({
          records: recordsToImport,
          ...(clientIdRef.current ? { clientId: clientIdRef.current } : {}),
        }),
      });
      if (res.status === 401) {
        return;
      }
      if (!res.ok) {
        const message = await readErrorMessage(res, 'Unable to import history.');
        throw new Error(message);
      }
      const data = await res.json();
      showStatus({
        type: 'success',
        message: `Imported ${data.created ?? 0} record${data.created === 1 ? '' : 's'}.`,
      });
      await Promise.all([loadRecords({ page: 1 }), loadDeletedRecords()]);
    } catch (error) {
      console.error(error);
      showStatus({ type: 'error', message: error.message || 'Unable to import history.' });
    } finally {
      setIsImporting(false);
      event.target.value = '';
    }
  };

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const filteredRecords = useMemo(
    () => sortRecordsForDisplay(records, sortOption),
    [records, sortOption],
  );
  const filteredIds = useMemo(() => filteredRecords.map((record) => record.id), [filteredRecords]);
  const filteredIdSet = useMemo(() => new Set(filteredIds), [filteredIds]);
  const allFilteredSelected = filteredRecords.length > 0
    && filteredRecords.every((record) => selectedSet.has(record.id));
  const someFilteredSelected = filteredRecords.some((record) => selectedSet.has(record.id));

  useEffect(() => {
    if (!selectAllRef.current) return;
    selectAllRef.current.indeterminate = !allFilteredSelected && someFilteredSelected;
  }, [allFilteredSelected, someFilteredSelected]);

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds((prev) => prev.filter((id) => !filteredIdSet.has(id)));
      return;
    }
    setSelectedIds((prev) => Array.from(new Set([...prev, ...filteredIds])));
  };

  const toggleSelection = (recordId) => {
    setSelectedIds((prev) => (
      prev.includes(recordId) ? prev.filter((id) => id !== recordId) : [...prev, recordId]
    ));
  };

  const startEdit = (record) => {
    if (!record) return;
    setEditRecordId(record.id);
    setEditDraft(buildEditDraft(record));
    setEditErrors({});
    setEditStatus('');
  };

  const cancelEdit = () => {
    setEditRecordId(null);
    setEditDraft(null);
    setEditErrors({});
    setEditStatus('');
  };

  const updateEditDraft = (field, value) => {
    setEditDraft((prev) => ({ ...(prev || {}), [field]: value }));
  };

  const handleEditSave = async () => {
    if (!editRecordId || !editDraft) return;
    const { errors, payload } = validateEditDraft(editDraft);
    setEditErrors(errors);
    if (Object.keys(errors).length) {
      setEditStatus('Fix the highlighted fields to continue.');
      return;
    }
    setEditSaving(true);
    setEditStatus('');
    try {
      const res = await authFetch(`/api/bazi/records/${editRecordId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (res.status === 401) {
        return;
      }
      if (!res.ok) {
        const message = await readErrorMessage(res, 'Unable to update record.');
        setEditStatus(message);
        return;
      }
      const data = await res.json();
      if (data.record) {
        setRecords((prev) => prev.map((item) => (item.id === data.record.id ? data.record : item)));
        setDeepLinkState((prev) => (
          prev?.status === 'found' && prev?.id === data.record.id
            ? { ...prev, record: data.record }
            : prev
        ));
      }
      cancelEdit();
    } catch (error) {
      setEditStatus('Unable to update record.');
    } finally {
      setEditSaving(false);
    }
  };

  const performBulkDelete = async (idsToDelete) => {
    if (!idsToDelete.length) return;
    const previousRecords = records;
    const previousTotalCount = totalCount;
    const previousFilteredCount = filteredCount;
    idsToDelete.forEach((recordId) => {
      deletingIdsRef.current.delete(recordId);
    });
    clearStatus();
    setRecords((prev) => prev.filter((record) => !idsToDelete.includes(record.id)));
    setSelectedIds((prev) => prev.filter((id) => !idsToDelete.includes(id)));
    setTotalCount((prev) => Math.max(0, prev - idsToDelete.length));
    setFilteredCount((prev) => Math.max(0, prev - idsToDelete.length));

    const res = await authFetch('/api/bazi/records/bulk-delete', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Client-ID': clientIdRef.current,
      },
      body: JSON.stringify({ ids: idsToDelete, clientId: clientIdRef.current }),
    });

    if (res.status === 401) {
      setRecords(previousRecords);
      setTotalCount(previousTotalCount);
      setFilteredCount(previousFilteredCount);
      return;
    }

    if (!res.ok) {
      if (res.status === 404) {
        await Promise.all([loadRecords({ page }), loadDeletedRecords()]);
        showStatus({ type: 'success', message: 'Selected records already deleted.' });
        return;
      }
      setRecords(previousRecords);
      setTotalCount(previousTotalCount);
      setFilteredCount(previousFilteredCount);
      const message = await readErrorMessage(res, 'Unable to delete selected records. They have been restored.');
      showStatus({ type: 'error', message });
      return;
    }

    await Promise.all([loadRecords({ page }), loadDeletedRecords()]);
    showStatus({
      type: 'success',
      message: `Deleted ${idsToDelete.length} record${idsToDelete.length === 1 ? '' : 's'}.`,
    });
  };

  const requestDelete = (record) => {
    setConfirmState({
      type: 'single',
      record,
      title: 'Delete this record?',
      description: 'This removes the record from your history. You can restore it later.',
      confirmLabel: 'Delete',
    });
  };

  const requestHardDelete = (record) => {
    setConfirmState({
      type: 'hard',
      record,
      title: 'Delete permanently?',
      description: 'This removes the record from your account forever. This cannot be undone.',
      confirmLabel: 'Delete permanently',
    });
  };

  const requestBulkDelete = () => {
    if (!selectedIds.length) return;
    setConfirmState({
      type: 'bulk',
      ids: [...selectedIds],
      title: `Delete ${selectedIds.length} selected record${selectedIds.length === 1 ? '' : 's'}?`,
      description: 'This removes the selected records from your history. You can restore them later.',
      confirmLabel: 'Delete selected',
    });
  };

  const handleConfirmAction = async () => {
    if (!confirmState) return;
    const { type, record, ids } = confirmState;
    setConfirmState(null);
    if (type === 'single' && record) {
      handleDelete(record);
      return;
    }
    if (type === 'hard' && record) {
      await handleHardDelete(record.id);
      return;
    }
    if (type === 'bulk' && ids?.length) {
      await performBulkDelete(ids);
    }
  };

  const handleResetFilters = () => {
    const nextQuery = DEFAULT_FILTERS.query;
    const nextGender = DEFAULT_FILTERS.genderFilter;
    const nextRange = DEFAULT_FILTERS.rangeFilter;
    const nextSort = DEFAULT_FILTERS.sortOption;

    setQuery(nextQuery);
    scheduleQueryDebounce(nextQuery, { immediate: true });
    setGenderFilter(nextGender);
    setRangeFilter(nextRange);
    setSortOption(nextSort);
    setPage(1);
    setSearchParams(new URLSearchParams(), { replace: true });
  };

  const clearDeepLink = () => {
    const params = new URLSearchParams(searchParams);
    params.delete('recordId');
    params.delete('id');
    params.delete('record');
    setSearchParams(params, { replace: true });
    setDeepLinkState({ status: 'idle', record: null, id: null });
  };

  const handleClearFilter = (filterName) => {
    switch (filterName) {
      case 'query':
        setQuery(DEFAULT_FILTERS.query);
        scheduleQueryDebounce(DEFAULT_FILTERS.query, { immediate: true });
        break;
      case 'gender':
        setGenderFilter(DEFAULT_FILTERS.genderFilter);
        break;
      case 'range':
        setRangeFilter(DEFAULT_FILTERS.rangeFilter);
        break;
      case 'sort':
        setSortOption(DEFAULT_FILTERS.sortOption);
        break;
      default:
        return;
    }
    setPage(1);
  };

  const isQueryActive = Boolean(query.trim());
  const isGenderActive = genderFilter !== DEFAULT_FILTERS.genderFilter;
  const isRangeActive = rangeFilter !== DEFAULT_FILTERS.rangeFilter;
  const isSortActive = sortOption !== DEFAULT_FILTERS.sortOption;
  const hasAnyRecords = totalCount > 0 || deletedRecords.length > 0;
  const hasActiveFilters = Boolean(query.trim()) || genderFilter !== 'all' || rangeFilter !== 'all';
  const totalPages = Math.max(1, Math.ceil(filteredCount / effectivePageSize));
  const canGoPrev = page > 1;
  const canGoNext = page < totalPages;
  const highlightRecordId = deepLinkState.status === 'found' ? deepLinkState.id : null;

  useEffect(() => {
    if (page <= 1) return;
    if (records.length > 0) return;
    const nextPage = filteredCount > 0 ? totalPages : 1;
    if (page > nextPage) {
      setPage(nextPage);
    }
  }, [page, totalPages, filteredCount, records.length]);

  return (
    <main id="main-content" tabIndex={-1} className="responsive-container pb-16">
      <Breadcrumbs />
      {status && (
        <div className="pointer-events-none fixed right-6 top-6 z-50 flex w-[min(90vw,360px)] flex-col gap-2">
          <div
            role={status.type === 'error' ? 'alert' : 'status'}
            aria-live={status.type === 'error' ? 'assertive' : 'polite'}
            className={`pointer-events-auto rounded-2xl border px-4 py-3 text-sm shadow-lg backdrop-blur ${
              status.type === 'error'
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
                Cancel
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
        <p className="mt-3 text-white/70">Your saved readings will appear here.</p>
        <section className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-xl text-white">I Ching Time Oracle</h2>
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
              className={`mt-4 rounded-2xl border px-4 py-2 ${getIchingStatusStyle(ichingTimeStatus)}`}
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
        {deepLinkState.status === 'loading' && (
          <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-white/70">
            Looking for the shared record…
          </div>
        )}
        {deepLinkState.status === 'missing' && (
          <div className="mt-5 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-100">
            <p className="font-semibold text-rose-100">Record not found</p>
            <p className="mt-1 text-rose-100/80">
              This link points to a record that no longer exists or you no longer have access.
            </p>
          </div>
        )}
        {deepLinkState.status === 'error' && (
          <div className="mt-5 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-100">
            <p className="font-semibold text-rose-100">Unable to load shared record</p>
            <p className="mt-1 text-rose-100/80">Please try again or remove the record link from the URL.</p>
          </div>
        )}
        {deepLinkState.status === 'found' && deepLinkState.record && (
          <div
            data-testid="history-shared-record"
            className="mt-5 rounded-2xl border border-gold-400/30 bg-gold-500/10 p-4 text-sm text-gold-100"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-gold-100">Shared record loaded</p>
                <p className="mt-1 text-gold-100/80">
                  This link points to a specific record. You can keep browsing or clear the link.
                </p>
              </div>
              <button
                type="button"
                onClick={clearDeepLink}
                className="rounded-full border border-gold-300/40 px-3 py-1 text-[0.7rem] uppercase tracking-[0.2em] text-gold-100 transition hover:border-gold-200 hover:text-white"
              >
                Clear link
              </button>
            </div>
            <div className="mt-3 grid gap-2 text-xs text-gold-100/80 sm:grid-cols-2">
              <div>
                <p className="text-[0.65rem] uppercase tracking-[0.2em] text-gold-100/60">Birth</p>
                <p className="text-sm text-gold-100">
                  {deepLinkState.record.birthYear}-{deepLinkState.record.birthMonth}-{deepLinkState.record.birthDay} · {deepLinkState.record.birthHour}:00
                </p>
              </div>
              <div>
                <p className="text-[0.65rem] uppercase tracking-[0.2em] text-gold-100/60">Profile</p>
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
            {isExporting ? 'Exporting…' : 'Export filtered'}
          </button>
          <button
            type="button"
            onClick={handleExportAll}
            disabled={isExportingAll}
            className="rounded-full border border-white/20 px-4 py-2 text-xs uppercase tracking-[0.2em] text-white/70 transition hover:border-white/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isExportingAll ? 'Exporting…' : 'Export all'}
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="rounded-full border border-white/20 px-4 py-2 text-xs uppercase tracking-[0.2em] text-white/70 transition hover:border-white/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isImporting ? 'Importing…' : 'Import file'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            onChange={handleImportFile}
            className="hidden"
          />
        </div>
        <div className="mt-6 grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-white/70 md:grid-cols-4">
          <label className="grid gap-2">
            <div className="flex items-center justify-between text-[0.7rem] uppercase tracking-[0.2em] text-white/50">
              <span>Search</span>
              {isQueryActive && (
                <button
                  type="button"
                  onClick={() => handleClearFilter('query')}
                  className="rounded-full border border-white/10 px-2 py-0.5 text-[0.55rem] uppercase tracking-[0.2em] text-white/50 transition hover:border-white/40 hover:text-white"
                >
                  Clear
                </button>
              )}
            </div>
            <input
              type="search"
              value={query}
              onChange={(event) => {
                const nextValue = event.target.value;
                setQuery(nextValue);
                scheduleQueryDebounce(nextValue);
              }}
              placeholder="Location, timezone, pillar"
              className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/30"
            />
          </label>
          <label className="grid gap-2">
            <div className="flex items-center justify-between text-[0.7rem] uppercase tracking-[0.2em] text-white/50">
              <span>Gender</span>
              {isGenderActive && (
                <button
                  type="button"
                  onClick={() => handleClearFilter('gender')}
                  className="rounded-full border border-white/10 px-2 py-0.5 text-[0.55rem] uppercase tracking-[0.2em] text-white/50 transition hover:border-white/40 hover:text-white"
                >
                  Clear
                </button>
              )}
            </div>
            <select
              value={genderFilter}
              onChange={(event) => {
                setGenderFilter(event.target.value);
                setSortOption(DEFAULT_FILTERS.sortOption);
              }}
              className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
            >
              <option value="all">All</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </label>
          <label className="grid gap-2">
            <div className="flex items-center justify-between text-[0.7rem] uppercase tracking-[0.2em] text-white/50">
              <span>Created</span>
              {isRangeActive && (
                <button
                  type="button"
                  onClick={() => handleClearFilter('range')}
                  className="rounded-full border border-white/10 px-2 py-0.5 text-[0.55rem] uppercase tracking-[0.2em] text-white/50 transition hover:border-white/40 hover:text-white"
                >
                  Clear
                </button>
              )}
            </div>
            <select
              value={rangeFilter}
              onChange={(event) => {
                setRangeFilter(event.target.value);
                setSortOption(DEFAULT_FILTERS.sortOption);
              }}
              className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
            >
              <option value="all">All time</option>
              <option value="today">Today</option>
              <option value="week">This week</option>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
            </select>
          </label>
          <label className="grid gap-2">
            <div className="flex items-center justify-between text-[0.7rem] uppercase tracking-[0.2em] text-white/50">
              <span>Sort</span>
              {isSortActive && (
                <button
                  type="button"
                  onClick={() => handleClearFilter('sort')}
                  className="rounded-full border border-white/10 px-2 py-0.5 text-[0.55rem] uppercase tracking-[0.2em] text-white/50 transition hover:border-white/40 hover:text-white"
                >
                  Clear
                </button>
              )}
            </div>
            <select
              value={sortOption}
              onChange={(event) => setSortOption(event.target.value)}
              className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
            >
              <option value="created-desc">Newest saved</option>
              <option value="created-asc">Oldest saved</option>
              <option value="birth-desc">Newest birthdate</option>
              <option value="birth-asc">Oldest birthdate</option>
            </select>
          </label>
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={handleResetFilters}
            className="rounded-full border border-white/20 px-4 py-2 text-xs uppercase tracking-[0.2em] text-white/70 transition hover:border-gold-400/60 hover:text-white"
          >
            Reset filters
          </button>
        </div>
        {!!orderedDeletedRecords.length && (
          <div className="mt-6 rounded-2xl border border-amber-300/20 bg-amber-500/10 p-4 text-xs text-amber-100">
            <p className="font-semibold text-amber-100">Deleted records</p>
            <p className="mt-1 text-amber-100/80">Restore any record you removed from history.</p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2" role="list">
              {orderedDeletedRecords.map((record) => {
                const isPrimaryRestore = primaryRestoreId === record.id;
                const label = isPrimaryRestore ? 'Restore' : 'Recover';
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
                          onClick={() => handleRestore(record.id)}
                          className="rounded-full border border-amber-200/40 px-3 py-1 text-[0.7rem] uppercase tracking-[0.18em] text-amber-100 transition hover:border-amber-200 hover:text-white"
                        >
                          {label}
                        </button>
                        <button
                          type="button"
                          onClick={() => requestHardDelete(record)}
                          className="rounded-full border border-rose-300/40 px-3 py-1 text-[0.7rem] uppercase tracking-[0.18em] text-rose-100 transition hover:border-rose-300 hover:text-rose-200"
                        >
                          Delete permanently
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
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-white/30 bg-black/40 text-gold-400"
                />
                <span className="uppercase tracking-[0.18em] text-white/60">Select all</span>
                {selectedIds.length > 0 && (
                  <span className="rounded-full border border-white/10 px-2 py-0.5 text-[0.65rem] text-white/60">
                    {selectedIds.length} selected
                  </span>
                )}
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedIds([])}
                  className="rounded-full border border-white/10 px-3 py-1 text-[0.7rem] uppercase tracking-[0.2em] text-white/50 transition hover:border-white/40 hover:text-white disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/40"
                  disabled={!selectedIds.length}
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={requestBulkDelete}
                  className="rounded-full border border-rose-400/40 px-4 py-1 text-[0.7rem] uppercase tracking-[0.2em] text-rose-100 transition hover:border-rose-300 hover:text-rose-200 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/40"
                  disabled={!selectedIds.length}
                >
                  Delete selected
                </button>
              </div>
            </div>
            {filteredRecords.map((record) => (
              <div
                key={record.id}
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
                      checked={selectedSet.has(record.id)}
                      onChange={() => toggleSelection(record.id)}
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
                        Saved {new Date(record.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to={`/history/${record.id}`}
                      className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/70 transition hover:border-white/50 hover:text-white"
                    >
                      {t('history.viewDetails', { defaultValue: 'View details' })}
                    </Link>
                    <button
                      type="button"
                      onClick={() => startEdit(record)}
                      disabled={editSaving && editRecordId === record.id}
                      className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/70 transition hover:border-gold-400/60 hover:text-gold-100 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/40"
                    >
                      {editRecordId === record.id ? 'Editing' : 'Edit'}
                    </button>
                    <button
                      type="button"
                      onClick={() => requestDelete(record)}
                      className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/70 transition hover:border-rose-400/60 hover:text-rose-200"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <div className="mt-3 grid gap-3 text-xs text-white/70 sm:grid-cols-2">
                  <div>
                    <p className="text-white/50">Year Pillar</p>
                    <p>{record.pillars.year.stem} · {record.pillars.year.branch}</p>
                  </div>
                  <div>
                    <p className="text-white/50">Day Pillar</p>
                    <p>{record.pillars.day.stem} · {record.pillars.day.branch}</p>
                  </div>
                </div>
                {editRecordId === record.id && editDraft && (
                  <div className="mt-4 rounded-2xl border border-white/10 bg-black/40 p-4 text-xs text-white/70">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="grid gap-1">
                        <span className="text-[0.65rem] uppercase tracking-[0.18em] text-white/50">Birth year</span>
                        <input
                          type="number"
                          min="1"
                          max="9999"
                          value={editDraft.birthYear}
                          onChange={(event) => updateEditDraft('birthYear', event.target.value)}
                          className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                        />
                        {editErrors.birthYear && (
                          <span className="text-[0.65rem] text-rose-200">{editErrors.birthYear}</span>
                        )}
                      </label>
                      <label className="grid gap-1">
                        <span className="text-[0.65rem] uppercase tracking-[0.18em] text-white/50">Birth month</span>
                        <input
                          type="number"
                          min="1"
                          max="12"
                          value={editDraft.birthMonth}
                          onChange={(event) => updateEditDraft('birthMonth', event.target.value)}
                          className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                        />
                        {editErrors.birthMonth && (
                          <span className="text-[0.65rem] text-rose-200">{editErrors.birthMonth}</span>
                        )}
                      </label>
                      <label className="grid gap-1">
                        <span className="text-[0.65rem] uppercase tracking-[0.18em] text-white/50">Birth day</span>
                        <input
                          type="number"
                          min="1"
                          max="31"
                          value={editDraft.birthDay}
                          onChange={(event) => updateEditDraft('birthDay', event.target.value)}
                          className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                        />
                        {editErrors.birthDay && (
                          <span className="text-[0.65rem] text-rose-200">{editErrors.birthDay}</span>
                        )}
                      </label>
                      <label className="grid gap-1">
                        <span className="text-[0.65rem] uppercase tracking-[0.18em] text-white/50">Birth hour</span>
                        <input
                          type="number"
                          min="0"
                          max="23"
                          value={editDraft.birthHour}
                          onChange={(event) => updateEditDraft('birthHour', event.target.value)}
                          className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                        />
                        {editErrors.birthHour && (
                          <span className="text-[0.65rem] text-rose-200">{editErrors.birthHour}</span>
                        )}
                      </label>
                      <label className="grid gap-1">
                        <span className="text-[0.65rem] uppercase tracking-[0.18em] text-white/50">Gender</span>
                        <select
                          value={editDraft.gender}
                          onChange={(event) => updateEditDraft('gender', event.target.value)}
                          className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                        >
                          <option value="">Select</option>
                          <option value="female">Female</option>
                          <option value="male">Male</option>
                        </select>
                        {editErrors.gender && (
                          <span className="text-[0.65rem] text-rose-200">{editErrors.gender}</span>
                        )}
                      </label>
                      <label className="grid gap-1">
                        <span className="text-[0.65rem] uppercase tracking-[0.18em] text-white/50">Birth location</span>
                        <input
                          type="text"
                          value={editDraft.birthLocation}
                          onChange={(event) => updateEditDraft('birthLocation', event.target.value)}
                          className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                        />
                        {editErrors.birthLocation && (
                          <span className="text-[0.65rem] text-rose-200">{editErrors.birthLocation}</span>
                        )}
                      </label>
                      <label className="grid gap-1">
                        <span className="text-[0.65rem] uppercase tracking-[0.18em] text-white/50">Timezone</span>
                        <input
                          type="text"
                          value={editDraft.timezone}
                          onChange={(event) => updateEditDraft('timezone', event.target.value)}
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
                        onClick={handleEditSave}
                        disabled={editSaving}
                        className="rounded-full border border-emerald-400/50 px-4 py-1 text-xs uppercase tracking-[0.18em] text-emerald-100 transition hover:border-emerald-300 hover:text-emerald-200 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/40"
                      >
                        {editSaving ? 'Saving...' : 'Save changes'}
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        disabled={editSaving}
                        className="rounded-full border border-white/20 px-4 py-1 text-xs uppercase tracking-[0.18em] text-white/60 transition hover:border-white/40 hover:text-white disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/40"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {totalPages > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/60">
                <span>
                  Page {page} of {totalPages}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    to={buildPageHref(page - 1)}
                    aria-disabled={!canGoPrev}
                    className={`rounded-full border px-3 py-1 text-[0.7rem] uppercase tracking-[0.2em] transition ${
                      canGoPrev
                        ? 'border-white/20 text-white/70 hover:border-white/50 hover:text-white'
                        : 'pointer-events-none border-white/10 text-white/30'
                    }`}
                  >
                    Prev
                  </Link>
                  <Link
                    to={buildPageHref(page + 1)}
                    aria-disabled={!canGoNext}
                    className={`rounded-full border px-3 py-1 text-[0.7rem] uppercase tracking-[0.2em] transition ${
                      canGoNext
                        ? 'border-white/20 text-white/70 hover:border-white/50 hover:text-white'
                        : 'pointer-events-none border-white/10 text-white/30'
                    }`}
                  >
                    Next
                  </Link>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-dashed border-white/20 bg-white/5 p-6 text-sm text-white/60">
            {hasAnyRecords ? (
              <div className="grid gap-2">
                <p className="text-sm font-semibold text-white">No results found</p>
                <p className="text-white/60">
                  {hasActiveFilters
                    ? 'Try clearing a filter or searching a different location or pillar.'
                    : 'No records match your current view yet.'}
                </p>
              </div>
            ) : (
              <div className="grid gap-2">
                <p className="text-sm font-semibold text-white">No history yet</p>
                <p className="text-white/60">Complete a reading to see it saved here.</p>
              </div>
            )}
          </div>
        )}
      </section>
      <section className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl text-gold-300">Tarot Archive</h2>
            <p className="mt-1 text-sm text-white/60">
              Review saved tarot spreads pulled directly from your backend history.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/tarot?spread=ThreeCard"
              className="rounded-full border border-gold-400/60 px-4 py-2 text-xs uppercase tracking-[0.2em] text-gold-200 transition hover:bg-gold-400/10"
            >
              Start three-card
            </Link>
            <button
              type="button"
              onClick={loadTarotHistory}
              disabled={tarotHistoryLoading}
              className="rounded-full border border-white/20 px-4 py-2 text-xs uppercase tracking-[0.2em] text-white/70 transition hover:border-white/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {tarotHistoryLoading ? 'Refreshing…' : 'Refresh'}
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
            No tarot readings saved yet. Complete a three-card interpretation to see it here.
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
                    {record.userQuestion || 'General Reading'}
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
