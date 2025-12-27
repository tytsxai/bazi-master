import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useAuthFetch } from '../auth/useAuthFetch';
import { getClientId } from '../utils/clientId';
import { readApiErrorMessage } from '../utils/apiError';
import {
  SEARCH_DEBOUNCE_MS,
  PAGE_SIZE,
  MAX_SORT_PAGE_SIZE,
  DEFAULT_FILTERS,
  PENDING_SAVE_KEY,
  RECENT_SAVE_KEY
} from './historyConstants';
import {
  toTimestamp,
  isWhitespaceOnly,
  isValidCalendarDate,
  getBirthTimestamp,
  sortRecordsForDisplay,
  sortDeletedRecordsForDisplay
} from './historyUtils';

export default function useHistoryData({ t }) {
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
        const message = await readErrorMessage(res, t('history.timeHexagramError'));
        throw new Error(message);
      }
      const data = await res.json();
      setIchingTimeResult(data);
      setIchingTimeStatus({ type: 'success', message: t('iching.timeRevealed') });
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
      errors.birthYear = t('bazi.errors.yearInvalid');
    }
    if (!Number.isInteger(birthMonth) || birthMonth < 1 || birthMonth > 12) {
      errors.birthMonth = t('bazi.errors.monthInvalid');
    }
    if (!Number.isInteger(birthDay) || birthDay < 1 || birthDay > 31) {
      errors.birthDay = t('bazi.errors.dayInvalid');
    }
    if (!Number.isInteger(birthHour) || birthHour < 0 || birthHour > 23) {
      errors.birthHour = t('bazi.errors.hourInvalid');
    }
    if (!errors.birthYear && !errors.birthMonth && !errors.birthDay) {
      if (!isValidCalendarDate(birthYear, birthMonth, birthDay)) {
        errors.birthDay = t('bazi.errors.dateInvalid');
      }
    }
    if (!gender) {
      errors.gender = t('bazi.errors.genderRequired');
    }
    if (isWhitespaceOnly(draft?.birthLocation)) {
      errors.birthLocation = t('bazi.errors.locationWhitespace');
    }
    if (isWhitespaceOnly(draft?.timezone)) {
      errors.timezone = t('bazi.errors.timezoneWhitespace');
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
        const message = await readErrorMessage(res, t('history.loadError'));
        showStatus({ type: 'error', message });
        return;
      }
      const data = await res.json();
      if (recordsRequestIdRef.current !== requestId || controller.signal.aborted) {
        return;
      }
      const rawRecords = Array.isArray(data.records) ? data.records : [];
      const normalizedGenderFilter = genderFilter === 'male' || genderFilter === 'female' ? genderFilter : null;
      const nextRecords = normalizedGenderFilter
        ? rawRecords.filter((record) => normalizeText(record?.gender).toLowerCase() === normalizedGenderFilter)
        : rawRecords;
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
        showStatus({ type: 'error', message: t('history.loadError') });
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
        const message = await readErrorMessage(res, t('history.tarotLoadError'));
        throw new Error(message);
      }
      const data = await res.json();
      setTarotHistory(Array.isArray(data.records) ? data.records : []);
    } catch (error) {
      const isFetchFailure = error instanceof TypeError && /failed to fetch/i.test(error.message || '');
      if (!isFetchFailure) {
        console.error(error);
      }
      setTarotHistoryError(error.message || t('history.tarotLoadError'));
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
        const message = await readErrorMessage(res, t('history.deletedLoadError'));
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
        showStatus({ type: 'success', message: t('history.alreadyDeleted') });
        return;
      }
      if (!res.ok) {
        const message = await readErrorMessage(res, t('history.deleteRestoredError'));
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
      showStatus({ type: 'success', message: t('history.recordDeleted') });
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
        showStatus({ type: 'error', message: t('history.restoreUnavailable') });
        return;
      }
      if (!res.ok) {
        const message = await readErrorMessage(res, t('history.restoreError'));
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
      showStatus({ type: 'success', message: t('history.recordRestored') });
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
        showStatus({ type: 'success', message: t('history.alreadyRemoved') });
        return;
      }
      if (!res.ok) {
        const message = await readErrorMessage(res, t('history.deletePermanentError'));
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
      showStatus({ type: 'success', message: t('history.recordHardDeleted') });
      await Promise.all([loadRecords({ page }), loadDeletedRecords()]);
    } finally {
      deletingIdsRef.current.delete(recordId);
    }
  };

  const handleExport = async () => {
    if (!records.length) {
      showStatus({ type: 'error', message: t('history.noRecordsToExport') });
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
        const message = await readErrorMessage(res, t('history.exportError'));
        throw new Error(message);
      }
      const data = await res.json();
      const exportedRecords = Array.isArray(data) ? data : data?.records;
      if (!Array.isArray(exportedRecords) || exportedRecords.length === 0) {
        showStatus({ type: 'error', message: t('history.exportNoMatches') });
        return;
      }
      const payload = JSON.stringify(data, null, 2);
      const blob = new Blob([payload], { type: 'application/json' });
      downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = `bazi-history-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      showStatus({ type: 'success', message: t('history.exportSuccess') });
    } catch (error) {
      const isFetchFailure = error instanceof TypeError && /failed to fetch/i.test(error.message || '');
      if (!isFetchFailure) {
        console.error(error);
      }
      showStatus({ type: 'error', message: error.message || t('history.exportError') });
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
        const message = await readErrorMessage(res, t('history.exportError'));
        throw new Error(message);
      }
      const data = await res.json();
      const exportedRecords = Array.isArray(data) ? data : data?.records;
      if (!Array.isArray(exportedRecords) || exportedRecords.length === 0) {
        showStatus({ type: 'error', message: t('history.noRecordsToExport') });
        return;
      }
      const payload = JSON.stringify(data, null, 2);
      const blob = new Blob([payload], { type: 'application/json' });
      downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = `bazi-history-full-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      showStatus({ type: 'success', message: t('history.exportAllSuccess') });
    } catch (error) {
      const isFetchFailure = error instanceof TypeError && /failed to fetch/i.test(error.message || '');
      if (!isFetchFailure) {
        console.error(error);
      }
      showStatus({ type: 'error', message: error.message || t('history.exportError') });
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
        throw new Error(t('history.importNoRecords'));
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
        const message = await readErrorMessage(res, t('history.importError'));
        throw new Error(message);
      }
      const data = await res.json();
      showStatus({
        type: 'success',
        message: t('history.importSuccess', { count: data.created ?? 0 }),
      });
      await Promise.all([loadRecords({ page: 1 }), loadDeletedRecords()]);
    } catch (error) {
      const isFetchFailure = error instanceof TypeError && /failed to fetch/i.test(error.message || '');
      if (!isFetchFailure) {
        console.error(error);
      }
      showStatus({ type: 'error', message: error.message || t('history.importError') });
    } finally {
      setIsImporting(false);
      event.target.value = '';
    }
  };

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const filteredRecords = useMemo(
    () => {
      const normalizedGenderFilter = genderFilter === 'male' || genderFilter === 'female' ? genderFilter : null;
      const nextRecords = normalizedGenderFilter
        ? records.filter((record) => normalizeText(record?.gender).toLowerCase() === normalizedGenderFilter)
        : records;
      return sortRecordsForDisplay(nextRecords, sortOption);
    },
    [records, sortOption, genderFilter],
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
      setEditStatus(t('history.fixFields'));
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
        const message = await readErrorMessage(res, t('history.updateError'));
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
      setEditStatus(t('history.updateError'));
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
        showStatus({ type: 'success', message: t('history.bulkAlreadyDeleted') });
        return;
      }
      setRecords(previousRecords);
      setTotalCount(previousTotalCount);
      setFilteredCount(previousFilteredCount);
      const message = await readErrorMessage(res, t('history.bulkDeleteRestoredError'));
      showStatus({ type: 'error', message });
      return;
    }

    await Promise.all([loadRecords({ page }), loadDeletedRecords()]);
    showStatus({
      type: 'success',
      message: t('history.bulkDeleted', { count: idsToDelete.length }),
    });
  };

  const requestDelete = (record) => {
    setConfirmState({
      type: 'single',
      record,
      title: t('history.deleteConfirmTitle'),
      description: t('history.deleteConfirmDesc'),
      confirmLabel: t('common.delete'),
    });
  };

  const requestHardDelete = (record) => {
    setConfirmState({
      type: 'hard',
      record,
      title: t('history.hardDeleteConfirmTitle'),
      description: t('history.hardDeleteConfirmDesc'),
      confirmLabel: t('history.deletePermanently'),
    });
  };

  const requestBulkDelete = () => {
    if (!selectedIds.length) return;
    setConfirmState({
      type: 'bulk',
      ids: [...selectedIds],
      title: t('history.bulkDeleteTitle', { count: selectedIds.length }),
      description: t('history.bulkDeleteDesc'),
      confirmLabel: t('history.deleteSelected'),
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

  const handleQueryChange = (value) => {
    setQuery(value);
    scheduleQueryDebounce(value);
  };

  const handleGenderChange = (value) => {
    setGenderFilter(value);
    setSortOption(DEFAULT_FILTERS.sortOption);
  };

  const handleRangeChange = (value) => {
    setRangeFilter(value);
    setSortOption(DEFAULT_FILTERS.sortOption);
  };

  const handleSortChange = (value) => {
    setSortOption(value);
  };

  const clearSelected = () => {
    setSelectedIds([]);
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

  return {
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
  };
}
