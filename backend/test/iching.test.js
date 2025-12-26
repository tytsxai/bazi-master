import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeNumber,
  pickTrigram,
  buildHexagram,
  applyChangingLines,
  deriveChangingLinesFromNumbers,
  deriveChangingLinesFromTimeContext,
} from '../services/iching.service.js';

test('normalizeNumber returns modulo for multiples and null for invalid', () => {
  assert.equal(normalizeNumber(8, 8), 8);
  assert.equal(normalizeNumber(0, 8), 8);
  assert.equal(normalizeNumber(-9, 8), 1);
  assert.equal(normalizeNumber('16', 8), 8);
  assert.equal(normalizeNumber('not-a-number', 8), null);
});

test('pickTrigram selects the correct trigram by normalized index', () => {
  assert.equal(pickTrigram(1)?.name, 'Qian');
  assert.equal(pickTrigram(8)?.name, 'Kun');
  assert.equal(pickTrigram(9)?.name, 'Qian');
  assert.equal(pickTrigram(-1)?.name, 'Qian');
  assert.equal(pickTrigram('x'), null);
});

test('buildHexagram constructs a hexagram from two trigrams', () => {
  const upper = pickTrigram(1);
  const lower = pickTrigram(8);
  const hexagram = buildHexagram(upper, lower);
  assert.ok(hexagram);
  assert.equal(hexagram?.upperTrigram?.name, 'Qian');
  assert.equal(hexagram?.lowerTrigram?.name, 'Kun');
  assert.deepEqual(hexagram?.lines, [0, 0, 0, 1, 1, 1]);
});

test('applyChangingLines flips valid line positions and clamps indices', () => {
  const base = buildHexagram(pickTrigram(1), pickTrigram(2));
  assert.ok(base);
  const changed = applyChangingLines(base, [6, 7, 0]);
  assert.deepEqual(base?.lines, [1, 1, 0, 1, 1, 1]);
  assert.deepEqual(changed?.lines, [0, 1, 0, 1, 1, 1]);
});

test('deriveChangingLinesFromNumbers derives a single normalized line', () => {
  assert.deepEqual(deriveChangingLinesFromNumbers([1, 2, 3]), [6]);
  assert.deepEqual(deriveChangingLinesFromNumbers([0, 0, 0]), [6]);
  assert.deepEqual(deriveChangingLinesFromNumbers([1, 2]), []);
});

test('deriveChangingLinesFromTimeContext returns sorted unique lines', () => {
  const timeContext = { year: 2024, month: 12, day: 25, hour: 9, minute: 30 };
  assert.deepEqual(deriveChangingLinesFromTimeContext(timeContext), [3, 6]);
  assert.deepEqual(deriveChangingLinesFromTimeContext(null), []);
});
