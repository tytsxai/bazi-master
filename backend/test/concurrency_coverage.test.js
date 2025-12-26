import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createAiGuard, createInFlightDeduper } from '../lib/concurrency.js';

describe('Concurrency helpers', () => {
  it('createAiGuard tracks in-flight by user id', () => {
    const guard = createAiGuard();

    const noopRelease = guard.acquire();
    assert.equal(typeof noopRelease, 'function');
    assert.equal(guard.has(), false);
    assert.equal(guard.size(), 0);

    const release = guard.acquire('user-1');
    assert.equal(typeof release, 'function');
    assert.equal(guard.has('user-1'), true);
    assert.equal(guard.size(), 1);

    const blocked = guard.acquire('user-1');
    assert.equal(blocked, null);

    release();
    assert.equal(guard.has('user-1'), false);
    assert.equal(guard.size(), 0);
  });

  it('createInFlightDeduper dedupes by key and supports missing keys', async () => {
    const deduper = createInFlightDeduper();

    let calls = 0;
    const factory = async () => {
      calls += 1;
      return calls;
    };

    const a = deduper.getOrCreate('k', factory);
    const b = deduper.getOrCreate('k', factory);
    assert.equal(a.isNew, true);
    assert.equal(b.isNew, false);
    assert.equal(await a.promise, 1);
    assert.equal(await b.promise, 1);
    assert.equal(calls, 1);

    deduper.clear('k');
    assert.equal(deduper.has('k'), false);
    const c = deduper.getOrCreate('k', factory);
    assert.equal(await c.promise, 2);

    const missing1 = deduper.getOrCreate('', factory);
    const missing2 = deduper.getOrCreate(null, factory);
    assert.equal(missing1.isNew, true);
    assert.equal(missing2.isNew, true);
    assert.equal(await missing1.promise, 3);
    assert.equal(await missing2.promise, 4);
  });
});
