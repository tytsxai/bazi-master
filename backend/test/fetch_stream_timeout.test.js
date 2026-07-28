import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fetchStreamWithTimeout } from '../utils/http.js';

/**
 * A fake fetch that resolves headers immediately and then feeds the body on demand, so a
 * test can decide when (or whether) the next chunk ever arrives.
 */
const createStallingFetch = ({ chunks = [], stallForever = false } = {}) => {
  let aborted = false;
  const calls = [];

  const fakeFetch = (url, options) => {
    calls.push({ url, options });
    const signal = options?.signal;

    let index = 0;
    const body = {
      getReader: () => ({
        read: () =>
          new Promise((resolve, reject) => {
            if (index < chunks.length) {
              const value = chunks[index];
              index += 1;
              resolve({ done: false, value });
              return;
            }
            if (!stallForever) {
              resolve({ done: true, value: undefined });
              return;
            }
            // Never resolves on its own. Only the abort signal can end this.
            if (signal) {
              signal.addEventListener('abort', () => {
                aborted = true;
                reject(new Error('aborted'));
              });
            }
          }),
        releaseLock: () => {},
      }),
    };

    return Promise.resolve({ ok: true, status: 200, body });
  };

  return { fakeFetch, calls, wasAborted: () => aborted };
};

describe('fetchStreamWithTimeout', () => {
  const withFetch = async (fakeFetch, fn) => {
    const original = globalThis.fetch;
    globalThis.fetch = fakeFetch;
    try {
      return await fn();
    } finally {
      globalThis.fetch = original;
    }
  };

  it('passes options straight through when no deadline is configured', async () => {
    const { fakeFetch, calls } = createStallingFetch();
    await withFetch(fakeFetch, async () => {
      const { response, touch, release } = await fetchStreamWithTimeout('https://x', {
        method: 'POST',
      });
      assert.equal(response.ok, true);
      // The no-deadline path still returns usable no-op callbacks, so callers do not
      // need to branch on whether a timeout was configured.
      assert.equal(typeof touch, 'function');
      assert.equal(typeof release, 'function');
      release();
    });
    assert.equal(calls[0].options.method, 'POST');
    assert.equal(calls[0].options.signal, undefined);
  });

  it('attaches an abort signal when a deadline is configured', async () => {
    const { fakeFetch, calls } = createStallingFetch();
    await withFetch(fakeFetch, async () => {
      const { release } = await fetchStreamWithTimeout(
        'https://x',
        {},
        { connectTimeoutMs: 1000, idleTimeoutMs: 1000 }
      );
      release();
    });
    assert.ok(calls[0].options.signal, 'expected an AbortSignal to be passed to fetch');
  });

  // The regression this exists for: fetchWithTimeout cleared its timer as soon as the
  // headers arrived, so a provider that sent headers and then went quiet left the read
  // loop awaiting a chunk forever, holding a socket and the caller's AI slot.
  it('aborts a stream that stalls after the headers arrive', async () => {
    const { fakeFetch, wasAborted } = createStallingFetch({ stallForever: true });

    await withFetch(fakeFetch, async () => {
      const { response, touch, release } = await fetchStreamWithTimeout(
        'https://x',
        {},
        { connectTimeoutMs: 5000, idleTimeoutMs: 50 }
      );

      const reader = response.body.getReader();
      try {
        await assert.rejects(async () => {
          for (;;) {
            const { done } = await reader.read();
            touch();
            if (done) break;
          }
        });
      } finally {
        release();
      }
    });

    assert.equal(wasAborted(), true, 'expected the idle deadline to abort the stalled read');
  });

  it('lets a stream that keeps producing chunks run past the idle deadline', async () => {
    // Three chunks, each arriving well inside the idle window: the countdown restarts on
    // every touch(), so a slow-but-alive stream is never cut off.
    const { fakeFetch, wasAborted } = createStallingFetch({
      chunks: [new Uint8Array([1]), new Uint8Array([2]), new Uint8Array([3])],
    });

    let received = 0;
    await withFetch(fakeFetch, async () => {
      const { response, touch, release } = await fetchStreamWithTimeout(
        'https://x',
        {},
        { connectTimeoutMs: 5000, idleTimeoutMs: 200 }
      );

      const reader = response.body.getReader();
      try {
        for (;;) {
          const { done } = await reader.read();
          touch();
          if (done) break;
          received += 1;
          await new Promise((resolve) => setTimeout(resolve, 60));
        }
      } finally {
        release();
      }
    });

    assert.equal(received, 3);
    assert.equal(wasAborted(), false);
  });

  it('clears the timer when the initial fetch itself fails', async () => {
    const failingFetch = () => Promise.reject(new Error('connect failed'));
    await withFetch(failingFetch, async () => {
      await assert.rejects(
        () => fetchStreamWithTimeout('https://x', {}, { connectTimeoutMs: 50, idleTimeoutMs: 50 }),
        /connect failed/
      );
    });
    // A leaked timer would keep the event loop alive; node:test fails the run on a
    // handle that outlives the test, so reaching here is the assertion.
  });
});
