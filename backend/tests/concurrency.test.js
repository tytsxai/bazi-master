import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAiGuard, createInFlightDeduper } from '../lib/concurrency.js';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('ai guard blocks concurrent requests per user and releases correctly', async () => {
  const guard = createAiGuard();
  const release = guard.acquire(42);
  assert.equal(typeof release, 'function');
  assert.equal(guard.has(42), true);

  const second = guard.acquire(42);
  assert.equal(second, null);

  release();
  assert.equal(guard.has(42), false);

  const third = guard.acquire(42);
  assert.equal(typeof third, 'function');
  third();

  // Different users should be able to acquire concurrently.
  const releaseA = guard.acquire(1);
  const releaseB = guard.acquire(2);
  assert.equal(typeof releaseA, 'function');
  assert.equal(typeof releaseB, 'function');
  releaseA();
  releaseB();

  await delay(0);
});

test('ai guard returns a no-op release for missing user id', () => {
  const guard = createAiGuard();
  const release = guard.acquire(null);
  assert.equal(typeof release, 'function');
  release();
  assert.equal(guard.size(), 0);
});

test('in-flight deduper shares promises by key and clears', async () => {
  const deduper = createInFlightDeduper();
  let calls = 0;
  const factory = async () => {
    calls += 1;
    await delay(5);
    return calls;
  };

  const first = deduper.getOrCreate('same', factory);
  const second = deduper.getOrCreate('same', factory);

  assert.equal(first.isNew, true);
  assert.equal(second.isNew, false);
  assert.equal(first.promise, second.promise);

  const result = await first.promise;
  assert.equal(result, 1);
  assert.equal(calls, 1);

  deduper.clear('same');
  assert.equal(deduper.has('same'), false);
});

test('in-flight deduper bypasses tracking when key is missing', async () => {
  const deduper = createInFlightDeduper();
  let calls = 0;
  const factory = async () => {
    calls += 1;
    const current = calls;
    await delay(1);
    return current;
  };

  const first = deduper.getOrCreate(null, factory);
  const second = deduper.getOrCreate('', factory);

  assert.equal(first.isNew, true);
  assert.equal(second.isNew, true);
  assert.notEqual(first.promise, second.promise);

  const [firstResult, secondResult] = await Promise.all([first.promise, second.promise]);
  assert.equal(firstResult, 1);
  assert.equal(secondResult, 2);
  assert.equal(calls, 2);
  assert.equal(deduper.size(), 0);
});
