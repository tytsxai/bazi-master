import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  normalizeLocationKey,
  resolveLocationCoordinates,
  computeTrueSolarTime,
} from '../solarTime.js';

describe('solar time helpers', () => {
  test('normalizeLocationKey trims and normalizes punctuation', () => {
    assert.equal(normalizeLocationKey(' New York (NYC) '), 'new york');
    assert.equal(normalizeLocationKey('Los-Angeles, CA'), 'los angeles ca');
    assert.equal(normalizeLocationKey(''), '');
  });

  test('resolveLocationCoordinates handles known locations and aliases', () => {
    const nyc = resolveLocationCoordinates('NYC');
    assert.ok(nyc);
    assert.equal(nyc.name, 'New York');
    assert.equal(nyc.source, 'known');
    assert.equal(nyc.latitude, 40.7128);
    assert.equal(nyc.longitude, -74.006);

    const beijing = resolveLocationCoordinates('Beijing China');
    assert.ok(beijing);
    assert.equal(beijing.name, 'Beijing');
  });

  test('resolveLocationCoordinates parses coordinate pairs', () => {
    const coords = resolveLocationCoordinates('40.7128, -74.0060');
    assert.ok(coords);
    assert.equal(coords.source, 'coordinates');
    assert.equal(coords.latitude, 40.7128);
    assert.equal(coords.longitude, -74.006);

    const reversed = resolveLocationCoordinates('120, 35');
    assert.ok(reversed);
    assert.equal(reversed.source, 'coordinates');
    assert.equal(reversed.latitude, 35);
    assert.equal(reversed.longitude, 120);
  });

  test('computeTrueSolarTime applies longitude correction', () => {
    const result = computeTrueSolarTime({
      birthYear: 2000,
      birthMonth: 1,
      birthDay: 1,
      birthHour: 12,
      birthMinute: 0,
      timezoneOffsetMinutes: 0,
      longitude: 30,
    });
    assert.ok(result?.applied);
    assert.equal(result.longitudeCorrection, 120);
    assert.equal(result.eotCorrection, -3.71);
    assert.equal(result.correctionMinutes, 116.29);
    assert.equal(result.corrected.hour, 13);
    assert.equal(result.corrected.minute, 56);
  });

  test('computeTrueSolarTime returns null for invalid inputs', () => {
    assert.equal(
      computeTrueSolarTime({
        birthYear: 2000,
        birthMonth: 1,
        birthDay: 1,
        birthHour: 12,
        timezoneOffsetMinutes: null,
        longitude: 30,
      }),
      null,
    );
    assert.equal(
      computeTrueSolarTime({
        birthYear: 2000,
        birthMonth: 1,
        birthDay: 1,
        birthHour: 12,
        timezoneOffsetMinutes: 0,
        longitude: NaN,
      }),
      null,
    );
  });
});
