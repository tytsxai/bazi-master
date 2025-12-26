import { getBaziCacheConfig } from '../config/app.js';

const ELEMENTS = ['Wood', 'Fire', 'Earth', 'Metal', 'Water'];
const {
  ttlMs: BAZI_CACHE_TTL_MS,
  maxEntries: BAZI_CACHE_MAX_ENTRIES,
} = getBaziCacheConfig();
const baziCalculationCache = new Map();
let cacheMirror = null;

export const setBaziCacheMirror = (mirror) => {
  cacheMirror = mirror;
};

export const hasBaziCacheMirror = () => Boolean(cacheMirror);

const coerceInt = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim().length === 0) return null;
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return null;
  return Math.trunc(numberValue);
};

export const buildBaziCacheKey = (data) => {
  if (!data) return null;
  const birthYear = coerceInt(data.birthYear);
  const birthMonth = coerceInt(data.birthMonth);
  const birthDay = coerceInt(data.birthDay);
  const birthHour = coerceInt(data.birthHour);
  const gender =
    typeof data.gender === 'string' ? data.gender.trim().toLowerCase() : null;

  if (
    birthYear === null
    || birthMonth === null
    || birthDay === null
    || birthHour === null
    || !gender
  ) {
    return null;
  }

  return `${birthYear}-${birthMonth}-${birthDay}-${birthHour}-${gender}`;
};

export const buildFiveElementsPercent = (fiveElements) => {
  if (!fiveElements || typeof fiveElements !== 'object') return null;
  const total = Object.values(fiveElements).reduce((sum, value) => {
    const next = Number(value);
    return sum + (Number.isFinite(next) ? next : 0);
  }, 0);

  return ELEMENTS.reduce((acc, element) => {
    const raw = Number(fiveElements[element]);
    const safe = Number.isFinite(raw) ? raw : 0;
    acc[element] = total ? Math.round((safe / total) * 100) : 0;
    return acc;
  }, {});
};

export const normalizeBaziResult = (result) => {
  if (!result || typeof result !== 'object') return result;
  if (result.fiveElementsPercent || !result.fiveElements) return result;
  const fiveElementsPercent = buildFiveElementsPercent(result.fiveElements);
  if (!fiveElementsPercent) return result;
  return { ...result, fiveElementsPercent };
};

const isValidBaziCacheValue = (value) => {
  if (!value || typeof value !== 'object') return false;
  if (!value.pillars || typeof value.pillars !== 'object') return false;
  if (!value.fiveElements || typeof value.fiveElements !== 'object') return false;
  return true;
};

const pruneBaziCache = () => {
  if (!Number.isFinite(BAZI_CACHE_MAX_ENTRIES) || BAZI_CACHE_MAX_ENTRIES <= 0) {
    return;
  }
  while (baziCalculationCache.size > BAZI_CACHE_MAX_ENTRIES) {
    const oldestKey = baziCalculationCache.keys().next().value;
    if (!oldestKey) break;
    baziCalculationCache.delete(oldestKey);
    if (cacheMirror?.delete) {
      cacheMirror.delete(oldestKey);
    }
  }
};

const setLocalEntry = (key, value) => {
  const normalized = normalizeBaziResult(value);
  const expiresAt = Number.isFinite(BAZI_CACHE_TTL_MS) && BAZI_CACHE_TTL_MS > 0
    ? Date.now() + BAZI_CACHE_TTL_MS
    : null;
  if (baziCalculationCache.has(key)) {
    baziCalculationCache.delete(key);
  }
  baziCalculationCache.set(key, { value: normalized, expiresAt });
  pruneBaziCache();
};

export const getCachedBaziCalculation = (key) => {
  if (!key) return null;
  const entry = baziCalculationCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt && entry.expiresAt <= Date.now()) {
    baziCalculationCache.delete(key);
    return null;
  }
  // Refresh LRU position
  baziCalculationCache.delete(key);
  baziCalculationCache.set(key, entry);
  return entry.value;
};

export const getCachedBaziCalculationAsync = async (key) => {
  const cached = getCachedBaziCalculation(key);
  if (cached) return cached;
  if (!key || !cacheMirror?.get) return null;
  const remote = await cacheMirror.get(key);
  if (!remote) return null;
  const normalized = normalizeBaziResult(remote);
  if (!isValidBaziCacheValue(normalized)) {
    if (cacheMirror?.delete) {
      cacheMirror.delete(key);
    }
    return null;
  }
  setLocalEntry(key, normalized);
  return normalized;
};

export const setBaziCacheEntry = (key, value) => {
  if (!key) return;
  setLocalEntry(key, value);
  if (cacheMirror?.set) {
    cacheMirror.set(key, normalizeBaziResult(value), BAZI_CACHE_TTL_MS);
  }
};

export const primeBaziCalculationCache = (data, result) => {
  const key = buildBaziCacheKey(data);
  if (!key || !result) return;
  setBaziCacheEntry(key, result);
};

export const invalidateBaziCalculationCache = (data) => {
  const key = typeof data === 'string' ? data : buildBaziCacheKey(data);
  if (!key) return;
  baziCalculationCache.delete(key);
  if (cacheMirror?.delete) {
    cacheMirror.delete(key);
  }
};

export const clearBaziCalculationCache = () => {
  baziCalculationCache.clear();
  if (cacheMirror?.clear) {
    cacheMirror.clear();
  }
};
