// API utility functions for Bazi calculations

const safeJsonParse = (value) => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

export const computeFiveElementsPercent = (fiveElements) => {
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

export const normalizeBaziApiResponse = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  const root =
    payload.calculation && typeof payload.calculation === 'object'
      ? payload.calculation
      :
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
