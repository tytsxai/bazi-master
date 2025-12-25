import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

const SEARCH_DEBOUNCE_MS = 350;
const PAGE_SIZE = 100;
const DEFAULT_FILTERS = {
  query: '',
  genderFilter: 'all',
  rangeFilter: 'all',
  sortOption: 'created-desc',
};
const FILTER_STORAGE_KEY = 'bazi_history_filters_v1';

export default function History() {
  const { t } = useTranslation();
  const { token } = useAuth();
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
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [filteredCount, setFilteredCount] = useState(0);
  const [selectedIds, setSelectedIds] = useState([]);
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
  const filterKey = useMemo(
    () => [debouncedQuery.trim(), genderFilter, rangeFilter, sortOption].join('|'),
    [debouncedQuery, genderFilter, rangeFilter, sortOption],
  );
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

  const buildFilterParams = ({ page: targetPage } = {}) => {
    const params = new URLSearchParams();
    const trimmedQuery = debouncedQuery.trim();
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
    const params = buildFilterParams({ page: targetPage });
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
    params.set('pageSize', String(PAGE_SIZE));

    try {
      const res = await fetch(`/api/bazi/records?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (!res.ok) {
        showStatus({ type: 'error', message: 'Unable to load history.' });
        return;
      }
      const data = await res.json();
      if (recordsRequestIdRef.current !== requestId || controller.signal.aborted) {
        return;
      }
      const nextRecords = data.records || [];
      setRecords(nextRecords);
      setPage(nextPage);
      setTotalCount(typeof data.totalCount === 'number' ? data.totalCount : nextRecords.length);
      setFilteredCount(typeof data.filteredCount === 'number' ? data.filteredCount : nextRecords.length);
    } catch (error) {
      if (error.name !== 'AbortError') {
        showStatus({ type: 'error', message: 'Unable to load history.' });
      }
    }
  };

  const loadDeletedRecords = async () => {
    if (!token) return;
    if (deletedAbortRef.current) deletedAbortRef.current.abort();
    const controller = new AbortController();
    deletedAbortRef.current = controller;
    try {
      const params = new URLSearchParams();
      params.set('status', 'deleted');
      params.set('pageSize', '50');
      const res = await fetch(`/api/bazi/records?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (!res.ok) {
        setDeletedRecords([]);
        return;
      }
      const data = await res.json();
      setDeletedRecords(Array.isArray(data.records) ? data.records : []);
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
    const storedFilters = sessionStorage.getItem(FILTER_STORAGE_KEY);
    if (storedFilters) {
      const params = new URLSearchParams(storedFilters);
      if (params.toString()) {
        hasRestoredFiltersRef.current = true;
        setSearchParams(params, { replace: true });
        return;
      }
    }
    hasRestoredFiltersRef.current = true;
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const currentSearch = searchParams.toString();
    if (currentSearch !== lastSetSearchRef.current) {
      pendingSearchSyncRef.current = currentSearch;
    }
    const searchQuery = searchParams.get('q') || '';
    const nextQuery = searchQuery.trim();
    const nextGender = searchParams.get('gender') || DEFAULT_FILTERS.genderFilter;
    const nextRange = searchParams.get('rangeDays') || DEFAULT_FILTERS.rangeFilter;
    const nextSort = searchParams.get('sort') || DEFAULT_FILTERS.sortOption;
    const nextFilterKey = [nextQuery, nextGender, nextRange, nextSort].join('|');
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
    fetch(`/api/bazi/records/${recordId}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then(async (res) => {
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
    if (filtersKeyRef.current !== filterKey) {
      filtersKeyRef.current = filterKey;
      if (page !== 1) {
        setPage(1);
        return;
      }
    }
    loadRecords({ page });
  }, [filterKey, page, token]);

  useEffect(() => {
    if (!token) return;
    loadDeletedRecords();
  }, [token]);

  useEffect(() => {
    const params = buildFilterParams({ page });
    const nextSearch = params.toString();
    const currentSearch = searchParams.toString();

    if (nextSearch) {
      sessionStorage.setItem(FILTER_STORAGE_KEY, nextSearch);
    } else {
      sessionStorage.removeItem(FILTER_STORAGE_KEY);
    }

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
  }, [page, filterKey, searchParams, setSearchParams, shouldResetPage]);

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
      const res = await fetch(`/api/bazi/records/${record.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 404) {
        await Promise.all([loadRecords({ page }), loadDeletedRecords()]);
        if (deepLinkState.status === 'found' && deepLinkState.id === record.id) {
          setDeepLinkState({ status: 'missing', record: null, id: record.id });
        }
        showStatus({ type: 'success', message: 'Record already deleted.' });
        return;
      }
      if (!res.ok) {
        setRecords((prev) => [record, ...prev]);
        setTotalCount((prev) => clampCount(prev + 1));
        setFilteredCount((prev) => clampCount(prev + 1));
        showStatus({ type: 'error', message: 'Unable to delete record. It has been restored.' });
        return;
      }
      await Promise.all([loadRecords({ page }), loadDeletedRecords()]);
      showStatus({ type: 'success', message: 'Record deleted.' });
    } finally {
      deletingIdsRef.current.delete(record.id);
    }
  };

  const handleRestore = async (recordId) => {
    if (deletingIdsRef.current.has(recordId)) return;
    deletingIdsRef.current.add(recordId);
    clearStatus();
    try {
      const res = await fetch(`/api/bazi/records/${recordId}/restore`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 404) {
        await Promise.all([loadRecords({ page }), loadDeletedRecords()]);
        showStatus({ type: 'error', message: 'Record is no longer available to restore.' });
        return;
      }
      if (!res.ok) {
        showStatus({ type: 'error', message: 'Unable to restore record.' });
        return;
      }
      await Promise.all([loadRecords({ page }), loadDeletedRecords()]);
      showStatus({ type: 'success', message: 'Record restored.' });
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
      const queryString = params.toString();
      const res = await fetch(`/api/bazi/records/export${queryString ? `?${queryString}` : ''}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error('Unable to export history.');
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
      showStatus({ type: 'error', message: 'Unable to export history.' });
    } finally {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      setIsExporting(false);
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
      const res = await fetch('/api/bazi/records/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ records: recordsToImport }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || 'Unable to import history.');
      }
      const data = await res.json();
      showStatus({
        type: 'success',
        message: `Imported ${data.created ?? 0} record${data.created === 1 ? '' : 's'}.`,
      });
      await loadRecords({ page: 1 });
    } catch (error) {
      console.error(error);
      showStatus({ type: 'error', message: 'Unable to import history.' });
    } finally {
      setIsImporting(false);
      event.target.value = '';
    }
  };

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const filteredRecords = records;
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

    const res = await fetch('/api/bazi/records/bulk-delete', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ids: idsToDelete }),
    });

    if (!res.ok) {
      if (res.status === 404) {
        await Promise.all([loadRecords({ page }), loadDeletedRecords()]);
        showStatus({ type: 'success', message: 'Selected records already deleted.' });
        return;
      }
      setRecords(previousRecords);
      setTotalCount(previousTotalCount);
      setFilteredCount(previousFilteredCount);
      showStatus({ type: 'error', message: 'Unable to delete selected records. They have been restored.' });
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
  const totalPages = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE));
  const canGoPrev = page > 1;
  const canGoNext = page < totalPages;

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
            {confirmState.type === 'single' && confirmState.record && (
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
        {!!deletedRecords.length && (
          <div className="mt-6 rounded-2xl border border-amber-300/20 bg-amber-500/10 p-4 text-xs text-amber-100">
            <p className="font-semibold text-amber-100">Deleted records</p>
            <p className="mt-1 text-amber-100/80">Restore any record you removed from history.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {deletedRecords.map((record) => (
                <div
                  key={record.id}
                  data-testid="history-deleted-card"
                  className="flex items-center justify-between rounded-xl border border-amber-200/20 bg-black/20 px-3 py-2"
                >
                  <span className="text-xs">
                    {record.birthYear}-{record.birthMonth}-{record.birthDay} · {record.birthHour}:00 · {record.birthLocation || '—'}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRestore(record.id)}
                    className="rounded-full border border-amber-200/40 px-3 py-1 text-[0.7rem] uppercase tracking-[0.18em] text-amber-100 transition hover:border-amber-200 hover:text-white"
                  >
                    Restore
                  </button>
                </div>
              ))}
            </div>
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
                className="rounded-2xl border border-white/10 bg-white/5 p-4"
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
                  <button
                    type="button"
                    onClick={() => requestDelete(record)}
                    className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/70 transition hover:border-rose-400/60 hover:text-rose-200"
                  >
                    Delete
                  </button>
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
    </main>
  );
}
