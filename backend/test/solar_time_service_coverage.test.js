import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeLocationKey,
  resolveLocationCoordinates,
  computeTrueSolarTime,
  listKnownLocations,
} from '../services/solarTime.service.js';

describe('solarTime.service coverage', () => {
  it('normalizeLocationKey normalizes and strips punctuation', () => {
    assert.equal(normalizeLocationKey(null), '');
    assert.equal(normalizeLocationKey('  New-York (City)!  '), 'new york');
  });

  it('resolveLocationCoordinates handles unknown, coordinates, swapped coordinates, and known matches', () => {
    assert.equal(resolveLocationCoordinates(null), null);
    assert.equal(resolveLocationCoordinates('   '), null);
    assert.equal(resolveLocationCoordinates('Atlantis'), null);

    // Regex matches but out of range both ways => parseCoordinatePair returns null
    assert.equal(resolveLocationCoordinates('200, 200'), null);

    const swapped = resolveLocationCoordinates('120, 30');
    assert.deepEqual(swapped, { latitude: 30, longitude: 120, source: 'coordinates' });

    const known = resolveLocationCoordinates('I live in New York City');
    assert.ok(known);
    assert.equal(known.source, 'known');
    assert.equal(known.name, 'New York');
  });

  it('computeTrueSolarTime returns null on invalid inputs and returns corrected result otherwise', () => {
    assert.equal(computeTrueSolarTime({ timezoneOffsetMinutes: NaN, longitude: 0 }), null);
    assert.equal(computeTrueSolarTime({ timezoneOffsetMinutes: 0, longitude: 0, birthYear: 'x' }), null);

    const out = computeTrueSolarTime({
      birthYear: 2024,
      birthMonth: 1,
      birthDay: 1,
      birthHour: 12,
      birthMinute: 0,
      timezoneOffsetMinutes: 480,
      longitude: 121.4737,
    });
    assert.ok(out);
    assert.equal(out.applied, true);
    assert.ok(out.correctedDate instanceof Date);
  });

  it('listKnownLocations returns sorted unique entries', () => {
    const locations = listKnownLocations();
    const names = locations.map((l) => l.name);
    assert.equal(names.includes('New York'), true);
    assert.equal(names.filter((n) => n === 'New York').length, 1);
    // sorted by name
    const sorted = [...names].sort((a, b) => (a || '').localeCompare(b || ''));
    assert.deepEqual(names, sorted);
  });
});
