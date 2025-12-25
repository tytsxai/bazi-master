import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  normalizePageNumber,
  normalizePageSize,
  getPagination,
  paginateArray,
  slicePage,
} from '../pagination.js';

test('normalizePageNumber defaults invalid inputs to 1', () => {
  assert.equal(normalizePageNumber(undefined), 1);
  assert.equal(normalizePageNumber(null), 1);
  assert.equal(normalizePageNumber(''), 1);
  assert.equal(normalizePageNumber('0'), 1);
  assert.equal(normalizePageNumber(0), 1);
  assert.equal(normalizePageNumber(-3), 1);
  assert.equal(normalizePageNumber(NaN), 1);
});

test('normalizePageNumber truncates valid values', () => {
  assert.equal(normalizePageNumber('2'), 2);
  assert.equal(normalizePageNumber(5.9), 5);
  assert.equal(normalizePageNumber('3.1'), 3);
});

test('normalizePageSize defaults to 100 and caps at 500', () => {
  assert.equal(normalizePageSize(undefined), 100);
  assert.equal(normalizePageSize(null), 100);
  assert.equal(normalizePageSize('0'), 100);
  assert.equal(normalizePageSize(-5), 100);
  assert.equal(normalizePageSize('50'), 50);
  assert.equal(normalizePageSize(501), 500);
  assert.equal(normalizePageSize(1200), 500);
});

test('normalizePageSize respects custom defaults and limits', () => {
  assert.equal(normalizePageSize(undefined, { defaultPageSize: 25 }), 25);
  assert.equal(normalizePageSize(0, { defaultPageSize: 25 }), 25);
  assert.equal(normalizePageSize(200, { defaultPageSize: 25, maxPageSize: 80 }), 80);
  assert.equal(normalizePageSize(79, { defaultPageSize: 25, maxPageSize: 80 }), 79);
});

test('getPagination computes skip/take using normalized values', () => {
  const result = getPagination('2', '20');
  assert.deepEqual(result, {
    safePage: 2,
    safePageSize: 20,
    skip: 20,
    take: 21,
  });
});

test('getPagination handles invalid inputs with defaults', () => {
  const result = getPagination('-1', '0');
  assert.equal(result.safePage, 1);
  assert.equal(result.safePageSize, 100);
  assert.equal(result.skip, 0);
  assert.equal(result.take, 101);
});

test('paginateArray slices the correct page and reports hasMore', () => {
  const items = Array.from({ length: 25 }, (_, i) => i + 1);
  const { pageItems, hasMore, safePage, safePageSize, skip } = paginateArray(items, 2, 10);
  assert.deepEqual(pageItems, [11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  assert.equal(hasMore, true);
  assert.equal(safePage, 2);
  assert.equal(safePageSize, 10);
  assert.equal(skip, 10);
});

test('paginateArray returns remaining items on last page', () => {
  const items = Array.from({ length: 23 }, (_, i) => i + 1);
  const { pageItems, hasMore } = paginateArray(items, 3, 10);
  assert.deepEqual(pageItems, [21, 22, 23]);
  assert.equal(hasMore, false);
});

test('paginateArray uses defaults for invalid inputs', () => {
  const items = Array.from({ length: 3 }, (_, i) => i + 1);
  const { pageItems, hasMore, safePage, safePageSize } = paginateArray(items, 0, -5);
  assert.deepEqual(pageItems, [1, 2, 3]);
  assert.equal(hasMore, false);
  assert.equal(safePage, 1);
  assert.equal(safePageSize, 100);
});

test('slicePage trims to page size and reports hasMore', () => {
  const items = Array.from({ length: 15 }, (_, i) => i + 1);
  const { pageItems, hasMore, safePageSize } = slicePage(items, 10);
  assert.deepEqual(pageItems, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(hasMore, true);
  assert.equal(safePageSize, 10);
});

test('slicePage defaults to page size 100', () => {
  const items = Array.from({ length: 5 }, (_, i) => i + 1);
  const { pageItems, hasMore, safePageSize } = slicePage(items);
  assert.deepEqual(pageItems, [1, 2, 3, 4, 5]);
  assert.equal(hasMore, false);
  assert.equal(safePageSize, 100);
});
