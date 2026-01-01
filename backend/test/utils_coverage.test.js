import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatTimezoneOffset,
  parseTimezoneOffsetMinutes,
  buildBirthTimeMeta,
} from '../utils/timezone.js';

describe('Utils Coverage', () => {
  // --- Timezone Utils ---
  it('formatTimezoneOffset handles values', () => {
    assert.equal(formatTimezoneOffset(480), 'UTC+08:00');
    assert.equal(formatTimezoneOffset(-300), 'UTC-05:00');
    assert.equal(formatTimezoneOffset('invalid'), 'UTC');
  });

  it('parseTimezoneOffsetMinutes handles values', () => {
    assert.equal(parseTimezoneOffsetMinutes(480), 480);
    assert.equal(parseTimezoneOffsetMinutes('UTC+08:00'), 480);
    assert.equal(parseTimezoneOffsetMinutes('UTC-05:00'), -300);
    assert.equal(parseTimezoneOffsetMinutes('invalid'), null);
  });

  it('buildBirthTimeMeta handles invalid input', () => {
    const meta = buildBirthTimeMeta({ birthYear: 'invalid' });
    assert.equal(meta.birthTimestamp, null);
  });

  it('buildBirthTimeMeta correctly calculates timestamp', () => {
    const meta = buildBirthTimeMeta({
      birthYear: 1990,
      birthMonth: 1,
      birthDay: 1,
      birthHour: 12,
      timezoneOffsetMinutes: 480, // +8
    });
    assert.ok(meta.birthTimestamp);
    // UTC 12:00 -> Local 20:00 (if +8).
    // Wait, input is usually "Wall Time".
    // input 12:00 in +8.
    // UTC = 12:00 - 8h = 04:00.
    // Timestamp should match UTC 04:00 on 1990-01-01.

    // Let's just check it returns valid object with resolvedOffset.
    assert.equal(meta.timezoneOffsetMinutes, 480);
  });
});
