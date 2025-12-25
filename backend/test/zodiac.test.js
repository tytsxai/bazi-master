import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ZODIAC_ORDER,
  normalizeAngle,
  degToRad,
  radToDeg,
  calculateRisingSign
} from '../zodiac.js';

test('normalizeAngle wraps degrees into [0, 360)', () => {
  assert.equal(normalizeAngle(-30), 330);
  assert.equal(normalizeAngle(390), 30);
});

test('degToRad and radToDeg are inverse within tolerance', () => {
  const value = 123.45;
  const roundTrip = radToDeg(degToRad(value));
  assert.ok(Math.abs(roundTrip - value) < 1e-10);
});

test('calculateRisingSign returns expected values for a reference case', () => {
  const result = calculateRisingSign({
    birthYear: 1990,
    birthMonth: 1,
    birthDay: 1,
    birthHour: 0,
    birthMinute: 0,
    latitude: 0,
    longitude: 0,
    timezoneOffsetMinutes: 0
  });

  assert.equal(result.signKey, 'libra');
  assert.deepEqual(result.ascendant, {
    longitude: 191.29,
    localSiderealTime: 6.69
  });
});

test('calculateRisingSign outputs a valid sign and ranges', () => {
  const result = calculateRisingSign({
    birthYear: 1990,
    birthMonth: 1,
    birthDay: 1,
    birthHour: 6,
    birthMinute: 30,
    latitude: 40.7128,
    longitude: -74.006,
    timezoneOffsetMinutes: -300
  });

  assert.ok(ZODIAC_ORDER.includes(result.signKey));
  assert.ok(result.ascendant.longitude >= 0);
  assert.ok(result.ascendant.longitude < 360);
  assert.ok(result.ascendant.localSiderealTime >= 0);
  assert.ok(result.ascendant.localSiderealTime < 24);
  assert.deepEqual(result.ascendant, {
    longitude: 267.67,
    localSiderealTime: 13.29
  });
});
