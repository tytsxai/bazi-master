import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  isUrlTooLong,
  parseIdParam,
  sanitizeQueryParam,
  sanitizeNextPath,
  isLocalUrl,
  isWhitespaceOnly,
  isValidCalendarDate,
  validateBaziInput,
} from '../utils/validation.js';

describe('validation utils coverage', () => {
  it('isUrlTooLong uses MAX_URL_LENGTH and url fallbacks', () => {
    const prev = process.env.MAX_URL_LENGTH;
    try {
      process.env.MAX_URL_LENGTH = '3';
      assert.equal(isUrlTooLong({ originalUrl: '/abcd' }), true);
      assert.equal(isUrlTooLong({ url: '/ab' }), false);
      assert.equal(isUrlTooLong({}), false);
    } finally {
      if (prev === undefined) delete process.env.MAX_URL_LENGTH;
      else process.env.MAX_URL_LENGTH = prev;
    }
  });

  it('parseIdParam parses positive integers only', () => {
    assert.equal(parseIdParam(null), null);
    assert.equal(parseIdParam('0'), null);
    assert.equal(parseIdParam('-1'), null);
    assert.equal(parseIdParam('abc'), null);
    assert.equal(parseIdParam('12'), 12);
  });

  it('sanitizeQueryParam trims strings', () => {
    assert.equal(sanitizeQueryParam(null), '');
    assert.equal(sanitizeQueryParam('  hi  '), 'hi');
  });

  it('sanitizeNextPath enforces local paths', () => {
    assert.equal(sanitizeNextPath(null), '/profile');
    assert.equal(sanitizeNextPath(''), '/profile');
    assert.equal(sanitizeNextPath('  '), '/profile');
    assert.equal(sanitizeNextPath('nope'), '/profile');
    assert.equal(sanitizeNextPath('http://evil.com'), '/profile');
    assert.equal(sanitizeNextPath('/safe'), '/safe');
  });

  it('isLocalUrl detects localhost and handles invalid urls', () => {
    assert.equal(isLocalUrl(null), false);
    assert.equal(isLocalUrl('not a url'), false);
    assert.equal(isLocalUrl('http://localhost:3000'), true);
    assert.equal(isLocalUrl('http://127.0.0.1:3000'), true);
    assert.equal(isLocalUrl('http://127.0.0.9:3000'), true);
    assert.equal(isLocalUrl('https://example.com'), false);
  });

  it('isWhitespaceOnly works', () => {
    assert.equal(isWhitespaceOnly(''), false);
    assert.equal(isWhitespaceOnly('   '), true);
    assert.equal(isWhitespaceOnly(' a '), false);
  });

  it('isValidCalendarDate validates bounds and actual dates', () => {
    assert.equal(isValidCalendarDate('2024', 1, 1), false);
    assert.equal(isValidCalendarDate(2024, 0, 1), false);
    assert.equal(isValidCalendarDate(2024, 13, 1), false);
    assert.equal(isValidCalendarDate(2024, 1, 0), false);
    assert.equal(isValidCalendarDate(2024, 1, 32), false);
    assert.equal(isValidCalendarDate(2024, 2, 29), true);
    assert.equal(isValidCalendarDate(2023, 2, 29), false);
  });

  it('validateBaziInput returns whitespace/invalid/ok as expected', () => {
    assert.deepEqual(validateBaziInput({ gender: '   ' }), {
      ok: false,
      payload: null,
      reason: 'whitespace',
    });
    assert.deepEqual(validateBaziInput({ timezone: '   ' }), {
      ok: false,
      payload: null,
      reason: 'whitespace',
    });

    assert.equal(
      validateBaziInput({
        birthYear: 2024,
        birthMonth: 2,
        birthDay: 31,
        birthHour: 10,
        gender: 'm',
      }).ok,
      false
    );

    const ok = validateBaziInput({
      birthYear: '2024',
      birthMonth: '2',
      birthDay: '29',
      birthHour: '10',
      gender: ' m ',
      birthLocation: '  shanghai  ',
      timezone: '  Asia/Shanghai  ',
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.payload.gender, 'm');
    assert.equal(ok.payload.birthLocation, 'shanghai');
    assert.equal(ok.payload.timezone, 'Asia/Shanghai');
    assert.equal(ok.payload.birthYear, 2024);
    assert.equal(ok.payload.birthHour, 10);
  });
});
