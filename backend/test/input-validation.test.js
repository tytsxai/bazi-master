import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBaziInput } from '../utils/validation.js';

test('validateBaziInput accepts valid payload and trims fields', () => {
  const raw = {
    birthYear: '1990',
    birthMonth: '5',
    birthDay: '10',
    birthHour: '13',
    gender: ' Female ',
    birthLocation: ' NYC ',
    timezone: ' America/New_York ',
    extra: 'keep-me'
  };

  const result = validateBaziInput(raw);

  assert.equal(result.ok, true);
  assert.equal(result.reason, undefined);
  assert.equal(result.payload.birthYear, 1990);
  assert.equal(result.payload.birthMonth, 5);
  assert.equal(result.payload.birthDay, 10);
  assert.equal(result.payload.birthHour, 13);
  assert.equal(result.payload.gender, 'Female');
  assert.equal(result.payload.birthLocation, 'NYC');
  assert.equal(result.payload.timezone, 'America/New_York');
  assert.equal(result.payload.extra, 'keep-me');
});

test('validateBaziInput rejects whitespace-only fields with whitespace reason', () => {
  const raw = {
    birthYear: 1990,
    birthMonth: 5,
    birthDay: 10,
    birthHour: 13,
    gender: '   ',
    birthLocation: 'NYC',
    timezone: 'UTC'
  };

  const result = validateBaziInput(raw);

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'whitespace');
  assert.equal(result.payload, null);
});

test('validateBaziInput rejects impossible calendar dates', () => {
  const raw = {
    birthYear: 2020,
    birthMonth: 2,
    birthDay: 30,
    birthHour: 12,
    gender: 'male',
    birthLocation: 'NYC',
    timezone: 'UTC'
  };

  const result = validateBaziInput(raw);

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'invalid');
  assert.equal(result.payload, null);
});

test('validateBaziInput rejects out-of-range hours', () => {
  const raw = {
    birthYear: 1995,
    birthMonth: 6,
    birthDay: 12,
    birthHour: 24,
    gender: 'female',
    birthLocation: 'NYC',
    timezone: 'UTC'
  };

  const result = validateBaziInput(raw);

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'invalid');
  assert.equal(result.payload, null);
});
