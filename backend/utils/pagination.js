const normalizePageNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 1;
};

const normalizePageSize = (value, { defaultPageSize = 100, maxPageSize = 500 } = {}) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultPageSize;
  return Math.min(Math.trunc(parsed), maxPageSize);
};

const getPagination = (page, pageSize, options) => {
  const safePage = normalizePageNumber(page);
  const safePageSize = normalizePageSize(pageSize, options);
  const skip = (safePage - 1) * safePageSize;
  const take = safePageSize + 1;
  return {
    safePage,
    safePageSize,
    skip,
    take,
  };
};

const paginateArray = (items, page, pageSize, options) => {
  const { safePage, safePageSize, skip, take } = getPagination(page, pageSize, options);
  const pageSlice = items.slice(skip, skip + take);
  const hasMore = pageSlice.length > safePageSize;
  const pageItems = hasMore ? pageSlice.slice(0, safePageSize) : pageSlice;
  return {
    pageItems,
    hasMore,
    safePage,
    safePageSize,
    skip,
  };
};

const slicePage = (items, pageSize) => {
  const safePageSize = normalizePageSize(pageSize);
  const hasMore = items.length > safePageSize;
  const pageItems = hasMore ? items.slice(0, safePageSize) : items;
  return { pageItems, hasMore, safePageSize };
};

export { normalizePageNumber, normalizePageSize, getPagination, paginateArray, slicePage };
