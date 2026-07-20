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

// mode: 'insensitive' matters on PostgreSQL, where `contains` is case-sensitive by
// default — searching "beijing" would not match a stored "Beijing". The client-side
// recordMatchesQuery below has always been case-insensitive, so without this the two
// search paths disagreed about what matches.
const buildSearchOr = (term) => [
  { birthLocation: { contains: term, mode: 'insensitive' } },
  { timezone: { contains: term, mode: 'insensitive' } },
  { gender: { contains: term, mode: 'insensitive' } },
  { pillars: { contains: term, mode: 'insensitive' } },
];

export { buildSearchOr, parseSearchTerms, recordMatchesQuery };
