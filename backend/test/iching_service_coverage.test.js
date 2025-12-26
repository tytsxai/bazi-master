import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeNumber,
  pickTrigram,
  buildHexagram,
  applyChangingLines,
  deriveChangingLinesFromNumbers,
  deriveChangingLinesFromTimeContext,
  getDetailedLines,
} from '../services/iching.service.js';

describe('iching.service coverage', () => {
  it('normalizeNumber and pickTrigram handle invalid and modulo cases', () => {
    assert.equal(normalizeNumber('x', 8), null);
    assert.equal(normalizeNumber(-8, 8), 8);
    assert.equal(normalizeNumber(9, 8), 1);

    assert.equal(pickTrigram('x'), null);
    const trigram = pickTrigram(1);
    assert.equal(trigram.id, 1);
  });

  it('buildHexagram returns null on missing inputs and a hexagram when present', () => {
    assert.equal(buildHexagram(null, null), null);
    const upper = pickTrigram(1);
    const lower = pickTrigram(2);
    const hex = buildHexagram(upper, lower);
    assert.ok(hex);
    assert.equal(hex.upperTrigram.id, 1);
    assert.equal(hex.lowerTrigram.id, 2);
  });

  it('applyChangingLines toggles specified lines', () => {
    const base = buildHexagram(pickTrigram(1), pickTrigram(1));
    const next = applyChangingLines(base, [1, 6]);
    assert.ok(next);
    assert.notDeepEqual(next.lines, base.lines);
    assert.equal(next.lines[0], base.lines[0] ? 0 : 1);
    assert.equal(next.lines[5], base.lines[5] ? 0 : 1);
  });

  it('deriveChangingLinesFromNumbers handles invalid and valid inputs', () => {
    assert.deepEqual(deriveChangingLinesFromNumbers(null), []);
    assert.deepEqual(deriveChangingLinesFromNumbers([1, 2]), []);
    assert.deepEqual(deriveChangingLinesFromNumbers(['a', 'b', 'c']), []);
    assert.deepEqual(deriveChangingLinesFromNumbers([1, 2, 3]), [6]);
  });

  it('deriveChangingLinesFromTimeContext validates and returns sorted unique lines', () => {
    assert.deepEqual(deriveChangingLinesFromTimeContext(null), []);
    assert.deepEqual(deriveChangingLinesFromTimeContext('x'), []);
    assert.deepEqual(deriveChangingLinesFromTimeContext({ year: 'x' }), []);

    const lines = deriveChangingLinesFromTimeContext({ year: 1, month: 1, day: 1, hour: 0, minute: 0 });
    assert.deepEqual(lines, [3, 6]);

    const deduped = deriveChangingLinesFromTimeContext({ year: 1, month: 1, day: 4, hour: 0, minute: 0 });
    // first and second both normalize to 6
    assert.deepEqual(deduped, [6]);
  });

  it('getDetailedLines returns statuses and changing flags', () => {
    const hex = buildHexagram(pickTrigram(1), pickTrigram(1));
    const detailed = getDetailedLines(hex, [1, 2]);
    assert.equal(detailed.length, 6);
    assert.equal(detailed[0].isChanging, true);
    assert.equal(detailed[1].isChanging, true);
    assert.equal(typeof detailed[0].status, 'string');
  });
});
