import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseSearchTerms, recordMatchesQuery, buildSearchOr } from '../utils/search.js';

describe('parseSearchTerms', () => {
  it('splits by spaces when no quotes are present', () => {
    assert.deepEqual(parseSearchTerms('alpha beta gamma'), ['alpha', 'beta', 'gamma']);
  });

  it('preserves quoted phrases and trims surrounding quotes', () => {
    const input = 'alpha "New York" \'Los Angeles\'';
    assert.deepEqual(parseSearchTerms(input), ['alpha', 'New York', 'Los Angeles']);
  });

  it('ignores empty or whitespace-only tokens', () => {
    assert.deepEqual(parseSearchTerms('  ""   \'   \'   '), []);
  });
});

describe('recordMatchesQuery', () => {
  const record = {
    birthLocation: 'New York City',
    timezone: 'America/New_York',
    gender: 'Female',
    pillars: 'Jia Zi',
  };

  it('returns true for an empty query', () => {
    assert.equal(recordMatchesQuery(record, ''), true);
  });

  it('matches case-insensitively across searchable fields', () => {
    assert.equal(recordMatchesQuery(record, 'new york'), true);
    assert.equal(recordMatchesQuery(record, 'america/'), true);
    assert.equal(recordMatchesQuery(record, 'female'), true);
    assert.equal(recordMatchesQuery(record, 'jia'), true);
  });

  it('returns false when no fields include the query', () => {
    assert.equal(recordMatchesQuery(record, 'tokyo'), false);
  });

  it('handles missing record fields safely', () => {
    assert.equal(recordMatchesQuery({ birthLocation: null }, 'new'), false);
  });
});

describe('buildSearchOr', () => {
  it('builds a prisma OR filter for search terms', () => {
    assert.deepEqual(buildSearchOr('alpha'), [
      { birthLocation: { contains: 'alpha' } },
      { timezone: { contains: 'alpha' } },
      { gender: { contains: 'alpha' } },
      { pillars: { contains: 'alpha' } },
    ]);
  });
});
