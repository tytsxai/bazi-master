import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  formatTimezoneOffset,
  parseTimezoneOffsetMinutes,
  getOffsetMinutesFromTimeZone,
  buildBirthTimeMeta,
} from '../timezone.js';

describe('timezone helpers', () => {
  test('parseTimezoneOffsetMinutes handles common formats', () => {
    assert.equal(parseTimezoneOffsetMinutes('UTC'), 0);
    assert.equal(parseTimezoneOffsetMinutes('GMT-05:30'), -330);
    assert.equal(parseTimezoneOffsetMinutes('+08'), 480);
    assert.equal(parseTimezoneOffsetMinutes(' UTC +09:00 '), 540);
    assert.equal(parseTimezoneOffsetMinutes('Z'), 0);
    assert.equal(parseTimezoneOffsetMinutes(''), null);
    assert.equal(parseTimezoneOffsetMinutes('UTC+15'), null);
    assert.equal(parseTimezoneOffsetMinutes('GMT+12:75'), null);
  });

  test('formatTimezoneOffset renders offsets consistently', () => {
    assert.equal(formatTimezoneOffset(330), 'UTC+05:30');
    assert.equal(formatTimezoneOffset(-90), 'UTC-01:30');
    assert.equal(formatTimezoneOffset(NaN), 'UTC');
  });

  test('getOffsetMinutesFromTimeZone resolves UTC offset', () => {
    const date = new Date(Date.UTC(2024, 0, 1, 12, 0, 0));
    assert.equal(getOffsetMinutesFromTimeZone('UTC', date), 0);
    assert.equal(getOffsetMinutesFromTimeZone('America/Los_Angeles', date), -480);
  });

  test('buildBirthTimeMeta prefers payload offsets and computes timestamps', () => {
    const meta = buildBirthTimeMeta({
      birthYear: 2000,
      birthMonth: 1,
      birthDay: 1,
      birthHour: 12,
      birthMinute: 0,
      timezoneOffsetMinutes: 120,
      timezone: 'America/New_York',
    });
    const expectedTimestamp = Date.UTC(2000, 0, 1, 12, 0, 0) - 120 * 60 * 1000;
    assert.equal(meta.timezoneOffsetMinutes, 120);
    assert.equal(meta.birthTimestamp, expectedTimestamp);
    assert.equal(meta.birthIso, new Date(expectedTimestamp).toISOString());
  });

  test('buildBirthTimeMeta falls back to timezone label offsets', () => {
    const meta = buildBirthTimeMeta({
      birthYear: 2000,
      birthMonth: 1,
      birthDay: 1,
      birthHour: 12,
      birthMinute: 0,
      timezone: 'UTC+02:00',
    });
    const expectedTimestamp = Date.UTC(2000, 0, 1, 12, 0, 0) - 120 * 60 * 1000;
    assert.equal(meta.timezoneOffsetMinutes, 120);
    assert.equal(meta.birthIso, new Date(expectedTimestamp).toISOString());
  });

  test('buildBirthTimeMeta resolves IANA zones when no offset is provided', () => {
    const meta = buildBirthTimeMeta({
      birthYear: 2000,
      birthMonth: 1,
      birthDay: 1,
      birthHour: 12,
      birthMinute: 0,
      timezone: 'America/New_York',
    });
    const expectedTimestamp = Date.UTC(2000, 0, 1, 17, 0, 0);
    assert.equal(meta.timezoneOffsetMinutes, -300);
    assert.equal(meta.birthIso, new Date(expectedTimestamp).toISOString());
  });

  test('buildBirthTimeMeta returns nulls when date parts are invalid', () => {
    const meta = buildBirthTimeMeta({
      birthYear: 'abc',
      birthMonth: 1,
      birthDay: 1,
      birthHour: 12,
      birthMinute: 0,
      timezone: 'UTC',
    });
    assert.equal(meta.timezoneOffsetMinutes, null);
    assert.equal(meta.birthTimestamp, null);
    assert.equal(meta.birthIso, null);
  });
});
