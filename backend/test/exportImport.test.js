import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildImportRecord,
  parseRecordsQuery,
  parseSearchTerms,
  buildSearchOr,
  recordMatchesQuery,
} from '../server.js';

test('parseSearchTerms handles quotes and whitespace', () => {
  const terms = parseSearchTerms('foo "bar baz"   \'zip zop\'');
  assert.deepEqual(terms, ['foo', 'bar baz', 'zip zop']);
});

test('parseRecordsQuery normalizes paging, filters, and ranges', () => {
  const result = parseRecordsQuery({
    page: '2',
    pageSize: '600',
    q: '  hello ',
    gender: 'Female',
    rangeDays: 'week',
    sort: 'birth-asc',
    status: 'deleted',
    timezoneOffsetMinutes: 'UTC-05:00',
  });

  assert.equal(result.safePage, 2);
  assert.equal(result.safePageSize, 500);
  assert.equal(result.normalizedQuery, 'hello');
  assert.equal(result.validGender, 'female');
  assert.equal(result.rangeType, 'week');
  assert.equal(result.validRangeDays, null);
  assert.equal(result.sortOption, 'birth-asc');
  assert.equal(result.normalizedStatus, 'deleted');
  assert.equal(result.timezoneOffsetMinutes, -300);
});

test('recordMatchesQuery checks searchable fields', () => {
  const record = {
    birthLocation: 'New York',
    timezone: 'UTC-05:00',
    gender: 'female',
    pillars: '{"year":"foo"}',
  };

  assert.equal(recordMatchesQuery(record, 'new'), true);
  assert.equal(recordMatchesQuery(record, 'utc-05'), true);
  assert.equal(recordMatchesQuery(record, 'tokyo'), false);
});

test('buildSearchOr creates Prisma conditions', () => {
  const clauses = buildSearchOr('abc');
  assert.equal(clauses.length, 4);
  assert.deepEqual(clauses[0], { birthLocation: { contains: 'abc' } });
  assert.deepEqual(clauses[3], { pillars: { contains: 'abc' } });
});

test('buildImportRecord builds a normalized record with fallback timezone', async () => {
  const record = await buildImportRecord({
    birthYear: '1992',
    birthMonth: '7',
    birthDay: '15',
    birthHour: '4',
    gender: 'male',
    birthLocation: 'Taipei',
    timezoneOffsetMinutes: 'UTC+08:00',
    pillars: { year: { stem: 'A' } },
    fiveElements: { Wood: 2, Fire: 1, Earth: 1, Metal: 2, Water: 2 },
    tenGods: [{ name: 'Friend', strength: 10 }],
    luckCycles: [{ range: '10-20' }],
    createdAt: '2024-01-01T00:00:00.000Z',
  }, 42);

  assert.ok(record);
  assert.equal(record.userId, 42);
  assert.equal(record.birthYear, 1992);
  assert.equal(record.birthMonth, 7);
  assert.equal(record.birthDay, 15);
  assert.equal(record.birthHour, 4);
  assert.equal(record.gender, 'male');
  assert.equal(record.birthLocation, 'Taipei');
  assert.equal(record.timezone, 'UTC+08:00');
  assert.equal(record.pillars, JSON.stringify({ year: { stem: 'A' } }));
  assert.equal(record.fiveElements, JSON.stringify({ Wood: 2, Fire: 1, Earth: 1, Metal: 2, Water: 2 }));
  assert.equal(record.tenGods, JSON.stringify([{ name: 'Friend', strength: 10 }]));
  assert.equal(record.luckCycles, JSON.stringify([{ range: '10-20' }]));
  assert.ok(record.createdAt instanceof Date);
});

test('buildImportRecord rejects invalid payloads', async () => {
  const invalid = await buildImportRecord({ birthYear: 'nope' }, 1);
  assert.equal(invalid, null);
});
