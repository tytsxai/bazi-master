const normalizeSearchValue = (value) => (value == null ? '' : String(value).toLowerCase());

const recordMatchesQuery = (record, queryLower) => {
  if (!queryLower) return true;
  return [record?.birthLocation, record?.timezone, record?.gender, record?.pillars].some((field) =>
    normalizeSearchValue(field).includes(queryLower)
  );
};

const parseSearchTerms = (input) => {
  if (!input) return [];
  const terms = [];
  const regex = /"([^"]+)"|'([^']+)'|(\S+)/g;
  let match = null;
  while ((match = regex.exec(input)) !== null) {
    const rawTerm = (match[1] || match[2] || match[3] || '').trim();
    const cleaned = rawTerm.replace(/^["']+|["']+$/g, '').trim();
    if (cleaned) terms.push(cleaned);
  }
  return terms;
};

const buildSearchOr = (term) => [
  { birthLocation: { contains: term } },
  { timezone: { contains: term } },
  { gender: { contains: term } },
  { pillars: { contains: term } },
];

export { buildSearchOr, parseSearchTerms, recordMatchesQuery };
